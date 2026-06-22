"""Property-based tests for the launch-verification Performance_Gate evaluator.

# Feature: beanola-launch-verification, Property 8: Lighthouse scoring uses the median of runs and passes against the class threshold
# Feature: beanola-launch-verification, Property 9: API timing uses correct percentiles and requires sufficient samples

These two properties pin the pure-logic core of Gate 3 (Performance_Gate),
``scripts/launch-verification/performance_eval.py``. That module is
standard-library-only (it imports ``math``/``statistics`` and never touches
Django or the ORM), so the tests load it directly via ``importlib`` from the
hyphenated ``scripts/launch-verification/`` directory and exercise it with
hypothesis without any database or network.

Property 8 (Requirements 3.1, 3.2, 3.3, 3.6)
    *For any* list of Lighthouse run scores and any route class,
    ``evaluate_lighthouse_route`` records the ``statistics.median`` of the runs
    and passes **iff** that median is at least the class threshold (Public route
    >= 90, Authenticated/admin route >= 80). With fewer than ``MIN_RUNS`` runs the
    route is *not measured* and therefore cannot pass (it blocks the gate).

Property 9 (Requirements 3.4, 3.7)
    *For any* sample vector and p95 target, ``percentile`` matches an independent
    nearest-rank computation, the recorded p50/p95 are the definitional
    percentiles, a surface with fewer than ``MIN_API_SAMPLES`` samples is *not
    measured* (forcing the gate not passed), and a sufficiently-sampled surface
    passes **iff** its p95 is at or under the target.

Backend property-test conventions (spec ``beanola-launch-verification``):
- ``pytest`` + ``hypothesis``, >= 100 examples, exactly one property per test
  method, tagged with the Feature/Property markers above.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.6, 3.7**
"""

from __future__ import annotations

import importlib.util
import math
import statistics
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
# alias before ``exec_module`` runs: ``performance_eval`` uses frozen
# dataclasses, and registering the module first keeps any internal name
# resolution / repr machinery consistent and lets a second import (e.g. another
# test module) reuse the already-loaded object instead of re-executing it.
# --------------------------------------------------------------------------- #

_MODULE_NAME = "launch_verification_performance_eval"
_MODULE_PATH = (
    Path(__file__).resolve().parents[3]
    / "scripts"
    / "launch-verification"
    / "performance_eval.py"
)

if _MODULE_NAME in sys.modules:  # pragma: no cover - import cache reuse
    performance_eval = sys.modules[_MODULE_NAME]
else:
    _spec = importlib.util.spec_from_file_location(_MODULE_NAME, _MODULE_PATH)
    assert _spec is not None and _spec.loader is not None
    performance_eval = importlib.util.module_from_spec(_spec)
    sys.modules[_MODULE_NAME] = performance_eval
    _spec.loader.exec_module(performance_eval)

PUBLIC_LH_MIN = performance_eval.PUBLIC_LH_MIN
AUTH_LH_MIN = performance_eval.AUTH_LH_MIN
MIN_RUNS = performance_eval.MIN_RUNS
MIN_API_SAMPLES = performance_eval.MIN_API_SAMPLES
ROUTE_CLASS_PUBLIC = performance_eval.ROUTE_CLASS_PUBLIC
ROUTE_CLASS_AUTHENTICATED = performance_eval.ROUTE_CLASS_AUTHENTICATED
ROUTE_CLASS_ADMIN = performance_eval.ROUTE_CLASS_ADMIN
RESULT_PASS = performance_eval.RESULT_PASS
RESULT_FAIL = performance_eval.RESULT_FAIL
RESULT_NOT_MEASURED = performance_eval.RESULT_NOT_MEASURED
evaluate_lighthouse_route = performance_eval.evaluate_lighthouse_route
threshold_for_route_class = performance_eval.threshold_for_route_class
percentile = performance_eval.percentile
evaluate_api_surface = performance_eval.evaluate_api_surface

# Run a meaningful campaign: >= 100 examples per property.
PBT_SETTINGS = hypothesis_settings(max_examples=200, deadline=None)

# Lighthouse scores live on the 0..100 scale. Mixing integers with floats lets
# the campaign land exactly on a class threshold (90 / 80) often enough to
# exercise the >= boundary, not just the strictly-above / strictly-below cases.
_LH_SCORE = st.one_of(
    st.integers(min_value=0, max_value=100).map(float),
    st.floats(min_value=0.0, max_value=100.0, allow_nan=False, allow_infinity=False),
)

_ROUTE_CLASS = st.sampled_from(
    [ROUTE_CLASS_PUBLIC, ROUTE_CLASS_AUTHENTICATED, ROUTE_CLASS_ADMIN]
)

# Latency samples in milliseconds. Integers and floats both, so p50/p95 land on
# real sample members and the nearest-rank index logic is fully exercised.
_LATENCY = st.one_of(
    st.integers(min_value=0, max_value=20000).map(float),
    st.floats(min_value=0.0, max_value=20000.0, allow_nan=False, allow_infinity=False),
)


def _independent_nearest_rank(samples, p):
    """An independent re-derivation of the nearest-rank percentile.

    Deliberately written from the definition rather than calling the module
    under test, so the property is a genuine cross-check:

        sort ascending; for p == 0 take the minimum; otherwise
        rank = ceil(p / 100 * N) clamped to [1, N]; value = sorted[rank - 1].
    """
    ordered = sorted(float(s) for s in samples)
    n = len(ordered)
    if p == 0:
        return ordered[0]
    rank = math.ceil(p / 100.0 * n)
    if rank < 1:
        rank = 1
    elif rank > n:
        rank = n
    return ordered[rank - 1]


# --------------------------------------------------------------------------- #
# Property 8 — Lighthouse median + class-threshold scoring.
# --------------------------------------------------------------------------- #


class TestProperty8LighthouseMedianThreshold:
    """Feature: beanola-launch-verification, Property 8: Lighthouse scoring uses the median of runs and passes against the class threshold."""

    @PBT_SETTINGS
    @given(
        route_class=_ROUTE_CLASS,
        run_scores=st.lists(_LH_SCORE, min_size=MIN_RUNS, max_size=9),
    )
    def test_measured_route_records_median_and_passes_iff_at_threshold(
        self, route_class, run_scores
    ) -> None:
        """With >= MIN_RUNS runs the result records statistics.median and passes iff median >= class threshold."""
        result = evaluate_lighthouse_route(route_class, run_scores, route="/x")

        expected_threshold = (
            PUBLIC_LH_MIN if route_class == ROUTE_CLASS_PUBLIC else AUTH_LH_MIN
        )
        expected_median = float(statistics.median([float(s) for s in run_scores]))

        # The recorded score is the median of the runs (R3.1).
        assert result.median == expected_median
        assert result.threshold == expected_threshold
        assert result.measured is True
        assert result.result in (RESULT_PASS, RESULT_FAIL)

        # Passes iff the median meets the class threshold (R3.2, R3.3, R3.6).
        should_pass = expected_median >= expected_threshold
        assert result.passed is should_pass
        assert result.result == (RESULT_PASS if should_pass else RESULT_FAIL)

    @PBT_SETTINGS
    @given(
        run_scores=st.lists(_LH_SCORE, min_size=MIN_RUNS, max_size=9),
    )
    def test_public_threshold_is_90_and_auth_admin_is_80(self, run_scores) -> None:
        """Public requires >= 90; authenticated and admin both require >= 80 over the same runs."""
        median = float(statistics.median([float(s) for s in run_scores]))

        public = evaluate_lighthouse_route(ROUTE_CLASS_PUBLIC, run_scores, route="/")
        auth = evaluate_lighthouse_route(
            ROUTE_CLASS_AUTHENTICATED, run_scores, route="/student/dashboard"
        )
        admin = evaluate_lighthouse_route(
            ROUTE_CLASS_ADMIN, run_scores, route="/admin/dashboard"
        )

        assert public.threshold == 90.0
        assert auth.threshold == 80.0
        assert admin.threshold == 80.0
        assert threshold_for_route_class(ROUTE_CLASS_PUBLIC) == 90.0
        assert threshold_for_route_class(ROUTE_CLASS_AUTHENTICATED) == 80.0
        assert threshold_for_route_class(ROUTE_CLASS_ADMIN) == 80.0

        assert public.passed is (median >= 90.0)
        assert auth.passed is (median >= 80.0)
        assert admin.passed is (median >= 80.0)

    @PBT_SETTINGS
    @given(
        route_class=_ROUTE_CLASS,
        run_scores=st.lists(_LH_SCORE, min_size=0, max_size=MIN_RUNS - 1),
    )
    def test_fewer_than_min_runs_is_not_measured_and_blocks(
        self, route_class, run_scores
    ) -> None:
        """Fewer than MIN_RUNS runs -> not-measured, which can never pass (R3.7)."""
        result = evaluate_lighthouse_route(route_class, run_scores, route="/x")

        assert result.result == RESULT_NOT_MEASURED
        assert result.median is None
        assert result.measured is False
        # A not-measured route blocks the gate: it is never a pass.
        assert result.passed is False


# --------------------------------------------------------------------------- #
# Property 9 — API timing percentiles + sample-count sufficiency.
# --------------------------------------------------------------------------- #


class TestProperty9ApiPercentilesSampleSufficiency:
    """Feature: beanola-launch-verification, Property 9: API timing uses correct percentiles and requires sufficient samples."""

    @PBT_SETTINGS
    @given(
        samples=st.lists(_LATENCY, min_size=1, max_size=250),
        p=st.sampled_from([0, 25, 50, 75, 90, 95, 99, 100]),
    )
    def test_percentile_matches_independent_nearest_rank(self, samples, p) -> None:
        """percentile() equals an independent nearest-rank computation and is a sample member."""
        got = percentile(samples, p)
        expected = _independent_nearest_rank(samples, p)

        assert got == expected
        # Nearest-rank never interpolates: the result is always an actual sample.
        assert got in [float(s) for s in samples]

    @PBT_SETTINGS
    @given(
        samples=st.lists(_LATENCY, min_size=MIN_API_SAMPLES, max_size=300),
        p95_target_ms=st.floats(
            min_value=0.0, max_value=20000.0, allow_nan=False, allow_infinity=False
        ),
    )
    def test_sufficient_samples_record_p50_p95_and_pass_iff_under_target(
        self, samples, p95_target_ms
    ) -> None:
        """With >= MIN_API_SAMPLES samples, p50/p95 are definitional and pass iff p95 <= target (R3.4-3.6)."""
        result = evaluate_api_surface("payment status", samples, p95_target_ms)

        expected_p50 = _independent_nearest_rank(samples, 50)
        expected_p95 = _independent_nearest_rank(samples, 95)

        assert result.measured is True
        assert result.sample_count == len(samples)
        assert result.p50_ms == expected_p50
        assert result.p95_ms == expected_p95
        # p50 <= p95 always (ranks are monotone in p over the sorted vector).
        assert result.p50_ms <= result.p95_ms

        should_pass = expected_p95 <= p95_target_ms
        assert result.passed is should_pass
        assert result.result == (RESULT_PASS if should_pass else RESULT_FAIL)

    @PBT_SETTINGS
    @given(
        samples=st.lists(_LATENCY, min_size=0, max_size=MIN_API_SAMPLES - 1),
        p95_target_ms=st.floats(
            min_value=0.0, max_value=20000.0, allow_nan=False, allow_infinity=False
        ),
    )
    def test_undersampled_surface_is_not_measured_and_blocks(
        self, samples, p95_target_ms
    ) -> None:
        """Fewer than MIN_API_SAMPLES samples -> not-measured, forcing the gate not passed (R3.7)."""
        result = evaluate_api_surface("catalog offerings", samples, p95_target_ms)

        assert result.result == RESULT_NOT_MEASURED
        assert result.p50_ms is None
        assert result.p95_ms is None
        assert result.measured is False
        # Under-sampled surface blocks the gate: it is never a pass.
        assert result.passed is False
