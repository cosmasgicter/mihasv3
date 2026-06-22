#!/usr/bin/env python3
"""Gate 11 — Scope_Gate wrapper.

Spec: ``.kiro/specs/beanola-launch-verification/`` — task 12.3, Requirement 11
(R11.1, R11.2, R11.3, R11.4).

This is the **impure orchestrator** for the launch-scope gate. The pure decision
logic lives in the sibling module ``scope_eval.py`` (task 12.1: ``flag_passes``,
``route_is_in_scope``, ``route_check``, ``evaluate_scope``); this script performs
the I/O the pure core deliberately avoids:

1. **Read the launch configuration's ``ENABLE_JOBS_OPS_ROUTES`` value (R11.1/R11.2).**
   It loads Django settings (``--settings``, default ``config.settings.base`` —
   the production default evaluates the flag from the environment, defaulting to
   ``false``) and reads ``settings.ENABLE_JOBS_OPS_ROUTES``. If Django cannot be
   imported/configured in the current sandbox, it **degrades clearly** to reading
   the ``ENABLE_JOBS_OPS_ROUTES`` environment variable exactly the way
   ``backend/config/settings/base.py`` does (``... in ('1', 'true', 'yes')``,
   default ``false``) and records the degraded source in the summary.

2. **Probe the jobs/automation/integrations stub routes under ``/api/v1/`` (R11.3).**
   The stub routes are mounted in ``backend/config/urls.py`` *only* inside an
   ``if settings.ENABLE_JOBS_OPS_ROUTES:`` block, so reachability is determined by
   inspecting the resolved root URLconf: a stub prefix is **reachable** (served)
   iff it is mounted in the URL resolver, and **unreachable** (rejected as not
   found / 404) iff it is absent. When Django is unavailable the probe degrades to
   the flag-derived truth that mirrors ``urls.py`` exactly (mounted iff the flag
   is truthy). Each route's full ``/api/v1/`` path, reachability, and
   ship-decision flag are captured.

3. **Evaluate + emit evidence.** It runs
   :func:`scope_eval.evaluate_scope(flag_value, stub_routes)` and writes
   ``docs/launch-evidence/11-scope/scope-evidence.json`` via the shared
   ``Evidence_Artifact`` envelope (gate_id ``scope``, requirement ``R11``,
   generated_by ``ci``) through the shared redaction helper. The artifact records
   the evaluated ``enable_jobs_ops_routes`` value (R11.2) and the full path of
   every reachable un-shipped route (R11.4).

4. **Block launch on failure.** The gate exits non-zero (failing closed) when the
   flag is anything other than ``False`` or any un-shipped stub route is reachable.

No jobs/automation/integrations module has a recorded ship decision for the
admissions launch (they are explicitly scoped out per the 2026-06-16
postmortem), so every stub route is treated as un-shipped unless an optional
``--ship-decisions`` JSON file (``{"jobs": true, ...}``) says otherwise.

It imports ``scope_eval`` from the same directory and the shared evidence schema
+ redaction helper from ``backend/`` (never copies them) via a robust
``sys.path`` insert, mirroring ``rollup.py`` / ``check-contract-sync.py``.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple


# ---------------------------------------------------------------------------
# Locate the repo + import scope_eval (same dir) and the shared schema/redaction.
# ---------------------------------------------------------------------------

_THIS_FILE = Path(__file__).resolve()
_THIS_DIR = _THIS_FILE.parent
# parents[0] = scripts/launch-verification, [1] = scripts, [2] = repo root
REPO_ROOT = _THIS_FILE.parents[2]
_BACKEND_DIR = REPO_ROOT / "backend"
_EVIDENCE_DIR = REPO_ROOT / "docs" / "launch-evidence" / "11-scope"

GATE_ID = "scope"
REQUIREMENT = "R11"

#: The jobs/automation/integrations stub routes mounted under ``/api/v1/`` in
#: ``backend/config/urls.py`` (kept in lock-step with the gated ``if`` block
#: there). Each tuple is ``(full_path, owning_module)``.
STUB_ROUTES: Tuple[Tuple[str, str], ...] = (
    ("/api/v1/jobs/", "jobs"),
    ("/api/v1/job-applications/", "jobs"),
    ("/api/v1/outreach/", "outreach"),
    ("/api/v1/automation/", "automation"),
    ("/api/v1/integrations/", "integrations"),
    ("/api/v1/analytics/", "analytics"),
    ("/api/v1/reports/", "analytics"),
)


def _ensure_paths() -> None:
    """Put the script dir (for ``scope_eval``) and ``backend/`` on ``sys.path``."""
    for entry in (str(_THIS_DIR), str(_BACKEND_DIR)):
        if entry not in sys.path:
            sys.path.insert(0, entry)


_ensure_paths()

try:
    import scope_eval  # noqa: E402  (same-directory pure core)
except ImportError as exc:  # pragma: no cover - defensive
    raise SystemExit(
        "launch-verification scope: could not import scope_eval.py from "
        f"{_THIS_DIR} — {exc}"
    )

try:
    from apps.common.launch_verification.evidence import (  # noqa: E402
        EvidenceArtifact,
        EvidenceCheck,
        to_json,
        utc_now_iso,
    )
    from apps.common.launch_verification.redaction import redact  # noqa: E402
except ImportError as exc:  # pragma: no cover - defensive
    raise SystemExit(
        "launch-verification scope: could not import the evidence schema from "
        f"{_BACKEND_DIR}/apps/common/launch_verification/ — {exc}"
    )


# ---------------------------------------------------------------------------
# Flag + reachability discovery (the impure work scope_eval avoids).
# ---------------------------------------------------------------------------


def _env_flag_value() -> bool:
    """Evaluate ``ENABLE_JOBS_OPS_ROUTES`` exactly as ``settings/base.py`` does."""
    return os.environ.get("ENABLE_JOBS_OPS_ROUTES", "false").lower() in (
        "1",
        "true",
        "yes",
    )


def _mounted_prefixes() -> set[str]:
    """Return the set of top-level URL-resolver route prefixes (Django must be set up).

    ``backend/config/urls.py`` mounts each stub include with
    ``path("api/v1/jobs/", include(...))``; ``str(pattern.pattern)`` for that
    ``URLResolver`` is the route string ``"api/v1/jobs/"``. The presence of a stub
    prefix here means a request to that path is *served* (reachable) rather than
    rejected as not found.
    """
    from django.urls import get_resolver

    prefixes: set[str] = set()
    for pattern in get_resolver().url_patterns:
        try:
            prefixes.add(str(pattern.pattern))
        except Exception:  # pragma: no cover - defensive against odd patterns
            continue
    return prefixes


def _prefix_for(full_path: str) -> str:
    """Map a full ``/api/v1/...`` path to its resolver route prefix (no leading ``/``)."""
    return full_path.lstrip("/")


def discover_via_django(settings_module: str) -> Tuple[bool, Dict[str, bool], str]:
    """Load Django and read the flag + probe stub-route reachability.

    Returns ``(flag_value, {full_path: reachable}, source_detail)``. Raises on any
    failure so the caller can fall back to the env-only degraded path.
    """
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", settings_module)
    # Honour an explicit --settings even if the env var was already set.
    os.environ["DJANGO_SETTINGS_MODULE"] = settings_module

    import django  # noqa: E402
    from django.conf import settings as dj_settings  # noqa: E402

    django.setup()

    flag_value = bool(getattr(dj_settings, "ENABLE_JOBS_OPS_ROUTES"))

    mounted = _mounted_prefixes()
    reachability: Dict[str, bool] = {}
    for full_path, _module in STUB_ROUTES:
        reachability[full_path] = _prefix_for(full_path) in mounted

    return flag_value, reachability, f"django settings '{settings_module}'"


def discover_via_env() -> Tuple[bool, Dict[str, bool], str]:
    """Degraded discovery: read the env flag and derive reachability from it.

    ``backend/config/urls.py`` mounts the stub includes *iff*
    ``settings.ENABLE_JOBS_OPS_ROUTES`` is truthy, so when Django itself cannot be
    loaded the flag is the faithful, conservative determinant of reachability: the
    routes are mounted (reachable) exactly when the flag is truthy.
    """
    flag_value = _env_flag_value()
    reachability = {full_path: flag_value for full_path, _module in STUB_ROUTES}
    return flag_value, reachability, "env var ENABLE_JOBS_OPS_ROUTES (Django unavailable)"


def load_ship_decisions(path: Optional[Path]) -> Dict[str, bool]:
    """Load optional per-module ship decisions (``{"jobs": true, ...}``).

    Absent file ⇒ no module has a recorded ship decision (the conservative,
    scoped-out default per the postmortem).
    """
    if path is None:
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise SystemExit(f"launch-verification scope: invalid --ship-decisions {path}: {exc}")
    if not isinstance(data, dict):
        raise SystemExit(
            f"launch-verification scope: --ship-decisions {path} must be a JSON object"
        )
    return {str(k): bool(v) for k, v in data.items()}


def build_stub_records(
    reachability: Dict[str, bool], ship_decisions: Dict[str, bool]
) -> List[Dict[str, Any]]:
    """Assemble the stub-route fact records consumed by ``evaluate_scope``."""
    records: List[Dict[str, Any]] = []
    for full_path, module in STUB_ROUTES:
        records.append(
            {
                "path": full_path,
                "module": module,
                "reachable": bool(reachability.get(full_path, True)),
                "has_ship_decision": bool(ship_decisions.get(module, False)),
            }
        )
    return records


# ---------------------------------------------------------------------------
# Evidence assembly.
# ---------------------------------------------------------------------------


def build_artifact(
    result: Dict[str, Any],
    stub_records: Sequence[Dict[str, Any]],
    source_detail: str,
) -> EvidenceArtifact:
    """Assemble the gate's Evidence_Artifact, redacting every recorded value."""
    flag_value = result["enable_jobs_ops_routes"]
    flag_ok = bool(result["flag_passes"])
    reachable_unshipped = list(result.get("reachable_unshipped_routes", []))
    overall_pass = bool(result["passed"])

    # Per-check rows straight from the pure evaluator (R11.1–R11.4).
    checks = [EvidenceCheck.from_dict(c) for c in result.get("checks", [])]

    # Recorded failures: the flag value when it fails (R11.2) + every reachable
    # un-shipped route's full path (R11.4).
    failures: List[Dict[str, Any]] = []
    if not flag_ok:
        failures.append(
            {
                "kind": "flag-not-false",
                "setting": "ENABLE_JOBS_OPS_ROUTES",
                "enable_jobs_ops_routes": flag_value,  # R11.2 — record the value
                "detail": "ENABLE_JOBS_OPS_ROUTES must be the boolean False for launch",
            }
        )
    for path in reachable_unshipped:
        failures.append(
            {
                "kind": "reachable-unshipped-route",
                "path": path,  # R11.4 — record the full route path
                "detail": "stub route reachable without a recorded ship decision",
            }
        )

    summary = (
        f"ENABLE_JOBS_OPS_ROUTES={flag_value!r} (flag {'ok' if flag_ok else 'FAIL'}); "
        f"{len(stub_records)} stub route(s) probed; "
        f"{len(reachable_unshipped)} reachable un-shipped; "
        f"source: {source_detail}."
    )

    artifact = EvidenceArtifact(
        gate_id=GATE_ID,
        requirement=REQUIREMENT,
        status="passed" if overall_pass else "failed",
        generated_by="ci",
        generated_at=utc_now_iso(),
        summary=str(redact(summary)),
        checks=[
            EvidenceCheck.from_dict(redact(c.to_dict()))  # type: ignore[arg-type]
            for c in checks
        ],
        assets=[],
        failures=[redact(f) for f in failures],
    )
    return artifact


def write_artifact(artifact: EvidenceArtifact) -> Path:
    """Write the artifact to the evidence store, creating parent dirs."""
    _EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    out = _EVIDENCE_DIR / "scope-evidence.json"
    out.write_text(to_json(artifact) + "\n", encoding="utf-8")
    return out


# ---------------------------------------------------------------------------
# CLI entrypoint.
# ---------------------------------------------------------------------------


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="check-launch-scope.py",
        description=(
            "Gate 11 Scope_Gate: assert ENABLE_JOBS_OPS_ROUTES is False and probe "
            "jobs/automation/integrations stub routes under /api/v1/ for "
            "reachability, emitting the scope Evidence_Artifact."
        ),
    )
    parser.add_argument(
        "--settings",
        default=os.environ.get("DJANGO_SETTINGS_MODULE", "config.settings.base"),
        help=(
            "Django settings module used to read the launch configuration "
            "(default: $DJANGO_SETTINGS_MODULE or config.settings.base)."
        ),
    )
    parser.add_argument(
        "--ship-decisions",
        type=Path,
        default=None,
        help=(
            "Optional JSON object mapping module name -> bool recording a ship "
            "decision (default: none recorded — every stub is scoped out)."
        ),
    )
    parser.add_argument(
        "--no-django",
        action="store_true",
        help="Skip Django and read the flag from the environment (degraded mode).",
    )
    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = build_arg_parser().parse_args(argv)

    ship_decisions = load_ship_decisions(args.ship_decisions)

    # 1) Read the flag + probe reachability (Django-first, env fallback).
    if args.no_django:
        flag_value, reachability, source_detail = discover_via_env()
    else:
        try:
            flag_value, reachability, source_detail = discover_via_django(args.settings)
        except Exception as exc:  # noqa: BLE001 - any Django/import/config failure degrades
            flag_value, reachability, source_detail = discover_via_env()
            source_detail = f"{source_detail}; django load failed: {exc}"

    # 2) Evaluate via the pure core (scope_eval.evaluate_scope).
    stub_records = build_stub_records(reachability, ship_decisions)
    result = scope_eval.evaluate_scope(flag_value, stub_records)

    # 3) Assemble + write the evidence artifact (redacted).
    artifact = build_artifact(result, stub_records, source_detail)
    out = write_artifact(artifact)

    # 4) Report + exit closed (block launch on failure).
    passed = artifact.status == "passed"
    print(f"launch-verification scope: {artifact.status}")
    print(f"  evidence:  {out}")
    print(f"  summary:   {artifact.summary}")
    if artifact.failures:
        print("  failures:")
        for f in artifact.failures:
            if isinstance(f, dict):
                loc = f.get("path") or f.get("setting") or ""
                print(f"    - [{f.get('kind')}] {loc}: {f.get('detail', '')}")
            else:
                print(f"    - {f}")
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
