"""Admin URL patterns.

Implements task 19.1, 19.2, 19.3.
Mounted at /api/v1/admin/ in config/urls.py.
"""

from django.urls import path

from apps.accounts.admin_views import (
    AdminAuditLogView,
    AdminDashboardView,
    AdminSettingDetailView,
    AdminSettingsListView,
    AdminUserDetailView,
    AdminUserExportView,
    AdminUserListView,
)

urlpatterns = [
    path("dashboard/", AdminDashboardView.as_view(), name="admin-dashboard"),
    # GET lists users, POST creates user — same path per API spec
    path("users/", AdminUserListView.as_view(), name="admin-user-list"),
    path("users/export/", AdminUserExportView.as_view(), name="admin-user-export"),
    path("users/<uuid:pk>/", AdminUserDetailView.as_view(), name="admin-user-detail"),
    path("settings/", AdminSettingsListView.as_view(), name="admin-settings-list"),
    path("settings/<uuid:pk>/", AdminSettingDetailView.as_view(), name="admin-setting-detail"),
    path("audit-logs/", AdminAuditLogView.as_view(), name="admin-audit-logs"),
]
