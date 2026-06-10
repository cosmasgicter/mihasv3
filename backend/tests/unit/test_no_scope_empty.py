"""No-scope empty-state tests — Phase 3 task 12.3 (Requirement R4.6).

R4.6: WHEN a School_Staff user has no Memberships and no Access_Grants, THE
scoped surfaces SHALL return empty results scoped to "no school access" and
SHALL NOT return global zero/aggregate counts that could imply platform-wide
totals.

The filtering work from tasks 12.1/12.2 already produces empty querysets for a
no-scope caller, so the counts are a *correct* zero for an empty scope. This
module proves two things across the staff-facing aggregate surfaces:

1. A no-scope non-super-admin gets zeros/empties computed over their (empty)
   scope — never the global table — AND an explicit ``no_school_access`` signal
   so the frontend can render "No school access assigned" instead of treating
   the zeros as platform totals.
2. A super-admin still sees global aggregates; a properly-scoped staff member
   sees only their own school.

A fresh ``reviewer`` models the no-scope caller rather than an ``admin``: under
the test settings module the legacy-admin all-access compatibility branch
(``AccessScopeService._legacy_admin_test_scope``) would grant a membership-less
*admin* global access (that compat path is task 12.4's concern and must not be
relied on). A reviewer is genuinely unscoped on every settings module.

Run (sqlite-in-memory; the default ``DATABASE_URL`` points at Neon)::

    cd backend && DJANGO_SETTINGS_MODULE=config.settings.test \
      .venv/bin/python -m pytest tests/unit/test_no_scope_empty.py -v

**Validates: Requirements R4.6**
"""

from __future__ import annotations

import pytest
from django.core.cache import cache
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.catalog.services import AccessScopeService
from tests.tenant_fixtures import build_payment, build_profile


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _jwt_user(profile) -> JWTUser:
    return JWTUser(
        {
            "user_id": str(profile.id),
            "email": profile.email,
            "role": profile.role,
            "first_name": profile.first_name,
            "last_name": profile.last_name,
        }
    )


def _client(profile) -> APIClient:
    client = APIClient()
    client.force_authenticate(user=_jwt_user(profile))
    return client


@pytest.fixture(autouse=True)
def _clear_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.fixture()
def production_scope(monkeypatch):
    """Force production scope semantics: disable the test-settings legacy-admin
    all-access compatibility branch.

    The admin dashboard + analytics funnel require ``IsAdmin``, so a reviewer
    (genuinely unscoped) is rejected with 403 and never reaches them. The real
    R4.6 no-scope caller for these surfaces is therefore an *admin* with no
    membership/grant. Under ``config.settings.test`` that admin would get
    legacy all-access via ``AccessScopeService._legacy_admin_test_scope`` — the
    compat path task 12.4 retires. Patching ``_test_settings_active`` to False
    makes the scope resolve exactly as it would in production, so a
    membership-less admin is correctly no-scope.
    """
    monkeypatch.setattr(
        AccessScopeService, "_test_settings_active", staticmethod(lambda: False)
    )


# ---------------------------------------------------------------------------
# ScopeFilters.has_no_scope — the primitive the views key on
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestScopeFiltersHasNoScope:
    """``ScopeFilters.has_no_scope`` distinguishes empty-scope from all-access.

    **Validates: Requirements R4.6**
    """

    def test_no_membership_no_grant_reviewer_has_no_scope(self):
        no_scope = build_profile(role="reviewer")
        filters = AccessScopeService().filters_for_user(no_scope)
        assert filters.all_access is False
        assert filters.has_no_scope is True

    def test_super_admin_is_not_no_scope(self):
        super_admin = build_profile(role="super_admin")
        filters = AccessScopeService().filters_for_user(super_admin)
        assert filters.all_access is True
        assert filters.has_no_scope is False

    def test_scoped_staff_is_not_no_scope(self, tenant_world):
        filters = AccessScopeService().filters_for_user(tenant_world.staff)
        assert filters.all_access is False
        assert filters.has_no_scope is False
        assert tenant_world.institution_id in filters.institution_ids


# ---------------------------------------------------------------------------
# Admin dashboard — /api/v1/admin/dashboard/
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestDashboardNoScope:
    """Dashboard aggregates are empty + flagged for a no-scope caller (R4.6).

    **Validates: Requirements R4.6**
    """

    URL = "/api/v1/admin/dashboard/"

    def test_no_scope_reviewer_sees_empty_and_flagged(self, two_tenant_worlds, production_scope):
        """A no-scope admin (production scope semantics) sees zero applications
        scoped to "no school access" — never the platform total (which is 2
        here) — and the explicit ``no_school_access`` flag is set.

        The dashboard requires ``IsAdmin``, so the no-scope caller must be an
        admin; ``production_scope`` disables the test-settings legacy-admin
        all-access compat branch so the membership-less admin is genuinely
        unscoped (the production behaviour)."""
        world_a, world_b = two_tenant_worlds  # 2 applications exist globally
        no_scope = build_profile(role="admin")

        body = _client(no_scope).get(self.URL).json()
        assert body["success"] is True
        data = body["data"]

        # Explicit "no school access assigned" signal (R4.6).
        assert data["no_school_access"] is True
        # Zeros for the empty scope — NOT the global total of 2.
        assert data["applications"]["total"] == 0
        assert data["applications"]["by_status"] == {}
        assert data["needs_attention"]["pending_payments"] == 0
        assert data["needs_attention"]["pending_documents"] == 0
        assert data["recent_activity"] == []

    def test_scoped_staff_sees_own_school_only(self, two_tenant_worlds):
        """A staff member with a membership sees their one application, not the
        global total, and is NOT flagged no-school-access."""
        world_a, world_b = two_tenant_worlds
        build_payment(application=world_a.application, status="pending")

        body = _client(world_a.staff).get(self.URL).json()
        data = body["data"]

        assert data["no_school_access"] is False
        assert data["applications"]["total"] == 1

    def test_super_admin_sees_global_total_unflagged(self, two_tenant_worlds):
        """A super-admin sees the platform-wide total and is never flagged."""
        world_a, world_b = two_tenant_worlds
        super_admin = build_profile(role="super_admin")

        body = _client(super_admin).get(self.URL).json()
        data = body["data"]

        assert data["no_school_access"] is False
        assert data["applications"]["total"] == 2


# ---------------------------------------------------------------------------
# Analytics funnel — /api/v1/analytics/funnel/
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestFunnelNoScope:
    """Funnel aggregates are empty + flagged for a no-scope caller (R4.6).

    **Validates: Requirements R4.6**
    """

    URL = "/api/v1/analytics/funnel/"

    def test_no_scope_reviewer_sees_zeros_and_flag(self, two_tenant_worlds, production_scope):
        world_a, world_b = two_tenant_worlds
        no_scope = build_profile(role="admin")

        body = _client(no_scope).get(self.URL).json()
        data = body["data"]

        assert data["no_school_access"] is True
        # Funnel total is zero for the empty scope, not the global 2.
        assert data["funnel"]["total"] == 0

    def test_scoped_staff_funnel_not_flagged(self, two_tenant_worlds):
        world_a, world_b = two_tenant_worlds
        body = _client(world_a.staff).get(self.URL).json()
        data = body["data"]

        assert data["no_school_access"] is False
        assert data["funnel"]["total"] == 1

    def test_super_admin_funnel_global_unflagged(self, two_tenant_worlds):
        world_a, world_b = two_tenant_worlds
        super_admin = build_profile(role="super_admin")
        body = _client(super_admin).get(self.URL).json()
        data = body["data"]

        assert data["no_school_access"] is False
        assert data["funnel"]["total"] == 2
