"""Admin dashboard and user management views - re-export shim.

Decomposed during Stream 9 backend module decomposition.
All view classes AND their supporting serializers/helpers are re-exported here
so that existing imports continue to work.

Split files:
  - admin_user_views.py      - AdminDashboardView, AdminUserListView, AdminUserDetailView, AdminUserExportView
  - admin_settings_views.py  - AdminSettingsListView, AdminSettingDetailView, AdminSettingsImportView, AdminSettingsResetView
  - admin_audit_views.py     - AdminAuditLogView
  - admin_serializers.py     - Shared serializers, helpers, regex constants
"""

# View classes
from apps.accounts.admin_user_views import (  # noqa: F401
    AdminDashboardView,
    AdminScopeView,
    AdminUserDetailView,
    AdminUserExportView,
    AdminUserListView,
    _redact_email,
    _redact_name,
)
from apps.accounts.permissions import is_super_admin  # noqa: F401

# Backward-compat alias for tests that patch "apps.accounts.admin_views._is_super_admin"
_is_super_admin = is_super_admin
from apps.accounts.admin_settings_views import (  # noqa: F401
    AdminSettingDetailView,
    AdminSettingsImportView,
    AdminSettingsListView,
    AdminSettingsResetView,
)
from apps.accounts.admin_audit_views import AdminAuditLogView  # noqa: F401

# Test patch backward-compat: existing tests use
# ``@patch("apps.accounts.admin_views.X")`` for these symbols.
from django.db import transaction  # noqa: F401
from apps.accounts.models import Profile  # noqa: F401
from apps.common.models import AuditLog, Setting  # noqa: F401

# Shared serializers, helpers, and regex constants from admin_serializers.
# Re-exported so existing imports of `apps.accounts.admin_views.<symbol>`
# continue to work after Stream 9 decomposition.
from apps.accounts.admin_serializers import (  # noqa: F401
    DEFAULT_GUIDED_SETTINGS,
    KNOWN_SETTING_KEYS,
    SETTING_CATEGORY_RE,
    SETTING_KEY_RE,
    AdminAuditLogListResponseSerializer,
    AdminDashboardActivitySerializer,
    AdminDashboardApplicationStatsSerializer,
    AdminDashboardNeedsAttentionSerializer,
    AdminDashboardResponseSerializer,
    AdminDashboardSerializer,
    AdminDashboardUserStatsSerializer,
    AdminMessageResponseSerializer,
    AdminSettingsListResponseSerializer,
    AdminSettingsResponseSerializer,
    AdminUserCreateSerializer,
    AdminUserListResponseSerializer,
    AdminUserResponseSerializer,
    AdminUserSerializer,
    AdminUserUpdateSerializer,
    AuditLogSerializer,
    SettingSerializer,
    SettingUpdateSerializer,
    _validate_known_setting_value,
    _validate_setting_json_value,
)

__all__ = [
    # View classes
    "AdminAuditLogView",
    "AdminDashboardView",
    "AdminScopeView",
    "AdminSettingDetailView",
    "AdminSettingsImportView",
    "AdminSettingsListView",
    "AdminSettingsResetView",
    "AdminUserDetailView",
    "AdminUserExportView",
    "AdminUserListView",
    # Serializers
    "AdminAuditLogListResponseSerializer",
    "AdminDashboardActivitySerializer",
    "AdminDashboardApplicationStatsSerializer",
    "AdminDashboardNeedsAttentionSerializer",
    "AdminDashboardResponseSerializer",
    "AdminDashboardSerializer",
    "AdminDashboardUserStatsSerializer",
    "AdminMessageResponseSerializer",
    "AdminSettingsListResponseSerializer",
    "AdminSettingsResponseSerializer",
    "AdminUserCreateSerializer",
    "AdminUserListResponseSerializer",
    "AdminUserResponseSerializer",
    "AdminUserSerializer",
    "AdminUserUpdateSerializer",
    "AuditLogSerializer",
    "SettingSerializer",
    "SettingUpdateSerializer",
    # Constants & helpers
    "DEFAULT_GUIDED_SETTINGS",
    "KNOWN_SETTING_KEYS",
    "SETTING_CATEGORY_RE",
    "SETTING_KEY_RE",
    "_is_super_admin",
    "_redact_email",
    "_redact_name",
]
