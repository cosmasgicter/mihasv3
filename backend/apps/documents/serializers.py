"""Document and payment serializers.

Implements task 16.2.
Requirements: 6.1, 6.2, 6.4
"""

from rest_framework import serializers

from apps.documents.models import ApplicationDocument, Payment, ProgramFee


class DocumentUploadSerializer(serializers.Serializer):
    """Validates document upload requests."""

    file = serializers.FileField()
    # admissions-v2 task 7.2 (R11.6, STU-13): the accepted document types are the
    # ones *configured for the application* — a tenant may require a custom type
    # such as ``nursing_council_letter``, and a fixed choice list here made that
    # requirement impossible to satisfy. This field only validates the *shape* of
    # the identifier; authorisation of which type is acceptable for a given
    # application is resolved in the view through
    # ``apps.applications.required_documents.resolve_upload_target`` (the same
    # contract the student's upload controls were rendered from), so an arbitrary
    # type is still refused with the stable ``DOCUMENT_TYPE_NOT_REQUIRED``.
    document_type = serializers.RegexField(
        r"^[a-z][a-z0-9_]{0,79}$",
        error_messages={"invalid": "Invalid document type."},
    )
    application_id = serializers.UUIDField()

    def validate_application_id(self, value):
        from apps.applications.models import Application

        if not Application.objects.filter(id=value).exists():
            raise serializers.ValidationError("Application not found.")
        return value


class DocumentSerializer(serializers.ModelSerializer):
    """Read-only serializer for listing documents.

    Publishes the immutable-version identity added by admissions-v2 task 7.3
    (``version``, ``is_current``, ``lifecycle_state``, ``content_hash``,
    ``supersedes_id``) so a client can tell one stored version from another —
    which is what makes "replace" verifiable on the server rather than a local UI
    flag (R11.7-R11.8, STU-19). ``storage_key`` is deliberately NOT published: the
    object key is an internal storage detail, and downloads go through the
    short-lived signed-URL endpoints.
    """

    application_id = serializers.UUIDField(read_only=True)
    supersedes_id = serializers.UUIDField(read_only=True, allow_null=True)
    lifecycle_state = serializers.SerializerMethodField()
    file_url = serializers.SerializerMethodField()

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
            # Immutable evidence version (task 7.3).
            "version",
            "is_current",
            "lifecycle_state",
            "extraction_state",
            "content_hash",
            "supersedes_id",
            "superseded_at",
            "provenance",
        ]
        read_only_fields = fields

    def get_file_url(self, obj) -> str | None:
        """A freshly signed URL, never the stored key (design R4-a).

        A signing failure yields ``null`` and an ERROR log; the student opener
        signs separately and shows its own state.
        """
        import logging

        from apps.common.storage import resolve_document_open_url

        try:
            return resolve_document_open_url(obj)
        except Exception:
            logging.getLogger(__name__).error(
                "document.sign.failed",
                extra={"document_id": str(getattr(obj, "id", "")), "kind": "list"},
                exc_info=True,
            )
            return None

    def get_lifecycle_state(self, obj) -> str:
        """The canonical lifecycle state, derived for pre-7.3 rows."""
        from apps.documents.document_evidence import lifecycle_of

        return lifecycle_of(obj)


class PaymentSerializer(serializers.ModelSerializer):
    """Read-only serializer for payment data."""

    application_id = serializers.UUIDField(read_only=True)
    user_id = serializers.UUIDField(read_only=True)
    verified_by_id = serializers.UUIDField(read_only=True, allow_null=True)
    # admissions-v2 task 8.2 (R12.4/R12.6, STU-09): ``status`` says whether the
    # money arrived; ``phase`` says who is being waited on. A pending payment
    # where the provider has issued the customer prompt needs an instruction and
    # a short timeout; one still in the provider's hands needs neither. The
    # server derives both so the UI cannot invent its own answer.
    phase = serializers.SerializerMethodField()
    phase_timeout_seconds = serializers.SerializerMethodField()

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
            "phase",
            "phase_timeout_seconds",
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

    def get_phase(self, obj) -> str:
        from apps.documents.payment_phase import derive_payment_phase

        return derive_payment_phase(
            obj.status, (obj.metadata or {}).get("provider_initiation")
        )

    def get_phase_timeout_seconds(self, obj) -> int | None:
        from apps.documents.payment_phase import (
            derive_payment_phase,
            phase_ui_timeout_seconds,
        )

        return phase_ui_timeout_seconds(
            derive_payment_phase(
                obj.status, (obj.metadata or {}).get("provider_initiation")
            )
        )


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
# Payment serializers (T14 - API remediation Phase 3)
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


class FeeQuoteRequestSerializer(serializers.Serializer):
    """Validates POST /api/v1/payments/quote/ request body (task 8.1).

    The application id is the **only** client input. Amounts, currency, provider
    fee, bearer, residency, expiry, and the configuration binding are all
    server-authored (R12.1) — a client cannot propose, hint at, or override any
    of them.
    """

    application_id = serializers.UUIDField(
        help_text="Application to quote the fee for."
    )


class FeeQuoteDataSerializer(serializers.Serializer):
    """Shape of the ``data`` field of a fee-quote response (design §10.1).

    Amounts are strings so no client loses precision re-parsing them, and every
    number the payment UI renders is present — the client never computes a
    percentage, a total, or a fallback (finding STU-08).
    """

    quote_id = serializers.CharField()
    application_id = serializers.CharField()
    configuration_version = serializers.CharField(
        allow_null=True, required=False,
        help_text="Canonical assignment configuration version of the application.",
    )
    fee_configuration_version = serializers.CharField(
        help_text=(
            "Fingerprint of every fee-configuration input that decided the money. "
            "Redemption refuses a quote whose fingerprint no longer matches."
        ),
    )
    fee_type = serializers.CharField()
    base_amount = serializers.CharField(help_text="Canonical fee after any waiver.")
    provider_fee = serializers.CharField(
        help_text="Customer-borne provider fee from the server-side policy.",
    )
    total_amount = serializers.CharField(
        help_text="What the student is told they will be charged.",
    )
    currency = serializers.CharField()
    bearer = serializers.CharField(help_text="'customer' or 'merchant'.")
    residency_category = serializers.CharField()
    waiver_applied = serializers.BooleanField()
    status = serializers.CharField(
        help_text="active | redeemed | expired | superseded | cancelled.",
    )
    expires_at = serializers.CharField(allow_null=True, required=False)
    signature = serializers.CharField()
    signature_version = serializers.IntegerField()


class FeeQuoteResponseSerializer(serializers.Serializer):
    """Envelope wrapper for a fee-quote success response."""

    success = serializers.BooleanField()
    data = FeeQuoteDataSerializer()


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
