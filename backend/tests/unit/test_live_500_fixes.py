"""Unit tests for live-500-fixes verification of already-fixed endpoints.

Tests:
- 6.1: ApplicationReviewView.post() does not contain debug wrapper (Req 7.1, 7.2, 7.3)
- 6.2: SSE stream view — REMOVED (SSE infrastructure deleted)
- 6.3: AdminDashboardView returns JSON with expected keys (Req 2.1, 2.2)
"""

import inspect
import pytest
import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

from unittest.mock import MagicMock, patch

import django

django.setup()

from django.test import SimpleTestCase
from rest_framework.test import APIRequestFactory

from apps.applications.admin_review_views import ApplicationReviewView


@pytest.fixture(autouse=True)
def _passthrough_access_scope_autouse():
    """Neutralise multi-tenant application scoping for these tests.

    The admin review / document / export paths now route through
    ``AccessScopeService().filter_applications`` (multi-tenant Beanola). These
    tests predate that scoping and assert review/notification/export behaviour
    for an admin actor, so the scope service returns the queryset unchanged
    (document_views imports it at module level; other call sites import it
    lazily from apps.catalog.services).
    """
    from unittest.mock import patch as _patch
    targets = []
    try:
        import apps.applications.document_views as _document_views
        # Only patch the module-level name if it is still there. Task 9.4 moved
        # ``document_views`` onto the shared ``resolve_scoped_application`` seam and
        # dropped its module-level ``AccessScopeService`` import, at which point this
        # fixture began raising ``AttributeError`` **at setup** and every case in this
        # file errored rather than ran. Guarding the patch target (rather than only
        # the import) is what makes the fixture describe the code that exists. The
        # remaining ``apps.catalog.services.AccessScopeService`` target below is the
        # real seam: ``resolve_scoped_application`` imports it lazily from there.
        # (admissions-v2 GATE-13.1-02, closed by task 13.6.)
        if hasattr(_document_views, "AccessScopeService"):
            targets.append("apps.applications.document_views.AccessScopeService")
    except Exception:
        pass
    targets.append("apps.catalog.services.AccessScopeService")
    mocks = []
    import contextlib
    with contextlib.ExitStack() as stack:
        for t in targets:
            m = stack.enter_context(_patch(t))
            m.return_value.filter_applications.side_effect = lambda qs, _user: qs
            m.return_value.filters_for_user.return_value = __import__(
                "apps.catalog.services", fromlist=["ScopeFilters"]
            ).ScopeFilters(True, set(), set(), set())
        yield


factory = APIRequestFactory()


# =========================================================================
# 6.1: ApplicationReviewView.post() does not contain debug wrapper
# Requirements: 7.1, 7.2, 7.3
# =========================================================================


class TestReviewViewNoDebugWrapper(SimpleTestCase):
    """Verify the review view source does not expose tracebacks."""

    def test_no_traceback_format_exc_in_source(self):
        """ApplicationReviewView.post must not call traceback.format_exc()."""
        source = inspect.getsource(ApplicationReviewView.post)
        self.assertNotIn("traceback.format_exc", source)

    def test_no_generic_exception_with_traceback(self):
        """ApplicationReviewView.post must not catch generic Exception and expose traceback."""
        source = inspect.getsource(ApplicationReviewView.post)
        # The view should not have a bare 'except Exception' that also references traceback
        self.assertNotIn("traceback", source)

    def test_no_format_exc_import_in_module(self):
        """The applications views module should not import traceback."""
        import apps.applications.views as views_module

        module_source = inspect.getsource(views_module)
        self.assertNotIn("import traceback", module_source)


# =========================================================================
# 6.2: SSE stream view — REMOVED (SSE infrastructure deleted)
# =========================================================================


# =========================================================================
# 6.3: AdminDashboardView returns expected response shape
# Requirements: 2.1, 2.2
# =========================================================================


def _answering_metrics_payload(by_status, *, value=0):
    """A ``DashboardMetricsService.build`` payload where every source answered.

    Task **9.2** replaced the dashboard's direct ``Application`` / ``Profile`` /
    ``AuditLog`` queryset reads with :class:`~apps.accounts.dashboard_metrics.DashboardMetricsService`,
    and the module-level ``AuditLog`` import these tests patched no longer
    exists — which is why they raised ``AttributeError`` at *setup* rather than
    running (GATE-13.1-02 → B9). ``build`` is the live seam, so it is what is
    stubbed here; the payload it returns is the post-9.2 shape (``metrics``
    entries are ``{"state", "value"}`` and a metric that did not answer is
    ``unknown`` with ``None``).

    Nothing about the shape under test is stubbed: ``AdminDashboardView._legacy_blocks``
    still runs for real, so these cases pin the actual 9.2 contract — a metric
    that answered ``ok`` reaches the legacy block, and ``by_status`` is carried
    from ``windows``.
    """
    def ok(v):
        return {"state": "ok", "value": v}

    return {
        "no_school_access": False,
        "scope": {
            "kind": "platform",
            "institution_id": None,
            "all_access": True,
            "institution_count": None,
        },
        "metrics": {
            "total_applications": ok(value),
            "today_activity": ok(value),
            "applications_this_week": ok(value),
            "applications_this_month": ok(value),
            "staff_accounts_total": ok(value),
            "staff_accounts_enabled": ok(value),
            "pending_documents": ok(value),
            "payment_review": ok(value),
            "upcoming_interviews": ok(value),
            "overdue_reviews": ok(value),
            "deadline_pressure": ok(value),
        },
        "sources": {},
        "health": {"state": "ok", "definition": "every source answered"},
        "freshness": {"generated_at": "2026-01-01T00:00:00+00:00", "stale_after_seconds": 45},
        "windows": {"by_status": by_status},
        "recent_activity": [],
        "activity_state": "ok",
    }


def _admin_dashboard_request():
    request = factory.get("/api/v1/admin/dashboard/")
    request.user = MagicMock()
    request.user.pk = "00000000-0000-0000-0000-000000000001"
    request.user.is_authenticated = True
    request.user.role = "admin"
    return request


class TestAdminDashboardResponseShape(SimpleTestCase):
    """Verify admin dashboard returns JSON with expected top-level keys."""

    def test_response_contains_expected_keys(self):
        """AdminDashboardView must return applications, users, and recent_activity."""
        from apps.accounts.admin_views import AdminDashboardView

        payload = _answering_metrics_payload(
            {"draft": 5, "submitted": 10}, value=15
        )

        with patch(
            "apps.accounts.dashboard_metrics.DashboardMetricsService.build",
            return_value=payload,
        ):
            view = AdminDashboardView()
            response = view.get(_admin_dashboard_request())

        self.assertEqual(response.status_code, 200)

        data = response.data.get("data", response.data)
        self.assertIn("applications", data)
        self.assertIn("users", data)
        self.assertIn("recent_activity", data)

    def test_applications_contains_expected_subkeys(self):
        """The applications key must contain by_status, today, this_week, this_month, total."""
        from apps.accounts.admin_views import AdminDashboardView

        payload = _answering_metrics_payload({}, value=0)

        with patch(
            "apps.accounts.dashboard_metrics.DashboardMetricsService.build",
            return_value=payload,
        ):
            view = AdminDashboardView()
            response = view.get(_admin_dashboard_request())

        data = response.data.get("data", response.data)
        apps_data = data["applications"]
        for key in ("by_status", "today", "this_week", "this_month", "total"):
            self.assertIn(key, apps_data, f"Missing key '{key}' in applications")
