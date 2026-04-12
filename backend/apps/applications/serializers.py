"""Application serializers.

Implements task 13.1, 3.3, 3.4.
Requirements: 4.1, 4.2, 10.1, 10.2, 10.3, 10.4, 11.1, 11.2, 11.3
"""

import logging
from datetime import date

from dateutil.relativedelta import relativedelta
from rest_framework import serializers

from apps.applications.models import (
    Application,
    ApplicationDraft,
    ApplicationInterview,
    ApplicationStatusHistory,
)
from apps.applications.identifier_resolver import IdentifierResolver
from apps.common.validators import validate_nrc, validate_zambian_phone
from apps.documents.models import Payment

logger = logging.getLogger(__name__)

DRAFT_SAFE_FIELDS = frozenset({
    "full_name", "nrc_number", "passport_number", "date_of_birth", "sex",
    "phone", "email", "residence_town", "nationality", "country",
    "address_line_1", "address_line_2", "postal_code",
    "next_of_kin_name", "next_of_kin_phone",
    "program", "intake", "institution", "additional_subjects",
    "result_slip_url", "extra_kyc_url",
})

LIFECYCLE_FIELDS = frozenset({
    "status", "payment_status", "eligibility_status", "eligibility_score",
    "eligibility_notes", "review_started_at", "decision_date", "reviewed_by",
    "admin_feedback", "admin_feedback_date", "admin_feedback_by",
})


def validate_program_intake_compatibility(program_name: str, intake_name: str) -> None:
    """Validate that a program-intake combination is valid and active.

    Resolves program and intake using IdentifierResolver for flexible
    name/code lookup, then checks the program_intakes join table for a
    matching row. Also verifies the intake is currently active.

    Raises serializers.ValidationError with code INVALID_PROGRAM_INTAKE or
    INACTIVE_INTAKE on failure.

    Requirements: 2.2, 2.3, 10.1, 10.2, 10.3, 10.4
    """
    from apps.catalog.models import ProgramIntake

    resolved_program = IdentifierResolver.resolve_program(program_name)
    resolved_intake = IdentifierResolver.resolve_intake(intake_name)

    if resolved_program.source == "not_found" or resolved_intake.source == "not_found":
        raise serializers.ValidationError(
            {"program": "Program or intake not found."},
            code="INVALID_PROGRAM_INTAKE",
        )

    if not ProgramIntake.objects.filter(
        program_id=resolved_program.id, intake_id=resolved_intake.id
    ).exists():
        raise serializers.ValidationError(
            {"program": "The selected program is not available for this intake."},
            code="INVALID_PROGRAM_INTAKE",
        )

    # Re-fetch the intake to check is_active (resolver already filters by is_active,
    # but we verify explicitly for clarity)
    from apps.catalog.models import Intake
    intake = Intake.objects.filter(id=resolved_intake.id).first()
    if intake and not intake.is_active:
        raise serializers.ValidationError(
            {"intake": "The selected intake is not currently active."},
            code="INACTIVE_INTAKE",
        )


def validate_minimum_age(date_of_birth):
    """Validate that the applicant is at least 16 years old.

    Uses relativedelta for accurate leap-year-aware age calculation.

    Raises serializers.ValidationError with code MINIMUM_AGE_NOT_MET if underage.

    Requirements: 11.1, 11.2, 11.3
    """
    if date_of_birth is None:
        return
    age = relativedelta(date.today(), date_of_birth).years
    if age < 16:
        raise serializers.ValidationError(
            {"date_of_birth": "Applicants must be at least 16 years old."},
            code="MINIMUM_AGE_NOT_MET",
        )


class ApplicationPaymentSummaryMixin(serializers.Serializer):
    """Expose payment summary fields from canonical payment records."""

    payment_method = serializers.SerializerMethodField()
    paid_amount = serializers.SerializerMethodField()
    paid_at = serializers.SerializerMethodField()
    receipt_number = serializers.SerializerMethodField()
    payment_reference = serializers.SerializerMethodField()
    last_payment_reference = serializers.SerializerMethodField()

    def _get_payment_summary(self, obj) -> dict[str, object | None]:
        cache = getattr(self, "_payment_summary_cache", None)
        if cache is None:
            cache = {}
            self._payment_summary_cache = cache

        cache_key = getattr(obj, "id", id(obj))
        if cache_key in cache:
            return cache[cache_key]

        annotated_summary = {
            "payment_method": getattr(obj, "payment_summary_method", None),
            "paid_amount": getattr(obj, "payment_summary_paid_amount", None),
            "paid_at": getattr(obj, "payment_summary_paid_at", None),
            "receipt_number": getattr(obj, "payment_summary_receipt_number", None),
            "payment_reference": getattr(obj, "payment_summary_reference", None),
            "last_payment_reference": getattr(obj, "payment_summary_reference", None),
        }
        if any(value is not None for value in annotated_summary.values()):
            cache[cache_key] = annotated_summary
            return annotated_summary

        direct_summary = {
            "payment_method": getattr(obj, "payment_method", None),
            "paid_amount": getattr(obj, "paid_amount", None),
            "paid_at": getattr(obj, "paid_at", None),
            "receipt_number": getattr(obj, "receipt_number", None),
            "payment_reference": getattr(obj, "payment_reference", None),
            "last_payment_reference": getattr(
                obj,
                "last_payment_reference",
                getattr(obj, "payment_reference", None),
            ),
        }
        if any(value is not None for value in direct_summary.values()):
            cache[cache_key] = direct_summary
            return direct_summary

        if not isinstance(obj, Application):
            cache[cache_key] = direct_summary
            return direct_summary

        latest_payment = (
            Payment.objects
            .filter(application_id=getattr(obj, "id", None))
            .order_by("-updated_at", "-created_at")
            .first()
        )
        latest_successful_payment = (
            Payment.objects
            .filter(application_id=getattr(obj, "id", None), status="successful")
            .order_by("-verified_at", "-updated_at", "-created_at")
            .first()
        )

        summary = {
            "payment_method": getattr(latest_payment, "payment_method", None),
            "paid_amount": getattr(latest_successful_payment, "amount", None),
            "paid_at": getattr(latest_successful_payment, "verified_at", None)
            or getattr(latest_successful_payment, "updated_at", None)
            or getattr(latest_successful_payment, "created_at", None),
            "receipt_number": getattr(latest_successful_payment, "receipt_number", None),
            "payment_reference": getattr(latest_payment, "transaction_reference", None),
            "last_payment_reference": getattr(latest_payment, "transaction_reference", None),
        }
        cache[cache_key] = summary
        return summary

    def get_payment_method(self, obj):
        return self._get_payment_summary(obj)["payment_method"]

    def get_paid_amount(self, obj):
        return self._get_payment_summary(obj)["paid_amount"]

    def get_paid_at(self, obj):
        return self._get_payment_summary(obj)["paid_at"]

    def get_receipt_number(self, obj):
        return self._get_payment_summary(obj)["receipt_number"]

    def get_payment_reference(self, obj):
        return self._get_payment_summary(obj)["payment_reference"]

    def get_last_payment_reference(self, obj):
        return self._get_payment_summary(obj)["last_payment_reference"]


class ApplicationSerializer(ApplicationPaymentSummaryMixin, serializers.ModelSerializer):
    """Full application serializer with all fields."""

    user_id = serializers.UUIDField(read_only=True)
    tracking_code = serializers.CharField(source="public_tracking_code", read_only=True)
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
            "payment_method", "paid_amount", "paid_at", "receipt_number",
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

    def get_fields(self):
        fields = super().get_fields()
        request = self.context.get('request')
        instance = self.instance

        if request and request.method in ('PATCH', 'PUT'):
            user_role = getattr(request.user, 'role', 'student')
            app_status = getattr(instance, 'status', 'draft') if instance else 'draft'

            if user_role in ('admin', 'super_admin'):
                # Admins can edit draft-safe fields on any status, but never 'status' via PATCH
                for field_name in list(fields.keys()):
                    if field_name not in DRAFT_SAFE_FIELDS:
                        fields[field_name].read_only = True
            else:
                # Students: only draft-safe fields when status == 'draft'
                if app_status != 'draft':
                    for field_name in fields:
                        fields[field_name].read_only = True
                else:
                    for field_name in list(fields.keys()):
                        if field_name not in DRAFT_SAFE_FIELDS:
                            fields[field_name].read_only = True

        return fields

    def get_payment_verified_by_name(self, obj) -> str | None:
        verifier = getattr(obj, "payment_verified_by", None)
        if verifier is None:
            return None

        full_name = " ".join(
            part for part in [getattr(verifier, "first_name", ""), getattr(verifier, "last_name", "")]
            if part
        ).strip()
        return full_name or None

    def get_payment_verified_by_email(self, obj) -> str | None:
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

    def validate_date_of_birth(self, value):
        """Validate applicant meets minimum age requirement (>= 16)."""
        if value:
            validate_minimum_age(value)
        return value

    def validate_program(self, value):
        """Validate and canonicalize program via IdentifierResolver."""
        resolved = IdentifierResolver.resolve_program(value)
        if resolved.source == "not_found":
            raise serializers.ValidationError("Invalid program reference.")
        return resolved.name

    def validate_intake(self, value):
        """Validate and canonicalize intake via IdentifierResolver."""
        resolved = IdentifierResolver.resolve_intake(value)
        if resolved.source == "not_found":
            raise serializers.ValidationError("Invalid intake reference.")
        return resolved.name

    def validate_institution(self, value):
        """Validate and canonicalize institution via IdentifierResolver.

        Requirements: 2.1, 2.4
        """
        resolved = IdentifierResolver.resolve_institution(value)
        if resolved.source == "not_found":
            raise serializers.ValidationError(
                "Invalid institution reference.",
                code="INVALID_INSTITUTION",
            )
        return resolved.name

    def validate(self, attrs):
        attrs = super().validate(attrs)
        program_name = attrs.get("program")
        intake_name = attrs.get("intake")
        if program_name and intake_name:
            validate_program_intake_compatibility(program_name, intake_name)
        return attrs


class ApplicationCreateSerializer(serializers.Serializer):
    """Serializer for application creation with field-level validation."""

    full_name = serializers.CharField(max_length=255)
    nrc_number = serializers.CharField(max_length=20, required=False, allow_blank=True, allow_null=True, default="")
    passport_number = serializers.CharField(max_length=50, required=False, allow_blank=True, allow_null=True, default="")
    date_of_birth = serializers.DateField()
    sex = serializers.ChoiceField(choices=["male", "female"])
    phone = serializers.CharField(max_length=20)
    email = serializers.EmailField()
    residence_town = serializers.CharField(max_length=255)
    country = serializers.CharField(max_length=100, required=False, allow_blank=True, allow_null=True, default="Zambia")
    nationality = serializers.CharField(max_length=100, required=False, default="Zambian")
    next_of_kin_name = serializers.CharField(max_length=255, required=False, allow_blank=True, allow_null=True, default="")
    next_of_kin_phone = serializers.CharField(max_length=20, required=False, allow_blank=True, allow_null=True, default="")
    program = serializers.CharField(max_length=255)
    intake = serializers.CharField(max_length=100)
    institution = serializers.CharField(max_length=255)
    draft_name = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")

    def validate_phone(self, value):
        if value:
            return validate_zambian_phone(value)
        return value

    def validate_nrc_number(self, value):
        if value:
            return validate_nrc(value)
        return value

    def validate_date_of_birth(self, value):
        """Validate applicant meets minimum age requirement (>= 16)."""
        if value:
            validate_minimum_age(value)
        return value

    def validate_program(self, value):
        """Validate and canonicalize program via IdentifierResolver."""
        resolved = IdentifierResolver.resolve_program(value)
        if resolved.source == "not_found":
            raise serializers.ValidationError("Invalid program reference.")
        return resolved.name

    def validate_intake(self, value):
        """Validate and canonicalize intake via IdentifierResolver."""
        resolved = IdentifierResolver.resolve_intake(value)
        if resolved.source == "not_found":
            raise serializers.ValidationError("Invalid intake reference.")
        return resolved.name

    def validate_institution(self, value):
        """Validate and canonicalize institution via IdentifierResolver.

        Requirements: 2.1, 2.4
        """
        resolved = IdentifierResolver.resolve_institution(value)
        if resolved.source == "not_found":
            raise serializers.ValidationError(
                "Invalid institution reference.",
                code="INVALID_INSTITUTION",
            )
        return resolved.name

    def validate(self, attrs):
        attrs = super().validate(attrs)
        program_name = attrs.get("program")
        intake_name = attrs.get("intake")
        if program_name and intake_name:
            validate_program_intake_compatibility(program_name, intake_name)
        return attrs


class ApplicationListSerializer(ApplicationPaymentSummaryMixin, serializers.ModelSerializer):
    """Lightweight serializer for list views."""

    tracking_code = serializers.CharField(source="public_tracking_code", read_only=True)
    payment_verified_by_name = serializers.SerializerMethodField()
    payment_verified_by_email = serializers.SerializerMethodField()
    last_payment_audit_notes = serializers.CharField(source="admin_feedback", read_only=True)

    class Meta:
        model = Application
        fields = [
            "id", "application_number", "public_tracking_code", "tracking_code",
            "full_name", "email", "phone", "program", "intake", "institution",
            "status", "payment_status", "payment_method", "paid_amount", "paid_at",
            "receipt_number",
            "payment_verified_at", "payment_reference", "last_payment_reference",
            "payment_verified_by_name", "payment_verified_by_email",
            "submitted_at", "admin_feedback", "last_payment_audit_notes",
            "review_started_at", "decision_date", "application_fee",
            "created_at", "updated_at",
        ]

    def get_payment_verified_by_name(self, obj) -> str | None:
        verifier = getattr(obj, "payment_verified_by", None)
        if verifier is None:
            return None

        full_name = " ".join(
            part for part in [getattr(verifier, "first_name", ""), getattr(verifier, "last_name", "")]
            if part
        ).strip()
        return full_name or None

    def get_payment_verified_by_email(self, obj) -> str | None:
        verifier = getattr(obj, "payment_verified_by", None)
        if verifier is None:
            return None
        return getattr(verifier, "email", None)


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

    application_id = serializers.UUIDField(read_only=True, allow_null=True)
    user_id = serializers.UUIDField(read_only=True)

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

    application_id = serializers.UUIDField()
    program = serializers.CharField(source="application.program", read_only=True)
    application_number = serializers.CharField(source="application.application_number", read_only=True)

    class Meta:
        model = ApplicationInterview
        fields = [
            "id", "application_id", "scheduled_at", "mode", "location",
            "status", "notes", "program", "application_number", "created_by", "updated_by",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class ApplicationReviewSerializer(serializers.Serializer):
    """Admin review — status update."""

    new_status = serializers.CharField(max_length=50)
    notes = serializers.CharField(required=False, allow_blank=True, default="")
    force = serializers.BooleanField(required=False, default=False)
    reason = serializers.CharField(required=False, allow_blank=True, default="")


class PaymentStatusUpdateSerializer(serializers.Serializer):
    """Validates payment status updates (P1-SEC-027)."""

    PAYMENT_STATUS_CHOICES = [
        ("not_paid", "Not Paid"),
        ("pending_review", "Pending Review"),
        ("verified", "Verified"),
        ("rejected", "Rejected"),
    ]

    payment_status = serializers.ChoiceField(choices=PAYMENT_STATUS_CHOICES)
    notes = serializers.CharField(max_length=1000, required=False, allow_blank=True, default="")


class ApplicationBulkStatusSerializer(serializers.Serializer):
    """Admin bulk status update."""

    application_ids = serializers.ListField(child=serializers.UUIDField())
    new_status = serializers.CharField(max_length=50)
    notes = serializers.CharField(required=False, allow_blank=True, default="")
