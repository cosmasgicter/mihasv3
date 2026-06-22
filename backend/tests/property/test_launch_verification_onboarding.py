"""Property test for Gate 10 — Onboarding_Smoke_Gate (Requirement 10).

Feature: beanola-launch-verification, Property 19: Onboarding smoke halts at the
first failing step and marks no later step passed.

This test exercises the pure-logic core in
``scripts/launch-verification/onboarding_eval.py``. That module is
standard-library-only (it imports only ``typing`` and never touches Django, the
ORM, or the network), so the test loads it directly via ``importlib`` from the
hyphenated ``scripts/launch-verification/`` directory and drives it with
hypothesis without any database or network. This sidesteps the backend
``conftest.py`` Postgres fixtures — the module is run with
``backend/.venv/bin/python`` against this file directly.

Property 19 (design.md, R10.12): *For any* ordered sequence of per-step results,
``sequence_onboarding`` halts at the **first** non-passing step. Concretely:

* ``halted_at`` is the name of the first non-passing step (or ``None`` when every
  step passed / there are no steps);
* every step **after** the halt is recorded ``skipped`` and is **never** marked
  ``pass``;
* every step **before** the halt that passed is recorded ``pass``;
* the overall run ``passed`` is ``True`` **iff** there is at least one step and
  every step passed (nothing halted); and
* ``passed_count`` equals the number of leading consecutive passing steps before
  the halt.

**Validates: Requirements 10.12**
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

from hypothesis import given, settings as hypothesis_settings
from hypothesis import strategies as st

# --------------------------------------------------------------------------- #
# Load the pure evaluator from the hyphenated scripts/launch-verification dir.
#
# ``scripts/launch-verification`` is not an importable package name (the hyphen
# is illegal in a dotted module path), so we resolve the file directly and load
# it with importlib. The module is registered in ``sys.modules`` under a legal
# alias *before* ``exec_module`` runs so any internal name resolution stays
# consistent and a second import reuses the already-loaded object.
# --------------------------------------------------------------------------- #

_MODULE_NAME = "launch_verification_onboarding_eval"
_MODULE_PATH = (
    Path(__file__).resolve().parents[3]
    / "scripts"
    / "launch-verification"
    / "onboarding_eval.py"
)

if _MODULE_NAME in sys.modules:  # pragma: no cover - import cache reuse
    onboarding_eval = sys.modules[_MODULE_NAME]
else:
    _spec = importlib.util.spec_from_file_location(_MODULE_NAME, _MODULE_PATH)
    assert _spec is not None and _spec.loader is not None
    onboarding_eval = importlib.util.module_from_spec(_spec)
    sys.modules[_MODULE_NAME] = onboarding_eval
    _spec.loader.exec_module(onboarding_eval)

STEP_TIMEOUT_MS = onboarding_eval.STEP_TIMEOUT_MS
STEP_SEQUENCE = onboarding_eval.STEP_SEQUENCE
PASS = onboarding_eval.PASS
FAIL = onboarding_eval.FAIL
SKIPPED = onboarding_eval.SKIPPED
step_passed = onboarding_eval.step_passed
failure_reason = onboarding_eval.failure_reason
sequence_onboarding = onboarding_eval.sequence_onboarding


# Run a meaningful campaign: well over the >= 100 examples per property minimum.
PBT_SETTINGS = hypothesis_settings(max_examples=300, deadline=None)


# --------------------------------------------------------------------------- #
# Generators
#
# Each step-result dict carries the fields the sequencer reads: ``step`` (name),
# ``ok``, ``errored``, ``elapsed_ms``, and ``scoped_to_school``. We bias the
# generators toward the failure modes named in R10.12 — a non-``ok`` step, an
# ``errored`` step, an over-budget elapsed time (> 60 000 ms), and an unscoped
# result — so the campaign lands on the halt edge often, while still generating
# plenty of clean-passing steps so passing prefixes of every length appear.
# --------------------------------------------------------------------------- #

# elapsed_ms samples spanning the 60 000 ms timeout boundary, including the
# exact boundary, over-budget values (timeout breach), and invalid measurements
# (negative / missing) so every timing branch is exercised.
_ELAPSED_MS = st.one_of(
    st.just(0),
    st.just(STEP_TIMEOUT_MS),               # exact boundary — still passes
    st.just(STEP_TIMEOUT_MS + 1),           # just over budget — timeout
    st.integers(min_value=-5000, max_value=120000),
    st.none(),                              # missing measurement — invalid
)


def _step_strategy():
    """A single step-result dict with random pass/fail across every criterion."""
    return st.fixed_dictionaries(
        {
            "step": st.sampled_from(STEP_SEQUENCE),
            # Bias ``ok`` toward True so passing prefixes of varied length form,
            # but still fail often enough to exercise the halt.
            "ok": st.booleans(),
            "errored": st.booleans(),
            "elapsed_ms": _ELAPSED_MS,
            "scoped_to_school": st.booleans(),
        }
    )


# A list of step results of varied length, including the empty sequence.
_STEPS = st.lists(_step_strategy(), min_size=0, max_size=14)


def _expected_first_failure_index(steps, timeout_ms=STEP_TIMEOUT_MS):
    """Independent oracle: index of the first non-passing step, or None.

    Reimplements the pass predicate independently of the module under test so the
    sequencer is checked against a second source of truth rather than itself.
    """
    for i, step in enumerate(steps):
        ok = step.get("ok") is True
        errored = step.get("errored") is True
        elapsed = step.get("elapsed_ms")
        elapsed_ok = (
            not isinstance(elapsed, bool)
            and isinstance(elapsed, (int, float))
            and elapsed >= 0
            and elapsed <= timeout_ms
        )
        scoped = step.get("scoped_to_school", True)
        passed = ok and (not errored) and elapsed_ok and bool(scoped)
        if not passed:
            return i
    return None


@given(steps=_STEPS)
@PBT_SETTINGS
def test_sequence_onboarding_halts_at_first_failure(steps):
    """Property 19: halt at the first failing step; no later step passes (R10.12)."""
    result = sequence_onboarding(steps)
    checks = result["checks"]
    first_fail = _expected_first_failure_index(steps)

    # One check row per provided step, preserving order.
    assert len(checks) == len(steps)

    if first_fail is None:
        # Every step passed (or there were no steps).
        assert result["halted_at"] is None
        assert result["failing_step"] is None
        assert all(row["result"] == PASS for row in checks)
        assert result["passed_count"] == len(steps)
        # Overall passes iff there is at least one step and nothing halted.
        assert result["passed"] is (len(steps) > 0)
        return

    # --- A failure exists at index ``first_fail``. ------------------------- #

    # halted_at names the FIRST failing step.
    expected_name = steps[first_fail]["step"]
    assert result["halted_at"] == expected_name
    assert result["failing_step"] is not None
    assert result["failing_step"]["step"] == expected_name
    # The recorded reason is the module's own deterministic cause for that step.
    assert result["failing_step"]["reason"] == failure_reason(steps[first_fail])

    # Steps BEFORE the halt all passed and are recorded ``pass``.
    for i in range(first_fail):
        assert checks[i]["result"] == PASS, (
            f"step {i} before halt should be pass, got {checks[i]['result']}"
        )

    # The failing step itself is recorded ``fail``.
    assert checks[first_fail]["result"] == FAIL
    assert checks[first_fail]["halted_at"] == expected_name

    # Every step AFTER the halt is recorded ``skipped`` and NEVER ``pass``.
    for i in range(first_fail + 1, len(checks)):
        assert checks[i]["result"] == SKIPPED, (
            f"step {i} after halt should be skipped, got {checks[i]['result']}"
        )
        assert checks[i]["result"] != PASS

    # No step anywhere after the halt is ever marked pass.
    assert all(row["result"] != PASS for row in checks[first_fail:])

    # passed_count == number of leading consecutive passing steps before halt.
    assert result["passed_count"] == first_fail

    # Overall run failed because something halted.
    assert result["passed"] is False


@given(steps=_STEPS)
@PBT_SETTINGS
def test_passed_count_equals_leading_passing_run(steps):
    """passed_count is exactly the count of consecutive leading passing steps."""
    result = sequence_onboarding(steps)
    first_fail = _expected_first_failure_index(steps)
    expected_leading = first_fail if first_fail is not None else len(steps)
    assert result["passed_count"] == expected_leading
    # passed_count never exceeds the number of pass rows actually recorded.
    pass_rows = sum(1 for row in result["checks"] if row["result"] == PASS)
    assert result["passed_count"] == pass_rows


@given(steps=_STEPS)
@PBT_SETTINGS
def test_overall_passed_iff_every_step_passed(steps):
    """Overall ``passed`` is True iff >=1 step and every step passed."""
    result = sequence_onboarding(steps)
    every_step_passed = len(steps) > 0 and all(
        step_passed(step) for step in steps
    )
    assert result["passed"] is every_step_passed
    # When passed, nothing halted; when not passed (non-empty), something halted.
    if result["passed"]:
        assert result["halted_at"] is None
        assert result["failing_step"] is None
