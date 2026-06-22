"""Dashboard cache hit + invalidation tests (task 13.3).

# Feature: system-performance-hardening
Requirements: 2.1, 2.4

These integration-style tests exercise the flag-gated Dashboard_Cache wired by
task 13.1 (``AdminDashboardView.get`` wrapping its aggregate computation in
``cached_or_compute("dash", build_scope_signature(user), ttl=45,
enabled=PERF_CACHE_DASHBOARD)``) together with the dashboard invalidation
signals added by task 13.2 (``apps.accounts.signals``).

They assert two behaviours, both with ``PERF_CACHE_DASHBOARD=True``:

* **Cache hit (R2.1).** Calling the dashboard twice for the same admin scope
  serves the second call (a hit within the 45s TTL) from the cache: using
  :class:`~django.test.utils.CaptureQueriesContext` we assert the second call
  issues **zero** ``COUNT(`` / aggregate queries. The first call populates the
  cache; the only queries the hit path runs are the scope-signature SELECTs
  (``visible_institution_queryset`` etc.), never a count/aggregate.

* **Invalidation (R2.4).** After priming the cache, each triggering change
  forces the next dashboard read to recompute (count/aggregate queries run
  again, and the recomputed payload reflects the change):
    - an ``Application`` status change,
    - a ``Payment`` create/change,
    - a ``UserInstitutionMembership`` / ``AccessGrant`` change,
    - an ``Institution`` update.

On-commit handling
------------------
The invalidation signals bump the per-scope ``"dash"`` version token from
inside a ``transaction.on_commit`` callback (so a rolled-back write never
invalidates). Under pytest-django's default ``django_db`` the test body runs in
an atomic block that is never committed, so ``on_commit`` callbacks would never
fire. We therefore make each triggering write inside the pytest-django
``django_capture_on_commit_callbacks(execute=True)`` block, which captures the
callbacks registered during the block and runs them at block exit — the same
effect a real commit would have, without needing a slower
``django_db(transaction=True)`` test.

Scope-signature alignment
-------------------------
The cache key embeds ``build_scope_signature(user)``. For the invalidation
signal (which resolves admins from the DB) to invalidate the *same* entry the
view primed, the priming caller and the DB-resident admin must hash to the same
signature. We therefore create a real ``super_admin`` Profile row and
authenticate a JWT-style principal carrying that profile's id and role: both
resolve to ``role=super_admin``, ``is_super_admin/all_access=True`` and the same
all-institutions scope, so the signatures match. (A super-admin's dashboard is
platform-wide, so every triggering change above affects it regardless of the
record's institution — the signal always invalidates super-admins.)
"""

from __future__ import annotations

import re
import uuid

import pytest
from django.core.cache import cache
from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIRequestFactory, force_authenticate

pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# Helpers (mirror test_perf_dashboard_query_count / test_perf_golden_snapshots)
# ---------------------------------------------------------------------------


class _JWTUser:
    """Minimal JWT-style principal: role + id, no auth DB row required."""

    is_authenticated = True

    def __init__(self, role: str, user_id):
        self.role = role
        self.id = user_id
        self.pk = user_id


#: Matches the COUNT( token that every Django ``.count()`` / ``aggregate(...)``
#: emits, so a non-empty match list means the recompute path ran.
_COUNT_RE = re.compile(r"\bCOUNT\s*\(", re.IGNORECASE)


def _count_queries(captured):
    """COUNT/aggregate SQL statements captured during a request."""
    return [q["sql"] for q in captured.captured_queries if _COUNT_RE.search(q["sql"])]


def _call_dashboard(user, query: dict | None = None):
    from apps.accounts.admin_user_views import AdminDashboardView

    request = APIRequestFactory().get("/api/v1/admin/dashboard/", query or {})
    force_authenticate(request, user=user)
    return AdminDashboardView.as_view()(request)


@pytest.fixture(autouse=True)
def _clear_cache():
    """LocMemCache is process-wide; clear it so each test starts cold."""
    cache.clear()
    yield
    cache.clear()


def _super_admin_caller():
    """A DB-resident super_admin Profile + a JWT principal sharing its id/role.

    The DB row lets the invalidation signal (which resolves super-admins from
    the DB) recompute the *same* scope signature the view primed under.
    """
    from tests.tenant_fixtures import build_profile

    admin_profile = build_profile(role="super_admin")
    return _JWTUser("super_admin", admin_profile.id)


def _prime_and_assert_hit(caller):
    """Populate the cache (first call) then assert the second call is a hit.

    Returns the second (hit) response so callers can also inspect the payload.
    """
    first = _call_dashboard(caller)
    assert first.status_code == 200, first.data

    with CaptureQueriesContext(connection) as captured:
        hit = _call_dashboard(caller)
    assert hit.status_code == 200, hit.data
    # R2.1: a hit within TTL issues zero count/aggregate queries.
    assert _count_queries(captured) == [], (
        "R2.1: a Dashboard_Cache hit within TTL must issue zero count/aggregate "
        "queries, saw:\n" + "\n".join(_count_queries(captured))
    )
    return hit


def _assert_recomputes(caller):
    """Assert the next dashboard read recomputes (count/aggregate queries run)."""
    with CaptureQueriesContext(connection) as captured:
        resp = _call_dashboard(caller)
    assert resp.status_code == 200, resp.data
    assert _count_queries(captured), (
        "R2.4: after a triggering change the next read must recompute and issue "
        "count/aggregate queries again, but none were observed"
    )
    return resp


# ---------------------------------------------------------------------------
# R2.1 — cache hit within TTL issues zero count/aggregate queries
# ---------------------------------------------------------------------------


def test_cache_hit_within_ttl_issues_zero_count_queries(settings):
    settings.PERF_CACHE_DASHBOARD = True

    from tests.tenant_fixtures import build_application, build_tenant_world

    caller = _super_admin_caller()
    world = build_tenant_world(with_application=False)
    build_application(
        student=world.student,
        institution=world.institution,
        canonical_program=world.canonical_program,
        offering=world.offering,
        intake=world.intake,
        suffix=f"hit-{uuid.uuid4().hex[:6]}",
        status="submitted",
    )

    hit = _prime_and_assert_hit(caller)
    # The cached payload is the real aggregate, not an empty placeholder.
    assert hit.data["data"]["applications"]["total"] == 1


# ---------------------------------------------------------------------------
# R2.4 — each triggering change forces the next read to recompute
# ---------------------------------------------------------------------------


def test_application_status_change_invalidates_cache(
    settings, django_capture_on_commit_callbacks
):
    settings.PERF_CACHE_DASHBOARD = True

    from tests.tenant_fixtures import build_tenant_world

    caller = _super_admin_caller()
    world = build_tenant_world(with_application=True, application_status="submitted")

    _prime_and_assert_hit(caller)

    # Triggering change: a genuine status transition, committed so on_commit
    # invalidation fires.
    with django_capture_on_commit_callbacks(execute=True):
        app = world.application
        app.status = "approved"
        app.save(update_fields=["status", "updated_at"])

    resp = _assert_recomputes(caller)
    # The recomputed payload reflects the new status.
    assert resp.data["data"]["applications"]["by_status"].get("approved") == 1


def test_payment_change_invalidates_cache(
    settings, django_capture_on_commit_callbacks
):
    settings.PERF_CACHE_DASHBOARD = True

    from tests.tenant_fixtures import build_payment, build_tenant_world

    caller = _super_admin_caller()
    world = build_tenant_world(with_application=True, application_status="submitted")

    _prime_and_assert_hit(caller)

    # Triggering change: a payment create on a scoped application.
    with django_capture_on_commit_callbacks(execute=True):
        build_payment(application=world.application, status="successful")

    _assert_recomputes(caller)


def test_membership_or_grant_change_invalidates_cache(
    settings, django_capture_on_commit_callbacks
):
    settings.PERF_CACHE_DASHBOARD = True

    from tests.tenant_fixtures import build_membership, build_profile, build_tenant_world

    caller = _super_admin_caller()
    world = build_tenant_world(with_application=False)

    _prime_and_assert_hit(caller)

    # Triggering change: a new active membership within the scope.
    with django_capture_on_commit_callbacks(execute=True):
        staff = build_profile(role="admin")
        build_membership(user=staff, institution=world.institution)

    _assert_recomputes(caller)


def test_institution_update_invalidates_cache(
    settings, django_capture_on_commit_callbacks
):
    settings.PERF_CACHE_DASHBOARD = True

    from tests.tenant_fixtures import build_tenant_world

    caller = _super_admin_caller()
    world = build_tenant_world(with_application=False)

    _prime_and_assert_hit(caller)

    # Triggering change: an institution update (not a create).
    with django_capture_on_commit_callbacks(execute=True):
        institution = world.institution
        institution.name = f"Renamed {uuid.uuid4().hex[:6]}"
        institution.save(update_fields=["name", "updated_at"])

    _assert_recomputes(caller)
