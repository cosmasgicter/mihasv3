"""Shared serializers, helpers, and constants for admin views.

This module consolidates the serializers, regex patterns, and validation helpers
that were originally inline in the monolithic ``apps/accounts/admin_views.py``
before Stream 9 decomposition split that file into four submodules
(``admin_user_views.py``, ``admin_settings_views.py``, ``admin_audit_views.py``,
plus the re-export shim ``admin_views.py``).

All four submodules import what they need from here so the OpenAPI envelope
serializers and validation regexes remain a single source of truth.
"""

from __future__ import annotations

import re

from rest_framework import serializers

from apps.common.audit_network import decrypt_network_value
from apps.common.openapi_helpers import (
    MessageSerializer,
    envelope_serializer,
    paginated_serializer,
)


# ---------------------------------------------------------------------------
# Validation regexes & known-setting catalogues
# ---------------------------------------------------------------------------

SETTING_KEY_RE = re.compile(r"^[a-z][a-z0-9_]{1,99}$")
SETTING_CATEGORY_RE = re.compile(r"^[a-z][a-z0-9_-]{0,49}$")

KNOWN_SETTING_KEYS = {
    "site_name",
    "enable_online_applications",
    "contact_email",
    "contact_phone",
    "application_fee",
    "max_applications_per_user",
}


def _validate_setting_json_value(value, *, depth: int = 0) -> None:
    if depth > 4:
        raise serializers.ValidationError("Setting value is too deeply nested.")
    if value is None or isinstance(value, (bool, int, float)):
        return
    if isinstance(value, str):
        if len(value) > 2000:
            raise serializers.ValidationError(
                "Setting string values must be 2000 characters or fewer."
            )
        return
    if isinstance(value, list):
        if len(value) > 50:
            raise serializers.ValidationError(
                "Setting arrays must contain 50 items or fewer."
            )
        for item in value:
            _validate_setting_json_value(item, depth=depth + 1)
        return
    if isinstance(value, dict):
        if len(value) > 50:
            raise serializers.ValidationError(
                "Setting objects must contain 50 keys or fewer."
            )
        for key, item in value.items():
            if not isinstance(key, str) or len(key) > 100:
                raise serializers.ValidationError(
                    "Setting object keys must be strings of 100 characters or fewer."
                )
            _validate_setting_json_value(item, depth=depth + 1)
        return
    raise serializers.ValidationError("Setting value must be valid JSON.")


def _validate_known_setting_value(key, value) -> None:
    if key not in KNOWN_SETTING_KEYS:
        return
    if key in {"site_name", "contact_phone"}:
        if not isinstance(value, str) or not value.strip():
            raise serializers.ValidationError(f"{key} must be a non-empty string.")
        return
    if key == "enable_online_applications":
        if isinstance(value, bool):
            return
        if isinstance(value, str) and value.lower() in {"true", "false"}:
            return
        raise serializers.ValidationError(
            "enable_online_applications must be a boolean or 'true'/'false'."
        )
    if key == "contact_email":
        serializers.EmailField().run_validation(value)
        return
    if key == "application_fee":
        try:
            amount = float(value)
        except (TypeError, ValueError):
            raise serializers.ValidationError(
                "application_fee must be a numeric value."
            ) from None
        if amount < 0:
            raise serializers.ValidationError("application_fee must be zero or greater.")
        return
    if key == "max_applications_per_user":
        try:
            count = int(value)
        except (TypeError, ValueError):
            raise serializers.ValidationError(
                "max_applications_per_user must be an integer."
            ) from None
        if count < 0:
            raise serializers.ValidationError(
                "max_applications_per_user must be zero or greater."
            )
        return


DEFAULT_GUIDED_SETTINGS = [
    {
        "key": "site_name",
        "value": "MIHAS Application System",
        "description": "Primary platform title shown across public and authenticated screens.",
        "category": "general",
        "is_public": True,
    },
    {
        "key": "enable_online_applications",
        "value": "true",
        "description": "Controls whether students can start or continue applications online.",
        "category": "general",
        "is_public": True,
    },
    {
        "key": "contact_email",
        "value": "***REMOVED***",
        "description": "Primary email used for admissions contact, slip delivery, and public support messaging.",
        "category": "contact",
        "is_public": True,
    },
    {
        "key": "contact_phone",
        "value": "+260-000-000-000",
        "description": "Primary phone number shown to applicants and used by support surfaces.",
        "category": "contact",
        "is_public": True,
    },
    {
        "key": "application_fee",
        "value": "153.00",
        "description": "Default admissions application fee used in payment guidance and review.",
        "category": "finance",
        "is_public": True,
    },
    {
        "key": "max_applications_per_user",
        "value": "3",
        "description": "Maximum number of application records a single student can submit.",
        "category": "limits",
        "is_public": False,
    },
]


# ---------------------------------------------------------------------------
# Admin user serializers
# ---------------------------------------------------------------------------


class AdminUserSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    email = serializers.EmailField(read_only=True)
    first_name = serializers.CharField(read_only=True)
    last_name = serializers.CharField(read_only=True)
    role = serializers.CharField(read_only=True)
    is_active = serializers.BooleanField(read_only=True)
    created_at = serializers.DateTimeField(read_only=True)


class AdminUserCreateSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(min_length=6, write_only=True)
    first_name = serializers.CharField(max_length=255)
    last_name = serializers.CharField(max_length=255)
    role = serializers.ChoiceField(choices=["student", "admin", "reviewer", "super_admin"])
    phone = serializers.CharField(max_length=20, required=False, default="")
    nationality = serializers.CharField(max_length=100, required=False, default="Zambian")

    def validate_password(self, value):
        if len(value) < 6:
            raise serializers.ValidationError("Password must be at least 6 characters.")
        return value


class AdminUserUpdateSerializer(serializers.Serializer):
    role = serializers.ChoiceField(
        choices=["student", "admin", "reviewer", "super_admin"], required=False
    )
    is_active = serializers.BooleanField(required=False)
    first_name = serializers.CharField(max_length=255, required=False)
    last_name = serializers.CharField(max_length=255, required=False)
    password = serializers.CharField(min_length=6, write_only=True, required=False)


# ---------------------------------------------------------------------------
# Settings serializers
# ---------------------------------------------------------------------------


class SettingSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    key = serializers.CharField(max_length=100)
    value = serializers.JSONField()
    category = serializers.CharField(max_length=50, required=False, allow_blank=True, default="")
    description = serializers.CharField(required=False, allow_blank=True, default="")
    is_public = serializers.BooleanField(required=False, default=False)
    updated_by = serializers.UUIDField(read_only=True, allow_null=True)
    created_at = serializers.DateTimeField(read_only=True)
    updated_at = serializers.DateTimeField(read_only=True)

    def validate_key(self, value):
        if not SETTING_KEY_RE.match(value):
            raise serializers.ValidationError(
                "Setting key must use lowercase letters, numbers, and underscores, and start with a letter."
            )
        return value

    def validate_category(self, value):
        if value and not SETTING_CATEGORY_RE.match(value):
            raise serializers.ValidationError(
                "Setting category must use lowercase letters, numbers, dashes, or underscores."
            )
        return value

    def validate_description(self, value):
        if value and len(value) > 1000:
            raise serializers.ValidationError("Description must be 1000 characters or fewer.")
        return value

    def validate(self, attrs):
        key = attrs.get("key")
        value = attrs.get("value")
        _validate_setting_json_value(value)
        _validate_known_setting_value(key, value)
        return attrs


class SettingUpdateSerializer(serializers.Serializer):
    value = serializers.JSONField(required=False)
    category = serializers.CharField(max_length=50, required=False, allow_blank=True)
    description = serializers.CharField(required=False, allow_blank=True)
    is_public = serializers.BooleanField(required=False)

    def validate_category(self, value):
        if value and not SETTING_CATEGORY_RE.match(value):
            raise serializers.ValidationError(
                "Setting category must use lowercase letters, numbers, dashes, or underscores."
            )
        return value

    def validate_description(self, value):
        if value and len(value) > 1000:
            raise serializers.ValidationError("Description must be 1000 characters or fewer.")
        return value

    def validate(self, attrs):
        if "value" in attrs:
            key = self.context.get("setting_key")
            value = attrs["value"]
            _validate_setting_json_value(value)
            _validate_known_setting_value(key, value)
        return attrs


# ---------------------------------------------------------------------------
# Audit log serializer
# ---------------------------------------------------------------------------


class AuditLogSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    actor_id = serializers.UUIDField(read_only=True, allow_null=True)
    action = serializers.CharField(read_only=True)
    entity_type = serializers.CharField(read_only=True)
    entity_id = serializers.UUIDField(read_only=True, allow_null=True)
    changes = serializers.JSONField(read_only=True)
    ip_hash = serializers.CharField(source="ip_address", read_only=True, allow_blank=True, allow_null=True)
    user_agent_hash = serializers.CharField(source="user_agent", read_only=True, allow_blank=True, allow_null=True)
    request_ip = serializers.SerializerMethodField()
    request_user_agent = serializers.SerializerMethodField()
    retention_category = serializers.CharField(read_only=True)
    created_at = serializers.DateTimeField(read_only=True)

    def _can_view_network_context(self) -> bool:
        request = self.context.get("request")
        user = getattr(request, "user", None) if request else None
        return bool(
            user
            and getattr(user, "is_authenticated", False)
            and getattr(user, "role", None) == "super_admin"
        )

    def get_request_ip(self, obj) -> str | None:
        if not self._can_view_network_context():
            return None
        return decrypt_network_value(getattr(obj, "ip_address_encrypted", None))

    def get_request_user_agent(self, obj) -> str | None:
        if not self._can_view_network_context():
            return None
        return decrypt_network_value(getattr(obj, "user_agent_encrypted", None))


# ---------------------------------------------------------------------------
# Admin dashboard serializers
# ---------------------------------------------------------------------------


class AdminDashboardActivitySerializer(serializers.Serializer):
    id = serializers.CharField(read_only=True)
    type = serializers.CharField(read_only=True)
    application_number = serializers.CharField(read_only=True, allow_blank=True)
    old_status = serializers.CharField(read_only=True, allow_blank=True)
    new_status = serializers.CharField(read_only=True, allow_blank=True)
    timestamp = serializers.CharField(read_only=True, allow_blank=True)
    actor_name = serializers.CharField(read_only=True, allow_blank=True)
    message = serializers.CharField(read_only=True)


class AdminDashboardApplicationStatsSerializer(serializers.Serializer):
    by_status = serializers.JSONField()
    today = serializers.IntegerField()
    this_week = serializers.IntegerField()
    this_month = serializers.IntegerField()
    total = serializers.IntegerField()


class AdminDashboardUserStatsSerializer(serializers.Serializer):
    total = serializers.IntegerField()
    active = serializers.IntegerField()


class AdminDashboardNeedsAttentionSerializer(serializers.Serializer):
    pending_payments = serializers.IntegerField()
    pending_documents = serializers.IntegerField()
    upcoming_interviews = serializers.IntegerField()


class AdminDashboardSerializer(serializers.Serializer):
    applications = AdminDashboardApplicationStatsSerializer()
    users = AdminDashboardUserStatsSerializer()
    needs_attention = AdminDashboardNeedsAttentionSerializer()
    recent_activity = AdminDashboardActivitySerializer(many=True)


# ---------------------------------------------------------------------------
# OpenAPI envelope response serializers
# ---------------------------------------------------------------------------

AdminDashboardResponseSerializer = envelope_serializer(
    "AdminDashboardResponse",
    AdminDashboardSerializer(),
)
AdminUserResponseSerializer = envelope_serializer(
    "AdminUserResponse",
    AdminUserSerializer(),
)
AdminUserListResponseSerializer = envelope_serializer(
    "AdminUserListResponse",
    paginated_serializer("AdminUserPage", AdminUserSerializer),
)
AdminSettingsResponseSerializer = envelope_serializer(
    "AdminSettingResponse",
    SettingSerializer(),
)
AdminSettingsListResponseSerializer = envelope_serializer(
    "AdminSettingListResponse",
    paginated_serializer("AdminSettingPage", SettingSerializer),
)
AdminAuditLogListResponseSerializer = envelope_serializer(
    "AdminAuditLogListResponse",
    paginated_serializer("AdminAuditLogPage", AuditLogSerializer),
)
AdminMessageResponseSerializer = envelope_serializer(
    "AdminMessageResponse",
    MessageSerializer(),
)


__all__ = [
    "SETTING_KEY_RE",
    "SETTING_CATEGORY_RE",
    "KNOWN_SETTING_KEYS",
    "DEFAULT_GUIDED_SETTINGS",
    "AdminUserSerializer",
    "AdminUserCreateSerializer",
    "AdminUserUpdateSerializer",
    "SettingSerializer",
    "SettingUpdateSerializer",
    "AuditLogSerializer",
    "AdminDashboardActivitySerializer",
    "AdminDashboardApplicationStatsSerializer",
    "AdminDashboardUserStatsSerializer",
    "AdminDashboardNeedsAttentionSerializer",
    "AdminDashboardSerializer",
    "AdminDashboardResponseSerializer",
    "AdminUserResponseSerializer",
    "AdminUserListResponseSerializer",
    "AdminSettingsResponseSerializer",
    "AdminSettingsListResponseSerializer",
    "AdminAuditLogListResponseSerializer",
    "AdminMessageResponseSerializer",
]
