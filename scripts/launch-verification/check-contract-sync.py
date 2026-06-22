#!/usr/bin/env python3
"""Gate 8 — Contract_Sync_Gate orchestrator.

Spec: ``.kiro/specs/beanola-launch-verification/`` — task 10.5, Requirement 8
(R8.1, R8.2, R8.3, R8.5, R8.6).

This is the **impure orchestrator** for the frontend/backend tenant-admin
contract gate. The pure decision logic lives in the TypeScript comparator
``apps/admissions/tests/contract/contractComparator.ts`` (task 10.1); this script
reuses it as the single source of truth via the bun bridge
``apps/admissions/scripts/check-contract-sync-bridge.ts`` (approach (a) from the
task) rather than re-expressing shape diffing in Python.

What it does, in one run:

1. **Generate the OpenAPI artifact in the same run (R8.1).** Runs
   ``manage.py spectacular`` to write ``docs/launch-evidence/08-contract/openapi.yaml``
   (the reviewable artifact) and a machine-readable JSON copy the bridge consumes.
   If generation does not complete, the gate fails (it never fabricates a pass).
2. **Run the comparator over all eleven tabs (R8.2–R8.6).** Invokes the bun
   bridge, which feeds the declared tenant-admin endpoint contracts to
   ``evaluateContract`` and cross-checks each endpoint path against the freshly
   generated schema.
3. **Emit the shared Evidence_Artifact** at
   ``docs/launch-evidence/08-contract/contract-evidence.json`` (gate_id
   ``contract``, requirement ``R8``, generated_by ``ci``) through the shared
   redaction helper, recording per-check rows and, on failure, the diverging
   field name + endpoint path / the unmapped error code + endpoint / the
   uncovered tab.
4. **Exit non-zero on failure** so CI fails closed. The gate passes iff the
   OpenAPI artifact was generated, no shape diverges, every backend error code is
   mapped, and every tenant-admin tab has at least one checked endpoint.

It imports the shared evidence envelope + redaction helper from ``backend/``
(never copies them) via a robust ``sys.path`` insert, mirroring ``rollup.py``.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence


# ---------------------------------------------------------------------------
# Locate the repo + import the shared evidence schema and redaction helper.
# ---------------------------------------------------------------------------

_THIS_FILE = Path(__file__).resolve()
# parents[0] = scripts/launch-verification, [1] = scripts, [2] = repo root
REPO_ROOT = _THIS_FILE.parents[2]
_BACKEND_DIR = REPO_ROOT / "backend"
_BRIDGE = REPO_ROOT / "apps" / "admissions" / "scripts" / "check-contract-sync-bridge.ts"
_EVIDENCE_DIR = REPO_ROOT / "docs" / "launch-evidence" / "08-contract"

GATE_ID = "contract"
REQUIREMENT = "R8"


def _ensure_backend_on_path() -> None:
    backend = str(_BACKEND_DIR)
    if backend not in sys.path:
        sys.path.insert(0, backend)


_ensure_backend_on_path()

try:
    from apps.common.launch_verification.evidence import (  # noqa: E402
        EvidenceArtifact,
        EvidenceCheck,
        to_json,
        utc_now_iso,
    )
    from apps.common.launch_verification.redaction import redact  # noqa: E402
except ImportError as exc:  # pragma: no cover - defensive, surfaces a clear error
    raise SystemExit(
        "launch-verification contract-sync: could not import the evidence schema "
        f"from {_BACKEND_DIR}/apps/common/launch_verification/ — {exc}"
    )


# ---------------------------------------------------------------------------
# OpenAPI generation (R8.1).
# ---------------------------------------------------------------------------


class GenerationResult:
    """Outcome of the ``manage.py spectacular`` generation step."""

    def __init__(
        self,
        *,
        ok: bool,
        yaml_path: Optional[Path],
        json_path: Optional[Path],
        detail: str,
    ) -> None:
        self.ok = ok
        self.yaml_path = yaml_path
        self.json_path = json_path
        self.detail = detail


def _run_spectacular(
    python_exe: str, out_file: Path, *, as_json: bool
) -> subprocess.CompletedProcess[str]:
    """Run ``manage.py spectacular`` writing ``out_file`` (YAML or JSON)."""
    out_file.parent.mkdir(parents=True, exist_ok=True)
    cmd = [python_exe, "manage.py", "spectacular", "--file", str(out_file)]
    if as_json:
        cmd += ["--format", "openapi-json"]
    return subprocess.run(
        cmd,
        cwd=str(_BACKEND_DIR),
        capture_output=True,
        text=True,
        check=False,
    )


def generate_openapi(python_exe: str, json_tmp: Path) -> GenerationResult:
    """Generate ``openapi.yaml`` (artifact) + a JSON copy for the bridge.

    The YAML file is the reviewable Evidence_Artifact required by R8.1; the JSON
    copy is consumed by the bridge for the endpoint-path cross-check. Generation
    failure (non-zero exit, missing/empty output) is reported so the gate can
    fail closed.
    """
    yaml_path = _EVIDENCE_DIR / "openapi.yaml"

    try:
        yaml_proc = _run_spectacular(python_exe, yaml_path, as_json=False)
    except OSError as exc:
        return GenerationResult(
            ok=False,
            yaml_path=None,
            json_path=None,
            detail=f"could not execute manage.py spectacular: {exc}",
        )

    if yaml_proc.returncode != 0 or not yaml_path.is_file() or yaml_path.stat().st_size == 0:
        tail = (yaml_proc.stderr or yaml_proc.stdout or "").strip().splitlines()
        snippet = " | ".join(tail[-3:]) if tail else "no output"
        return GenerationResult(
            ok=False,
            yaml_path=yaml_path if yaml_path.is_file() else None,
            json_path=None,
            detail=(
                f"manage.py spectacular (yaml) exited {yaml_proc.returncode}: {snippet}"
            ),
        )

    # JSON copy for the bridge cross-check. A JSON-format failure is non-fatal:
    # the comparator still runs (pure), the path cross-check just degrades.
    json_path: Optional[Path] = None
    try:
        json_proc = _run_spectacular(python_exe, json_tmp, as_json=True)
        if json_proc.returncode == 0 and json_tmp.is_file() and json_tmp.stat().st_size > 0:
            json_path = json_tmp
    except OSError:
        json_path = None

    detail = "openapi.yaml generated"
    if json_path is None:
        detail += " (JSON copy unavailable — path cross-check degraded)"
    return GenerationResult(ok=True, yaml_path=yaml_path, json_path=json_path, detail=detail)


# ---------------------------------------------------------------------------
# Bun bridge invocation (reuses the comparator SSOT).
# ---------------------------------------------------------------------------


def _resolve_bun(explicit: Optional[str]) -> Optional[str]:
    if explicit:
        return explicit
    found = shutil.which("bun")
    if found:
        return found
    # Common default install location.
    candidate = Path.home() / ".bun" / "bin" / "bun"
    return str(candidate) if candidate.is_file() else None


def run_bridge(bun_exe: str, openapi_json: Optional[Path]) -> Dict[str, Any]:
    """Run the bun bridge and return its parsed JSON result.

    Raises :class:`RuntimeError` on any failure to execute or parse, so the caller
    can record the gate as not passed.
    """
    if not _BRIDGE.is_file():
        raise RuntimeError(f"contract-sync bridge not found at {_BRIDGE}")
    cmd = [bun_exe, str(_BRIDGE)]
    if openapi_json is not None:
        cmd += ["--openapi", str(openapi_json)]
    try:
        proc = subprocess.run(
            cmd, cwd=str(REPO_ROOT), capture_output=True, text=True, check=False
        )
    except OSError as exc:
        raise RuntimeError(f"could not execute bun bridge: {exc}") from exc
    if proc.returncode != 0:
        err = (proc.stderr or proc.stdout or "").strip()
        raise RuntimeError(f"bun bridge exited {proc.returncode}: {err}")
    try:
        return json.loads(proc.stdout)
    except (json.JSONDecodeError, TypeError) as exc:
        raise RuntimeError(f"bun bridge produced invalid JSON: {exc}") from exc


# ---------------------------------------------------------------------------
# Evidence assembly.
# ---------------------------------------------------------------------------


def _checks_from_bridge(bridge: Dict[str, Any]) -> List[EvidenceCheck]:
    """Convert the bridge's comparator + spec-path checks into evidence rows."""
    checks: List[EvidenceCheck] = []
    contract = bridge.get("contract", {}) or {}
    for raw in contract.get("checks", []) or []:
        if isinstance(raw, dict) and "id" in raw and "result" in raw:
            checks.append(EvidenceCheck.from_dict(raw))

    # Spec-path cross-check rollup (R8.1 — generated artifact actually consumed).
    openapi = bridge.get("openapi", {}) or {}
    if openapi.get("provided"):
        missing = openapi.get("missingPaths", []) or []
        total = len(openapi.get("checks", []) or [])
        present = total - len(missing)
        checks.append(
            EvidenceCheck(
                id="openapi-path-coverage",
                result="pass" if not missing else "fail",
                observed=f"{present}/{total} declared endpoints present in schema",
                threshold="every declared endpoint present in generated schema",
                detail="; ".join(
                    f"{m.get('endpoint')} absent" for m in missing
                ),
            )
        )
    return checks


def _failures_from_bridge(bridge: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Normalise bridge failures into the recorded failure shape (R8.5/8.6)."""
    failures: List[Dict[str, Any]] = []
    for f in bridge.get("failures", []) or []:
        if not isinstance(f, dict):
            continue
        record: Dict[str, Any] = {"kind": f.get("kind"), "detail": f.get("detail", "")}
        if f.get("endpoint"):
            record["endpoint"] = f["endpoint"]
        if f.get("tab"):
            record["tab"] = f["tab"]
        if f.get("field"):
            record["field"] = f["field"]
        if f.get("unmappedCode"):
            record["unmapped_error_code"] = f["unmappedCode"]
        failures.append(record)
    return failures


def build_artifact(
    generation: GenerationResult,
    bridge: Optional[Dict[str, Any]],
    bridge_error: Optional[str],
) -> EvidenceArtifact:
    """Assemble the gate's Evidence_Artifact, redacting every recorded value."""
    checks: List[EvidenceCheck] = []
    failures: List[Dict[str, Any]] = []

    # OpenAPI generation check (R8.1).
    checks.append(
        EvidenceCheck(
            id="openapi-generation",
            result="pass" if generation.ok else "fail",
            observed=generation.detail,
            threshold="OpenAPI artifact generated in the same run",
            detail="",
        )
    )
    if not generation.ok:
        failures.append(
            {"kind": "openapi-generation-failed", "detail": generation.detail}
        )

    bridge_ok = False
    if bridge_error is not None:
        checks.append(
            EvidenceCheck(
                id="contract-comparator",
                result="fail",
                observed=bridge_error,
                threshold="comparator runs over all eleven tenant-admin tabs",
                detail="",
            )
        )
        failures.append({"kind": "comparator-error", "detail": bridge_error})
    elif bridge is not None:
        checks.extend(_checks_from_bridge(bridge))
        failures.extend(_failures_from_bridge(bridge))
        bridge_ok = bool(bridge.get("pass"))

    overall_pass = generation.ok and bridge_error is None and bridge_ok

    # Human-readable summary.
    if bridge is not None and bridge_error is None:
        summary = (
            f"{bridge.get('endpointCount', 0)} endpoint(s) across "
            f"{bridge.get('tabsCovered', 0)}/{bridge.get('tabsExpected', 0)} tabs; "
            f"{len(failures)} failure(s); "
            f"openapi {'generated' if generation.ok else 'NOT generated'}."
        )
    else:
        summary = (
            f"Contract_Sync_Gate could not complete: "
            f"{bridge_error or generation.detail}"
        )

    assets = ["openapi.yaml"] if generation.yaml_path is not None else []

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
        assets=assets,
        failures=[redact(f) for f in failures],
    )
    return artifact


def write_artifact(artifact: EvidenceArtifact) -> Path:
    """Write the artifact to the evidence store, creating parent dirs."""
    _EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    out = _EVIDENCE_DIR / "contract-evidence.json"
    out.write_text(to_json(artifact) + "\n", encoding="utf-8")
    return out


# ---------------------------------------------------------------------------
# CLI entrypoint.
# ---------------------------------------------------------------------------


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="check-contract-sync.py",
        description=(
            "Gate 8 Contract_Sync_Gate: generate OpenAPI in the same run and "
            "contract-check the frontend tenant-admin services against the "
            "backend serializers across all eleven tabs."
        ),
    )
    parser.add_argument(
        "--python",
        default=sys.executable,
        help="Python interpreter used to run manage.py (default: this interpreter).",
    )
    parser.add_argument(
        "--bun",
        default=None,
        help="Path to the bun executable (default: auto-detected on PATH / ~/.bun).",
    )
    parser.add_argument(
        "--skip-openapi",
        action="store_true",
        help=(
            "Skip OpenAPI generation (the gate then fails R8.1). For local "
            "comparator-only debugging; not for CI."
        ),
    )
    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = build_arg_parser().parse_args(argv)

    with tempfile.TemporaryDirectory(prefix="contract-sync-") as tmp:
        json_tmp = Path(tmp) / "openapi.json"

        # 1) Generate the OpenAPI artifact in the same run (R8.1).
        if args.skip_openapi:
            generation = GenerationResult(
                ok=False,
                yaml_path=None,
                json_path=None,
                detail="OpenAPI generation skipped (--skip-openapi)",
            )
        else:
            generation = generate_openapi(args.python, json_tmp)

        # 2) Run the comparator (SSOT) via the bun bridge. The comparator is pure,
        #    so it runs even when generation degraded — the gate still fails R8.1,
        #    but the evidence captures the full contract picture.
        bridge: Optional[Dict[str, Any]] = None
        bridge_error: Optional[str] = None
        bun_exe = _resolve_bun(args.bun)
        if bun_exe is None:
            bridge_error = "bun executable not found (PATH / ~/.bun/bin/bun)"
        else:
            try:
                bridge = run_bridge(bun_exe, generation.json_path)
            except RuntimeError as exc:
                bridge_error = str(exc)

        # 3) Assemble + write the evidence artifact (redacted).
        artifact = build_artifact(generation, bridge, bridge_error)
        out = write_artifact(artifact)

    # 4) Report + exit closed.
    passed = artifact.status == "passed"
    print(f"launch-verification contract-sync: {artifact.status}")
    print(f"  evidence:  {out}")
    if generation.yaml_path is not None:
        print(f"  openapi:   {generation.yaml_path}")
    print(f"  summary:   {artifact.summary}")
    if artifact.failures:
        print("  failures:")
        for f in artifact.failures:
            if isinstance(f, dict):
                loc = f.get("endpoint") or f.get("tab") or ""
                code = f.get("unmapped_error_code")
                field = f.get("field")
                extra = ""
                if field:
                    extra = f" field={field}"
                elif code:
                    extra = f" code={code}"
                print(f"    - [{f.get('kind')}] {loc}{extra}: {f.get('detail', '')}")
            else:
                print(f"    - {f}")
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
