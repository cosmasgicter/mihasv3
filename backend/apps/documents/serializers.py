"""Document and payment serializers.

Implements task 16.2.
Requirements: 6.1, 6.2, 6.4
"""

from rest_framework import serializers

from apps.documents.models import ApplicationDocument, Payment, ProgramFee


class DocumentUploadSerializer(serializers.Serializer):
    """Validates document upload requests."""

    file = serializers.FileField()
    document_type = serializers.CharField(max_length=100)
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
