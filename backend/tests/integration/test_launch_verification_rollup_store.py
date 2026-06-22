"""Integration tests for the rollup aggregator over a real fixture evidence store.

These tests exercise the **filesystem wrapper** of the Gate 12 rollup
aggregator (``build_rollup(evidence_root)`` -> ``probe_gate`` -> ``compute_rollup``)
against temporary evidence directories populated with real ``Evidence_Artifact``
JSON files. Where the property tests (Properties 1 and 2) pin the pure verdict
core, these tests pin the end-to-end read path: artifact discovery, JSON parsing,
the conservative readability probe, and the resulting verdict.

Four representative cases are covered:

* **all-pass** — all 11 gates present with status ``passed`` => ``production-launch-ready``.
* **one-fail** — one gate's artifact records status ``failed`` => not ready, gate blocks.
* **missing-gate** — one gate's artifact file is absent => not ready, gate missing/unreadable.
* **unreadable-artifact** — one gate's artifact is present but not valid JSON => not ready, gate missing/unreadable.

The wrapper only touches the filesystem (no Django ORM, no database), so these
tests use ``tmp_path`` and need no DB fixtures.

_Requirements: 12.1, 12.2, 12.3, 12.5_
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Import the rollup aggregator + the shared evidence schema.
# ---------------------------------------------------------------------------

# test file = backend/tests/integration/test_...py
#   parents[0]=integration [1]=tests [2]=backend [3]=<repo root>
_REPO_ROOT = Path(__file__).resolve().parents[3]
_ROLLUP_PATH = _REPO_ROOT / "scripts" / "launch-verification" / "rollup.py"


def _load_rollup():
    spec = importlib.util.spec_from_file_location(
        "launch_verification_rollup", _ROLLUP_PATH
    )
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader, f"cannot load rollup module from {_ROLLUP_PATH}"
    # Register before exec so dataclasses can resolve the module's (stringized)
    # annotations via sys.modules under ``from __future__ import annotations``.
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


_rollup = _load_rollup()

build_rollup = _rollup.build_rollup
write_rollup = _rollup.write_rollup
GATE_SPECS = _rollup.GATE_SPECS
Verdict = _rollup.Verdict

# Importing the schema works because loading rollup.py put <repo>/backend on path.
from apps.common.launch_verification.evidence import (  # noqa: E402
    EvidenceArtifact,
    RollupStatus,
    to_json,
)

READY = Verdict.READY.value
NOT_READY = Verdict.NOT_READY.value


# ---------------------------------------------------------------------------
# Fixture-store helpers (module-level so they are reusable outside pytest).
# ---------------------------------------------------------------------------


def _write_passing_artifact(evidence_root: Path, spec) -> None:
    """Write a well-formed, passing Evidence_Artifact for ``spec`` under the store."""
    artifact = EvidenceArtifact(
        gate_id=spec.gate_id,
        requirement=spec.requirement,
        status="passed",
        generated_by="ci",
        generated_at="2026-06-20T09:00:00Z",
        summary=f"{spec.gate_id} passed",
    )
    path = evidence_root / spec.artifact
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(to_json(artifact), encoding="utf-8")


def _write_failing_artifact(evidence_root: Path, spec) -> None:
    """Write a well-formed Evidence_Artifact with status ``failed`` for ``spec``."""
    artifact = EvidenceArtifact(
        gate_id=spec.gate_id,
        requirement=spec.requirement,
        status="failed",
        generated_by="ci",
        generated_at="2026-06-20T09:00:00Z",
        summary=f"{spec.gate_id} failed",
        failures=["a check failed"],
    )
    path = evidence_root / spec.artifact
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(to_json(artifact), encoding="utf-8")


def _write_corrupt_artifact(evidence_root: Path, spec) -> None:
    """Write a present-but-unparseable artifact file for ``spec`` (not valid JSON)."""
    path = evidence_root / spec.artifact
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("{ this is : not valid json ]", encoding="utf-8")


def build_all_pass_store(evidence_root: Path) -> None:
    """Populate every one of the 11 gates with a passing artifact."""
    for spec in GATE_SPECS:
        _write_passing_artifact(evidence_root, spec)


# ---------------------------------------------------------------------------
# Tests.
# ---------------------------------------------------------------------------


class TestRollupOverFixtureStore:
    """build_rollup over a real (temporary) evidence store, four canonical cases."""

    def test_all_pass_store_is_production_launch_ready(self, tmp_path) -> None:
        """All 11 gates passing and readable => production-launch-ready."""
        build_all_pass_store(tmp_path)

        rollup = build_rollup(tmp_path)

        assert isinstance(rollup, RollupStatus)
        assert rollup.verdict == READY
        assert rollup.not_passed == []
        assert rollup.missing_or_unreadable == []
        # All eleven gates enumerated, each readable + passed.
        assert len(rollup.gates) == len(GATE_SPECS) == 11
        assert all(g.artifact_readable and g.status == "passed" for g in rollup.gates)

    def test_one_failed_gate_blocks_launch(self, tmp_path) -> None:
        """A single failed gate artifact => not ready, that gate blocks (but is readable)."""
        build_all_pass_store(tmp_path)
        failed_spec = GATE_SPECS[2]  # performance (R3)
        _write_failing_artifact(tmp_path, failed_spec)

        rollup = build_rollup(tmp_path)

        assert rollup.verdict == NOT_READY
        assert rollup.not_passed == [failed_spec.gate_id]
        # A failed (but present + parseable) artifact is readable, so it is NOT
        # listed as missing/unreadable — only as not_passed.
        assert rollup.missing_or_unreadable == []
        blocking = next(g for g in rollup.gates if g.gate_id == failed_spec.gate_id)
        assert blocking.status == "failed"
        assert blocking.artifact_readable is True

    def test_missing_gate_artifact_blocks_launch(self, tmp_path) -> None:
        """An absent artifact file => not ready, gate is missing/unreadable + blocks."""
        # Write 10 of 11; deliberately omit one gate's artifact.
        missing_spec = GATE_SPECS[5]  # suite (R6)
        for spec in GATE_SPECS:
            if spec.gate_id != missing_spec.gate_id:
                _write_passing_artifact(tmp_path, spec)

        rollup = build_rollup(tmp_path)

        assert rollup.verdict == NOT_READY
        assert rollup.not_passed == [missing_spec.gate_id]
        assert rollup.missing_or_unreadable == [missing_spec.gate_id]
        # Still enumerated, conservatively marked unknown + unreadable.
        gate = next(g for g in rollup.gates if g.gate_id == missing_spec.gate_id)
        assert gate.status == "unknown"
        assert gate.artifact_readable is False

    def test_unreadable_artifact_blocks_launch(self, tmp_path) -> None:
        """A present-but-corrupt artifact => not ready, gate is missing/unreadable + blocks."""
        build_all_pass_store(tmp_path)
        corrupt_spec = GATE_SPECS[8]  # operational (R9)
        _write_corrupt_artifact(tmp_path, corrupt_spec)

        rollup = build_rollup(tmp_path)

        assert rollup.verdict == NOT_READY
        assert rollup.not_passed == [corrupt_spec.gate_id]
        assert rollup.missing_or_unreadable == [corrupt_spec.gate_id]
        gate = next(g for g in rollup.gates if g.gate_id == corrupt_spec.gate_id)
        assert gate.status == "unknown"
        assert gate.artifact_readable is False

    def test_rollup_round_trips_through_disk(self, tmp_path) -> None:
        """write_rollup emits a rollup.json that parses back to an equal verdict."""
        build_all_pass_store(tmp_path)
        rollup = build_rollup(tmp_path)

        out = tmp_path / "rollup.json"
        write_rollup(rollup, out)
        assert out.is_file()

        reloaded = RollupStatus.from_json(out.read_text(encoding="utf-8"))
        assert reloaded.verdict == rollup.verdict == READY
        assert [g.gate_id for g in reloaded.gates] == [g.gate_id for g in rollup.gates]
