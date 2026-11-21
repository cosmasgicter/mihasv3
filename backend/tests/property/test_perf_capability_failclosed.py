"""Property 16 — fail-closed on capability resolution error.

# Feature: system-performance-hardening, Property 16

Retargeted to the uncached path by platform-simplification task 16.1 (decision
D7 option A). The property first held for the flag-gated capability cache: a
resolution error was never stored, any existing entry was dropped, and the error
re-raised. That cache, its flag and ``invalidate_user`` are gone, so the shared
resolver ``_resolve_capability_payload`` (``backend/apps/accounts/admin_user_views.py``)
computes ``_build_capability_payload(user)`` on every call. The property that
remains, for arbitrary user pks:

  (a) a :class:`~apps.catalog.services.CapabilityResolutionError` from the
      computation **re-raises**, so the scope and capabilities views return the
      fail-closed authorization error (zero capabilities, no tenant data);
  (b) nothing is remembered: the next call computes again, so a payload that was
      returned **before** a failure is never served in its place, and a failure
      is never served after the computation recovers.

``_build_capability_payload`` is patched to return a deterministic payload or to
raise; no live DB is required, because the resolver only passes ``user`` through.

**Validates: Requirements 5.3**
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.test")
os.environ.setdefault("TESTING", "1")

import django  # noqa: E402

django.setup()

from unittest.mock import patch  # noqa: E402

import pytest  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

from apps.accounts import admin_user_views  # noqa: E402
from apps.accounts.admin_user_views import _resolve_capability_payload  # noqa: E402
from apps.catalog.services import CapabilityResolutionError  # noqa: E402


# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------


class _FakeUser:
    """Minimal stand-in: the resolver only passes ``user`` to the computation."""

    def __init__(self, pk):
        self.pk = pk


# A distinct "fresh" payload representing a clean computation after a failure.
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


# ---------------------------------------------------------------------------
# Property 16 — fail-closed: re-raise, and nothing is remembered
# ---------------------------------------------------------------------------


@settings(max_examples=200, deadline=None)
@given(user_pk=user_pks)
def test_failclosed_reraises_and_next_call_computes_again(user_pk):
    """A resolution error re-raises, and the next call computes afresh.

    1. resolve with a computation that raises ``CapabilityResolutionError`` —
       assert it re-raises (a) and the computation was attempted once;
    2. resolve twice with a FRESH computation — assert each call returns FRESH
       and invokes the computation, so no failure and no payload is remembered (b).

    **Validates: Requirements 5.3**
    """
    user = _FakeUser(user_pk)

    with _patch_build(side_effect=CapabilityResolutionError("unresolvable")) as raising:
        with pytest.raises(CapabilityResolutionError):
            _resolve_capability_payload(user)
    assert raising.call_count == 1, "the failing computation must be attempted once"

    with _patch_build(return_value=dict(_FRESH_PAYLOAD)) as fresh:
        assert _resolve_capability_payload(user) == _FRESH_PAYLOAD
        assert _resolve_capability_payload(user) == _FRESH_PAYLOAD
    assert fresh.call_count == 2, "every call must compute; nothing is served from memory"


# ---------------------------------------------------------------------------
# Property 16 — an earlier payload never masks a later failure
# ---------------------------------------------------------------------------


@settings(max_examples=150, deadline=None)
@given(user_pk=user_pks)
def test_failure_after_success_is_never_masked_by_the_earlier_payload(user_pk):
    """A failure that follows a success still fails closed.

    Resolve successfully with a STALE payload, then have the computation fail:
    the failure must re-raise instead of serving STALE. A later recovered
    computation then returns FRESH, never STALE.

    **Validates: Requirements 5.3**
    """
    user = _FakeUser(user_pk)
    stale = {"capabilities": ["platform.tenant.read_all"], "marker": "stale"}

    with _patch_build(return_value=dict(stale)):
        assert _resolve_capability_payload(user) == stale

    with _patch_build(side_effect=CapabilityResolutionError("unresolvable")) as raising:
        with pytest.raises(CapabilityResolutionError):
            _resolve_capability_payload(user)
    assert raising.call_count == 1

    with _patch_build(return_value=dict(_FRESH_PAYLOAD)) as fresh:
        result = _resolve_capability_payload(user)
    assert result == _FRESH_PAYLOAD
    assert result != stale
    assert fresh.call_count == 1
