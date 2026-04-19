"""Property-based tests for admin endpoint authentication.

# Feature: pre-launch-audit, Property 13: Admin endpoints require admin authentication

For any backend endpoint called by admin service modules
(apps/admissions/src/services/admin/), the view's permission_classes
should include IsAdmin or equivalent admin-level permission.

This test validates the PERMISSION MAPPING LOGIC — it does NOT make
live HTTP requests. Instead, it defines the known set of admin endpoints
and their expected permission classes (extracted during the audit), then
uses Hypothesis to sample from the set and verify each has admin auth.

**Validates: Requirements 3.7, 13.4**
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django  # noqa: E402

django.setup()

from dataclasses import dataclass  # noqa: E402

from django.test import SimpleTestCase  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

# ---------------------------------------------------------------------------
# Admin permission class names considered "admin-level"
# ---------------------------------------------------------------------------

ADMIN_PERMISSION_CLASSES = {
    "IsAdmin",
    "IsAdminOrSuperAdmin",
    "IsSuperAdmin",
}

# ---------------------------------------------------------------------------
# Admin endpoint definitions — extracted from audit Task 4.5
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class AdminEndpoint:
    """An admin endpoint with its expected permission configuration."""

    url_pattern: str
    view_class_name: str
    source_module: str  # frontend service module that calls this endpoint
    permission_classes: tuple[str, ...]  # actual permission classes on the view


# Endpoints called by admin service modules (admin/dashboard.ts, admin/audit.ts, admin/users.ts)
ADMIN_SERVICE_ENDPOINTS: list[AdminEndpoint] = [
    AdminEndpoint(
        url_pattern="/api/v1/admin/dashboard/",
        view_class_name="AdminDashboardView",
        source_module="admin/dashboard.ts",
        permission_classes=("IsAuthenticated", "IsAdmin"),
    ),
    AdminEndpoint(
        url_pattern="/api/v1/admin/audit-logs/",
        view_class_name="AdminAuditLogView",
        source_module="admin/audit.ts",
        permission_classes=("IsAuthenticated", "IsAdmin"),
    ),
    AdminEndpoint(
        url_pattern="/api/v1/admin/users/",
        view_class_name="AdminUserListView",
        source_module="admin/users.ts",
        permission_classes=("IsAuthenticated", "IsAdmin"),
    ),
    AdminEndpoint(
        url_pattern="/api/v1/admin/users/{id}/",
        view_class_name="AdminUserDetailView",
        source_module="admin/users.ts",
        permission_classes=("IsAuthenticated", "IsAdmin"),
    ),
    AdminEndpoint(
        url_pattern="/api/v1/admin/users/export/",
        view_class_name="AdminUserExportView",
        source_module="admin/users.ts",
        permission_classes=("IsAuthenticated", "IsAdmin"),
    ),
]

# Additional admin-only endpoints called from applications.ts (not admin/ service
# modules, but still require admin auth per audit Task 4.5)
ADMIN_ONLY_APPLICATION_ENDPOINTS: list[AdminEndpoint] = [
    AdminEndpoint(
        url_pattern="/api/v1/applications/{id}/review/",
        view_class_name="ApplicationReviewView",
        source_module="applications.ts",
        permission_classes=("IsAdmin",),
    ),
    AdminEndpoint(
        url_pattern="/api/v1/applications/export/",
        view_class_name="ApplicationExportView",
        source_module="applications.ts",
        permission_classes=("IsAdmin",),
    ),
    AdminEndpoint(
        url_pattern="/api/v1/applications/bulk-status/",
        view_class_name="ApplicationBulkStatusView",
        source_module="applications.ts",
        permission_classes=("IsAdmin",),
    ),
    AdminEndpoint(
        url_pattern="/api/v1/applications/{id}/verify-document/",
        view_class_name="ApplicationVerifyDocumentView",
        source_module="applications.ts",
        permission_classes=("IsAdmin",),
    ),
    AdminEndpoint(
        url_pattern="/api/v1/applications/{id}/acceptance-letter/",
        view_class_name="AcceptanceLetterView",
        source_module="applications.ts",
        permission_classes=("IsAdmin",),
    ),
    AdminEndpoint(
        url_pattern="/api/v1/applications/{id}/finance-receipt/",
        view_class_name="FinanceReceiptView",
        source_module="applications.ts",
        permission_classes=("IsAdmin",),
    ),
]

ALL_ADMIN_ENDPOINTS = ADMIN_SERVICE_ENDPOINTS + ADMIN_ONLY_APPLICATION_ENDPOINTS


# ---------------------------------------------------------------------------
# Permission checking logic
# ---------------------------------------------------------------------------


def has_admin_permission(endpoint: AdminEndpoint) -> bool:
    """Check if the endpoint's permission_classes include an admin-level class."""
    return bool(set(endpoint.permission_classes) & ADMIN_PERMISSION_CLASSES)


def get_admin_permission_class(endpoint: AdminEndpoint) -> str | None:
    """Return the admin-level permission class name, or None."""
    matches = set(endpoint.permission_classes) & ADMIN_PERMISSION_CLASSES
    return next(iter(matches)) if matches else None


# ---------------------------------------------------------------------------
# Hypothesis strategies
# ---------------------------------------------------------------------------

admin_service_endpoint_st = st.sampled_from(ADMIN_SERVICE_ENDPOINTS)
admin_application_endpoint_st = st.sampled_from(ADMIN_ONLY_APPLICATION_ENDPOINTS)
all_admin_endpoint_st = st.sampled_from(ALL_ADMIN_ENDPOINTS)


# ---------------------------------------------------------------------------
# Test class
# ---------------------------------------------------------------------------


class TestAdminEndpointAuth(SimpleTestCase):
    """Property 13: Admin endpoints require admin authentication.

    For any backend endpoint called by admin service modules, the view's
    permission_classes should include IsAdmin or equivalent admin-level
    permission.

    **Validates: Requirements 3.7, 13.4**
    """

    # ------------------------------------------------------------------
    # Property: every admin service endpoint has admin-level permission
    # ------------------------------------------------------------------

    @given(endpoint=admin_service_endpoint_st)
    @settings(max_examples=5)
    def test_admin_service_endpoint_has_admin_permission(
        self, endpoint: AdminEndpoint
    ):
        """For any endpoint called by admin service modules, the view
        should include IsAdmin or equivalent in permission_classes."""
        self.assertTrue(
            has_admin_permission(endpoint),
            f"{endpoint.view_class_name} at {endpoint.url_pattern} "
            f"(called by {endpoint.source_module}) does not include "
            f"admin-level permission. Has: {endpoint.permission_classes}",
        )

    # ------------------------------------------------------------------
    # Property: every admin-only application endpoint has admin permission
    # ------------------------------------------------------------------

    @given(endpoint=admin_application_endpoint_st)
    @settings(max_examples=5)
    def test_admin_application_endpoint_has_admin_permission(
        self, endpoint: AdminEndpoint
    ):
        """For any admin-only application endpoint, the view should
        include IsAdmin or equivalent in permission_classes."""
        self.assertTrue(
            has_admin_permission(endpoint),
            f"{endpoint.view_class_name} at {endpoint.url_pattern} "
            f"(called by {endpoint.source_module}) does not include "
            f"admin-level permission. Has: {endpoint.permission_classes}",
        )

    # ------------------------------------------------------------------
    # Property: all admin endpoints (combined) have admin permission
    # ------------------------------------------------------------------

    @given(endpoint=all_admin_endpoint_st)
    @settings(max_examples=5)
    def test_any_admin_endpoint_has_admin_permission(
        self, endpoint: AdminEndpoint
    ):
        """For any admin endpoint from either category, the view should
        include admin-level permission."""
        admin_class = get_admin_permission_class(endpoint)
        self.assertIsNotNone(
            admin_class,
            f"{endpoint.view_class_name} at {endpoint.url_pattern} "
            f"has no admin-level permission class. Has: {endpoint.permission_classes}",
        )

    # ------------------------------------------------------------------
    # Live verification: check actual Django view permission_classes
    # ------------------------------------------------------------------

    def test_admin_dashboard_view_has_is_admin(self):
        """AdminDashboardView should have IsAdmin in permission_classes."""
        from apps.accounts.admin_views import AdminDashboardView
        from apps.accounts.permissions import IsAdmin

        perm_classes = AdminDashboardView.permission_classes
        self.assertIn(IsAdmin, perm_classes)

    def test_admin_user_list_view_has_is_admin(self):
        """AdminUserListView should have IsAdmin in permission_classes."""
        from apps.accounts.admin_views import AdminUserListView
        from apps.accounts.permissions import IsAdmin

        perm_classes = AdminUserListView.permission_classes
        self.assertIn(IsAdmin, perm_classes)

    def test_admin_user_detail_view_has_is_admin(self):
        """AdminUserDetailView should have IsAdmin in permission_classes."""
        from apps.accounts.admin_views import AdminUserDetailView
        from apps.accounts.permissions import IsAdmin

        perm_classes = AdminUserDetailView.permission_classes
        self.assertIn(IsAdmin, perm_classes)

    def test_admin_user_export_view_has_is_admin(self):
        """AdminUserExportView should have IsAdmin in permission_classes."""
        from apps.accounts.admin_views import AdminUserExportView
        from apps.accounts.permissions import IsAdmin

        perm_classes = AdminUserExportView.permission_classes
        self.assertIn(IsAdmin, perm_classes)

    def test_admin_audit_log_view_has_is_admin(self):
        """AdminAuditLogView should have IsAdmin in permission_classes."""
        from apps.accounts.admin_views import AdminAuditLogView
        from apps.accounts.permissions import IsAdmin

        perm_classes = AdminAuditLogView.permission_classes
        self.assertIn(IsAdmin, perm_classes)

    def test_application_review_view_has_is_admin(self):
        """ApplicationReviewView should have IsAdmin in permission_classes."""
        from apps.applications.views import ApplicationReviewView
        from apps.accounts.permissions import IsAdmin

        perm_classes = ApplicationReviewView.permission_classes
        self.assertIn(IsAdmin, perm_classes)

    def test_application_export_view_has_is_admin(self):
        """ApplicationExportView should have IsAdmin in permission_classes."""
        from apps.applications.views import ApplicationExportView
        from apps.accounts.permissions import IsAdmin

        perm_classes = ApplicationExportView.permission_classes
        self.assertIn(IsAdmin, perm_classes)

    def test_application_bulk_status_view_has_is_admin(self):
        """ApplicationBulkStatusView should have IsAdmin in permission_classes."""
        from apps.applications.views import ApplicationBulkStatusView
        from apps.accounts.permissions import IsAdmin

        perm_classes = ApplicationBulkStatusView.permission_classes
        self.assertIn(IsAdmin, perm_classes)

    def test_verify_document_view_has_is_admin(self):
        """ApplicationVerifyDocumentView should have IsAdmin in permission_classes."""
        from apps.applications.views import ApplicationVerifyDocumentView
        from apps.accounts.permissions import IsAdmin

        perm_classes = ApplicationVerifyDocumentView.permission_classes
        self.assertIn(IsAdmin, perm_classes)

    def test_acceptance_letter_view_has_is_admin(self):
        """AcceptanceLetterView should have IsAdmin in permission_classes."""
        from apps.applications.views import AcceptanceLetterView
        from apps.accounts.permissions import IsAdmin

        perm_classes = AcceptanceLetterView.permission_classes
        self.assertIn(IsAdmin, perm_classes)

    def test_finance_receipt_view_has_is_admin(self):
        """FinanceReceiptView should have IsAdmin in permission_classes."""
        from apps.applications.views import FinanceReceiptView
        from apps.accounts.permissions import IsAdmin

        perm_classes = FinanceReceiptView.permission_classes
        self.assertIn(IsAdmin, perm_classes)

    # ------------------------------------------------------------------
    # Structural: all admin endpoints are represented
    # ------------------------------------------------------------------

    def test_all_admin_service_endpoints_covered(self):
        """All admin service URL patterns should be in the endpoint list."""
        expected_patterns = {
            "/api/v1/admin/dashboard/",
            "/api/v1/admin/audit-logs/",
            "/api/v1/admin/users/",
            "/api/v1/admin/users/{id}/",
            "/api/v1/admin/users/export/",
        }
        covered = {ep.url_pattern for ep in ADMIN_SERVICE_ENDPOINTS}
        missing = expected_patterns - covered
        self.assertEqual(
            missing,
            set(),
            f"Missing admin service endpoints: {missing}",
        )

    def test_admin_permission_class_names_are_known(self):
        """All permission class names in endpoint definitions should be
        recognized permission classes."""
        known_classes = {
            "IsAuthenticated",
            "IsAdmin",
            "IsAdminOrSuperAdmin",
            "IsSuperAdmin",
            "IsStudent",
            "IsReviewer",
            "IsOwnerOrAdmin",
            "AllowAny",
        }
        for endpoint in ALL_ADMIN_ENDPOINTS:
            for perm in endpoint.permission_classes:
                self.assertIn(
                    perm,
                    known_classes,
                    f"Unknown permission class {perm!r} on "
                    f"{endpoint.view_class_name}",
                )
