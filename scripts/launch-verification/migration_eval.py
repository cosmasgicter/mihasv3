"""Pure-logic core for Gate 1 — Migration_Evidence_Gate (Requirement 1).

This module is the **pure, deterministic** decision layer behind the database
Migration_Evidence_Gate. Like the other launch-verification evaluators
(``smoke_eval``, ``performance_eval``), it contains *no* database access, *no*
Neon/MCP calls, *no* ``subprocess``, *no* Django, and *no* I/O — only predicates
and evaluators over already-captured facts (invariant counts, an idempotency
delta, two timestamps, a dry-run error count). That keeps it trivially
importable from the operator-gated ``record-migration-evidence.py`` recorder
(task 14.4), from CI, and from the hypothesis property tests (tasks 14.2 / 14.3),
and lets the gate's behavior be property-tested independent of any live
database.

The rules it encodes come straight from Requirement 1:

* **R1.4 / R1.5 — tenant invariants.** Post-apply validation SQL must confirm
  ``canonical_programs >= 1``, active ``institutions >= 1``, zero duplicate
  institution hostnames, zero duplicate institution slugs, and active
  memberships ``>= 1``. :func:`evaluate_invariants` passes **iff every**
  invariant holds and, on failure, records the *specific* failed invariant(s).
  This invariant set mirrors the read-only verification SQL documented in
  ``infrastructure.md``.

* **R1.3 — idempotent second apply.** Re-applying the same migration scripts
  must produce zero new ``migration_history`` rows **and** zero schema changes.
  :func:`idempotent_second_apply` passes **iff both** deltas are exactly zero.

* **R1.6 — backup precedes apply.** When a production apply is recorded, a
  ``deploy/backup-db.sh`` completion timestamp must precede the apply start by no
  more than :data:`MAX_BACKUP_AGE_MINUTES` (60) minutes.
  :func:`backup_precedes_apply` accepts ISO-8601 strings or ``datetime`` objects
  and passes **iff** the backup completes at/before the apply start (not after)
  and the gap is within the window.

* **R1.10 — dry-run-error withholding posture.** If a Neon dry-run reports an
  error, production-apply evidence must be **withheld** until a clean dry-run.
  :func:`dry_run_withholds_production` returns ``True`` (posture OK) **iff**
  there were zero dry-run errors **or** no production-apply evidence is present.

* **R1.7 — rollback/disable posture.** Each migration documents that schema
  changes are additive and that rollback is by redeploy or feature-disable
  rather than a destructive revert. :data:`ROLLBACK_POSTURE_NOTE` carries that
  statement and :func:`evaluate_migration` records it as a passing posture check.

:func:`evaluate_migration` combines the above into a single Evidence_Artifact
dict (``gate_id`` ``"migration-evidence"``, ``requirement`` ``"R1"``) following
the **common envelope** used across the harness, with a conservative overall
verdict: the gate is ``passed`` **iff every** included check passed; any failed
invariant, a non-zero idempotency delta, a missing/late backup when a production
apply is recorded, or a violated withholding posture forces ``failed``.

Check rows produced here use the same closed ``result`` vocabulary
(``"pass" | "fail" | "not-measured"``) and the same gate status vocabulary
(``"passed" | "failed"``) as the shared ``Evidence_Artifact`` envelope, so the
recorder can drop them straight into a gate artifact.

**Validates: Requirements 1.1, 1.3, 1.4, 1.5, 1.6, 1.7, 1.10**
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, List, Mapping, Optional, Sequence, Tuple

__all__ = [
    "MAX_BACKUP_AGE_MINUTES",
    "GATE_ID",
    "REQUIREMENT",
    "ROLLBACK_POSTURE_NOTE",
    "PASS",
    "FAIL",
    "NOT_MEASURED",
    "STATUS_PASSED",
    "STATUS_FAILED",
    "INVARIANT_SPECS",
    "evaluate_invariants",
    "idempotent_second_apply",
    "backup_precedes_apply",
    "dry_run_withholds_production",
    "evaluate_migration",
]

# --- Constants -------------------------------------------------------------

#: The maximum age, in minutes, a backup may have relative to a production apply
#: start (R1.6). A backup completing more than this many minutes before the apply
#: — or *after* it — does not satisfy the gate.
MAX_BACKUP_AGE_MINUTES: int = 60

#: Stable gate identity (mirrors the rollup ``GATE_SPECS`` entry for Gate 1).
GATE_ID: str = "migration-evidence"
REQUIREMENT: str = "R1"

#: The documented rollback/disable posture for every additive migration (R1.7).
ROLLBACK_POSTURE_NOTE: str = (
    "Schema changes are additive (managed=False SQL scripts applied by "
    "apply_sql_migrations). Rollback is performed by redeploy or feature "
    "disable, not by a destructive revert."
)

#: Per-check result vocabulary (mirrors the shared Evidence_Artifact envelope).
PASS: str = "pass"
FAIL: str = "fail"
NOT_MEASURED: str = "not-measured"

#: Gate status vocabulary (closed enum; mirrors the shared envelope ``status``).
STATUS_PASSED: str = "passed"
STATUS_FAILED: str = "failed"


# --- Tenant invariant evaluation (R1.4 / R1.5) -----------------------------

#: The five tenant invariants, in a stable order. Each entry is
#: ``(count_key, human_threshold, predicate)`` where ``predicate`` is applied to
#: the safely-coerced integer count. The "at least one" invariants
#: (``canonical_programs``, ``active_institutions``, ``active_memberships``)
#: require ``>= 1``; the duplicate invariants require exactly ``0``. This set is
#: the read-only verification SQL from ``infrastructure.md`` expressed as pure
#: predicates.
INVARIANT_SPECS: Tuple[Tuple[str, str, Any], ...] = (
    ("canonical_programs", "canonical_programs >= 1", lambda v: v >= 1),
    ("active_institutions", "active institutions >= 1", lambda v: v >= 1),
    ("duplicate_hostnames", "duplicate hostnames == 0", lambda v: v == 0),
    ("duplicate_slugs", "duplicate slugs == 0", lambda v: v == 0),
    ("active_memberships", "active memberships >= 1", lambda v: v >= 1),
)


def _coerce_count(value: Any) -> Optional[int]:
    """Return ``value`` as a non-negative ``int``, or ``None`` if it is not one.

    A missing key (``None``), a boolean, a non-integer, or a negative number is
    *not* a usable count and is treated conservatively as a failed invariant by
    the caller. ``bool`` is rejected explicitly because it is an ``int`` subclass
    but never a meaningful row count.
    """
    if isinstance(value, bool) or not isinstance(value, int):
        return None
    if value < 0:
        return None
    return value


def evaluate_invariants(counts: Mapping[str, Any]) -> dict:
    """Evaluate the five tenant invariants over ``counts`` (R1.4 / R1.5).

    ``counts`` is a mapping carrying ``canonical_programs``,
    ``active_institutions``, ``duplicate_hostnames``, ``duplicate_slugs``, and
    ``active_memberships``. The result passes **iff every** invariant holds
    (R1.4). On any failure the *specific* failed invariant(s) are recorded by key
    (R1.5). A missing, non-integer, negative, or boolean count is conservatively
    treated as a failed invariant (it is recorded as ``not-measured`` and blocks
    the pass).

    Returns a dict::

        {
          "passed": bool,
          "checks": [ <check row per invariant> ],
          "failed_invariants": [ <count_key>... ],   # blocking invariants
        }

    Each check row is drop-in for the shared Evidence_Artifact ``checks[]`` list.
    """
    if counts is None:
        counts = {}

    checks: List[dict] = []
    failed: List[str] = []

    for key, threshold, predicate in INVARIANT_SPECS:
        raw = counts.get(key) if isinstance(counts, Mapping) else None
        value = _coerce_count(raw)

        if value is None:
            # No usable count — conservatively not measured and blocking.
            checks.append(
                {
                    "id": f"invariant:{key}",
                    "result": NOT_MEASURED,
                    "observed": "not measured",
                    "threshold": threshold,
                    "detail": f"{key} count is missing or not a non-negative integer",
                }
            )
            failed.append(key)
            continue

        ok = bool(predicate(value))
        checks.append(
            {
                "id": f"invariant:{key}",
                "result": PASS if ok else FAIL,
                "observed": str(value),
                "threshold": threshold,
                "detail": f"{key} = {value}",
            }
        )
        if not ok:
            failed.append(key)

    return {
        "passed": len(failed) == 0,
        "checks": checks,
        "failed_invariants": failed,
    }


# --- Idempotent second apply (R1.3) ----------------------------------------


def idempotent_second_apply(migration_history_delta: Any, schema_delta: Any) -> bool:
    """Return ``True`` iff a second apply changed nothing (R1.3).

    Re-applying the same migration scripts must produce **zero** new
    ``migration_history`` rows **and** **zero** schema changes. This returns
    ``True`` **iff both** ``migration_history_delta`` and ``schema_delta`` are
    exactly ``0``. Any non-zero delta, a negative delta, a boolean, or a
    non-integer is treated conservatively as *not idempotent* and returns
    ``False``.
    """
    history = _coerce_count(migration_history_delta)
    schema = _coerce_count(schema_delta)
    if history is None or schema is None:
        return False
    return history == 0 and schema == 0


# --- Backup precedes apply (R1.6) ------------------------------------------


def _parse_timestamp(value: Any) -> Optional[datetime]:
    """Parse ``value`` (ISO-8601 string or ``datetime``) into a ``datetime``.

    A trailing ``Z`` (UTC designator) is accepted. Naive datetimes are assumed
    to be UTC so a naive/aware pair never raises on comparison. Anything that
    cannot be parsed returns ``None`` (the caller treats that conservatively as a
    failing backup-timing check).
    """
    if isinstance(value, datetime):
        dt = value
    elif isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        if text.endswith(("Z", "z")):
            text = text[:-1] + "+00:00"
        try:
            dt = datetime.fromisoformat(text)
        except ValueError:
            return None
    else:
        return None

    # Normalize to an aware UTC datetime so comparisons are always well-defined.
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def backup_precedes_apply(
    backup_completed_at: Any,
    apply_started_at: Any,
    max_minutes: float = MAX_BACKUP_AGE_MINUTES,
) -> bool:
    """Return ``True`` iff the backup precedes the apply within the window (R1.6).

    Passes **iff** the backup completion timestamp is at or before the apply
    start (it is never *after* the apply) **and** the gap between them is no more
    than ``max_minutes`` (default :data:`MAX_BACKUP_AGE_MINUTES` = 60). Both
    arguments accept either an ISO-8601 string (a trailing ``Z`` is fine) or a
    ``datetime``. An unparseable timestamp, or a non-positive ``max_minutes``
    (which admits no gap), conservatively returns ``False``.

    Boundary: a backup completing exactly at the apply start (a zero-minute gap)
    counts as preceding it and passes; a backup completing *after* the apply
    start fails.
    """
    backup = _parse_timestamp(backup_completed_at)
    apply = _parse_timestamp(apply_started_at)
    if backup is None or apply is None:
        return False
    if isinstance(max_minutes, bool) or not isinstance(max_minutes, (int, float)):
        return False
    if max_minutes <= 0:
        return False

    gap_minutes = (apply - backup).total_seconds() / 60.0
    # gap >= 0 means backup is at/before apply; gap < 0 means backup is after.
    return 0 <= gap_minutes <= max_minutes


# --- Dry-run-error withholding posture (R1.10) -----------------------------


def dry_run_withholds_production(
    dry_run_errors: Any,
    has_production_apply_evidence: bool,
) -> bool:
    """Return ``True`` iff the dry-run-error withholding posture holds (R1.10).

    If a Neon dry-run reports one or more errors, production-apply evidence must
    be **withheld** until a subsequent clean dry-run. The posture is therefore OK
    (``True``) **iff** ``dry_run_errors == 0`` **or** there is no
    ``has_production_apply_evidence``. It is violated (``False``) only when a
    production apply is recorded *despite* a dry-run that reported errors.

    A missing/invalid ``dry_run_errors`` is treated conservatively as "errors
    present" (non-zero), so recording a production apply alongside an unknown
    dry-run result also violates the posture.
    """
    errors = _coerce_count(dry_run_errors)
    has_prod = bool(has_production_apply_evidence)
    if errors is None:
        # Unknown dry-run outcome: treat as errors present.
        return not has_prod
    return errors == 0 or not has_prod


# --- Top-level gate evaluation ---------------------------------------------


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def evaluate_migration(
    counts: Mapping[str, Any],
    migration_history_delta: Any,
    schema_delta: Any,
    *,
    dry_run_errors: Any = 0,
    has_production_apply_evidence: bool = False,
    backup_completed_at: Any = None,
    apply_started_at: Any = None,
    max_backup_minutes: float = MAX_BACKUP_AGE_MINUTES,
    generated_at: Optional[str] = None,
    generated_by: str = "operator",
) -> dict:
    """Combine the migration checks into a Migration_Evidence_Gate artifact.

    Args:
        counts: tenant invariant counts (see :func:`evaluate_invariants`).
        migration_history_delta: new ``migration_history`` rows on the second
            apply (idempotency; must be 0).
        schema_delta: schema changes on the second apply (idempotency; must be 0).
        dry_run_errors: error count from the Neon dry-run (R1.10).
        has_production_apply_evidence: whether a production apply is recorded.
            When ``True`` the backup-timing check (R1.6) is required.
        backup_completed_at: ISO-8601 string / ``datetime`` for the backup
            completion (only consulted when a production apply is recorded).
        apply_started_at: ISO-8601 string / ``datetime`` for the apply start.
        max_backup_minutes: backup-age window in minutes (default 60).
        generated_at: optional ISO-8601 timestamp; defaults to current UTC.
        generated_by: provenance tag for the envelope (default ``"operator"``).

    Returns:
        An Evidence_Artifact dict (``gate_id`` ``"migration-evidence"``,
        ``requirement`` ``"R1"``) following the common envelope. ``status`` is
        conservative: it is ``passed`` **iff every** included check passed; any
        failed invariant, a non-zero idempotency delta, a missing/late backup
        when a production apply is recorded, or a violated withholding posture
        forces ``failed``.
    """
    checks: List[dict] = []
    failures: List[str] = []

    # --- Tenant invariants (R1.4 / R1.5) ---
    invariants = evaluate_invariants(counts)
    checks.extend(invariants["checks"])
    for key in invariants["failed_invariants"]:
        failures.append(f"invariant:{key} failed validation")

    # --- Idempotent second apply (R1.3) ---
    history = _coerce_count(migration_history_delta)
    schema = _coerce_count(schema_delta)
    idempotent = idempotent_second_apply(migration_history_delta, schema_delta)
    checks.append(
        {
            "id": "idempotency:second-apply",
            "result": PASS if idempotent else FAIL,
            "observed": (
                f"migration_history delta={history if history is not None else migration_history_delta}, "
                f"schema delta={schema if schema is not None else schema_delta}"
            ),
            "threshold": "migration_history delta == 0 and schema delta == 0",
            "detail": "second apply must change nothing",
        }
    )
    if not idempotent:
        failures.append(
            "idempotency:second-apply produced a non-zero delta "
            f"(migration_history={migration_history_delta}, schema={schema_delta})"
        )

    # --- Dry-run-error withholding posture (R1.10) ---
    withholding_ok = dry_run_withholds_production(
        dry_run_errors, has_production_apply_evidence
    )
    errors = _coerce_count(dry_run_errors)
    checks.append(
        {
            "id": "posture:dry-run-withholding",
            "result": PASS if withholding_ok else FAIL,
            "observed": (
                f"dry_run_errors={errors if errors is not None else dry_run_errors}, "
                f"production_apply_recorded={bool(has_production_apply_evidence)}"
            ),
            "threshold": "no production-apply evidence while dry-run reports errors",
            "detail": "production-apply evidence is withheld until a clean dry-run",
        }
    )
    if not withholding_ok:
        failures.append(
            "posture:dry-run-withholding violated — production apply recorded "
            "despite a dry-run that reported errors"
        )

    # --- Backup precedes apply (R1.6) — only when a production apply is recorded ---
    if has_production_apply_evidence:
        backup_ok = backup_precedes_apply(
            backup_completed_at, apply_started_at, max_backup_minutes
        )
        checks.append(
            {
                "id": "backup:precedes-apply",
                "result": PASS if backup_ok else FAIL,
                "observed": (
                    f"backup_completed_at={backup_completed_at!r}, "
                    f"apply_started_at={apply_started_at!r}"
                ),
                "threshold": (
                    f"backup completes at/before apply start, within "
                    f"{int(max_backup_minutes)} minutes"
                ),
                "detail": "production apply requires a recent preceding backup",
            }
        )
        if not backup_ok:
            failures.append(
                "backup:precedes-apply failed — no backup completion within "
                f"{int(max_backup_minutes)} minutes before the production apply"
            )

    # --- Rollback/disable posture note (R1.7) — documentation assertion ---
    checks.append(
        {
            "id": "posture:rollback-disable",
            "result": PASS,
            "observed": "documented",
            "threshold": "additive schema; rollback by redeploy or feature disable",
            "detail": ROLLBACK_POSTURE_NOTE,
        }
    )

    status = STATUS_PASSED if not failures else STATUS_FAILED

    n_pass = sum(1 for c in checks if c.get("result") == PASS)
    summary = (
        f"{n_pass}/{len(checks)} migration checks passed; "
        f"{len(invariants['failed_invariants'])} invariant failure(s)."
    )

    return {
        "gate_id": GATE_ID,
        "requirement": REQUIREMENT,
        "status": status,
        "generated_at": generated_at or _utc_now_iso(),
        "generated_by": generated_by,
        "summary": summary,
        "checks": checks,
        "assets": [],
        "failures": failures,
    }
