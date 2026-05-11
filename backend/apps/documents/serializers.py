"""Document and payment serializers.

Implements task 16.2.
Requirements: 6.1, 6.2, 6.4
"""

from rest_framework import serializers

from apps.documents.models import ApplicationDocument, Payment, ProgramFee


class DocumentUploadSerializer(serializers.Serializer):
    """Validates document upload requests."""

    file = serializers.FileField()
    document_type = serializers.ChoiceField(choices=[
        "nrc", "passport", "result_slip", "extra_kyc",
        "application_slip", "transcript", "certificate", "other",
    ])
    application_id = serializers.UUIDField()

    def validate_application_id(self, value):
        from apps.applications.models import Application

        if not Application.objects.filter(id=value).exists():
            raise serializers.ValidationError("Application not found.")
        return value


class DocumentSerializer(serializers.ModelSerializer):
    """Read-only serializer for listing documents."""

    application_id = serializers.UUIDField(read_only=True)

    class Meta:
        model = ApplicationDocument
        fields = [
            "id",
            "application_id",
            "document_type",
            "document_name",
            "file_url",
            "file_size",
            "mime_type",
            "verification_status",
            "verified_by",
            "verified_at",
            "verification_notes",
            "system_generated",
            "uploaded_at",
            "extracted_text",
            "ecz_exam_number",
            "ecz_exam_year",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class PaymentSerializer(serializers.ModelSerializer):
    """Read-only serializer for payment data."""

    application_id = serializers.UUIDField(read_only=True)
    user_id = serializers.UUIDField(read_only=True)
    verified_by_id = serializers.UUIDField(read_only=True, allow_null=True)

    class Meta:
        model = Payment
        fields = [
            "id",
            "application_id",
            "user_id",
            "amount",
            "currency",
            "payment_method",
            "transaction_reference",
            "status",
            "verified_by_id",
            "verified_at",
            "receipt_number",
            "receipt_url",
            "metadata",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class PaymentVerifySerializer(serializers.Serializer):
    """Admin payment verification request."""

    action = serializers.ChoiceField(choices=["verify", "reject"])
    notes = serializers.CharField(required=False, allow_blank=True, default="")


class ProgramFeeSerializer(serializers.ModelSerializer):
    """Serializer for ProgramFee CRUD operations."""

    class Meta:
        model = ProgramFee
        fields = [
            "id",
            "program_id",
            "fee_type",
            "residency_category",
            "amount",
            "currency",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_fee_type(self, value):
        if value not in ("application", "tuition"):
            raise serializers.ValidationError("fee_type must be 'application' or 'tuition'.")
        return value

    def validate_residency_category(self, value):
        if value not in ("local", "international"):
            raise serializers.ValidationError("residency_category must be 'local' or 'international'.")
        return value


# ---------------------------------------------------------------------------
# Payment serializers (T14 — API remediation Phase 3)
# ---------------------------------------------------------------------------


class MobileMoneyInitiateRequestSerializer(serializers.Serializer):
    """Validates POST /api/v1/payments/mobile-money/ request body.

    Mirrors the fields the view was previously reading via
    ``request.data.get(...)``: application_id (UUID), phone (string, Zambian
    format), operator (airtel|mtn).
    """

    application_id = serializers.UUIDField(
        help_text="Application ID to collect payment for"
    )
    phone = serializers.CharField(
        max_length=20,
        min_length=9,
        help_text=(
            "Zambian mobile phone number. Accepted formats: "
            "+260XXXXXXXXX, 260XXXXXXXXX, 0XXXXXXXXX, XXXXXXXXX"
        ),
    )
    operator = serializers.ChoiceField(
        choices=[("airtel", "Airtel"), ("mtn", "MTN")],
        required=False,
        allow_blank=True,
        help_text="Mobile money operator",
    )

    def validate_phone(self, value: str) -> str:
        """Require at least 9 digits after cleaning."""
        digits = "".join(c for c in value if c.isdigit())
        if len(digits) < 9:
            raise serializers.ValidationError(
                "Phone number must contain at least 9 digits."
            )
        return value


class MobileMoneyInitiateDataSerializer(serializers.Serializer):
    """Shape of the `data` field in MobileMoneyInitiateView 201 response."""

    payment_id = serializers.CharField()
    reference = serializers.CharField(required=False, allow_blank=True)
    amount = serializers.CharField()
    currency = serializers.CharField()
    status = serializers.CharField()
    provider_status = serializers.CharField(required=False, allow_blank=True)
    operator = serializers.CharField(required=False, allow_blank=True)
    masked_phone = serializers.CharField(required=False, allow_blank=True)
    message = serializers.CharField(required=False, allow_blank=True)


class MobileMoneyInitiateResponseSerializer(serializers.Serializer):
    """Envelope wrapper for MobileMoneyInitiateView success response."""

    success = serializers.BooleanField()
    data = MobileMoneyInitiateDataSerializer()


class DeferPaymentRequestSerializer(serializers.Serializer):
    """Validates POST /api/v1/payments/defer/ request body."""

    application_id = serializers.UUIDField(
        help_text="Application ID to mark as deferred"
    )


class DeferPaymentDataSerializer(serializers.Serializer):
    """Shape of the `data` field in DeferPaymentView 201 response."""

    payment_id = serializers.CharField()
    reference = serializers.CharField()
    amount = serializers.CharField()
    currency = serializers.CharField()
    status = serializers.CharField()


class DeferPaymentResponseSerializer(serializers.Serializer):
    """Envelope wrapper for DeferPaymentView success response."""

    success = serializers.BooleanField()
    data = DeferPaymentDataSerializer()
