"""Property-based test — scope-key collision invariant (Property 1).

Feature: system-performance-hardening, Property 1

Spec: ``.kiro/specs/system-performance-hardening`` (task 1.2). Pins the
scope-key collision invariant from the design's Testing Strategy / the
"Shared Cache Abstraction Layer" section:

    Property 1 — Scope-key collision invariant
    ``TenantScopeKeyBuilder.build_scope_signature`` produces the SAME signature
    if and only if the caller's resolved scope attributes match, and a DIFFERENT
    signature for any differing scope. The scope dimensions are: user id, the
    resolved role, ``is_super_admin``, ``all_access``, the sorted tuple of
    in-scope institution ids (from ``visible_institution_queryset``), and the
    applied institution filter. Two distinct scopes must never collide to the
    same signature (R2.2, R4.5, R13.3).

This exercises the **real** ``build_scope_signature`` derivation. The only
collaborator that needs a live database — ``AdminCapabilityService`` (capability
flags + ``visible_institution_queryset``) — is stubbed per example so the
signature math (composition + normalisation + SHA-256) runs at the unit level
without a DB, exactly as the task's approach note prefers.

Run (≥100 examples, SQLite-in-memory test settings)::

    cd backend && DJANGO_SETTINGS_MODULE=config.settings.test \
      python3 -m pytest tests/property/test_perf_scoped_cache_keys.py -q

**Validates: Requirements 2.2, 4.5**
"""

from __future__ import annotations

import re
from unittest.mock import patch

from hypothesis import given, settings
from hypothesis import strategies as st

from apps.common.scoped_cache import (
    _normalize_institution_filter,
    build_scope_signature,
)


# ≥100 examples; deadline relaxed because each example patches/imports the
# capability service module. No DB access (the service is fully stubbed).
HYPOTHESIS_SETTINGS = settings(max_examples=200, deadline=None)


# --- Lightweight stand-ins for the DB-backed collaborators -----------------


class _FakeCapabilities:
    """Stub of the ``CapabilitySet`` shape that the signature reads."""

    def __init__(self, role, is_super_admin, all_access):
        self.role = role
        self.is_super_admin = is_super_admin
        self.all_access = all_access


class _FakeQuerySet:
    """Stub of ``visible_institution_queryset(user)`` for ``.values_list``."""

    def __init__(self, ids):
        self._ids = list(ids)

    def values_list(self, *_fields, flat=False):  # noqa: D401 - mimic ORM API
        return list(self._ids)


class _FakeService:
    """Stub of ``AdminCapabilityService`` returning a fixed scope."""

    def __init__(self, capabilities, institution_ids):
        self._capabilities = capabilities
        self._institution_ids = institution_ids

    def get_capabilities(self, _user):
        return self._capabilities

    def visible_institution_queryset(self, _user):
        return _FakeQuerySet(self._institution_ids)


class _FakeUser:
    def __init__(self, pk):
        self.pk = pk
        self.id = pk


# --- Hypothesis strategy over the six scope dimensions ---------------------

# Small, overlapping domains so distinct examples sometimes collapse to the
# same canonical scope (covers the "SAME signature" direction) and usually
# differ (covers the "DIFFERENT signature" direction).
ROLES = st.sampled_from(["super_admin", "admin", "reviewer", "student", "", "manager"])
INSTITUTION_IDS = st.lists(st.integers(min_value=1, max_value=8), max_size=5)
INSTITUTION_FILTER = st.one_of(
    st.none(),
    st.integers(min_value=1, max_value=8),
    st.lists(st.integers(min_value=1, max_value=8), max_size=4),
    st.sets(st.integers(min_value=1, max_value=8), max_size=4),
)

SCOPE = st.fixed_dictionaries(
    {
        "user_id": st.integers(min_value=1, max_value=12),
        "role": ROLES,
        "is_super_admin": st.booleans(),
        "all_access": st.booleans(),
        "institution_ids": INSTITUTION_IDS,
        "institution_filter": INSTITUTION_FILTER,
    }
)


def _compute_signature(scope) -> str:
    """Run the real ``build_scope_signature`` with the service stubbed."""
    user = _FakeUser(scope["user_id"])
    capabilities = _FakeCapabilities(
        scope["role"], scope["is_super_admin"], scope["all_access"]
    )
    service = _FakeService(capabilities, scope["institution_ids"])
    with patch(
        "apps.catalog.services.AdminCapabilityService", return_value=service
    ):
        return build_scope_signature(
            user, institution_filter=scope["institution_filter"]
        )


def _canonical(scope):
    """The canonical (post-normalisation) scope identity.

    Two scopes share a signature iff this tuple is equal — mirroring exactly
    how ``build_scope_signature`` composes its parts (user id, role,
    is_super_admin, all_access, sorted stringified institution ids, normalised
    institution filter).
    """
    return (
        str(scope["user_id"] or ""),
        scope["role"] or "",
        bool(scope["is_super_admin"]),
        bool(scope["all_access"]),
        tuple(sorted(str(i) for i in scope["institution_ids"])),
        _normalize_institution_filter(scope["institution_filter"]),
    )


class TestScopeKeyCollisionInvariant:
    """Property 1 — scope-key collision invariant.

    **Validates: Requirements 2.2, 4.5**
    """

    @HYPOTHESIS_SETTINGS
    @given(scope_a=SCOPE, scope_b=SCOPE)
    def test_same_signature_iff_same_scope(self, scope_a, scope_b):
        """Signatures are equal IFF the resolved scope attributes match.

        Forward (``==``): equal scope → equal signature (determinism, R2.2).
        Reverse (``!=``): any differing scope dimension → a different signature,
        so two distinct tenant scopes can never collide onto one cache entry
        (R2.2, R4.5, R13.3).
        """
        sig_a = _compute_signature(scope_a)
        sig_b = _compute_signature(scope_b)

        if _canonical(scope_a) == _canonical(scope_b):
            assert sig_a == sig_b
        else:
            assert sig_a != sig_b

    @HYPOTHESIS_SETTINGS
    @given(scope=SCOPE)
    def test_signature_is_deterministic_bounded_hex(self, scope):
        """A signature is a stable, length-bounded hex digest (key-length bound).

        Recomputing for the same scope yields the same value, and the result is
        a 32-char lowercase hex string (SHA-256 truncated) so cache keys stay
        bounded.
        """
        first = _compute_signature(scope)
        second = _compute_signature(scope)
        assert first == second
        assert re.fullmatch(r"[0-9a-f]{32}", first)


class TestScopeKeyPerDimensionDifference:
    """Concrete examples: changing exactly one scope dimension changes the
    signature (complements Property 1).

    **Validates: Requirements 2.2, 4.5**
    """

    _BASE = {
        "user_id": 7,
        "role": "admin",
        "is_super_admin": False,
        "all_access": False,
        "institution_ids": [2, 1, 3],
        "institution_filter": None,
    }

    def _sig(self, **overrides):
        scope = dict(self._BASE)
        scope.update(overrides)
        return _compute_signature(scope)

    def test_user_id_difference_changes_signature(self):
        assert self._sig(user_id=7) != self._sig(user_id=8)

    def test_role_difference_changes_signature(self):
        assert self._sig(role="admin") != self._sig(role="reviewer")

    def test_is_super_admin_difference_changes_signature(self):
        assert self._sig(is_super_admin=False) != self._sig(is_super_admin=True)

    def test_all_access_difference_changes_signature(self):
        assert self._sig(all_access=False) != self._sig(all_access=True)

    def test_institution_set_difference_changes_signature(self):
        assert self._sig(institution_ids=[1, 2, 3]) != self._sig(
            institution_ids=[1, 2, 4]
        )

    def test_institution_filter_difference_changes_signature(self):
        assert self._sig(institution_filter=None) != self._sig(
            institution_filter=2
        )

    def test_institution_id_order_does_not_change_signature(self):
        """Sorted normalisation: id ordering must not perturb the signature."""
        assert self._sig(institution_ids=[1, 2, 3]) == self._sig(
            institution_ids=[3, 2, 1]
        )

    def test_institution_filter_normalisation_is_order_independent(self):
        """A list/tuple/set filter normalises order-independently."""
        assert self._sig(institution_filter=[1, 2]) == self._sig(
            institution_filter=(2, 1)
        )
