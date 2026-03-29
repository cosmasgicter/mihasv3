"""Application serializers.

Implements task 13.1.
Requirements: 4.1, 4.2
"""

from rest_framework import serializers

from apps.applications.models import (
    Application,
    ApplicationDraft,
    ApplicationInterview,
    ApplicationStatusHistory,
)
from apps.common.validators import validate_nrc, validate_zambian_phone


class ApplicationSerializer(serializers.ModelSerializer):
    """Full application serializer with all fields."""

    class Meta:
        model = Application
        fields = [
            "id", "user_id", "application_number", "public_tracking_code",
            "full_name", "nrc_number", "passport_number", "date_of_birth",
            "sex", "phone", "email", "residence_town", "nationality",
            "program", "intake", "institution", "status", "version",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "application_number", "public_tracking_code",
            "status", "version", "created_at", "updated_at",
        ]

    def validate_phone(self, value):
        if value:
            return validate_zambian_phone(value)
        return value

    def validate_nrc_number(self, value):
        if value:
            return validate_nrc(value)
        return value

    def validate_program(self, value):
        """Validate program exists in catalog."""
        from apps.catalog.models import Program
        if not Program.objects.filter(name=value, is_active=True).exists():
            raise serializers.ValidationError("Invalid program reference.")
        return value

    def validate_intake(self, value):
        """Validate intake exists in catalog."""
        from apps.catalog.models import Intake
        if not Intake.objects.filter(name=value, is_active=True).exists():
            raise serializers.ValidationError("Invalid intake reference.")
        return value

    def validate_institution(self, value):
        """Validate institution exists in catalog."""
        from apps.catalog.models import Institution
        if not Institution.objects.filter(name=value, is_active=True).exists():
            raise serializers.ValidationError("Invalid institution reference.")
        return value


class ApplicationCreateSerializer(serializers.Serializer):
    """Serializer for application creation with field-level validation."""

    full_name = serializers.CharField(max_length=255)
    nrc_number = serializers.CharField(max_length=20, required=False, allow_blank=True, default="")
    passport_number = serializers.CharField(max_length=50, required=False, allow_blank=True, default="")
    date_of_birth = serializers.DateField()
    sex = serializers.ChoiceField(choices=["male", "female"])
    phone = serializers.CharField(max_length=20)
    email = serializers.EmailField()
    residence_town = serializers.CharField(max_length=255)
    nationality = serializers.CharField(max_length=100, required=False, default="Zambian")
    program = serializers.CharField(max_length=255)
    intake = serializers.CharField(max_length=100)
    institution = serializers.CharField(max_length=255)

    def validate_phone(self, value):
        if value:
            return validate_zambian_phone(value)
        return value

    def validate_nrc_number(self, value):
        if value:
            return validate_nrc(value)
        return value

    def validate_program(self, value):
        from apps.catalog.models import Program
        if not Program.objects.filter(name=value, is_active=True).exists():
            raise serializers.ValidationError("Invalid program reference.")
        return value

    def validate_intake(self, value):
        from apps.catalog.models import Intake
        if not Intake.objects.filter(name=value, is_active=True).exists():
            raise serializers.ValidationError("Invalid intake reference.")
        return value

    def validate_institution(self, value):
        from apps.catalog.models import Institution
        if not Institution.objects.filter(name=value, is_active=True).exists():
            raise serializers.ValidationError("Invalid institution reference.")
        return value


class ApplicationListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for list views."""

    class Meta:
        model = Application
        fields = [
            "id", "application_number", "full_name", "program",
            "intake", "institution", "status", "created_at",
        ]


class ApplicationTrackingSerializer(serializers.ModelSerializer):
    """Public tracking serializer — no auth required."""

    class Meta:
        model = Application
        fields = [
            "status", "program", "intake", "created_at",
        ]


class ApplicationDraftSerializer(serializers.ModelSerializer):
    """Draft auto-save serializer."""

    class Meta:
        model = ApplicationDraft
        fields = ["id", "application_id", "user_id", "draft_data", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]


class ApplicationGradeSerializer(serializers.Serializer):
    """ECZ grade serializer."""

    subject_id = serializers.UUIDField()
    grade = serializers.IntegerField(min_value=1, max_value=9)

    def validate_subject_id(self, value):
        from apps.catalog.models import Subject
        if not Subject.objects.filter(id=value).exists():
            raise serializers.ValidationError("Invalid subject reference.")
        return value


class ApplicationInterviewSerializer(serializers.ModelSerializer):
    """Interview scheduling serializer."""

    class Meta:
        model = ApplicationInterview
        fields = ["id", "application_id", "scheduled_at", "status", "notes", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]


class ApplicationReviewSerializer(serializers.Serializer):
    """Admin review — status update."""

    new_status = serializers.CharField(max_length=50)
    notes = serializers.CharField(required=False, allow_blank=True, default="")
    force = serializers.BooleanField(required=False, default=False)


class ApplicationBulkStatusSerializer(serializers.Serializer):
    """Admin bulk status update."""

    application_ids = serializers.ListField(child=serializers.UUIDField())
    new_status = serializers.CharField(max_length=50)
    notes = serializers.CharField(required=False, allow_blank=True, default="")
