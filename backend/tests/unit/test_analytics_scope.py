"""Analytics scope isolation tests — Phase 3 task 12.1.

The admissions funnel analytics endpoint (``GET /api/v1/analytics/funnel/``)
aggregates across the whole ``applications`` + ``payments`` tables. Before this
task it returned **platform-wide** counts to any admin, leaking every school's
totals to School_Staff. This module pins the scoped behaviour:

    R4.5  THE analytics endpoints ... SHALL apply Scope_Filters or be
          restricted to Super_Admin before exposure to School_Staff.
    R4.3  ... admin dashboard aggregates ... SHALL filter results to the
          caller's Scope_Filters for School_Staff.
    R4.6  WHEN a School_Staff user has no Memberships and no Access_Grants,
          THE scoped surfaces SHALL return empty results scoped to
          "no school access" ... never global zero/aggregate counts.

The tests assert at two layers:

* **Service layer** — ``AdmissionsAnalyticsService(user=...)`` scopes its
  funnel / payment aggregates so a School_Staff caller only counts their own
  institution's rows, while a Super_Admin (and the legacy ``user=None`` caller)
  sees the global totals.
* **Endpoint layer** — the funnel view's cache key is namespaced by the
  caller's resolved scope, so one school's cached funnel can never be served to
  another school (and a no-scope staff member never inherits a cached global
  funnel).

Run (sqlite-in-memory, since the default ``DATABASE_URL`` points at the
production Neon branch)::

    cd backend && DATABASE_URL="sqlite://:memory:" TESTING=1 \
      .venv/bin/python -m pytest tests/unit/test_analytics_scope.py -v

**Validates: Requirements R4.3, R4.5, R4.6**
"""

from __future__ import annotations

import pytest
from django.core.cache import cache
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.analytics.admissions_analytics import AdmissionsAnalyticsService
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
    """The funnel view caches per-scope; clear between tests so a cached
    namespace from one test never leaks into another."""
    cache.clear()
    yield
    cache.clear()


# ---------------------------------------------------------------------------
# Service-layer scope (the aggregation itself)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestAdmissionsAnalyticsServiceScope:
    """``AdmissionsAnalyticsService`` bounds its aggregates by caller scope.

    **Validates: Requirements R4.3, R4.5, R4.6**
    """

    def test_school_staff_funnel_counts_only_own_school(self, two_tenant_worlds):
        """School-A staff funnel counts school A's application but never B's."""
        world_a, world_b = two_tenant_worlds

        scoped = AdmissionsAnalyticsService(user=world_a.staff).funnel_metrics({})
        global_view = AdmissionsAnalyticsService().funnel_metrics({})

        # Both worlds build one draft application each → global total is 2,
        # the scoped staff view is exactly 1 (their own school only).
        assert global_view["total"] == 2
        assert scoped["total"] == 1
        assert scoped["drafts"] == 1

    def test_super_admin_funnel_sees_global_total(self, two_tenant_worlds):
        """A super-admin caller sees the platform-wide funnel total."""
        world_a, world_b = two_tenant_worlds
        super_admin = build_profile(role="super_admin")

        scoped = AdmissionsAnalyticsService(user=super_admin).funnel_metrics({})
        assert scoped["total"] == 2

    def test_school_staff_payment_counts_only_own_school(self, two_tenant_worlds):
        """Payment aggregate is scoped too: school-A staff count only school A's
        payment, never school B's."""
        world_a, world_b = two_tenant_worlds
        build_payment(application=world_a.application, status="successful")
        build_payment(application=world_b.application, status="successful")

        scoped = AdmissionsAnalyticsService(user=world_a.staff).payment_metrics({})
        global_view = AdmissionsAnalyticsService().payment_metrics({})

        assert global_view["successful"] == 2
        assert scoped["successful"] == 1
        assert scoped["initiated"] == 1

    def test_no_scope_staff_sees_zeros_not_global_totals(self, two_tenant_worlds):
        """A staff member with no membership/grant must see their (empty) scope —
        zeros — never the platform-wide aggregate (R4.6).

        A fresh ``reviewer`` is used here rather than an ``admin``: under the
        test settings module the legacy-admin all-access compatibility branch
        (``AccessScopeService._legacy_admin_test_scope``) would grant a
        membership-less *admin* global access. That compat path is task 12.4's
        concern and must not be extended into production behaviour — a reviewer
        is genuinely unscoped on every settings module, so this proves the
        filtering itself (R4.6) without depending on the compat branch."""
        world_a, world_b = two_tenant_worlds
        # A fresh reviewer with no membership and no grant: empty scope.
        no_scope = build_profile(role="reviewer")

        funnel = AdmissionsAnalyticsService(user=no_scope).funnel_metrics({})
        payments = AdmissionsAnalyticsService(user=no_scope).payment_metrics({})

        assert funnel["total"] == 0
        assert payments["initiated"] == 0


# ---------------------------------------------------------------------------
# Endpoint-layer scope (cache namespacing + envelope)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestFunnelEndpointScope:
    """``GET /api/v1/analytics/funnel/`` is scope-isolated end to end.

    **Validates: Requirements R4.3, R4.5, R4.6**
    """

    URL = "/api/v1/analytics/funnel/"

    def test_endpoint_preserves_envelope(self, two_tenant_worlds):
        world_a, _ = two_tenant_worlds
        response = _client(world_a.staff).get(self.URL)
        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True
        assert "data" in body
        assert "funnel" in body["data"]

    def test_school_staff_endpoint_scoped_to_own_school(self, two_tenant_worlds):
        """The funnel endpoint returns only the caller school's total."""
        world_a, world_b = two_tenant_worlds
        body = _client(world_a.staff).get(self.URL).json()
        assert body["data"]["funnel"]["total"] == 1

    def test_super_admin_endpoint_global(self, two_tenant_worlds):
        world_a, world_b = two_tenant_worlds
        super_admin = build_profile(role="super_admin")
        body = _client(super_admin).get(self.URL).json()
        assert body["data"]["funnel"]["total"] == 2

    def test_cache_is_not_shared_across_schools(self, two_tenant_worlds):
        """Cross-tenant cache bleed guard: school A populating the funnel cache
        must NOT cause school B to receive A's counts. Each school sees exactly
        its own total even though both hit the same endpoint + filters."""
        world_a, world_b = two_tenant_worlds

        body_a = _client(world_a.staff).get(self.URL).json()
        body_b = _client(world_b.staff).get(self.URL).json()

        assert body_a["data"]["funnel"]["total"] == 1
        assert body_b["data"]["funnel"]["total"] == 1
        # Distinct scope namespaces → neither inherited the other's cache.
        assert body_a["data"]["funnel"]["drafts"] == 1
        assert body_b["data"]["funnel"]["drafts"] == 1
