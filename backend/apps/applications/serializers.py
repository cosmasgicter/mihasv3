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

    tracking_code = serializers.CharField(source="public_tracking_code", read_only=True)
    payment_reference = serializers.CharField(source="momo_ref", read_only=True)
    last_payment_reference = serializers.CharField(source="momo_ref", read_only=True)
    payment_verified_by_name = serializers.SerializerMethodField()
    payment_verified_by_email = serializers.SerializerMethodField()
    last_payment_audit_notes = serializers.CharField(source="admin_feedback", read_only=True)

    class Meta:
        model = Application
        fields = [
            "id", "user_id", "application_number", "public_tracking_code",
            "tracking_code",
            "full_name", "nrc_number", "passport_number", "date_of_birth",
            "sex", "phone", "email", "residence_town", "nationality",
            "country", "address_line_1", "address_line_2", "postal_code",
            "next_of_kin_name", "next_of_kin_phone",
            "program", "intake", "institution", "status", "version",
            "result_slip_url", "extra_kyc_url", "application_fee",
            "payment_method", "payer_name", "payer_phone", "amount",
            "paid_at", "momo_ref", "pop_url", "receipt_number",
            "payment_status", "payment_verified_at", "payment_verified_by",
            "payment_reference", "last_payment_reference",
            "payment_verified_by_name", "payment_verified_by_email",
            "eligibility_status", "eligibility_score", "eligibility_notes",
            "admin_feedback", "admin_feedback_date", "admin_feedback_by",
            "review_started_at", "decision_date", "reviewed_by",
            "additional_subjects", "submitted_at",
            "last_payment_audit_notes",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "application_number", "public_tracking_code", "tracking_code",
            "payment_reference", "last_payment_reference",
            "payment_verified_by_name", "payment_verified_by_email",
            "version", "created_at", "updated_at",
        ]

    def get_payment_verified_by_name(self, obj):
        verifier = getattr(obj, "payment_verified_by", None)
        if verifier is None:
            return None

        full_name = " ".join(
            part for part in [getattr(verifier, "first_name", ""), getattr(verifier, "last_name", "")]
            if part
        ).strip()
        return full_name or None

    def get_payment_verified_by_email(self, obj):
        verifier = getattr(obj, "payment_verified_by", None)
        if verifier is None:
            return None
        return getattr(verifier, "email", None)

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

    tracking_code = serializers.CharField(source="public_tracking_code", read_only=True)

    class Meta:
        model = Application
        fields = [
            "id", "application_number", "public_tracking_code", "tracking_code",
            "full_name", "email", "phone", "program", "intake", "institution",
            "status", "payment_status", "payment_method", "payer_name",
            "payer_phone", "amount", "paid_at", "momo_ref", "pop_url",
            "payment_verified_at", "submitted_at", "admin_feedback",
            "review_started_at", "decision_date", "application_fee",
            "created_at", "updated_at",
        ]


class ApplicationTrackingSerializer(serializers.ModelSerializer):
    """Public tracking serializer — no auth required."""

    class Meta:
        model = Application
        fields = [
            "application_number", "public_tracking_code", "status",
            "payment_status", "program", "intake", "created_at", "submitted_at",
        ]


class ApplicationDraftSerializer(serializers.ModelSerializer):
    """Draft auto-save serializer."""

    class Meta:
        model = ApplicationDraft
        fields = [
            "id", "application_id", "user_id", "draft_data", "draft_name",
            "step_completed", "is_active", "last_accessed_at",
            "created_at", "updated_at",
        ]
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
        fields = [
            "id", "application_id", "scheduled_at", "mode", "location",
            "status", "notes", "created_by", "updated_by",
            "created_at", "updated_at",
        ]
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
