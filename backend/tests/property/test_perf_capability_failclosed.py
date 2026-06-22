"""Property 16 — fail-closed on capability resolution error.

# Feature: system-performance-hardening, Property 16

The capability/scope cache (R5) must never weaken authorization. The shared
resolver ``_resolve_capability_payload`` (``backend/apps/accounts/admin_user_views.py``)
wraps the single source of truth ``_build_capability_payload(user)`` in the
flag-gated :func:`~apps.common.scoped_cache.cached_or_compute` and adds a
fail-closed guard: when the underlying computation raises
:class:`~apps.catalog.services.CapabilityResolutionError`, the wrapper must

  (a) **never store** a cache entry for that resolution failure,
  (b) **drop any existing entry** via ``invalidate_user("cap", user.pk)``, and
  (c) **re-raise** so the view returns the existing fail-closed authorization
      error (zero capabilities, no tenant data).

This holds whether ``PERF_CACHE_CAPABILITIES`` is on or off and across arbitrary
user pks. Note that the failure guard only runs when resolution is actually
*attempted* — i.e. on a cache miss. A live, within-TTL entry is a hit that never
invokes compute (that is the intended caching behaviour; staleness is bounded by
the ≤1s invalidation signals of task 12.2), so the property exercises the error
on a genuine miss.

The property is exercised at the resolver level: ``_build_capability_payload``
is patched to either return a deterministic payload (a clean recompute) or raise
``CapabilityResolutionError`` (the failure under test). The real
``cached_or_compute`` runs against Django's LocMemCache (the test cache backend)
so the version-token / never-cache-empty mechanics are genuinely exercised;
``invalidate_user`` is wrapped by a spy that still delegates to the real
implementation, so the drop (b) both happens and is observed. No live DB is
required — the wrapper only reads ``user.pk``.

The decisive observation for "(a) never stores / nothing poisoned": after the
raising call, a *flag-on* read whose compute returns a distinct FRESH payload
must actually invoke that compute and return FRESH — if the failure had been
stored, the read would have served the poisoned entry instead of recomputing.

**Validates: Requirements 5.3**
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.test")
os.environ.setdefault("TESTING", "1")

import django  # noqa: E402

django.setup()

from unittest.mock import patch  # noqa: E402

import pytest  # noqa: E402
from django.core.cache import cache  # noqa: E402
from django.test import override_settings  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

from apps.accounts import admin_user_views  # noqa: E402
from apps.accounts.admin_user_views import _resolve_capability_payload  # noqa: E402
from apps.catalog.services import CapabilityResolutionError  # noqa: E402
from apps.common.scoped_cache import invalidate_user as _real_invalidate_user  # noqa: E402


# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------


class _FakeUser:
    """Minimal stand-in: the resolver only ever reads ``user.pk``.

    ``_resolve_capability_payload`` keys the cache on ``str(user.pk)`` and
    invalidates via ``invalidate_user("cap", user.pk)`` — no DB row needed.
    """

    def __init__(self, pk):
        self.pk = pk


# A distinct "fresh" payload representing a clean recompute after a failure.
_FRESH_PAYLOAD = {"capabilities": [], "marker": "fresh"}

# Arbitrary user pks: both integer ids and UUID-string ids (the codebase uses
# both shapes for primary keys across models).
user_pks = st.one_of(
    st.integers(min_value=1, max_value=10_000_000),
    st.uuids().map(str),
)


def _patch_build(**kwargs):
    """Patch the module-level ``_build_capability_payload`` used by the resolver."""
    return patch.object(admin_user_views, "_build_capability_payload", **kwargs)


def _spy_invalidate_user():
    """Patch ``invalidate_user`` with a spy that still performs the real drop."""
    return patch.object(
        admin_user_views,
        "invalidate_user",
        side_effect=_real_invalidate_user,
    )


# ---------------------------------------------------------------------------
# Property 16 — fail-closed: re-raise, drop existing entry, never poison
# ---------------------------------------------------------------------------


@settings(max_examples=200, deadline=None)
@given(user_pk=user_pks, flag=st.booleans())
def test_failclosed_reraises_drops_entry_and_never_poisons(user_pk, flag):
    """A resolution error re-raises, drops the entry, and stores nothing.

    For arbitrary user pk and with the capability cache flag either on or off:

    1. resolve with a compute that raises ``CapabilityResolutionError`` on a
       genuine cache miss — assert it re-raises (c), the failing compute was
       attempted, and ``invalidate_user("cap", user.pk)`` was called to drop
       any existing entry (b);
    2. resolve again with the cache flag ON and a FRESH compute — assert it
       recomputes FRESH, proving the failure was never stored (a) and nothing
       poisoned is served.

    **Validates: Requirements 5.3**
    """
    cache.clear()
    user = _FakeUser(user_pk)

    # 1. The computation fails closed on a miss.
    with override_settings(PERF_CACHE_CAPABILITIES=flag):
        with _patch_build(side_effect=CapabilityResolutionError("unresolvable")) as raising:
            with _spy_invalidate_user() as drop:
                with pytest.raises(CapabilityResolutionError):
                    _resolve_capability_payload(user)

    assert raising.call_count == 1, "the failing compute must be attempted once"
    # (b) the existing entry is dropped via invalidate_user("cap", user.pk).
    drop.assert_called_once_with("cap", user.pk)

    # 2. With the flag ON, the next read must recompute FRESH — the failure was
    #    never stored (a) and nothing poisoned/stale is served. compute being
    #    invoked exactly once is the proof.
    with override_settings(PERF_CACHE_CAPABILITIES=True):
        with _patch_build(return_value=dict(_FRESH_PAYLOAD)) as fresh:
            result = _resolve_capability_payload(user)
        assert result == _FRESH_PAYLOAD
        assert fresh.call_count == 1, (
            "post-error read must recompute (no stored/poisoned entry served)"
        )


# ---------------------------------------------------------------------------
# Property 16 — a previously cached (stale) entry is dropped by the error path
# ---------------------------------------------------------------------------


@settings(max_examples=150, deadline=None)
@given(user_pk=user_pks)
def test_failclosed_drops_previously_cached_entry(user_pk):
    """A live cached entry is invalidated once resolution fails on the next miss.

    Seed a real (flag-on) cache entry, force its eviction (so the next call is a
    genuine miss that reaches compute), then have compute fail. The error path
    must drop the entry via ``invalidate_user`` and re-raise, and a subsequent
    flag-on read must recompute FRESH rather than resurrect the seeded value.

    **Validates: Requirements 5.3**
    """
    cache.clear()
    user = _FakeUser(user_pk)
    stale = {"capabilities": ["platform.tenant.read_all"], "marker": "stale"}

    with override_settings(PERF_CACHE_CAPABILITIES=True):
        # Seed a genuine cache entry through the success path.
        with _patch_build(return_value=dict(stale)) as seed:
            assert _resolve_capability_payload(user) == stale
        # Confirm it is cached: a second read is a hit (compute not re-invoked).
        with _patch_build(return_value=dict(stale)) as seed_hit:
            assert _resolve_capability_payload(user) == stale
            assert seed_hit.call_count == 0

        # Evict so the next resolve is a real miss that reaches compute. (In
        # production the ≤1s invalidation signals do this; here we clear to model
        # the residual-entry-then-miss sequence the fail-closed guard protects.)
        cache.clear()

        with _patch_build(side_effect=CapabilityResolutionError("unresolvable")):
            with _spy_invalidate_user() as drop:
                with pytest.raises(CapabilityResolutionError):
                    _resolve_capability_payload(user)
        drop.assert_called_once_with("cap", user.pk)

        # The next read recomputes FRESH; the stale seed is never resurrected.
        with _patch_build(return_value=dict(_FRESH_PAYLOAD)) as fresh:
            result = _resolve_capability_payload(user)
        assert result == _FRESH_PAYLOAD
        assert result != stale
        assert fresh.call_count == 1
