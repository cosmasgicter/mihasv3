"""Admin URL patterns.

Implements task 19.1, 19.2, 19.3.
Mounted at /api/v1/admin/ in config/urls.py.

The user-directory routes were rebuilt by admissions-v2 task 9.3 (R6.1-R6.5,
findings ADM-03/ADM-04/AUTH-04); their views live in
``apps.accounts.user_directory_views``.
"""

from django.urls import path

from apps.accounts.admin_views import (
    AdminAuditLogView,
    AdminCapabilitiesView,
    AdminDashboardView,
    AdminScopeView,
    AdminSettingDetailView,
    AdminSettingsImportView,
    AdminSettingsListView,
    AdminSettingsResetView,
    AdminUserDetailView,
    AdminUserEffectiveCapabilitiesView,
    AdminUserExportView,
    AdminUserListView,
)
from apps.accounts.user_directory_views import (
    AdminUserBatchImportView,
    AdminUserBulkView,
    AdminUserImportPreviewView,
)

urlpatterns = [
    path("dashboard/", AdminDashboardView.as_view(), name="admin-dashboard"),
    path("scope/", AdminScopeView.as_view(), name="admin-scope"),
    path("capabilities/", AdminCapabilitiesView.as_view(), name="admin-capabilities"),
    # GET lists users, POST creates user - same path per API spec
    path("users/", AdminUserListView.as_view(), name="admin-user-list"),
    path("users/export/", AdminUserExportView.as_view(), name="admin-user-export"),
    # One bulk role/status command (task 9.3, R6.5) — replaces the browser's
    # per-account PATCH loop.
    path("users/bulk/", AdminUserBulkView.as_view(), name="admin-user-bulk"),
    # Preview is declared before the commit route so the more specific path wins
    # regardless of resolver order.
    path(
        "users/batch-import/preview/",
        AdminUserImportPreviewView.as_view(),
        name="admin-user-batch-import-preview",
    ),
    path(
        "users/batch-import/",
        AdminUserBatchImportView.as_view(),
        name="admin-user-batch-import",
    ),
    # Read-only Effective_Capabilities for the user detail surface (task 2.4).
    # Declared before the detail route for clarity; the extra path segment keeps
    # it unambiguous from ``users/<uuid:pk>/``.
    path(
        "users/<uuid:pk>/effective-capabilities/",
        AdminUserEffectiveCapabilitiesView.as_view(),
        name="admin-user-effective-capabilities",
    ),
    path("users/<uuid:pk>/", AdminUserDetailView.as_view(), name="admin-user-detail"),
    path("settings/", AdminSettingsListView.as_view(), name="admin-settings-list"),
    path("settings/import/", AdminSettingsImportView.as_view(), name="admin-settings-import"),
    path("settings/reset/", AdminSettingsResetView.as_view(), name="admin-settings-reset"),
    path("settings/<uuid:pk>/", AdminSettingDetailView.as_view(), name="admin-setting-detail"),
    path("audit-logs/", AdminAuditLogView.as_view(), name="admin-audit-logs"),
]
