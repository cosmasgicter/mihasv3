#!/usr/bin/env python3
"""Gate 12 — the launch-verification rollup aggregator.

This is the single deterministic step that reads all **eleven** gate
``Evidence_Artifact`` JSON files under ``docs/launch-evidence/`` and declares the
Beanola platform ``production-launch-ready`` or ``not-production-launch-ready``.
It emits both the machine-readable ``rollup.json`` and the human-readable
``launch-readiness.md`` named in the design's "Gate 12 — Rollup aggregator" row.

Design (``.kiro/specs/beanola-launch-verification/design.md`` → "Gate 12 — Rollup
aggregator" and "Data Models" → "Rollup status object"):

* The aggregator **never re-runs a gate** — it only reads each gate's persisted
  artifact plus a filesystem readability probe.
* The verdict is **conservative by construction**: it is ``production-launch-ready``
  *iff* all eleven gates have an explicit ``passed`` status **and** every
  referenced artifact is present, readable, and parseable. A gate that is
  missing, ``unknown``/not-yet-evaluated, ``failed``, or whose artifact cannot be
  read/parsed forces ``not-production-launch-ready`` and is named in the output.
* All eleven gates are enumerated in the output every time.

The module is split into a **pure verdict core** (``compute_rollup`` over a list
of :class:`GateProbe` records — no I/O whatsoever) and a thin **filesystem
wrapper** (``probe_gate`` / ``build_rollup`` / ``write_rollup``) so the conservative
verdict logic is property-testable independent of any real evidence store
(tasks 2.2 / 2.3 / Properties 1 and 2).

It imports the shared rollup schema from
``backend/apps/common/launch_verification/evidence.py`` (never copies it) via a
robust ``sys.path`` insert that locates the repo's ``backend/`` directory.

**Validates: Requirements 12.1, 12.2, 12.3, 12.4, 12.5, 12.6**
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional, Sequence


# ---------------------------------------------------------------------------
# Import the shared rollup schema from backend/ (import it, never copy it).
# ---------------------------------------------------------------------------
#
# This script lives at ``<repo>/scripts/launch-verification/rollup.py``; the
# evidence schema lives at
# ``<repo>/backend/apps/common/launch_verification/evidence.py`` and is importable
# as ``apps.common.launch_verification.evidence`` once ``<repo>/backend`` is on
# ``sys.path``. We resolve the repo root from this file's location so the import
# is robust regardless of the current working directory.

_THIS_FILE = Path(__file__).resolve()
# parents[0] = scripts/launch-verification, [1] = scripts, [2] = repo root
REPO_ROOT = _THIS_FILE.parents[2]
_BACKEND_DIR = REPO_ROOT / "backend"


def _ensure_backend_on_path() -> None:
    """Insert ``<repo>/backend`` at the front of ``sys.path`` if not already present."""
    backend = str(_BACKEND_DIR)
    if backend not in sys.path:
        sys.path.insert(0, backend)


_ensure_backend_on_path()

try:
    from apps.common.launch_verification.evidence import (  # noqa: E402
        EvidenceArtifactError,
        EvidenceStatus,
        RollupGate,
        RollupStatus,
        Verdict,
        from_json,
        rollup_to_json,
        utc_now_iso,
    )
except ImportError as exc:  # pragma: no cover - defensive, surfaces a clear error
    raise SystemExit(
        "launch-verification rollup: could not import the evidence schema from "
        f"{_BACKEND_DIR}/apps/common/launch_verification/evidence.py — {exc}"
    )


# ---------------------------------------------------------------------------
# The eleven gate catalogue (design "Data Models" → evidence store layout).
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class GateSpec:
    """The static identity of one launch gate and its expected artifact path.

    ``artifact`` is the path **relative to the evidence-store root**
    (``docs/launch-evidence/``).
    """

    gate_id: str
    requirement: str
    artifact: str


#: The eleven gates, in evidence-store order. The rollup always enumerates all
#: of these regardless of which artifacts happen to be present.
GATE_SPECS: tuple[GateSpec, ...] = (
    GateSpec("migration-evidence", "R1", "01-migration/migration-evidence.json"),
    GateSpec("smoke", "R2", "02-smoke/smoke-evidence.json"),
    GateSpec("performance", "R3", "03-performance/performance-evidence.json"),
    GateSpec("mobile-ui", "R4", "04-mobile-ui/mobile-ui-evidence.json"),
    GateSpec("bundle-guard", "R5", "05-bundle/bundle-evidence.json"),
    GateSpec("suite", "R6", "06-suite/suite-evidence.json"),
    GateSpec("brand", "R7", "07-brand/brand-evidence.json"),
    GateSpec("contract", "R8", "08-contract/contract-evidence.json"),
    GateSpec("operational", "R9", "09-operational/operational-evidence.json"),
    GateSpec("onboarding", "R10", "10-onboarding/onboarding-evidence.json"),
    GateSpec("scope", "R11", "11-scope/scope-evidence.json"),
)


# ---------------------------------------------------------------------------
# Pure verdict core — no I/O. Property-testable (tasks 2.2 / 2.3).
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class GateProbe:
    """The fully-resolved input the pure verdict core needs for one gate.

    This deliberately carries no file handles or paths beyond the recorded
    ``artifact`` string: every filesystem concern (existence, readability, JSON
    parseability) has already been collapsed into the booleans below, so the
    verdict computation is a pure function of these records.

    Attributes:
        gate_id / requirement / artifact: the gate's identity and its relative
            artifact path, taken from :data:`GATE_SPECS`.
        readable: ``True`` iff the artifact file is present, readable, **and**
            parses as a valid Evidence_Artifact envelope. ``False`` for any of
            absent / unreadable / unparseable.
        status: the gate-level status to attribute to this gate. For a readable
            artifact this is the parsed artifact's status; for a non-readable one
            it is conservatively :attr:`EvidenceStatus.UNKNOWN`.
    """

    gate_id: str
    requirement: str
    artifact: str
    readable: bool
    status: str

    def is_passing(self) -> bool:
        """A gate passes iff its artifact is readable and its status is ``passed``."""
        return self.readable and self.status == EvidenceStatus.PASSED.value


def compute_rollup(
    probes: Sequence[GateProbe],
    *,
    generated_at: Optional[str] = None,
) -> RollupStatus:
    """Compute the launch verdict from already-resolved gate probes (pure).

    The conservative aggregation rule (design Gate 12 pass condition,
    Requirements 12.1–12.5):

    * Every gate is enumerated in ``gates[]`` with its recorded status and a
      ``artifact_readable`` flag.
    * A gate blocks the verdict (appears in ``not_passed``) when it is **not
      passing** — i.e. its artifact is not readable, or its status is anything
      other than ``passed``.
    * A gate appears in ``missing_or_unreadable`` when its artifact is not
      readable (absent / unreadable / unparseable).
    * The verdict is ``production-launch-ready`` **iff** ``not_passed`` is empty;
      otherwise ``not-production-launch-ready``.

    This function performs no I/O; ``probes`` already encode every filesystem
    fact, which is what makes the verdict deterministic and property-testable.
    """
    gates: List[RollupGate] = []
    not_passed: List[str] = []
    missing_or_unreadable: List[str] = []

    for probe in probes:
        gates.append(
            RollupGate(
                gate_id=probe.gate_id,
                requirement=probe.requirement,
                status=probe.status,
                artifact=probe.artifact,
                artifact_readable=probe.readable,
            )
        )
        if not probe.readable:
            missing_or_unreadable.append(probe.gate_id)
        if not probe.is_passing():
            not_passed.append(probe.gate_id)

    verdict = Verdict.READY if not not_passed else Verdict.NOT_READY
    return RollupStatus(
        verdict=verdict.value,
        generated_at=generated_at or utc_now_iso(),
        gates=gates,
        not_passed=not_passed,
        missing_or_unreadable=missing_or_unreadable,
    )


# ---------------------------------------------------------------------------
# Filesystem wrapper — reads the evidence store, probes readability, parses.
# ---------------------------------------------------------------------------


def probe_gate(evidence_root: Path, spec: GateSpec) -> GateProbe:
    """Resolve one gate's :class:`GateProbe` by reading + parsing its artifact.

    Conservative on every failure mode: a missing file, an unreadable file, or a
    file whose contents are not a valid Evidence_Artifact envelope all yield
    ``readable=False`` and ``status="unknown"``. Only a present, readable,
    parseable artifact contributes its own recorded status.
    """
    artifact_path = evidence_root / spec.artifact
    unknown = EvidenceStatus.UNKNOWN.value

    if not artifact_path.is_file():
        return GateProbe(spec.gate_id, spec.requirement, spec.artifact, False, unknown)

    try:
        text = artifact_path.read_text(encoding="utf-8")
    except OSError:
        # Present but unreadable (permissions, I/O error, etc.).
        return GateProbe(spec.gate_id, spec.requirement, spec.artifact, False, unknown)

    try:
        artifact = from_json(text)
    except EvidenceArtifactError:
        # Present and readable but not a valid Evidence_Artifact envelope.
        return GateProbe(spec.gate_id, spec.requirement, spec.artifact, False, unknown)

    return GateProbe(
        gate_id=spec.gate_id,
        requirement=spec.requirement,
        artifact=spec.artifact,
        readable=True,
        status=artifact.status,
    )


def build_rollup(
    evidence_root: Path,
    *,
    generated_at: Optional[str] = None,
) -> RollupStatus:
    """Read every gate artifact under ``evidence_root`` and compute the verdict."""
    probes = [probe_gate(evidence_root, spec) for spec in GATE_SPECS]
    return compute_rollup(probes, generated_at=generated_at)


def write_rollup(rollup: RollupStatus, output_path: Path) -> None:
    """Write the rollup to ``output_path`` as pretty JSON, creating parent dirs."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(rollup_to_json(rollup) + "\n", encoding="utf-8")


# ---------------------------------------------------------------------------
# Human-readable launch-readiness report (R12.6).
# ---------------------------------------------------------------------------
#
# The rollup stores its machine verdict in ``rollup.json``; this renders the same
# RollupStatus into the reviewable ``launch-readiness.md`` the design's "Gate 12 —
# Rollup aggregator" row names alongside it. It is a *pure* string renderer over
# an already-computed RollupStatus (no I/O), so it round-trips deterministically
# and stays trivially testable next to ``compute_rollup``.

#: Human-readable gate titles keyed by ``gate_id`` (the rollup carries only the
#: stable slug + requirement). Falls back to the slug for any unmapped gate so a
#: future gate never breaks the report.
_GATE_TITLES: dict[str, str] = {
    "migration-evidence": "Migration_Evidence_Gate",
    "smoke": "Smoke_Test_Gate",
    "performance": "Performance_Gate",
    "mobile-ui": "Mobile_UI_Gate",
    "bundle-guard": "Bundle_Guard",
    "suite": "Suite_Execution_Gate",
    "brand": "Brand_Scan_Gate",
    "contract": "Contract_Sync_Gate",
    "operational": "Operational_Readiness_Gate",
    "onboarding": "Onboarding_Smoke_Gate",
    "scope": "Scope_Gate",
}


def render_markdown(rollup: RollupStatus) -> str:
    """Render a :class:`RollupStatus` into the human-readable launch-readiness report.

    Produces (R12.6, design "Gate 12 — Rollup aggregator"):

    * a verdict headline that states launch is approved **only** when the verdict
      is ``production-launch-ready`` (the conservative DoD, Requirements 12.1–12.5);
    * the ``generated_at`` timestamp;
    * a table of **all eleven gates** with their status, artifact path, and the
      filesystem readable flag;
    * the ``not_passed`` and ``missing_or_unreadable`` lists, each named explicitly
      so a reviewer sees exactly what is blocking launch.

    This is a pure function of ``rollup`` — no filesystem access — so it is
    deterministic for a given (timestamp-fixed) RollupStatus.
    """
    ready = rollup.verdict == Verdict.READY.value
    headline = (
        "Launch is **APPROVED** — every gate passed and every referenced "
        "Evidence_Artifact is present and readable."
        if ready
        else "Launch is **NOT approved**. Launch is approved only when the verdict "
        "is `production-launch-ready`, which requires every one of the eleven "
        "gates to have an explicit `passed` status with a present, readable "
        "Evidence_Artifact (Requirement 12)."
    )

    lines: List[str] = []
    lines.append("# Launch Readiness")
    lines.append("")
    lines.append(f"> **Verdict: `{rollup.verdict}`**")
    lines.append(">")
    lines.append(f"> Generated at: `{rollup.generated_at}`")
    lines.append("")
    lines.append(headline)
    lines.append("")
    lines.append(
        "This report is generated by the Gate 12 rollup aggregator "
        "(`scripts/launch-verification/rollup.py`) from the eleven gate artifacts "
        "under `docs/launch-evidence/`. The machine-readable verdict lives in "
        "[`rollup.json`](./rollup.json)."
    )
    lines.append("")

    # --- Gate table: all eleven gates, every run. ---
    lines.append("## Gates")
    lines.append("")
    lines.append("| # | Gate | Requirement | Status | Artifact | Readable |")
    lines.append("|---|------|-------------|--------|----------|----------|")
    for index, gate in enumerate(rollup.gates, start=1):
        title = _GATE_TITLES.get(gate.gate_id, gate.gate_id)
        readable = "yes" if gate.artifact_readable else "no"
        lines.append(
            f"| {index} | {title} (`{gate.gate_id}`) | {gate.requirement} "
            f"| `{gate.status}` | `{gate.artifact}` | {readable} |"
        )
    lines.append("")

    # --- Not-passed list (every gate blocking the verdict). ---
    lines.append(f"## Not passed ({len(rollup.not_passed)})")
    lines.append("")
    if rollup.not_passed:
        for gate_id in rollup.not_passed:
            title = _GATE_TITLES.get(gate_id, gate_id)
            lines.append(f"- {title} (`{gate_id}`)")
    else:
        lines.append("- None — every gate passed.")
    lines.append("")

    # --- Missing-or-unreadable list (subset absent/unreadable/unparseable). ---
    lines.append(f"## Missing or unreadable ({len(rollup.missing_or_unreadable)})")
    lines.append("")
    if rollup.missing_or_unreadable:
        for gate_id in rollup.missing_or_unreadable:
            title = _GATE_TITLES.get(gate_id, gate_id)
            lines.append(f"- {title} (`{gate_id}`)")
    else:
        lines.append("- None — every referenced artifact is present and readable.")
    lines.append("")

    return "\n".join(lines)


def write_markdown(rollup: RollupStatus, output_path: Path) -> None:
    """Write the human-readable launch-readiness report, creating parent dirs."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(render_markdown(rollup) + "\n", encoding="utf-8")


# ---------------------------------------------------------------------------
# CLI entrypoint.
# ---------------------------------------------------------------------------


def _default_evidence_root() -> Path:
    """The evidence store under the repo root (``docs/launch-evidence``)."""
    return REPO_ROOT / "docs" / "launch-evidence"


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="rollup.py",
        description=(
            "Gate 12 launch-verification rollup aggregator: reads the 11 gate "
            "evidence artifacts and emits a conservative launch verdict."
        ),
    )
    parser.add_argument(
        "--evidence-root",
        type=Path,
        default=_default_evidence_root(),
        help="Evidence store root (default: <repo>/docs/launch-evidence).",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Output path for rollup.json (default: <evidence-root>/rollup.json).",
    )
    parser.add_argument(
        "--markdown-output",
        type=Path,
        default=None,
        help=(
            "Output path for the human-readable launch-readiness report "
            "(default: <evidence-root>/launch-readiness.md)."
        ),
    )
    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    """CLI: build the rollup, write ``rollup.json``, and return the exit code.

    Returns ``0`` only when the verdict is ``production-launch-ready``; any
    not-ready verdict (the conservative default) returns ``1`` so CI/operator
    flows fail closed.
    """
    args = build_arg_parser().parse_args(argv)
    evidence_root: Path = args.evidence_root
    output_path: Path = args.output or (evidence_root / "rollup.json")
    markdown_path: Path = args.markdown_output or (evidence_root / "launch-readiness.md")

    rollup = build_rollup(evidence_root)
    write_rollup(rollup, output_path)
    write_markdown(rollup, markdown_path)

    ready = rollup.verdict == Verdict.READY.value
    print(f"launch-verification rollup: {rollup.verdict}")
    print(f"  evidence root: {evidence_root}")
    print(f"  written:       {output_path}")
    print(f"  written:       {markdown_path}")
    if rollup.not_passed:
        print(f"  not passed:    {', '.join(rollup.not_passed)}")
    if rollup.missing_or_unreadable:
        print(f"  missing/unreadable: {', '.join(rollup.missing_or_unreadable)}")
    return 0 if ready else 1


if __name__ == "__main__":
    raise SystemExit(main())
