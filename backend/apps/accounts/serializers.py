"""Account serializers for authentication endpoints.

Implements task 9.4.
Requirements: 11.5
"""

from rest_framework import serializers

from apps.accounts.models import Profile
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

    def validate_password(self, value):
        """Enforce password complexity: min 8 chars, 1 uppercase, 1 digit, 1 special char."""
        if len(value) < 8:
            raise serializers.ValidationError("Password must be at least 8 characters.")
        if not any(c.isupper() for c in value):
            raise serializers.ValidationError("Password must contain at least one uppercase letter.")
        if not any(c.isdigit() for c in value):
            raise serializers.ValidationError("Password must contain at least one digit.")
        if not any(c in '!@#$%^&*()_+-=[]{}|;:,.<>?/' for c in value):
            raise serializers.ValidationError("Password must contain at least one special character.")
        common = {'password', 'password1', '12345678', 'qwerty12', 'admin123', 'letmein1'}
        if value.lower() in common:
            raise serializers.ValidationError("This password is too common.")
        return value

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


class ProfileReadSerializer(serializers.ModelSerializer):
    """Read-only serializer for full profile GET responses."""

    class Meta:
        model = Profile
        fields = [
            "id",
            "email",
            "role",
            "first_name",
            "last_name",
            "full_name",
            "phone",
            "date_of_birth",
            "sex",
            "residence_town",
            "country",
            "nrc_number",
            "address",
            "nationality",
            "next_of_kin_name",
            "next_of_kin_phone",
            "updated_at",
        ]
        read_only_fields = fields


class ProfileUpdateSerializer(serializers.Serializer):
    """Validates PATCH input for profile updates.

    All fields are optional with empty strings accepted (partial update semantics).
    Protected fields are excluded from the writable set entirely.
    """

    full_name = serializers.CharField(
        required=False, allow_blank=True, min_length=2, max_length=255
    )
    phone = serializers.CharField(
        required=False, allow_blank=True, max_length=20
    )
    date_of_birth = serializers.DateField(required=False, allow_null=True)
    sex = serializers.ChoiceField(
        choices=["Male", "Female"],
        required=False,
        allow_blank=True,
    )
    residence_town = serializers.CharField(
        required=False, allow_blank=True, max_length=255
    )
    country = serializers.CharField(
        required=False, allow_blank=True, max_length=255
    )
    nrc_number = serializers.CharField(
        required=False, allow_blank=True, max_length=20
    )
    address = serializers.CharField(
        required=False, allow_blank=True
    )
    nationality = serializers.CharField(
        required=False, allow_blank=True, max_length=100
    )
    next_of_kin_name = serializers.CharField(
        required=False, allow_blank=True, max_length=255
    )
    next_of_kin_phone = serializers.CharField(
        required=False, allow_blank=True, max_length=50
    )

    def validate_phone(self, value):
        if value:
            return validate_zambian_phone(value)
        return value

    def validate_full_name(self, value):
        """Allow empty strings without triggering min_length."""
        if value == "":
            return value
        return value

    def validate_nationality(self, value):
        return normalize_nationality(value)
