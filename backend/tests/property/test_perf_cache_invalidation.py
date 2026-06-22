"""Property-based tests for scoped-cache invalidation semantics.

# Feature: system-performance-hardening, Property 4

Property 4: Invalidation is idempotent and forces recompute.

After storing a value via ``cached_or_compute``, calling ``invalidate`` (or
``invalidate_user``) forces the next ``cached_or_compute`` for the same scope to
recompute (``compute`` is called again and the fresh value is returned).
Invalidation is idempotent: invalidating once versus many times in a row yields
the same observable result — the next read recomputes exactly once and no error
is raised. This is exercised through the per-scope integer version-token bump
mechanic (``spc:ver:<namespace>:<scope_signature>``).

Unit-level against Django's LocMemCache (the default test cache); no live DB is
required because ``cached_or_compute`` / ``invalidate`` accept the scope
signature as an opaque string.

**Validates: Requirements 2.4, 4.3, 5.4, 5.5, 5.6**
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django  # noqa: E402

django.setup()

from django.core.cache import cache  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

from apps.common.scoped_cache import (  # noqa: E402
    cached_or_compute,
    invalidate,
    invalidate_user,
)

# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

# Key segments: keep to a readable alphanumeric/underscore/hyphen alphabet. The
# builder strips ":" and bounds length itself, but constraining here keeps the
# generated scopes legible and collision-free across examples.
_segment_alphabet = st.text(
    alphabet="abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-",
    min_size=1,
    max_size=24,
)

namespaces = _segment_alphabet
scope_signatures = _segment_alphabet
sub_keys = st.one_of(st.none(), _segment_alphabet)

# Repeated invalidate count: N >= 1 (idempotency is about "once vs many times").
invalidate_counts = st.integers(min_value=1, max_value=6)

# A non-empty TTL so the stored entry is a genuine hit (never-cache-empty means
# only non-empty values are stored, so the produced value must be non-empty).
ttls = st.integers(min_value=30, max_value=600)


def _make_compute():
    """Return ``(compute, calls)`` where ``compute`` yields a fresh value each call.

    ``calls`` is a single-element list acting as a mutable counter so the test
    can assert exactly how many times the underlying computation ran. Each call
    returns a distinct non-empty payload so "fresh data" is observable.
    """
    calls = [0]

    def compute():
        calls[0] += 1
        return {"value": f"computed-{calls[0]}", "n": calls[0]}

    return compute, calls


# ---------------------------------------------------------------------------
# Property 4 — invalidate(namespace, scope_signature)
# ---------------------------------------------------------------------------


@settings(max_examples=200, deadline=None)
@given(
    namespace=namespaces,
    scope_signature=scope_signatures,
    sub_key=sub_keys,
    invalidate_count=invalidate_counts,
    ttl=ttls,
)
def test_invalidate_idempotent_and_forces_recompute(
    namespace, scope_signature, sub_key, invalidate_count, ttl
):
    """invalidate is idempotent and forces the next read to recompute.

    store -> read (hit, compute NOT re-called) -> invalidate N times (N>=1)
    -> read (miss, compute re-called exactly once, fresh value).

    **Validates: Requirements 2.4, 4.3**
    """
    # Reset between hypothesis examples (autouse conftest fixture only clears
    # once per test function, not per generated example).
    cache.clear()

    compute, calls = _make_compute()

    # 1. Store: first read is a miss -> compute runs once, value is cached.
    first = cached_or_compute(
        namespace, scope_signature, compute, ttl=ttl, sub_key=sub_key, enabled=True
    )
    assert calls[0] == 1
    assert first == {"value": "computed-1", "n": 1}

    # 2. Read again: cache hit -> compute must NOT run again, same value.
    cached = cached_or_compute(
        namespace, scope_signature, compute, ttl=ttl, sub_key=sub_key, enabled=True
    )
    assert calls[0] == 1, "cache hit must not re-invoke compute"
    assert cached == first, "cache hit must return the stored value unchanged"

    # 3. Invalidate N>=1 times in a row. Must never raise.
    for _ in range(invalidate_count):
        invalidate(namespace, scope_signature, sub_key=sub_key)

    # 4. Next read recomputes exactly once (idempotency: invalidating once vs
    #    many times yields the same observable result — a single recompute),
    #    returning fresh data.
    recomputed = cached_or_compute(
        namespace, scope_signature, compute, ttl=ttl, sub_key=sub_key, enabled=True
    )
    assert calls[0] == 2, (
        "exactly one recompute after invalidation regardless of invalidate count"
    )
    assert recomputed == {"value": "computed-2", "n": 2}, "must return fresh data"
    assert recomputed != first


@settings(max_examples=150, deadline=None)
@given(
    namespace=namespaces,
    scope_signature=scope_signatures,
    invalidate_count=invalidate_counts,
)
def test_invalidate_once_vs_many_same_observable_result(
    namespace, scope_signature, invalidate_count
):
    """Invalidating once and invalidating N>1 times are observably equivalent.

    Two independent scopes seeded identically: one invalidated once, the other
    invalidated ``invalidate_count`` times. Both must recompute exactly once on
    the next read and yield the same fresh payload.

    **Validates: Requirements 2.4, 4.3**
    """
    cache.clear()

    # Distinct scope signatures so the two runs never share a cache entry.
    sig_once = f"{scope_signature}-once"
    sig_many = f"{scope_signature}-many"

    compute_once, calls_once = _make_compute()
    compute_many, calls_many = _make_compute()

    # Seed both identically.
    seed_once = cached_or_compute(namespace, sig_once, compute_once, ttl=60, enabled=True)
    seed_many = cached_or_compute(namespace, sig_many, compute_many, ttl=60, enabled=True)
    assert seed_once == seed_many

    # Invalidate one scope once, the other many times.
    invalidate(namespace, sig_once)
    for _ in range(invalidate_count):
        invalidate(namespace, sig_many)

    after_once = cached_or_compute(namespace, sig_once, compute_once, ttl=60, enabled=True)
    after_many = cached_or_compute(namespace, sig_many, compute_many, ttl=60, enabled=True)

    # Both recomputed exactly once and produced the same fresh value.
    assert calls_once[0] == 2
    assert calls_many[0] == 2
    assert after_once == after_many == {"value": "computed-2", "n": 2}


# ---------------------------------------------------------------------------
# Property 4 — invalidate_user(namespace, user_id) variant (R5.4-5.6)
# ---------------------------------------------------------------------------


@settings(max_examples=150, deadline=None)
@given(
    namespace=namespaces,
    user_id=st.one_of(
        st.integers(min_value=1, max_value=10_000_000),
        st.uuids().map(str),
    ),
    invalidate_count=invalidate_counts,
)
def test_invalidate_user_idempotent_and_forces_recompute(
    namespace, user_id, invalidate_count
):
    """invalidate_user forces a recompute of the user-scoped entry, idempotently.

    The capability cache keys on ``str(user.pk)`` as its scope signature, so a
    user-scoped invalidation is the version bump for that signature. Repeated
    invalidation collapses to a single recompute on the next read.

    **Validates: Requirements 5.4, 5.5, 5.6**
    """
    cache.clear()

    scope_signature = str(user_id)
    compute, calls = _make_compute()

    # Store under the user-scoped signature, matching how the capability cache
    # is keyed (str(user.pk)).
    first = cached_or_compute(namespace, scope_signature, compute, ttl=60, enabled=True)
    assert calls[0] == 1

    # Hit: no recompute.
    cached = cached_or_compute(namespace, scope_signature, compute, ttl=60, enabled=True)
    assert calls[0] == 1
    assert cached == first

    # Invalidate the user N>=1 times. Must never raise.
    for _ in range(invalidate_count):
        invalidate_user(namespace, user_id)

    # Next read recomputes exactly once with fresh data.
    recomputed = cached_or_compute(namespace, scope_signature, compute, ttl=60, enabled=True)
    assert calls[0] == 2
    assert recomputed == {"value": "computed-2", "n": 2}
    assert recomputed != first
