#!/usr/bin/env python3
"""Gate 2 — Smoke_Test_Gate wrapper (Requirement 2).

**Execution world: DEPLOYED-TARGET / operator post-deploy. NOT auto-run in CI.**
This script probes a *live, deployed* Beanola frontend + backend (and the two
canonical admin surfaces) and records the result as a launch-verification
``Evidence_Artifact``. It is meant to be run by an operator after a deploy (see
``docs/runbooks/post-deploy-smoke-check.md``) or against a staging/preview
target — it is deliberately **not** wired into the automated CI gates, which
only run the pure-logic gates (5, 6, 7, 8, 11) and the rollup.

What it does (design ``.kiro/specs/beanola-launch-verification/design.md`` →
"Gate 2 — Smoke_Test_Gate"):

* **R2.1 — normalized smoke checks.** It wraps the existing smoke surfaces
  (mirroring ``scripts/smoke-production.sh`` and, optionally, invoking
  ``backend/scripts/staging_smoke.py``) and normalizes every frontend + backend
  check into a row recording the **target identifier**, the **observed result**,
  the **pass/fail outcome**, and an **execution timestamp**.
* **R2.4 — two distinct admin surfaces.** It always records ``/admin/tenants``
  (the product ``Tenant_Admin_UI``) and ``/beanola-admin-panel/`` (the
  operational ``Django_Admin``) as *two separate* reachability checks via
  :func:`smoke_eval.evaluate_admin_surfaces` — never collapsed into one.
* **R2.2 / R2.3 — reachability.** Each surface passes only on a non-error
  reachability response within a 10-second timeout (:data:`smoke_eval.TIMEOUT_MS`).
* **R2.5 — unauth/no-CSRF rejection probe.** It issues a state-changing request
  that omits valid cookie auth + CSRF and records a pass **only if** the request
  was *rejected* (:func:`smoke_eval.unauth_state_change_passes`).
* **R2.6 — conservative rollup.** It rolls every check up with
  :func:`smoke_eval.evaluate_smoke`: the gate passes iff there is at least one
  check and every check passed; any failure marks the gate ``failed`` and the
  process exits non-zero.

The artifact is emitted to
``docs/launch-evidence/02-smoke/smoke-evidence.json`` through the shared
``Evidence_Artifact`` envelope (``gate_id="smoke"``, ``requirement="R2"``,
``generated_by="deployed-target"``).

Base URLs default to the production hosts (frontend ``apply.beanola.com``,
backend ``api.beanola.com``) and every URL/path is overridable via environment
variables or CLI flags. HTTP is performed with the stdlib ``urllib`` (no hard
dependency on ``requests``) so the script runs anywhere; when a target is
unreachable in a sandbox it degrades clearly — the unreachable surface is
recorded as a ``fail`` with the observed error, which (correctly) marks the gate
not passed. A ``--dry-run`` mode emits a valid envelope over synthetic
observations without touching the network, for local verification.

Run it::

    python3 scripts/launch-verification/run-smoke-gate.py \\
        --frontend-url https://apply.beanola.com \\
        --backend-url  https://api.beanola.com

    # offline envelope check (no network):
    python3 scripts/launch-verification/run-smoke-gate.py --dry-run

**Validates: Requirements 2.1, 2.5, 2.6**
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple


# ---------------------------------------------------------------------------
# Import the pure smoke core (same dir) and the shared evidence schema (backend).
# ---------------------------------------------------------------------------
#
# ``smoke_eval`` lives beside this file in ``scripts/launch-verification/``; the
# evidence schema lives at ``<repo>/backend/apps/common/launch_verification/
# evidence.py``. We resolve both from this file's location so imports are robust
# regardless of the current working directory.

_THIS_FILE = Path(__file__).resolve()
_THIS_DIR = _THIS_FILE.parent
# parents[0] = scripts/launch-verification, [1] = scripts, [2] = repo root
REPO_ROOT = _THIS_FILE.parents[2]
_BACKEND_DIR = REPO_ROOT / "backend"


def _ensure_on_path(directory: Path) -> None:
    """Insert ``directory`` at the front of ``sys.path`` if not already present."""
    text = str(directory)
    if text not in sys.path:
        sys.path.insert(0, text)


_ensure_on_path(_THIS_DIR)
_ensure_on_path(_BACKEND_DIR)

try:
    import smoke_eval  # noqa: E402,F401  (same-dir pure core, task 8.1)
    from smoke_eval import (  # noqa: E402
        DJANGO_ADMIN_PATH,
        FAIL,
        PASS,
        TENANT_ADMIN_PATH,
        TIMEOUT_MS,
        evaluate_admin_surfaces,
        evaluate_smoke,
        surface_check,
        unauth_state_change_passes,
    )
except ImportError as exc:  # pragma: no cover - defensive, surfaces a clear error
    raise SystemExit(
        "run-smoke-gate: could not import the smoke core from "
        f"{_THIS_DIR}/smoke_eval.py — {exc}"
    )

try:
    from apps.common.launch_verification.evidence import (  # noqa: E402
        EvidenceArtifact,
        EvidenceStatus,
        GeneratedBy,
        to_json,
        utc_now_iso,
    )
except ImportError as exc:  # pragma: no cover - defensive, surfaces a clear error
    raise SystemExit(
        "run-smoke-gate: could not import the evidence schema from "
        f"{_BACKEND_DIR}/apps/common/launch_verification/evidence.py — {exc}"
    )


# ---------------------------------------------------------------------------
# Defaults — production hosts; every value is overridable (env then CLI).
# ---------------------------------------------------------------------------

DEFAULT_FRONTEND_URL = "https://apply.beanola.com"
DEFAULT_BACKEND_URL = "https://api.beanola.com"

#: Default backend state-changing endpoint used for the unauth/no-CSRF probe
#: (R2.5). It requires cookie auth + CSRF, so an unauthenticated POST must be
#: rejected (4xx) rather than processed.
DEFAULT_STATE_CHANGE_PATH = "/api/v1/payments/mobile-money/"

#: The frontend reachability surfaces (mirrors ``smoke-production.sh`` landing
#: check). Each tuple is (target id, path).
_FRONTEND_SURFACES: Tuple[Tuple[str, str], ...] = (
    ("frontend:landing", "/"),
)

#: The backend reachability surfaces (mirrors ``smoke-production.sh``).
_BACKEND_SURFACES: Tuple[Tuple[str, str], ...] = (
    ("backend:health-live", "/health/live/"),
    ("backend:health-ready", "/health/ready/"),
    ("backend:auth-session", "/api/v1/auth/session/"),
    ("backend:catalog-programs", "/api/v1/catalog/programs/"),
)


# ---------------------------------------------------------------------------
# HTTP probing — stdlib only, degrades clearly when a target is unreachable.
# ---------------------------------------------------------------------------


def _join(base_url: str, path: str) -> str:
    """Join a base URL and a path without doubling the slash."""
    return base_url.rstrip("/") + "/" + path.lstrip("/")


def http_probe(
    url: str,
    *,
    method: str = "GET",
    timeout_ms: float = TIMEOUT_MS,
    data: Optional[bytes] = None,
    headers: Optional[Dict[str, str]] = None,
) -> Tuple[int, float, str]:
    """Issue one HTTP request and return ``(http_status, latency_ms, error)``.

    Uses the stdlib ``urllib`` so there is no hard dependency on ``requests``.
    On an HTTP error response (4xx/5xx) the real status code is returned (the
    surface *did* respond). On a timeout or a connection failure — the sandbox
    case — the status is the ``0`` sentinel that :mod:`smoke_eval` treats as "no
    response", the measured latency is returned, and ``error`` carries a short
    human description. The function never raises for a network failure.
    """
    timeout_s = max(0.0, timeout_ms / 1000.0)
    request = urllib.request.Request(
        url, method=method, data=data, headers=headers or {}
    )
    start = time.monotonic()
    try:
        with urllib.request.urlopen(request, timeout=timeout_s) as response:
            latency_ms = (time.monotonic() - start) * 1000.0
            return int(response.getcode() or 0), latency_ms, ""
    except urllib.error.HTTPError as exc:
        # An HTTP error is still a real response with a status code.
        latency_ms = (time.monotonic() - start) * 1000.0
        return int(exc.code), latency_ms, ""
    except Exception as exc:  # noqa: BLE001 - degrade clearly on any transport error
        latency_ms = (time.monotonic() - start) * 1000.0
        return 0, latency_ms, f"{type(exc).__name__}: {exc}"


# ---------------------------------------------------------------------------
# Check-row enrichment (R2.1: target id, observed result, pass/fail, timestamp).
# ---------------------------------------------------------------------------


def _observed(http_status: int, latency_ms: float, error: str) -> str:
    """Human-readable observation string for a probed surface."""
    if error:
        return f"unreachable ({error})"
    return f"HTTP {http_status} in {latency_ms:.0f} ms"


def _enrich(check: Dict[str, Any], *, observed: str, timestamp: str) -> Dict[str, Any]:
    """Add the R2.1 ``observed`` + ``timestamp`` columns to a smoke check row."""
    enriched = dict(check)
    enriched["observed"] = observed
    enriched["timestamp"] = timestamp
    return enriched


# ---------------------------------------------------------------------------
# Observation model — a probed (or synthetic) reachability fact for a surface.
# ---------------------------------------------------------------------------


def _probe_surface(
    target_id: str,
    path: str,
    url: str,
    timeout_ms: float,
    *,
    dry_run: bool,
) -> Dict[str, Any]:
    """Probe one reachability surface and return an enriched check row.

    In ``dry_run`` the network is not touched: a synthetic passing observation
    (HTTP 200, 1 ms) is used so the wrapper can emit a valid envelope for
    verification without a live deployment.
    """
    if dry_run:
        http_status, latency_ms, error = 200, 1.0, ""
    else:
        http_status, latency_ms, error = http_probe(url, timeout_ms=timeout_ms)

    row = surface_check(target_id, path, http_status, latency_ms, timeout_ms)
    row["target"] = target_id
    row["url"] = url
    return _enrich(
        row,
        observed=_observed(http_status, latency_ms, error),
        timestamp=utc_now_iso(),
    )


def _admin_surface_checks(
    frontend_url: str,
    backend_url: str,
    tenant_admin_path: str,
    django_admin_path: str,
    timeout_ms: float,
    *,
    dry_run: bool,
) -> List[Dict[str, Any]]:
    """Build the two **distinct** admin-surface checks via the pure core (R2.4).

    ``/admin/tenants`` lives on the deployed frontend; ``/beanola-admin-panel/``
    lives on the deployed backend. They are probed independently and handed to
    :func:`smoke_eval.evaluate_admin_surfaces`, which always returns two separate
    rows keyed by distinct surface slugs.
    """
    tenant_url = _join(frontend_url, tenant_admin_path)
    django_url = _join(backend_url, django_admin_path)

    if dry_run:
        tenant_status, tenant_latency, tenant_err = 200, 1.0, ""
        django_status, django_latency, django_err = 200, 1.0, ""
    else:
        tenant_status, tenant_latency, tenant_err = http_probe(
            tenant_url, timeout_ms=timeout_ms
        )
        django_status, django_latency, django_err = http_probe(
            django_url, timeout_ms=timeout_ms
        )

    rows = evaluate_admin_surfaces(
        {"http_status": tenant_status, "latency_ms": tenant_latency},
        {"http_status": django_status, "latency_ms": django_latency},
        timeout_ms,
    )
    # The two rows come back in (tenant-admin, django-admin) order — annotate
    # each with its URL, observation, and timestamp for the artifact.
    annotations = [
        (tenant_url, _observed(tenant_status, tenant_latency, tenant_err)),
        (django_url, _observed(django_status, django_latency, django_err)),
    ]
    enriched: List[Dict[str, Any]] = []
    for row, (url, observed) in zip(rows, annotations):
        row["target"] = row.get("surface")
        row["url"] = url
        enriched.append(_enrich(row, observed=observed, timestamp=utc_now_iso()))
    return enriched


def _unauth_probe_check(
    backend_url: str,
    state_change_path: str,
    timeout_ms: float,
    *,
    dry_run: bool,
) -> Dict[str, Any]:
    """Build the unauth/no-CSRF state-change rejection check (R2.5).

    Issues a POST to a state-changing endpoint with **no** cookie auth and **no**
    CSRF token. The check passes only if the request was *rejected* rather than
    processed — interpreted here as a ``4xx`` response (the endpoint refused the
    request). A ``2xx``/``3xx`` (processed) or a ``5xx``/no-response is treated as
    *not rejected* and fails the check.
    """
    url = _join(backend_url, state_change_path)
    if dry_run:
        # Synthetic: a healthy backend rejects the unauthenticated write.
        http_status, latency_ms, error = 403, 1.0, ""
    else:
        http_status, latency_ms, error = http_probe(
            url,
            method="POST",
            timeout_ms=timeout_ms,
            data=b"{}",
            headers={"Content-Type": "application/json"},
        )

    rejected = (not error) and (400 <= http_status < 500)
    passed = unauth_state_change_passes(rejected)
    timestamp = utc_now_iso()
    return {
        "id": "unauth-state-change",
        "target": "backend:unauth-state-change",
        "surface": "unauth-state-change",
        "path": state_change_path,
        "url": url,
        "method": "POST",
        "http_status": http_status,
        "rejected_when_unauthenticated": rejected,
        "threshold": "request rejected (4xx) without cookie auth + CSRF",
        "result": PASS if passed else FAIL,
        "observed": _observed(http_status, latency_ms, error),
        "timestamp": timestamp,
    }


def _wrapped_script_check(
    script_path: Path,
    argv: Sequence[str],
    *,
    target_id: str,
    env: Optional[Dict[str, str]] = None,
    timeout_s: float = 120.0,
) -> Dict[str, Any]:
    """Invoke an existing smoke script and normalize its exit code into a row.

    Wraps ``scripts/smoke-production.sh`` or ``backend/scripts/staging_smoke.py``
    (R2.1: "wrap the existing smoke scripts"). The script passes iff it exits 0.
    Any non-zero exit, missing script, or execution error is recorded as a
    ``fail`` with the observed exit code / error — never raising.
    """
    timestamp = utc_now_iso()
    if not script_path.is_file():
        return {
            "id": f"wrapped:{target_id}",
            "target": target_id,
            "surface": "wrapped-script",
            "result": FAIL,
            "threshold": "wrapped smoke script exits 0",
            "observed": f"script not found: {script_path}",
            "timestamp": timestamp,
        }
    try:
        completed = subprocess.run(  # noqa: S603 - fixed argv, no shell
            list(argv),
            cwd=str(REPO_ROOT),
            capture_output=True,
            text=True,
            timeout=timeout_s,
            env=env,
        )
        exit_code = completed.returncode
        observed = f"exit {exit_code}"
    except subprocess.TimeoutExpired:
        exit_code = -1
        observed = f"timeout after {timeout_s:.0f}s"
    except Exception as exc:  # noqa: BLE001 - degrade clearly
        exit_code = -1
        observed = f"{type(exc).__name__}: {exc}"
    return {
        "id": f"wrapped:{target_id}",
        "target": target_id,
        "surface": "wrapped-script",
        "exit_code": exit_code,
        "result": PASS if exit_code == 0 else FAIL,
        "threshold": "wrapped smoke script exits 0",
        "observed": observed,
        "timestamp": timestamp,
    }


# ---------------------------------------------------------------------------
# Gate orchestration.
# ---------------------------------------------------------------------------


def run_smoke_gate(
    *,
    frontend_url: str,
    backend_url: str,
    tenant_admin_path: str,
    django_admin_path: str,
    state_change_path: str,
    timeout_ms: float = TIMEOUT_MS,
    invoke_shell_smoke: bool = False,
    dry_run: bool = False,
) -> EvidenceArtifact:
    """Run every smoke check and build the Gate 2 ``Evidence_Artifact``.

    Returns the artifact (status ``passed``/``failed`` per the conservative
    :func:`smoke_eval.evaluate_smoke` rollup). Performs no file I/O; the caller
    persists the artifact.
    """
    checks: List[Dict[str, Any]] = []

    # R2.1 — frontend + backend reachability surfaces (mirrors smoke-production.sh).
    for target_id, path in _FRONTEND_SURFACES:
        checks.append(
            _probe_surface(
                target_id, path, _join(frontend_url, path), timeout_ms, dry_run=dry_run
            )
        )
    for target_id, path in _BACKEND_SURFACES:
        checks.append(
            _probe_surface(
                target_id, path, _join(backend_url, path), timeout_ms, dry_run=dry_run
            )
        )

    # R2.4 — the two distinct canonical admin surfaces.
    checks.extend(
        _admin_surface_checks(
            frontend_url,
            backend_url,
            tenant_admin_path,
            django_admin_path,
            timeout_ms,
            dry_run=dry_run,
        )
    )

    # R2.5 — unauthenticated / no-CSRF state-change rejection probe.
    checks.append(
        _unauth_probe_check(backend_url, state_change_path, timeout_ms, dry_run=dry_run)
    )

    # Optionally wrap the existing shell + python smoke scripts (R2.1). Skipped
    # in dry-run (no live target) so verification stays offline.
    if invoke_shell_smoke and not dry_run:
        env_app = {**os.environ, "APP_URL": frontend_url, "API_URL": backend_url}
        shell_script = REPO_ROOT / "scripts" / "smoke-production.sh"
        checks.append(
            _wrapped_script_check(
                shell_script,
                ["bash", str(shell_script)],
                target_id="smoke-production.sh",
                env=env_app,
            )
        )

    # R2.6 — conservative rollup over every check.
    rollup = evaluate_smoke(checks)
    passed = rollup["passed"]

    status = EvidenceStatus.PASSED if passed else EvidenceStatus.FAILED
    failures: List[Dict[str, Any]] = []
    if not passed:
        failed_ids = set(rollup["failed"])
        for check in checks:
            if check.get("id") in failed_ids or check.get("result") != PASS:
                failures.append(
                    {
                        "target": check.get("target", check.get("id")),
                        "observed": check.get("observed", ""),
                        "result": check.get("result"),
                    }
                )

    summary = (
        f"{rollup['passed_count']}/{rollup['total']} smoke checks passed "
        f"({'PASS' if passed else 'FAIL'})"
        + (" [dry-run synthetic]" if dry_run else "")
    )

    return EvidenceArtifact(
        gate_id="smoke",
        requirement="R2",
        status=status,
        generated_by=GeneratedBy.DEPLOYED_TARGET,
        summary=summary,
        checks=checks,
        assets=[],
        failures=failures,
    )


def _default_output_path() -> Path:
    """The Gate 2 artifact path under the evidence store."""
    return REPO_ROOT / "docs" / "launch-evidence" / "02-smoke" / "smoke-evidence.json"


def write_artifact(artifact: EvidenceArtifact, output_path: Path) -> None:
    """Write the artifact to ``output_path`` as pretty JSON, creating parent dirs."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(to_json(artifact) + "\n", encoding="utf-8")


# ---------------------------------------------------------------------------
# CLI entrypoint.
# ---------------------------------------------------------------------------


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="run-smoke-gate.py",
        description=(
            "Gate 2 Smoke_Test_Gate wrapper (deployed-target; NOT auto-run in "
            "CI). Probes the deployed frontend + backend and the two canonical "
            "admin surfaces, runs the unauth/no-CSRF rejection probe, and emits "
            "docs/launch-evidence/02-smoke/smoke-evidence.json."
        ),
    )
    parser.add_argument(
        "--frontend-url",
        default=os.environ.get("APP_URL", DEFAULT_FRONTEND_URL),
        help=f"Deployed frontend base URL (env APP_URL; default {DEFAULT_FRONTEND_URL}).",
    )
    parser.add_argument(
        "--backend-url",
        default=os.environ.get("API_URL", DEFAULT_BACKEND_URL),
        help=f"Deployed backend base URL (env API_URL; default {DEFAULT_BACKEND_URL}).",
    )
    parser.add_argument(
        "--tenant-admin-path",
        default=os.environ.get("TENANT_ADMIN_PATH", TENANT_ADMIN_PATH),
        help=f"Product tenant-admin path (default {TENANT_ADMIN_PATH}).",
    )
    parser.add_argument(
        "--django-admin-path",
        default=os.environ.get("DJANGO_ADMIN_PATH", DJANGO_ADMIN_PATH),
        help=f"Django operational admin path (default {DJANGO_ADMIN_PATH}).",
    )
    parser.add_argument(
        "--state-change-path",
        default=os.environ.get("STATE_CHANGE_PATH", DEFAULT_STATE_CHANGE_PATH),
        help=(
            "Backend state-changing endpoint for the unauth/no-CSRF probe "
            f"(default {DEFAULT_STATE_CHANGE_PATH})."
        ),
    )
    parser.add_argument(
        "--timeout-ms",
        type=float,
        default=TIMEOUT_MS,
        help=f"Per-surface reachability timeout in ms (default {TIMEOUT_MS}).",
    )
    parser.add_argument(
        "--invoke-shell-smoke",
        action="store_true",
        help="Also invoke scripts/smoke-production.sh and record its result.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Emit a valid envelope over synthetic observations (no network).",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Artifact output path (default: docs/launch-evidence/02-smoke/smoke-evidence.json).",
    )
    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    """CLI: run the smoke gate, write the artifact, return the exit code.

    Returns ``0`` only when the gate passed (every check passed); any not-passed
    verdict — including an unreachable target in a sandbox — returns ``1`` so the
    operator/CI flow fails closed.
    """
    args = build_arg_parser().parse_args(argv)
    output_path: Path = args.output or _default_output_path()

    artifact = run_smoke_gate(
        frontend_url=args.frontend_url,
        backend_url=args.backend_url,
        tenant_admin_path=args.tenant_admin_path,
        django_admin_path=args.django_admin_path,
        state_change_path=args.state_change_path,
        timeout_ms=args.timeout_ms,
        invoke_shell_smoke=args.invoke_shell_smoke,
        dry_run=args.dry_run,
    )
    write_artifact(artifact, output_path)

    passed = artifact.status == EvidenceStatus.PASSED.value
    print(f"launch-verification smoke gate: {artifact.status}")
    print(f"  {artifact.summary}")
    print(f"  frontend: {args.frontend_url}")
    print(f"  backend:  {args.backend_url}")
    print(f"  written:  {output_path}")
    if artifact.failures:
        for failure in artifact.failures:
            print(f"  FAIL {failure.get('target')}: {failure.get('observed')}")
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
