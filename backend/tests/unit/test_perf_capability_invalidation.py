"""Capability/scope freshness after authority changes, incl. super-admin demotion.

Retargeted to the uncached path by platform-simplification task 16.1 (decision
D7 option A). These tests first proved that the per-user capability cache
(``PERF_CACHE_CAPABILITIES``) was invalidated by every authority-affecting
change. That cache, its flag and its invalidation signals are gone, so
``GET /api/v1/admin/scope/`` and ``GET /api/v1/admin/capabilities/`` compute
from current state on every request. What the tests still guard is the
user-visible half of each original check: the next read after a change reflects
the new authority, and never the old one:

- ``Profile.role`` change (R5.4),
- ``UserInstitutionMembership`` create / update / delete (R5.5),
- ``AccessGrant`` create / update / delete (R5.5),
- the super-admin demotion case: after a super_admin -> admin demotion the next
  scope and capabilities reads return zero ``platform.*`` capabilities and no
  all-access (R5.7).

The cache-only assertions went with the cache: the query-count proofs of a
cache hit (zero queries) and of a recompute after invalidation, and the
``Institution.is_active`` case, whose only proof was that query-count delta
because a deactivation does not change the visible-institution payload.

Each triggering change still commits inside
``django_capture_on_commit_callbacks(execute=True)``, as before, so any
on-commit work the change schedules runs before the next read.

# Feature: system-performance-hardening
Requirements: 5.4, 5.5, 5.7
"""

from __future__ import annotations

import pytest
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.accounts.admin_user_views import AdminCapabilitiesView, AdminScopeView

pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# Authenticated principal (mirrors the JWT auth model used in production)
# ---------------------------------------------------------------------------


class _Principal:
    """Minimal JWT-style principal: ``role`` + ``id``/``pk``, no DB row.

    Production sets ``request.user`` from the JWT, not a ``Profile`` row, so the
    capability views only ever read ``user.role`` / ``user.pk``. We back the
    principal's ``id`` with a real ``Profile`` row so that ``AccessScopeService``
    resolves the principal's memberships/grants (keyed by ``user_id``) from the
    DB. ``role`` is carried on the principal so a read reflects the post-change
    authority just as a freshly minted token would.
    """

    is_authenticated = True

    def __init__(self, role, user_id):
        self.role = role
        self.id = user_id
        self.pk = user_id


def _principal_for(profile) -> _Principal:
    return _Principal(profile.role, profile.id)


# ---------------------------------------------------------------------------
# View drivers + read helper
# ---------------------------------------------------------------------------


def _call_scope(user):
    request = APIRequestFactory().get("/api/v1/admin/scope/")
    force_authenticate(request, user=user)
    return AdminScopeView.as_view()(request)


def _call_capabilities(user):
    request = APIRequestFactory().get("/api/v1/admin/capabilities/")
    force_authenticate(request, user=user)
    return AdminCapabilitiesView.as_view()(request)


def _read(call, user):
    """Invoke a capability/scope view and return its ``data`` payload."""
    response = call(user)
    assert response.status_code == 200, response.data
    return response.data["data"]


def _platform_caps(payload) -> list[str]:
    return [c for c in payload["capabilities"] if c.startswith("platform.")]


def _institution_ids(payload) -> list[str]:
    return sorted(inst["id"] for inst in payload["institutions"])


# ---------------------------------------------------------------------------
# R5.4 — a Profile.role change shows on the next read
# ---------------------------------------------------------------------------


def test_role_change_shows_on_next_read(django_capture_on_commit_callbacks):
    """After a ``Profile.role`` change the next read reflects the new role (R5.4)."""
    from tests.tenant_fixtures import build_institution, build_membership, build_profile

    user = build_profile(role="admin")
    inst = build_institution()
    build_membership(user=user, institution=inst, role="admin")
    principal = _principal_for(user)

    before = _read(_call_capabilities, principal)
    assert before["role"] == "admin"
    assert before["is_super_admin"] is False

    with django_capture_on_commit_callbacks(execute=True):
        user.role = "super_admin"
        user.save()
    principal.role = "super_admin"

    after = _read(_call_capabilities, principal)
    assert after["role"] == "super_admin"
    assert after["is_super_admin"] is True


# ---------------------------------------------------------------------------
# R5.5 — membership create / update / delete show on the next read
# ---------------------------------------------------------------------------


def test_membership_lifecycle_shows_on_next_read(django_capture_on_commit_callbacks):
    """Membership create/update/delete each show on the next scope read (R5.5)."""
    from tests.tenant_fixtures import build_institution, build_membership, build_profile

    user = build_profile(role="admin")
    inst = build_institution()
    principal = _principal_for(user)

    # An admin with no membership sees no institutions.
    assert _read(_call_scope, principal)["institutions"] == []

    # CREATE membership -> the institution is now visible.
    with django_capture_on_commit_callbacks(execute=True):
        membership = build_membership(user=user, institution=inst, role="admin")
    assert _institution_ids(_read(_call_scope, principal)) == [str(inst.id)]

    # UPDATE membership (deactivate) -> the institution drops.
    with django_capture_on_commit_callbacks(execute=True):
        membership.is_active = False
        membership.save()
    assert _read(_call_scope, principal)["institutions"] == []

    # Reactivate so the delete is exercised from an in-scope state.
    with django_capture_on_commit_callbacks(execute=True):
        membership.is_active = True
        membership.save()
    assert _institution_ids(_read(_call_scope, principal)) == [str(inst.id)]

    # DELETE membership -> the institution drops.
    with django_capture_on_commit_callbacks(execute=True):
        membership.delete()
    assert _read(_call_scope, principal)["institutions"] == []


# ---------------------------------------------------------------------------
# R5.5 — AccessGrant create / update / delete show on the next read
# ---------------------------------------------------------------------------


def test_access_grant_lifecycle_shows_on_next_read(django_capture_on_commit_callbacks):
    """AccessGrant create/update/delete each show on the next scope read (R5.5)."""
    from tests.tenant_fixtures import build_access_grant, build_institution, build_profile

    user = build_profile(role="admin")
    inst = build_institution()
    principal = _principal_for(user)

    # An admin with no grant sees no institutions.
    assert _read(_call_scope, principal)["institutions"] == []

    # CREATE an institution-scoped grant -> the institution is now visible.
    with django_capture_on_commit_callbacks(execute=True):
        grant = build_access_grant(user=user, scope_type="institution", institution=inst)
    assert _institution_ids(_read(_call_scope, principal)) == [str(inst.id)]

    # UPDATE grant (deactivate) -> the institution drops.
    with django_capture_on_commit_callbacks(execute=True):
        grant.is_active = False
        grant.save()
    assert _read(_call_scope, principal)["institutions"] == []

    # Reactivate so the delete is exercised from an in-scope state.
    with django_capture_on_commit_callbacks(execute=True):
        grant.is_active = True
        grant.save()
    assert _institution_ids(_read(_call_scope, principal)) == [str(inst.id)]

    # DELETE grant -> the institution drops.
    with django_capture_on_commit_callbacks(execute=True):
        grant.delete()
    assert _read(_call_scope, principal)["institutions"] == []


# ---------------------------------------------------------------------------
# R5.7 — super-admin demotion
# ---------------------------------------------------------------------------


def test_super_admin_demotion_shows_on_next_read(django_capture_on_commit_callbacks):
    """After a super_admin -> admin demotion both endpoints return zero
    ``platform.*`` capabilities and no all-access on the next read (R5.7)."""
    from tests.tenant_fixtures import build_profile

    user = build_profile(role="super_admin")
    principal = _principal_for(user)

    scope_before = _read(_call_scope, principal)
    assert scope_before["is_super_admin"] is True
    assert scope_before["all_access"] is True
    assert _platform_caps(scope_before), "super_admin must start with platform.* caps"
    caps_before = _read(_call_capabilities, principal)
    assert caps_before["is_super_admin"] is True

    with django_capture_on_commit_callbacks(execute=True):
        user.role = "admin"
        user.save()
    principal.role = "admin"

    scope_after = _read(_call_scope, principal)
    assert scope_after["is_super_admin"] is False
    assert scope_after["all_access"] is False
    assert _platform_caps(scope_after) == [], "no platform.* after demotion (R5.7)"

    caps_after = _read(_call_capabilities, principal)
    assert caps_after["is_super_admin"] is False
    assert _platform_caps(caps_after) == [], "no platform.* after demotion (R5.7)"
