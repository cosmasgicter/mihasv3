"""Property-based tests for the Gate 12 launch-verification rollup aggregator.

# Feature: beanola-launch-verification, Property 1: Rollup is launch-ready iff every gate passed and every artifact is readable
# Feature: beanola-launch-verification, Property 2: Missing, unknown, or unreadable gates force not-ready (conservative default)

These properties target the **pure verdict core** of the rollup aggregator,
``compute_rollup(probes)`` over :class:`GateProbe` records
(``gate_id``, ``requirement``, ``artifact``, ``readable``, ``status``). The pure
core encodes every filesystem fact into the ``readable`` boolean and the parsed
``status`` string, so the verdict computation is a deterministic function of its
inputs and can be property-tested with no I/O and no Django at all.

Property 1: *For any* set of gate records, the rollup verdict is
``production-launch-ready`` **iff** every gate has status ``passed`` **and** every
referenced artifact is readable; otherwise the verdict is
``not-production-launch-ready`` and every blocking gate is named in ``not_passed``.
**Validates: Requirements 12.1, 12.2, 12.4, 12.5**

Property 2: *For any* set of gate records in which at least one gate is missing,
has status ``unknown``/not-yet-evaluated, or has an unreadable artifact, the
verdict is ``not-production-launch-ready`` and that gate appears in ``not_passed``
(and, when absent/unreadable, in ``missing_or_unreadable``).
**Validates: Requirements 12.3, 2.6, 6.7, 6.8**

Backend property-test conventions (spec ``beanola-launch-verification``):
``pytest`` + ``hypothesis``, >= 100 examples per property, exactly one property
per test class, tagged with the Feature/Property markers above. The aggregator
under test is pure (standard library only), so these run without a database.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

from hypothesis import given, settings as hypothesis_settings
from hypothesis import strategies as st

# ---------------------------------------------------------------------------
# Import the rollup aggregator from scripts/launch-verification/rollup.py.
#
# rollup.py lives at the repo root (outside the ``backend`` import package) and
# inserts ``<repo>/backend`` onto ``sys.path`` itself when executed, so loading
# it by file path also makes the shared evidence schema importable.
# ---------------------------------------------------------------------------

# test file = backend/tests/property/test_...py
#   parents[0]=property [1]=tests [2]=backend [3]=<repo root>
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

GateProbe = _rollup.GateProbe
compute_rollup = _rollup.compute_rollup
Verdict = _rollup.Verdict
EvidenceStatus = _rollup.EvidenceStatus

READY = Verdict.READY.value
NOT_READY = Verdict.NOT_READY.value
PASSED = EvidenceStatus.PASSED.value
FAILED = EvidenceStatus.FAILED.value
UNKNOWN = EvidenceStatus.UNKNOWN.value

# Run a meaningful campaign: >= 100 examples per property.
PBT_SETTINGS = hypothesis_settings(max_examples=200, deadline=None)

# A fixed generated_at keeps the constructed RollupStatus deterministic in the
# verdict dimension we care about (the timestamp is irrelevant to the property).
_FIXED_TS = "2026-06-20T10:00:00Z"

# The closed status set a parsed/absent artifact can present to the pure core.
_STATUS = st.sampled_from([PASSED, FAILED, UNKNOWN])


@st.composite
def gate_probes(draw, *, min_size: int = 1, max_size: int = 13):
    """Generate a list of distinct-id :class:`GateProbe` records.

    Each probe carries an independent ``readable`` boolean and a ``status`` drawn
    from the closed evidence-status enum, covering every combination of
    readable/unreadable x passed/failed/unknown across a variable-length gate set
    (1..13 gates spans below, at, and above the real 11-gate catalogue).
    """
    size = draw(st.integers(min_value=min_size, max_value=max_size))
    probes = []
    for i in range(size):
        readable = draw(st.booleans())
        status = draw(_STATUS)
        probes.append(
            GateProbe(
                gate_id=f"gate-{i}",
                requirement=f"R{i}",
                artifact=f"{i:02d}-gate/evidence.json",
                readable=readable,
                status=status,
            )
        )
    return probes


@st.composite
def gate_probes_with_blocker(draw):
    """Generate a probe list guaranteed to contain >= 1 non-passing gate.

    A non-passing gate is one that is unreadable, or whose status is not
    ``passed``. This is the precondition space for Property 2.
    """
    probes = draw(gate_probes())
    # Force at least one gate to block: pick an index and make it non-passing in
    # one of the conservative-default ways (unreadable / unknown / failed).
    idx = draw(st.integers(min_value=0, max_value=len(probes) - 1))
    blocker_kind = draw(st.sampled_from(["unreadable", "unknown", "failed"]))
    target = probes[idx]
    if blocker_kind == "unreadable":
        new = GateProbe(target.gate_id, target.requirement, target.artifact, False, target.status)
    elif blocker_kind == "unknown":
        new = GateProbe(target.gate_id, target.requirement, target.artifact, target.readable, UNKNOWN)
    else:  # failed
        new = GateProbe(target.gate_id, target.requirement, target.artifact, target.readable, FAILED)
    probes[idx] = new
    return probes


# ---------------------------------------------------------------------------
# Property 1 — launch-ready iff every gate passed and every artifact readable.
# ---------------------------------------------------------------------------


class TestProperty1LaunchReadyIff:
    """Feature: beanola-launch-verification, Property 1: Rollup is launch-ready iff every gate passed and every artifact is readable."""

    @PBT_SETTINGS
    @given(probes=gate_probes())
    def test_verdict_ready_iff_all_gates_pass(self, probes) -> None:
        """verdict == READY iff every probe is readable AND status == passed."""
        expected_ready = all(p.readable and p.status == PASSED for p in probes)

        rollup = compute_rollup(probes, generated_at=_FIXED_TS)

        # The iff relationship between the verdict and the all-pass condition.
        assert (rollup.verdict == READY) == expected_ready
        # The verdict is always exactly one of the two closed values.
        assert rollup.verdict in (READY, NOT_READY)
        # All gates are always enumerated, never collapsed or dropped.
        assert len(rollup.gates) == len(probes)
        assert [g.gate_id for g in rollup.gates] == [p.gate_id for p in probes]

        if expected_ready:
            # A ready verdict means nothing blocks and nothing is missing.
            assert rollup.not_passed == []
            assert rollup.missing_or_unreadable == []
            assert all(g.status == PASSED and g.artifact_readable for g in rollup.gates)
        else:
            assert rollup.verdict == NOT_READY
            assert rollup.not_passed  # at least one blocking gate is named

    @PBT_SETTINGS
    @given(probes=gate_probes())
    def test_not_passed_names_exactly_the_blocking_gates(self, probes) -> None:
        """not_passed contains exactly the gate ids that are not passing."""
        rollup = compute_rollup(probes, generated_at=_FIXED_TS)

        expected_blocking = [
            p.gate_id for p in probes if not (p.readable and p.status == PASSED)
        ]
        assert rollup.not_passed == expected_blocking

        # Every passing gate is absent from not_passed; every blocking gate present.
        for p in probes:
            passing = p.readable and p.status == PASSED
            assert (p.gate_id in rollup.not_passed) == (not passing)


# ---------------------------------------------------------------------------
# Property 2 — missing/unknown/unreadable gates force not-ready (conservative).
# ---------------------------------------------------------------------------


class TestProperty2ConservativeDefault:
    """Feature: beanola-launch-verification, Property 2: Missing, unknown, or unreadable gates force not-ready (conservative default)."""

    @PBT_SETTINGS
    @given(probes=gate_probes_with_blocker())
    def test_any_blocking_gate_forces_not_ready(self, probes) -> None:
        """A single unreadable/unknown/failed gate forces a not-ready verdict."""
        rollup = compute_rollup(probes, generated_at=_FIXED_TS)

        assert rollup.verdict == NOT_READY
        # Every non-passing gate (the conservative defaults) is named as blocking.
        for p in probes:
            if not (p.readable and p.status == PASSED):
                assert p.gate_id in rollup.not_passed

    @PBT_SETTINGS
    @given(probes=gate_probes())
    def test_unreadable_gates_are_missing_or_unreadable_and_block(self, probes) -> None:
        """Unreadable artifacts appear in missing_or_unreadable and in not_passed."""
        rollup = compute_rollup(probes, generated_at=_FIXED_TS)

        expected_unreadable = [p.gate_id for p in probes if not p.readable]
        assert rollup.missing_or_unreadable == expected_unreadable

        for p in probes:
            if not p.readable:
                # An unreadable gate is both missing/unreadable and blocking,
                # regardless of whatever status it nominally carries.
                assert p.gate_id in rollup.missing_or_unreadable
                assert p.gate_id in rollup.not_passed
            else:
                assert p.gate_id not in rollup.missing_or_unreadable

    @PBT_SETTINGS
    @given(probes=gate_probes())
    def test_unknown_status_blocks_even_when_readable(self, probes) -> None:
        """A readable gate with status 'unknown' still blocks (never silently passes)."""
        rollup = compute_rollup(probes, generated_at=_FIXED_TS)
        for p in probes:
            if p.readable and p.status == UNKNOWN:
                assert p.gate_id in rollup.not_passed
                # 'unknown' is not an absent/unreadable artifact, so it is not
                # listed as missing_or_unreadable — only as not_passed.
                assert p.gate_id not in rollup.missing_or_unreadable
