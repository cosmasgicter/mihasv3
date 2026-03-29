"""Account serializers for authentication endpoints.

Implements task 9.4.
Requirements: 11.5
"""

from rest_framework import serializers

from apps.common.validators import normalize_nationality, validate_zambian_phone


class LoginSerializer(serializers.Serializer):
    """Validates login credentials."""

    email = serializers.EmailField(required=True)
    password = serializers.CharField(required=True, write_only=True)


class RegisterSerializer(serializers.Serializer):
    """Validates registration data."""

    email = serializers.EmailField(required=True)
    password = serializers.CharField(required=True, min_length=8, write_only=True)
    first_name = serializers.CharField(required=True, max_length=255)
    last_name = serializers.CharField(required=True, max_length=255)
    phone = serializers.CharField(required=False, allow_blank=True, default="")
    nationality = serializers.CharField(required=False, allow_blank=True, default="")

    def validate_phone(self, value):
        if value:
            return validate_zambian_phone(value)
        return value

    def validate_nationality(self, value):
        return normalize_nationality(value)

    def validate_email(self, value):
        return value.lower().strip()


class PasswordResetRequestSerializer(serializers.Serializer):
    """Validates password reset request."""

    email = serializers.EmailField(required=True)


class PasswordResetConfirmSerializer(serializers.Serializer):
    """Validates password reset confirmation."""

    token = serializers.CharField(required=True)
    new_password = serializers.CharField(required=True, min_length=8, write_only=True)


class SessionSerializer(serializers.Serializer):
    """Read-only serializer for current user session info."""

    id = serializers.UUIDField(read_only=True)
    email = serializers.EmailField(read_only=True)
    first_name = serializers.CharField(read_only=True)
    last_name = serializers.CharField(read_only=True)
    role = serializers.CharField(read_only=True)
