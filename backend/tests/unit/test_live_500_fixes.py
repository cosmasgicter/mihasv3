"""Unit tests for live-500-fixes verification of already-fixed endpoints.

Tests:
- 6.1: ApplicationReviewView.post() does not contain debug wrapper (Req 7.1, 7.2, 7.3)
- 6.2: SSE stream view — REMOVED (SSE infrastructure deleted)
- 6.3: AdminDashboardView returns JSON with expected keys (Req 2.1, 2.2)
"""

import inspect
import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

from unittest.mock import MagicMock, patch

import django

django.setup()

from django.test import SimpleTestCase
from rest_framework.test import APIRequestFactory

from apps.applications.views import ApplicationReviewView

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


class TestAdminDashboardResponseShape(SimpleTestCase):
    """Verify admin dashboard returns JSON with expected top-level keys."""

    @patch("apps.accounts.admin_user_views.AuditLog")
    @patch("apps.accounts.admin_user_views.Profile")
    @patch("apps.applications.models.Application")
    def test_response_contains_expected_keys(
        self, mock_app, mock_profile, mock_audit
    ):
        """AdminDashboardView must return applications, users, and recent_activity."""
        from apps.accounts.admin_views import AdminDashboardView

        # Mock Application.objects
        mock_qs = MagicMock()
        mock_qs.values_list.return_value.annotate.return_value.values_list.return_value = [
            ("draft", 5),
            ("submitted", 10),
        ]
        mock_qs.filter.return_value.count.return_value = 2
        mock_qs.count.return_value = 15
        mock_app.objects = mock_qs

        # Mock Profile.objects
        mock_profile.objects.count.return_value = 26
        mock_profile.objects.filter.return_value.count.return_value = 25

        # Mock AuditLog.objects
        mock_audit_qs = MagicMock()
        mock_audit_qs.__getitem__ = MagicMock(return_value=[])
        mock_audit.objects.order_by.return_value = mock_audit_qs

        # Build request with admin user
        request = factory.get("/api/v1/admin/dashboard/")
        request.user = MagicMock()
        request.user.pk = "00000000-0000-0000-0000-000000000001"
        request.user.is_authenticated = True
        request.user.role = "admin"

        with (
            patch("apps.applications.models.ApplicationStatusHistory.objects"),
            patch("apps.documents.models.Payment.objects"),
            patch("apps.documents.models.ApplicationDocument.objects"),
            patch("apps.applications.models.ApplicationInterview.objects"),
        ):
            view = AdminDashboardView()
            response = view.get(request)

        self.assertEqual(response.status_code, 200)

        data = response.data.get("data", response.data)
        self.assertIn("applications", data)
        self.assertIn("users", data)
        self.assertIn("recent_activity", data)

    @patch("apps.accounts.admin_user_views.AuditLog")
    @patch("apps.accounts.admin_user_views.Profile")
    @patch("apps.applications.models.Application")
    def test_applications_contains_expected_subkeys(
        self, mock_app, mock_profile, mock_audit
    ):
        """The applications key must contain by_status, today, this_week, this_month, total."""
        from apps.accounts.admin_views import AdminDashboardView

        mock_qs = MagicMock()
        mock_qs.values_list.return_value.annotate.return_value.values_list.return_value = []
        mock_qs.filter.return_value.count.return_value = 0
        mock_qs.count.return_value = 0
        mock_app.objects = mock_qs

        mock_profile.objects.count.return_value = 0
        mock_profile.objects.filter.return_value.count.return_value = 0

        mock_audit_qs = MagicMock()
        mock_audit_qs.__getitem__ = MagicMock(return_value=[])
        mock_audit.objects.order_by.return_value = mock_audit_qs

        request = factory.get("/api/v1/admin/dashboard/")
        request.user = MagicMock()
        request.user.pk = "00000000-0000-0000-0000-000000000001"
        request.user.is_authenticated = True
        request.user.role = "admin"

        with (
            patch("apps.applications.models.ApplicationStatusHistory.objects"),
            patch("apps.documents.models.Payment.objects"),
            patch("apps.documents.models.ApplicationDocument.objects"),
            patch("apps.applications.models.ApplicationInterview.objects"),
        ):
            view = AdminDashboardView()
            response = view.get(request)

        data = response.data.get("data", response.data)
        apps_data = data["applications"]
        for key in ("by_status", "today", "this_week", "this_month", "total"):
            self.assertIn(key, apps_data, f"Missing key '{key}' in applications")
