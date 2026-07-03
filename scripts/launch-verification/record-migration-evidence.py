#!/usr/bin/env python3
"""Gate 1 — Migration_Evidence_Gate recorder (Requirement 1).

**Execution world: OPERATOR-GATED, read-only capture. It performs NO production
writes itself.** This recorder *ingests* command output an operator already
captured while running the Neon-first migration procedure (Neon dry-run, staging
apply, idempotency second apply, post-apply validation SQL, ``deploy/backup-db.sh``
backup proof) and folds it into a launch-verification ``Evidence_Artifact``. The
risky steps — applying SQL on staging/production, taking the backup — are run by
the operator per ``docs/runbooks/multi-tenant-beanola-rollout.md`` and
``deploy/RUNBOOK.md`` §3; this script only *records* their results. It never
opens a database connection, never runs ``apply_sql_migrations``, and never
shells out to a production write.

What it does (design ``.kiro/specs/beanola-launch-verification/design.md`` →
"Gate 1 — Migration_Evidence_Gate"):

* **R1.1 — Neon dry-run capture.** Records the dry-run with the applied migration
  script identifier(s), the Neon target (branch or default branch), and the
  planned schema changes the dry-run reported. The recorded dry-run passes only
  when it reported zero errors.
* **R1.2 — staging apply capture.** Records the staging apply together with the
  resulting ``migration_history`` entries, requiring one recorded entry per
  applied script.
* **R1.3 — idempotency.** Hands the second-apply ``migration_history`` delta and
  schema delta to :func:`migration_eval.evaluate_migration` (must both be zero).
* **R1.4 / R1.5 — tenant invariants.** Hands the validation-SQL counts to
  :func:`migration_eval.evaluate_invariants` via ``evaluate_migration``.
* **R1.6 — backup precedes apply.** When a production apply is recorded, hands the
  ``backup-db.sh`` completion timestamp and the apply start timestamp to the
  evaluator's ≤ 60-minute backup-timing check.
* **R1.7 — rollback/disable posture.** Recorded by the evaluator via
  :data:`migration_eval.ROLLBACK_POSTURE_NOTE`.
* **R1.8 — branch-first evidence.** Records that a risky change was validated on a
  Neon branch before the Neon default branch and before production.
* **R1.9 — no secrets.** Every captured-output string is routed through the shared
  :func:`redaction.redact` helper before it lands in the artifact, so connection
  strings, passwords, and other secrets can never be persisted.
* **R1.10 — dry-run-error withholding.** The evaluator withholds production-apply
  evidence when the dry-run reported errors.

The artifact is emitted to
``docs/launch-evidence/01-migration/migration-evidence.json`` through the shared
``Evidence_Artifact`` envelope (``gate_id="migration-evidence"``,
``requirement="R1"``, ``generated_by="operator"``) and the shared redaction
helper. The process exits non-zero when the evaluated migration evidence is not
passing, so the operator/rollup flow fails closed.

Run it::

    # record from an operator-captured inputs JSON file
    python3 scripts/launch-verification/record-migration-evidence.py \\
        --inputs captured-migration-evidence.json

    # offline self-check: emit a valid envelope from synthetic inputs and
    # demonstrate that a secret embedded in captured output is redacted
    python3 scripts/launch-verification/record-migration-evidence.py --synthetic

The pure :mod:`migration_eval` core is imported from this same directory; the
shared envelope + redaction helper are imported from ``backend/`` via a robust
``sys.path`` insert (the same pattern the sibling wrappers use).

**Validates: Requirements 1.1, 1.2, 1.7, 1.8, 1.9, 1.10**
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

# ---------------------------------------------------------------------------
# Locate the repo root and wire up imports (pure core + shared schema/redaction)
# ---------------------------------------------------------------------------
#
# This script lives at
# ``<repo>/scripts/launch-verification/record-migration-evidence.py``:
#   * the pure core ``migration_eval`` is its sibling in this directory;
#   * the evidence envelope + redaction helper live under ``<repo>/backend`` as
#     ``apps.common.launch_verification.{evidence,redaction}``.
# We resolve everything from this file's location so imports are robust
# regardless of the current working directory.

_THIS_FILE = Path(__file__).resolve()
_SCRIPT_DIR = _THIS_FILE.parent
# parents[0] = scripts/launch-verification, [1] = scripts, [2] = repo root
REPO_ROOT = _THIS_FILE.parents[2]
_BACKEND_DIR = REPO_ROOT / "backend"


def _ensure_on_path(directory: Path) -> None:
    """Insert ``directory`` at the front of ``sys.path`` if not already present."""
    as_str = str(directory)
    if as_str not in sys.path:
        sys.path.insert(0, as_str)


_ensure_on_path(_SCRIPT_DIR)
_ensure_on_path(_BACKEND_DIR)

try:
    import migration_eval  # noqa: E402  (sibling pure core, task 14.1)
    from migration_eval import (  # noqa: E402
        FAIL,
        GATE_ID,
        INVARIANT_SPECS,
        PASS,
        REQUIREMENT,
        evaluate_migration,
    )
except ImportError as exc:  # pragma: no cover - defensive, surfaces a clear error
    raise SystemExit(
        "record-migration-evidence: could not import the pure core "
        f"migration_eval from {_SCRIPT_DIR}/migration_eval.py — {exc}"
    )

try:
    from apps.common.launch_verification.evidence import (  # noqa: E402
        EvidenceArtifact,
        EvidenceStatus,
        GeneratedBy,
        to_dict,
    )
    from apps.common.launch_verification.redaction import (  # noqa: E402
        REDACTION_MARKER,
        redact,
    )
except ImportError as exc:  # pragma: no cover - defensive, surfaces a clear error
    raise SystemExit(
        "record-migration-evidence: could not import the evidence schema / "
        f"redaction helper from {_BACKEND_DIR}/apps/common/launch_verification/ — {exc}"
    )


EVIDENCE_REL = "docs/launch-evidence/01-migration/migration-evidence.json"


# ---------------------------------------------------------------------------
# Input parsing — turn operator-captured output into evaluator inputs
# ---------------------------------------------------------------------------


def _as_dict(value: Any) -> Dict[str, Any]:
    """Return ``value`` if it is a dict, else an empty dict (defensive)."""
    return value if isinstance(value, dict) else {}


def _as_list(value: Any) -> List[Any]:
    """Return ``value`` if it is a list, else an empty list (defensive)."""
    return value if isinstance(value, list) else []


def _captured(value: Any) -> Any:
    """Route a captured-output value through the shared redaction helper (R1.9).

    Strings, dicts, and lists are scrubbed recursively; anything else passes
    through unchanged. Every operator-captured blob is funneled here *before* it
    is placed in a check row, so no connection string, password, phone number, or
    NRC/passport value can ever be persisted.
    """
    return redact(value)


def _staging_apply_check(
    migration_scripts: Sequence[str], migration_history: Sequence[Any]
) -> Dict[str, Any]:
    """Build the R1.2 staging-apply check: one ``migration_history`` row per script.

    Passes iff there is at least one applied script and every applied script has
    exactly one corresponding ``migration_history`` entry (matched by name).
    """
    scripts = [str(s) for s in migration_scripts if str(s).strip()]
    entries = _as_list(migration_history)

    def _entry_name(entry: Any) -> str:
        if isinstance(entry, dict):
            return str(entry.get("migration_name", entry.get("name", ""))).strip()
        return str(entry).strip()

    entry_names = [_entry_name(e) for e in entries]

    matched: List[str] = []
    missing: List[str] = []
    duplicated: List[str] = []
    for script in scripts:
        # Exact match only. A prior substring match (`n in script or script in
        # n`) produced false "duplicated" failures for real, distinct migration
        # names that happen to share a substring — e.g. the real production
        # migration_history contains both `normalize_data.sql` and
        # `seed_and_normalize_data.sql`; "normalize_data.sql" is a literal
        # substring of the latter, so the old matcher counted 2 hits for
        # `normalize_data.sql` even though each script has exactly one real
        # row. Migration script filenames are exact identifiers, not prefixes.
        hits = [n for n in entry_names if n == script]
        if len(hits) == 1:
            matched.append(script)
        elif len(hits) == 0:
            missing.append(script)
        else:
            duplicated.append(script)

    ok = bool(scripts) and not missing and not duplicated
    detail_bits: List[str] = []
    if not scripts:
        detail_bits.append("no migration scripts declared")
    if missing:
        detail_bits.append(f"no migration_history row for: {', '.join(missing)}")
    if duplicated:
        detail_bits.append(f"multiple migration_history rows for: {', '.join(duplicated)}")

    return {
        "id": "staging:apply",
        "result": PASS if ok else FAIL,
        "observed": (
            f"{len(scripts)} script(s), {len(entries)} migration_history entry(ies); "
            f"{len(matched)} matched"
        ),
        "threshold": "one migration_history row per applied script",
        "detail": "; ".join(detail_bits) if detail_bits else "one row recorded per applied script",
        # gate-specific columns (preserved verbatim by the envelope)
        "migration_scripts": list(scripts),
        "migration_history_entries": _captured(list(entries)),
    }


def _dry_run_check(neon: Dict[str, Any], migration_scripts: Sequence[str]) -> Dict[str, Any]:
    """Build the R1.1 / R1.10 Neon dry-run capture check.

    Records the dry-run target, the applied script id(s), and the planned schema
    changes the dry-run reported. Passes iff the dry-run reported zero errors
    (R1.10 withholding posture is additionally enforced by the evaluator).
    """
    dry_run = _as_dict(neon.get("dry_run"))
    target = str(neon.get("target", "")).strip() or "unspecified"

    raw_errors = dry_run.get("errors", 0)
    try:
        error_count = int(raw_errors)
    except (TypeError, ValueError):
        # Unknown/garbage error count is treated conservatively as "errors present".
        error_count = 1

    planned_changes = _as_list(dry_run.get("planned_changes"))
    ok = error_count == 0

    return {
        "id": "dry-run:neon",
        "result": PASS if ok else FAIL,
        "observed": (
            f"target={target}, errors={error_count}, "
            f"{len(planned_changes)} planned change(s)"
        ),
        "threshold": "Neon dry-run recorded with zero errors",
        "detail": (
            "dry-run recorded clean"
            if ok
            else f"dry-run reported {error_count} error(s); production-apply evidence withheld (R1.10)"
        ),
        # gate-specific columns
        "neon_target": _captured(target),
        "migration_scripts": [str(s) for s in migration_scripts],
        "planned_changes": _captured(list(planned_changes)),
        "dry_run_output": _captured(dry_run.get("output", "")),
    }


def _branch_first_check(neon: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Build the R1.8 branch-first check for a risky change.

    ``WHERE a schema or data change is risky``, the gate records that the change
    was validated on a Neon branch before the Neon default branch and before
    production. When ``risky`` is false the check is omitted (returns ``None``).
    Passes iff a Neon branch was used (``branch_first`` true, or the target names
    a branch).
    """
    risky = bool(neon.get("risky", True))
    if not risky:
        return None

    target = str(neon.get("target", "")).strip()
    branch_first = bool(neon.get("branch_first", target.lower().startswith("branch")))

    return {
        "id": "neon:branch-first",
        "result": PASS if branch_first else FAIL,
        "observed": f"branch_first={branch_first}, target={target or 'unspecified'}",
        "threshold": "risky change validated on a Neon branch before default and production",
        "detail": (
            "validated on a Neon branch before the default branch and production"
            if branch_first
            else "risky change not recorded as branch-first validated (R1.8)"
        ),
        "neon_target": _captured(target),
    }


# ---------------------------------------------------------------------------
# Recorder — combine evaluator output with the captured-evidence checks
# ---------------------------------------------------------------------------


def build_artifact(inputs: Dict[str, Any]) -> EvidenceArtifact:
    """Build the Gate 1 ``Evidence_Artifact`` from operator-captured ``inputs``.

    Parses the captured output into the counts/deltas/timestamps the pure
    :func:`migration_eval.evaluate_migration` consumes, calls it, then prepends
    the capture-oriented checks (dry-run R1.1/R1.10, staging apply R1.2,
    branch-first R1.8). Overall status is conservative: ``passed`` iff the
    evaluator passed **and** every capture check passed.
    """
    inputs = _as_dict(inputs)

    neon = _as_dict(inputs.get("neon"))
    staging = _as_dict(inputs.get("staging"))
    idempotency = _as_dict(inputs.get("idempotency"))
    validation = _as_dict(inputs.get("validation"))
    production = _as_dict(inputs.get("production_apply"))

    migration_scripts = [str(s) for s in _as_list(inputs.get("migration_scripts"))]

    # --- Parse evaluator inputs -------------------------------------------
    counts = _as_dict(validation.get("counts"))
    dry_run = _as_dict(neon.get("dry_run"))
    try:
        dry_run_errors: Any = int(dry_run.get("errors", 0))
    except (TypeError, ValueError):
        dry_run_errors = dry_run.get("errors", 0)

    has_production_apply = bool(production.get("recorded", False))

    base = evaluate_migration(
        counts,
        idempotency.get("migration_history_delta"),
        idempotency.get("schema_delta"),
        dry_run_errors=dry_run_errors,
        has_production_apply_evidence=has_production_apply,
        backup_completed_at=production.get("backup_completed_at"),
        apply_started_at=production.get("apply_started_at"),
        generated_by="operator",
    )

    # --- Capture-oriented checks (this recorder's responsibility) ----------
    capture_checks: List[Dict[str, Any]] = []
    capture_failures: List[str] = []

    dry_run_row = _dry_run_check(neon, migration_scripts)
    capture_checks.append(dry_run_row)
    if dry_run_row["result"] != PASS:
        capture_failures.append("dry-run:neon reported one or more errors (R1.1/R1.10)")

    staging_row = _staging_apply_check(migration_scripts, staging.get("migration_history"))
    capture_checks.append(staging_row)
    if staging_row["result"] != PASS:
        capture_failures.append(f"staging:apply failed — {staging_row['detail']}")

    branch_row = _branch_first_check(neon)
    if branch_row is not None:
        capture_checks.append(branch_row)
        if branch_row["result"] != PASS:
            capture_failures.append("neon:branch-first not satisfied for a risky change (R1.8)")

    # --- Merge: capture checks first, then the evaluator's checks ----------
    all_checks: List[Dict[str, Any]] = capture_checks + list(base.get("checks", []))
    all_failures: List[Any] = list(capture_failures) + list(base.get("failures", []))

    base_passed = base.get("status") == migration_eval.STATUS_PASSED
    passed = base_passed and not capture_failures
    status = EvidenceStatus.PASSED if passed else EvidenceStatus.FAILED

    n_pass = sum(1 for c in all_checks if c.get("result") == PASS)
    summary = (
        f"Migration_Evidence_Gate {'PASSED' if passed else 'FAILED'}: "
        f"{n_pass}/{len(all_checks)} checks passed; "
        f"{len(migration_scripts)} script(s); "
        f"production apply {'recorded' if has_production_apply else 'not recorded'}."
    )

    # Capture the remaining redacted output blobs as informational assets/checks
    # so the operator log text is preserved (always through redaction, R1.9).
    captured_logs = {
        "staging_apply_output": _captured(staging.get("apply_output", "")),
        "idempotency_second_apply_output": _captured(idempotency.get("second_apply_output", "")),
        "validation_output": _captured(validation.get("output", "")),
        "backup_output": _captured(production.get("backup_output", "")),
    }
    all_checks.append(
        {
            "id": "capture:operator-logs",
            "result": PASS,
            "observed": "captured operator command output (redacted)",
            "threshold": "all captured output routed through the redaction helper",
            "detail": "raw Neon/staging/validation/backup output, secrets stripped (R1.9)",
            "logs": captured_logs,
        }
    )

    return EvidenceArtifact(
        gate_id=GATE_ID,
        requirement=REQUIREMENT,
        status=status,
        generated_by=GeneratedBy.OPERATOR,
        generated_at=base.get("generated_at", ""),
        summary=summary,
        checks=all_checks,
        assets=[],
        failures=all_failures,
    )


def write_artifact(artifact: EvidenceArtifact, output_path: Path) -> None:
    """Write the artifact to ``output_path`` as redacted, pretty JSON.

    The whole envelope is routed through the shared redaction helper one final
    time (defense in depth) so no secret value can land in the evidence store
    even if a captured blob slipped past per-field redaction (design Property 16).
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)
    payload = redact(to_dict(artifact))
    output_path.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


# ---------------------------------------------------------------------------
# Synthetic inputs — offline self-check that also exercises redaction (R1.9)
# ---------------------------------------------------------------------------


#: A secret value deliberately embedded in synthetic captured output so the
#: ``--synthetic`` run can prove it is redacted before it reaches the artifact.
SYNTHETIC_SECRET = "postgresql://mihas:sup3r-s3cret-pw@db.internal:5432/mihas"


def synthetic_inputs() -> Dict[str, Any]:
    """Return a passing synthetic inputs payload that embeds a secret + PII.

    The dry-run, staging, and backup output strings deliberately contain a
    connection string with an inline password and a raw phone number so a
    ``--synthetic`` run demonstrates the redaction helper scrubs them out of the
    emitted artifact (R1.9 / Property 16).
    """
    counts = {key: 1 for key, _threshold, _pred in INVARIANT_SPECS}
    # The "at least one" invariants are happy at 1; duplicate invariants must be 0.
    counts["duplicate_hostnames"] = 0
    counts["duplicate_slugs"] = 0

    secret_blob = (
        "Applying via DATABASE_URL=" + SYNTHETIC_SECRET + " ... "
        "operator phone +260971234567 ... done."
    )

    return {
        "migration_scripts": ["business_logic_densification.sql"],
        "neon": {
            "target": "branch:launch-verification-2026-06-20",
            "branch_first": True,
            "risky": True,
            "dry_run": {
                "output": "neon prepare_database_migration: " + secret_blob,
                "errors": 0,
                "planned_changes": [
                    "CREATE TABLE application_conditions (...)",
                    "ALTER TABLE applications ADD COLUMN is_late_submission boolean",
                ],
            },
        },
        "staging": {
            "apply_output": "apply_sql_migrations: " + secret_blob,
            "migration_history": [
                {
                    "migration_name": "business_logic_densification.sql",
                    "applied_at": "2026-06-20T08:40:00Z",
                }
            ],
        },
        "idempotency": {
            "second_apply_output": "apply_sql_migrations: 0 pending. " + secret_blob,
            "migration_history_delta": 0,
            "schema_delta": 0,
        },
        "validation": {
            "output": "tenant invariant validation SQL: all green. " + secret_blob,
            "counts": counts,
        },
        "production_apply": {
            "recorded": True,
            "backup_completed_at": "2026-06-20T08:30:00Z",
            "apply_started_at": "2026-06-20T08:45:00Z",
            "backup_output": "deploy/backup-db.sh complete. " + secret_blob,
        },
    }


def load_inputs(path: Path) -> Dict[str, Any]:
    """Load and parse an operator-captured inputs JSON file."""
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as exc:
        raise SystemExit(f"record-migration-evidence: cannot read inputs file {path}: {exc}")
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as exc:
        raise SystemExit(f"record-migration-evidence: inputs file {path} is not valid JSON: {exc}")
    if not isinstance(parsed, dict):
        raise SystemExit(
            f"record-migration-evidence: inputs file {path} must contain a JSON object"
        )
    return parsed


# ---------------------------------------------------------------------------
# CLI entrypoint
# ---------------------------------------------------------------------------


def _default_output() -> Path:
    return REPO_ROOT / EVIDENCE_REL


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="record-migration-evidence.py",
        description=(
            "Gate 1 Migration_Evidence_Gate recorder (operator-gated, read-only "
            "capture; performs NO production writes). Ingests operator-captured "
            "command output and emits "
            "docs/launch-evidence/01-migration/migration-evidence.json."
        ),
    )
    source = parser.add_mutually_exclusive_group()
    source.add_argument(
        "--inputs",
        type=Path,
        default=None,
        help="Path to the operator-captured inputs JSON file.",
    )
    source.add_argument(
        "--synthetic",
        action="store_true",
        help=(
            "Emit a valid envelope from synthetic inputs (no file needed) and "
            "demonstrate that a secret embedded in captured output is redacted."
        ),
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help=f"Output path for the evidence artifact (default: <repo>/{EVIDENCE_REL}).",
    )
    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    """CLI: record migration evidence, write the artifact, return the exit code.

    Returns ``0`` only when the evaluated migration evidence is passing; any
    not-passing verdict returns ``1`` so the operator/rollup flow fails closed.
    """
    args = build_arg_parser().parse_args(argv)
    output_path: Path = args.output or _default_output()

    if args.synthetic:
        inputs = synthetic_inputs()
    elif args.inputs is not None:
        inputs = load_inputs(args.inputs)
    else:
        build_arg_parser().error("one of --inputs or --synthetic is required")
        return 2  # pragma: no cover - argparse exits first

    artifact = build_artifact(inputs)
    write_artifact(artifact, output_path)

    passed = artifact.status == EvidenceStatus.PASSED.value
    print(f"launch-verification migration recorder: {artifact.status}")
    print(f"  summary: {artifact.summary}")
    print(f"  written: {output_path}")

    if args.synthetic:
        # Prove the embedded secret was redacted out of the written artifact.
        written = output_path.read_text(encoding="utf-8")
        leaked = SYNTHETIC_SECRET in written or "sup3r-s3cret-pw" in written
        if leaked:
            print("  REDACTION CHECK: FAILED — secret value leaked into the artifact!")
            return 1
        print(
            f"  REDACTION CHECK: passed — embedded secret absent from the artifact "
            f"(marker {REDACTION_MARKER!r} present where output was captured)."
        )

    if artifact.failures:
        print(f"  failures: {len(artifact.failures)}")
        for failure in artifact.failures[:20]:
            print(f"    - {failure}")

    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
