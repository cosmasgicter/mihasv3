"""Property 3 — cache failure degrades to computation.

Spec: ``system-performance-hardening`` — Requirements 2.8 and 4.7.

The shared graceful-degradation wrapper :func:`cached_or_compute`
(``backend/apps/common/scoped_cache.py``) underpins the three flag-gated
performance caches (dashboard aggregates R2, catalog reads R4, capability/scope
payloads R5). The hard reliability guarantee is that a *failing cache backend*
(Redis down, a connection error, a serialization error on get/set) can never
break a request: the wrapper must fall back to computing the value directly and
return it, surfacing **no** cache error to the caller.

R2.8 (verbatim):

    IF the cache backend is unavailable or errors, THEN THE dashboard SHALL
    fall back to direct database computation and SHALL NOT surface a cache
    error.

R4.7 (verbatim):

    IF a cache read or write fails, THEN THE catalog SHALL compute the response
    from the catalog data and SHALL NOT surface a cache error.

Property 3 (design.md):

    *For any* namespace, scope signature, ttl, sub-key, and computed value,
    when the cache backend raises on ``get`` and/or ``set``,
    ``cached_or_compute`` still invokes ``compute()`` and returns its result
    without raising — i.e. the failing-cache path is observably identical to a
    direct computation. Additionally, with the feature flag off
    (``enabled=False``) the wrapper calls ``compute()`` every time and never
    touches the cache at all.

The property is exercised purely at the wrapper level: the module-global
``cache`` reference in ``scoped_cache`` is swapped for an injected fake
(healthy, fully-failing, or a touch-recording spy), so the test needs no live
DB or Redis. ``compute`` is a counting closure so the test can assert it was
actually invoked (degradation really recomputed) and, for the flag-off case,
that the cache was never consulted.

# Feature: system-performance-hardening, Property 3: Cache failure degrades to computation

**Validates: Requirements 2.8, 4.7**
"""

from __future__ import annotations

from unittest.mock import patch

from hypothesis import given, settings
from hypothesis import strategies as st

from apps.common import scoped_cache
from apps.common.scoped_cache import cached_or_compute


# ---------------------------------------------------------------------------
# Injected cache backends
# ---------------------------------------------------------------------------


class _FailingCache:
    """A cache backend that is completely down: every operation raises.

    Models the R2.8 / R4.7 "backend unavailable or errors" condition — both the
    version-token read, the value ``get``, and the value ``set`` raise. The
    wrapper must swallow all of them and degrade to computation.
    """

    def get(self, *args, **kwargs):  # noqa: D401 - stub
        raise ConnectionError("simulated cache backend down (get)")

    def set(self, *args, **kwargs):  # noqa: D401 - stub
        raise ConnectionError("simulated cache backend down (set)")

    def incr(self, *args, **kwargs):  # noqa: D401 - stub
        raise ConnectionError("simulated cache backend down (incr)")

    def delete(self, *args, **kwargs):  # noqa: D401 - stub
        raise ConnectionError("simulated cache backend down (delete)")


class _GetFailsSetOkCache:
    """A backend whose reads fail but whose writes "succeed" (no-op store).

    Exercises the asymmetric failure mode: ``get`` raising (treated as a miss →
    compute) while ``set`` happens to work. The computed value must still be
    returned unchanged.
    """

    def __init__(self):
        self.store: dict = {}

    def get(self, *args, **kwargs):
        raise ConnectionError("simulated cache read failure")

    def set(self, key, value, timeout=None):
        self.store[key] = value

    def incr(self, *args, **kwargs):
        raise ConnectionError("simulated cache read failure")


class _GetOkSetFailsCache:
    """A backend that always misses on read but raises on write.

    A miss → ``compute()`` → ``cache.set`` raises; the wrapper must swallow the
    write failure and still return the computed value.
    """

    def get(self, key, default=None):
        # Version read and value read both miss.
        return default

    def set(self, *args, **kwargs):
        raise ConnectionError("simulated cache write failure")

    def incr(self, *args, **kwargs):
        raise ValueError("no token")


class _SpyCache:
    """A healthy in-memory cache that records every access.

    Used to prove the flag-off bypass: with ``enabled=False`` the wrapper must
    never touch the cache, so ``touches`` must stay empty.
    """

    def __init__(self):
        self.touches: list[tuple[str, str]] = []
        self.store: dict = {}

    def get(self, key, default=None):
        self.touches.append(("get", key))
        return self.store.get(key, default)

    def set(self, key, value, timeout=None):
        self.touches.append(("set", key))
        self.store[key] = value

    def incr(self, key, delta=1):
        self.touches.append(("incr", key))
        if key not in self.store:
            raise ValueError("no token")
        self.store[key] += delta
        return self.store[key]


# ---------------------------------------------------------------------------
# Strategies — span the wrapper's whole input space
# ---------------------------------------------------------------------------


def _values():
    """Arbitrary computed return values, including empty (never-cache-empty)."""
    return st.one_of(
        st.none(),
        st.booleans(),
        st.integers(),
        st.floats(allow_nan=False, allow_infinity=False),
        st.text(),
        st.lists(st.integers(), max_size=8),
        st.dictionaries(st.text(max_size=5), st.integers(), max_size=8),
    )


_namespaces = st.text(max_size=80)
_signatures = st.text(max_size=80)
_ttls = st.integers(min_value=1, max_value=600)
_sub_keys = st.one_of(st.none(), st.text(max_size=40))


def _counting_compute(value):
    """Return a zero-arg compute closure plus a mutable call counter."""
    calls = {"n": 0}

    def compute():
        calls["n"] += 1
        return value

    return compute, calls


# ---------------------------------------------------------------------------
# Property 3
# ---------------------------------------------------------------------------


class TestCacheFailureDegradesToComputation:
    """Property 3 — a failing cache backend degrades to direct computation.

    **Validates: Requirements 2.8, 4.7**
    """

    @given(
        namespace=_namespaces,
        signature=_signatures,
        ttl=_ttls,
        sub_key=_sub_keys,
        value=_values(),
        backend=st.sampled_from(["all_fail", "get_fail", "set_fail"]),
    )
    @settings(max_examples=250, deadline=None)
    def test_failing_backend_still_returns_computed_value(
        self, namespace, signature, ttl, sub_key, value, backend
    ):
        """When the cache raises, ``compute()`` runs and its result is returned.

        Holds across every namespace / scope signature / ttl / sub-key / value
        and across three failure shapes (both ops fail, read-only fail,
        write-only fail). No cache error is ever surfaced (R2.8, R4.7).
        """
        fake = {
            "all_fail": _FailingCache,
            "get_fail": _GetFailsSetOkCache,
            "set_fail": _GetOkSetFailsCache,
        }[backend]()

        compute, calls = _counting_compute(value)

        with patch.object(scoped_cache, "cache", fake):
            # Must not raise despite the backend erroring.
            result = cached_or_compute(
                namespace,
                signature,
                compute,
                ttl=ttl,
                sub_key=sub_key,
                enabled=True,
            )

        # The wrapper degraded to computation: compute ran and its value is
        # returned verbatim (observably identical to a direct computation).
        assert result == value
        assert calls["n"] >= 1

    @given(
        namespace=_namespaces,
        signature=_signatures,
        ttl=_ttls,
        sub_key=_sub_keys,
        value=_values(),
    )
    @settings(max_examples=250, deadline=None)
    def test_healthy_backend_also_returns_computed_value(
        self, namespace, signature, ttl, sub_key, value
    ):
        """Baseline: a healthy backend returns exactly the computed value too.

        Establishes that the failing-cache path is observably identical to the
        healthy path — both return ``compute()`` output unchanged.
        """
        spy = _SpyCache()
        compute, calls = _counting_compute(value)

        with patch.object(scoped_cache, "cache", spy):
            result = cached_or_compute(
                namespace,
                signature,
                compute,
                ttl=ttl,
                sub_key=sub_key,
                enabled=True,
            )

        assert result == value
        assert calls["n"] == 1  # one miss → exactly one computation

    @given(
        namespace=_namespaces,
        signature=_signatures,
        ttl=_ttls,
        sub_key=_sub_keys,
        value=_values(),
        calls_count=st.integers(min_value=1, max_value=5),
    )
    @settings(max_examples=200, deadline=None)
    def test_flag_off_computes_every_time_and_never_touches_cache(
        self, namespace, signature, ttl, sub_key, value, calls_count
    ):
        """``enabled=False`` calls ``compute()`` every time and never touches cache.

        With the feature flag off the wrapper must behave exactly like the
        pre-feature code path: compute on every call and never consult the cache
        backend at all (proved via the touch-recording spy).
        """
        spy = _SpyCache()
        compute, calls = _counting_compute(value)

        with patch.object(scoped_cache, "cache", spy):
            for _ in range(calls_count):
                result = cached_or_compute(
                    namespace,
                    signature,
                    compute,
                    ttl=ttl,
                    sub_key=sub_key,
                    enabled=False,
                )
                assert result == value

        # compute() ran on every invocation ...
        assert calls["n"] == calls_count
        # ... and the cache was never touched.
        assert spy.touches == []
