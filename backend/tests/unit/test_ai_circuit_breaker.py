"""Tests for ai_circuit_breaker.

Covers:
- Flag-off pass-through (pre-hardening behaviour preserved).
- Flag-on: opens after FAILURE_THRESHOLD consecutive failures.
- Flag-on: short-circuits while open.
- Flag-on: success after probe closes the breaker.
- Flag-on: None return is not counted as failure (existing AI contract).
"""

from __future__ import annotations

from unittest.mock import patch

import pytest
from django.core.cache import cache
from django.test import override_settings

from apps.common.ai_circuit_breaker import (
    FAILURE_THRESHOLD,
    with_circuit_breaker,
    _is_open,
    _breaker_key,
)


@pytest.fixture(autouse=True)
def _clear_cache():
    cache.clear()
    yield
    cache.clear()


# ---------------------------------------------------------------------------
# Flag-off: pure pass-through
# ---------------------------------------------------------------------------


@override_settings(AI_HARDENING_CIRCUIT_BREAKER=False)
def test_flag_off_is_pure_passthrough_on_success():
    calls = []

    @with_circuit_breaker("t.passthrough")
    def fn():
        calls.append(1)
        return "ok"

    assert fn() == "ok"
    assert calls == [1]
    # No breaker state written.
    assert cache.get(_breaker_key("t.passthrough", "open")) is None


@override_settings(AI_HARDENING_CIRCUIT_BREAKER=False)
def test_flag_off_does_not_swallow_exceptions():
    @with_circuit_breaker("t.passthrough_raise")
    def fn():
        raise RuntimeError("boom")

    with pytest.raises(RuntimeError):
        fn()


# ---------------------------------------------------------------------------
# Flag-on: failure counting + open
# ---------------------------------------------------------------------------


@override_settings(AI_HARDENING_CIRCUIT_BREAKER=True)
def test_opens_after_threshold_failures():
    @with_circuit_breaker("t.open")
    def fn():
        raise RuntimeError("gateway down")

    # First N-1 failures do not open.
    for _ in range(FAILURE_THRESHOLD - 1):
        assert fn() is None  # fallback returned, exception swallowed
    assert _is_open("t.open") is False

    # Nth failure opens.
    assert fn() is None
    assert _is_open("t.open") is True


@override_settings(AI_HARDENING_CIRCUIT_BREAKER=True)
def test_short_circuits_once_open():
    calls = []

    @with_circuit_breaker("t.sc")
    def fn():
        calls.append(1)
        raise RuntimeError("x")

    # Trip it.
    for _ in range(FAILURE_THRESHOLD):
        fn()
    assert _is_open("t.sc") is True

    call_count_before = len(calls)
    # Further calls must NOT invoke fn.
    assert fn() is None
    assert fn() is None
    assert len(calls) == call_count_before


# ---------------------------------------------------------------------------
# Flag-on: recovery
# ---------------------------------------------------------------------------


@override_settings(AI_HARDENING_CIRCUIT_BREAKER=True)
def test_success_closes_breaker_after_partial_failures():
    state = {"fail": True}

    @with_circuit_breaker("t.recover")
    def fn():
        if state["fail"]:
            raise RuntimeError("x")
        return "ok"

    # Accumulate partial failures (below threshold).
    fn()
    fn()
    # Next call succeeds → counter cleared.
    state["fail"] = False
    assert fn() == "ok"

    # Re-fail N times, should open cleanly (counter was reset).
    state["fail"] = True
    for _ in range(FAILURE_THRESHOLD):
        fn()
    assert _is_open("t.recover") is True


@override_settings(AI_HARDENING_CIRCUIT_BREAKER=True)
def test_none_return_does_not_count_as_failure():
    """Existing AI contract: None means "AI unavailable, keep going"."""
    @with_circuit_breaker("t.none")
    def fn():
        return None

    # Call many times — never trips.
    for _ in range(FAILURE_THRESHOLD * 5):
        assert fn() is None
    assert _is_open("t.none") is False


@override_settings(AI_HARDENING_CIRCUIT_BREAKER=True)
def test_fallback_value_is_returned_when_open():
    sentinel = object()

    @with_circuit_breaker("t.fallback", fallback=sentinel)
    def fn():
        raise RuntimeError("x")

    # Trip it.
    for _ in range(FAILURE_THRESHOLD):
        assert fn() is sentinel

    # Now it's open — short-circuit also returns sentinel.
    assert fn() is sentinel


@override_settings(AI_HARDENING_CIRCUIT_BREAKER=True)
def test_independent_breaker_names_do_not_affect_each_other():
    @with_circuit_breaker("t.a")
    def a():
        raise RuntimeError("a")

    @with_circuit_breaker("t.b")
    def b():
        return "b-ok"

    for _ in range(FAILURE_THRESHOLD):
        a()

    assert _is_open("t.a") is True
    assert _is_open("t.b") is False
    assert b() == "b-ok"
