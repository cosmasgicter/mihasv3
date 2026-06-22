"""Property 12 — Deploy disk threshold gate (task 10.3).

# Feature: system-performance-hardening, Property 12

R1 hardens ``.github/workflows/deploy.yml`` with a disk-usage gate. To make the
gate independently testable (R1.3 / R1.4) its logic is extracted into a
standalone, sourceable shell helper at ``deploy/disk_gate.sh``. The deploy
workflow scp's that file to the production box and ``source``s it, so the gate
exercised here is the exact gate that runs in production — there is no second,
divergent copy of the logic.

The helper contract (mirrored by the in-Python oracle below):

* the threshold defaults to 85 and is clamped to the inclusive range ``50..95``;
  a non-integer / empty threshold falls back to the default 85;
* the gate FAILS (non-zero exit) when integer disk ``usage >= clamped_threshold``,
  emitting an error naming the measured usage, the threshold, and the step;
* the gate SUCCEEDS (exit 0) when ``usage < clamped_threshold``, and still echoes
  the measured usage as an integer percentage (R1.3);
* a non-integer / empty usage value is a hard failure (cannot gate safely).

Property 12 proves, *for any* measured disk usage ``U`` in ``0..100`` and *any*
configured threshold ``T`` (including out-of-range values to exercise clamping),
that the gate halts with a non-zero exit **if and only if** ``U >= clamp(T)``;
that when it halts the emitted message contains ``U``, the clamped ``T``, and the
failed step name; and that ``U`` is always recorded as an integer percentage in
the gate output.

**Validates: Requirements 1.3, 1.4**

This test is DB-independent: it invokes the shell helper through ``subprocess``
and asserts on exit status + emitted text only. It is skipped gracefully when
``bash`` is unavailable.
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

# Resolve deploy/disk_gate.sh from the repo root (… /backend/tests/property/…).
REPO_ROOT = Path(__file__).resolve().parents[3]
DISK_GATE = REPO_ROOT / "deploy" / "disk_gate.sh"

BASH = shutil.which("bash")

pytestmark = [
    pytest.mark.skipif(BASH is None, reason="bash is required to exercise disk_gate.sh"),
    pytest.mark.skipif(
        not DISK_GATE.exists(), reason=f"disk_gate.sh helper missing at {DISK_GATE}"
    ),
]

DEFAULT_THRESHOLD = 85
CLAMP_MIN = 50
CLAMP_MAX = 95


def _clamp_threshold(raw: object) -> int:
    """In-Python oracle mirroring ``clamp_threshold`` in disk_gate.sh.

    The shell tests the token against ``^[0-9]+$`` (digits only), so a negative,
    empty, or otherwise non-digit value falls back to the default 85; a
    digit-only integer is clamped to the inclusive range 50..95.
    """
    token = str(raw)
    if not token.isdigit():
        value = DEFAULT_THRESHOLD
    else:
        value = int(token)
    if value < CLAMP_MIN:
        return CLAMP_MIN
    if value > CLAMP_MAX:
        return CLAMP_MAX
    return value


def _run_gate(usage: object, threshold: object, step: str) -> subprocess.CompletedProcess:
    """Invoke ``bash deploy/disk_gate.sh <usage> <threshold> <step>``."""
    return subprocess.run(
        [BASH, str(DISK_GATE), str(usage), str(threshold), step],
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )


# Thresholds span the clamp boundaries: below 50, in-range, above 95.
threshold_strategy = st.integers(min_value=0, max_value=140)
usage_strategy = st.integers(min_value=0, max_value=100)
step_strategy = st.sampled_from(
    ["pre-deploy-disk-gate", "post-deploy-disk-gate", "disk-usage-gate", "step_42"]
)


@settings(max_examples=200, deadline=None)
@given(usage=usage_strategy, threshold=threshold_strategy, step=step_strategy)
def test_gate_halts_iff_usage_at_or_above_clamped_threshold(usage, threshold, step):
    """Gate exits non-zero IFF usage >= clamp(threshold); message names U/T/step.

    Covers R1.4 (halt with usage/threshold/step naming) and the clamping of
    out-of-range thresholds to the inclusive 50..95 range.
    """
    clamped = _clamp_threshold(threshold)
    result = _run_gate(usage, threshold, step)
    combined = result.stdout + result.stderr

    if usage >= clamped:
        # Halt path: non-zero exit and a message naming usage, threshold, step.
        assert result.returncode != 0, (
            f"expected halt for usage={usage} >= clamped_threshold={clamped}, "
            f"got exit 0\n{combined}"
        )
        assert str(usage) in combined, f"usage {usage} not named in message:\n{combined}"
        assert str(clamped) in combined, (
            f"clamped threshold {clamped} not named in message:\n{combined}"
        )
        assert step in combined, f"step '{step}' not named in message:\n{combined}"
    else:
        # Proceed path: zero exit.
        assert result.returncode == 0, (
            f"expected proceed for usage={usage} < clamped_threshold={clamped}, "
            f"got exit {result.returncode}\n{combined}"
        )


@settings(max_examples=120, deadline=None)
@given(usage=usage_strategy, threshold=threshold_strategy, step=step_strategy)
def test_gate_records_usage_as_integer_percentage(usage, threshold, step):
    """The gate always echoes the measured usage as an integer percent (R1.3).

    Whether the gate halts or proceeds, the integer usage value appears in the
    emitted output (the workflow logs ``disk_usage_before/after`` separately;
    here we assert the gate itself surfaces the integer it was given).
    """
    result = _run_gate(usage, threshold, step)
    combined = result.stdout + result.stderr
    assert str(usage) in combined, (
        f"integer usage {usage} not recorded in gate output:\n{combined}"
    )
    # The usage we feed is, by construction, an integer in 0..100 (R1.3).
    assert 0 <= usage <= 100


@settings(max_examples=120, deadline=None)
@given(
    threshold=st.integers(min_value=-50, max_value=200),
    step=step_strategy,
)
def test_threshold_clamping_boundaries(threshold, step):
    """Out-of-range thresholds clamp to [50, 95]; in-range pass unchanged.

    Verified behaviourally through the gate: a usage one below the clamped
    threshold must proceed, and a usage equal to the clamped threshold must
    halt. This pins the clamp boundaries (<50 -> 50, >95 -> 95) via observable
    gate behaviour rather than parsing internals.
    """
    clamped = _clamp_threshold(threshold)
    assert CLAMP_MIN <= clamped <= CLAMP_MAX

    # Usage just below the clamped threshold -> proceed (exit 0).
    below = _run_gate(clamped - 1, threshold, step)
    assert below.returncode == 0, (
        f"usage={clamped - 1} should proceed under clamped threshold {clamped}\n"
        f"{below.stdout + below.stderr}"
    )

    # Usage exactly at the clamped threshold -> halt (non-zero).
    at = _run_gate(clamped, threshold, step)
    assert at.returncode != 0, (
        f"usage={clamped} should halt at clamped threshold {clamped}\n"
        f"{at.stdout + at.stderr}"
    )


@settings(max_examples=100, deadline=None)
@given(
    usage=usage_strategy,
    step=step_strategy,
)
def test_non_integer_threshold_falls_back_to_default(usage, step):
    """A non-integer / empty threshold falls back to the default 85.

    With the default threshold, usage >= 85 halts and usage < 85 proceeds,
    independent of the (garbage) threshold token supplied.
    """
    for bad_threshold in ("", "abc", "85.5", "  "):
        result = _run_gate(usage, bad_threshold, step)
        combined = result.stdout + result.stderr
        if usage >= DEFAULT_THRESHOLD:
            assert result.returncode != 0, (
                f"usage={usage} with bad threshold {bad_threshold!r} should halt "
                f"at default {DEFAULT_THRESHOLD}\n{combined}"
            )
            assert str(DEFAULT_THRESHOLD) in combined
        else:
            assert result.returncode == 0, (
                f"usage={usage} with bad threshold {bad_threshold!r} should proceed "
                f"under default {DEFAULT_THRESHOLD}\n{combined}"
            )


@settings(max_examples=100, deadline=None)
@given(
    bad_usage=st.sampled_from(["", "abc", "12.5", "-3", " ", "100%"]),
    threshold=threshold_strategy,
    step=step_strategy,
)
def test_non_integer_usage_is_a_hard_failure(bad_usage, threshold, step):
    """A non-integer / empty usage value is a hard failure (cannot gate safely).

    The gate must refuse to proceed (non-zero exit) and name the step when it
    cannot parse the measured usage as an integer percent.
    """
    result = _run_gate(bad_usage, threshold, step)
    combined = result.stdout + result.stderr
    assert result.returncode != 0, (
        f"unparseable usage {bad_usage!r} must not proceed\n{combined}"
    )
    assert step in combined, f"step '{step}' not named on parse failure:\n{combined}"
