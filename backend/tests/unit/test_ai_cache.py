"""Tests for ai_cache.

Covers:
- Flag-off: passthrough (always calls generator, never touches cache).
- Flag-on: hit returns cached value without calling generator.
- Flag-on: miss calls generator + stores result.
- Flag-on: None result is never cached.
- Flag-on: generator exception propagates (no cache poisoning).
- refresh=True forces regeneration.
- compute_application_fingerprint is deterministic + distinct for diff inputs.
- compute_grades_fingerprint is order-independent.
"""

from __future__ import annotations

import pytest
from django.core.cache import cache
from django.test import override_settings

from apps.common.ai_cache import (
    cached_ai_call,
    compute_application_fingerprint,
    compute_grades_fingerprint,
)


@pytest.fixture(autouse=True)
def _clear_cache():
    cache.clear()
    yield
    cache.clear()


# ---------------------------------------------------------------------------
# Flag-off pass-through
# ---------------------------------------------------------------------------


@override_settings(AI_HARDENING_CACHE=False)
def test_flag_off_always_calls_generator():
    calls = []

    def gen():
        calls.append(1)
        return "result"

    for _ in range(3):
        assert cached_ai_call("ns", "fp", gen) == "result"
    assert len(calls) == 3  # never cached


# ---------------------------------------------------------------------------
# Flag-on: hit / miss
# ---------------------------------------------------------------------------


@override_settings(AI_HARDENING_CACHE=True)
def test_flag_on_miss_calls_generator_and_caches():
    calls = []

    def gen():
        calls.append(1)
        return "cached-value"

    assert cached_ai_call("ns", "fp1", gen) == "cached-value"
    assert len(calls) == 1

    # Second call with same fingerprint — cache hit, generator not called.
    assert cached_ai_call("ns", "fp1", gen) == "cached-value"
    assert len(calls) == 1


@override_settings(AI_HARDENING_CACHE=True)
def test_different_fingerprints_are_isolated():
    def gen_a():
        return "A"

    def gen_b():
        return "B"

    assert cached_ai_call("ns", "fp-a", gen_a) == "A"
    assert cached_ai_call("ns", "fp-b", gen_b) == "B"

    # Fingerprints don't leak across.
    assert cached_ai_call("ns", "fp-a", lambda: "WRONG") == "A"
    assert cached_ai_call("ns", "fp-b", lambda: "WRONG") == "B"


@override_settings(AI_HARDENING_CACHE=True)
def test_different_namespaces_are_isolated():
    assert cached_ai_call("ns1", "fp", lambda: "X") == "X"
    assert cached_ai_call("ns2", "fp", lambda: "Y") == "Y"
    assert cached_ai_call("ns1", "fp", lambda: "IGNORED") == "X"
    assert cached_ai_call("ns2", "fp", lambda: "IGNORED") == "Y"


@override_settings(AI_HARDENING_CACHE=True)
def test_none_result_is_not_cached():
    calls = []

    def gen():
        calls.append(1)
        return None

    # First call: None.
    assert cached_ai_call("ns", "none-fp", gen) is None
    assert len(calls) == 1

    # Second call: generator ran again (None is never cached).
    assert cached_ai_call("ns", "none-fp", gen) is None
    assert len(calls) == 2


@override_settings(AI_HARDENING_CACHE=True)
def test_generator_exception_is_not_cached():
    calls = []

    def gen_boom():
        calls.append(1)
        raise RuntimeError("fail")

    with pytest.raises(RuntimeError):
        cached_ai_call("ns", "err-fp", gen_boom)

    # Still uncached — next call re-runs the generator.
    with pytest.raises(RuntimeError):
        cached_ai_call("ns", "err-fp", gen_boom)

    assert len(calls) == 2


@override_settings(AI_HARDENING_CACHE=True)
def test_refresh_true_bypasses_and_overwrites():
    def gen_v1():
        return "v1"

    def gen_v2():
        return "v2"

    assert cached_ai_call("ns", "refresh-fp", gen_v1) == "v1"
    # Without refresh: still v1.
    assert cached_ai_call("ns", "refresh-fp", gen_v2) == "v1"
    # With refresh=True: overwrite with v2.
    assert cached_ai_call("ns", "refresh-fp", gen_v2, refresh=True) == "v2"
    # New reads now see v2.
    assert cached_ai_call("ns", "refresh-fp", gen_v1) == "v2"


# ---------------------------------------------------------------------------
# Fingerprint helpers
# ---------------------------------------------------------------------------


def test_application_fingerprint_deterministic():
    a = compute_application_fingerprint("app-1", "2026-01-01T00:00:00Z", extra="x")
    b = compute_application_fingerprint("app-1", "2026-01-01T00:00:00Z", extra="x")
    assert a == b


def test_application_fingerprint_changes_with_updated_at():
    a = compute_application_fingerprint("app-1", "2026-01-01T00:00:00Z")
    b = compute_application_fingerprint("app-1", "2026-01-02T00:00:00Z")
    assert a != b


def test_application_fingerprint_changes_with_extra():
    a = compute_application_fingerprint("app-1", "2026-01-01T00:00:00Z", extra="pay:pending")
    b = compute_application_fingerprint("app-1", "2026-01-01T00:00:00Z", extra="pay:verified")
    assert a != b


def test_grades_fingerprint_is_order_independent():
    g1 = [("eng", 1), ("math", 3), ("sci", 2)]
    g2 = [("sci", 2), ("eng", 1), ("math", 3)]
    assert compute_grades_fingerprint(g1) == compute_grades_fingerprint(g2)


def test_grades_fingerprint_changes_with_value():
    g1 = [("eng", 1), ("math", 3)]
    g2 = [("eng", 2), ("math", 3)]
    assert compute_grades_fingerprint(g1) != compute_grades_fingerprint(g2)


def test_grades_fingerprint_accepts_dict_items():
    g_tuples = [("eng", 1), ("math", 3)]
    g_dicts = [{"subject_id": "eng", "grade": 1}, {"subject_id": "math", "grade": 3}]
    assert compute_grades_fingerprint(g_tuples) == compute_grades_fingerprint(g_dicts)


def test_grades_fingerprint_handles_empty_input():
    assert compute_grades_fingerprint([]) == compute_grades_fingerprint(None)
