"""Document and payment models - maps to existing Neon Postgres tables."""

import uuid

from django.db import models


class ApplicationDocument(models.Model):
    """Maps to 'application_documents' table."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    application = models.ForeignKey(
        'applications.Application', on_delete=models.CASCADE
    )
    document_type = models.CharField(max_length=100)
    document_name = models.CharField(max_length=255)
    file_url = models.TextField(null=True, blank=True)
    file_size = models.IntegerField(null=True, blank=True)
    mime_type = models.CharField(max_length=100, null=True, blank=True)
    verification_status = models.CharField(max_length=50, null=True, blank=True)
    verified_by = models.ForeignKey(
        'accounts.Profile',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='verified_documents',
        db_column='verified_by',
    )
    verified_at = models.DateTimeField(null=True, blank=True)
    verification_notes = models.TextField(null=True, blank=True)
    system_generated = models.BooleanField(null=True, blank=True, default=False)
    uploaded_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(null=True, blank=True)
    extracted_text = models.TextField(null=True, blank=True)
    ecz_exam_number = models.CharField(max_length=20, null=True, blank=True)
    ecz_exam_year = models.IntegerField(null=True, blank=True)

    # Immutable version + provenance fields (task 3.5; R11.7-R11.8, design §9.3).
    # A partial unique index (uq_application_documents_one_current) enforces exactly
    # one is_current row per (application, document_type). Replace/delete commands
    # (task 7.3) supersede the current row and preserve prior evidence as history.
    version = models.IntegerField(default=1)
    is_current = models.BooleanField(default=True)
    supersedes = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='superseded_by',
        db_column='supersedes_id',
    )
    superseded_at = models.DateTimeField(null=True, blank=True)
    content_hash = models.CharField(max_length=128, null=True, blank=True)
    uploaded_by = models.ForeignKey(
        'accounts.Profile',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='uploaded_documents',
        db_column='uploaded_by',
    )
    provenance = models.CharField(max_length=32, null=True, blank=True)

    # Canonical evidence lifecycle (task 7.3; R11.7-R11.8, design §9.3):
    # ``uploaded -> scanning -> ready_for_review -> verified`` /
    # ``-> rejected -> replacement uploaded`` /
    # ``uploaded|scanning -> processing_failed -> retry``.
    #
    # Deliberately separate from ``verification_status``, which conflates a human
    # decision, OCR progress, and soft-delete in one column and is read by many
    # existing surfaces. ``verification_status`` remains the legacy projection;
    # ``lifecycle_state`` is what the 7.3 commands transition. Nullable so a
    # legacy row's lifecycle is *derived* rather than invented — see
    # ``apps.documents.document_evidence.lifecycle_of``.
    lifecycle_state = models.CharField(max_length=32, null=True, blank=True)
    # Durable object key recorded at commit time from the value the storage
    # backend returned, so compensation and the reconciliation sweeper never have
    # to re-derive object identity from the rendered ``file_url``.
    storage_key = models.TextField(null=True, blank=True)
    # Scan/extraction status (R11.7). The OCR pipeline owns this column; before
    # 7.3 it wrote ``ocr_*`` values into ``verification_status`` and a re-extract
    # erased a reviewer's ``verified`` decision.
    extraction_state = models.CharField(max_length=32, null=True, blank=True)

    class Meta:
        managed = False
        db_table = 'application_documents'

    def __str__(self):
        return f"{self.document_type} for {self.application_id}"


class DocumentUploadStage(models.Model):
    """Durable staged-write ledger for document uploads (task 7.3).

    Maps to ``document_upload_stages``. One row per attempted evidence write,
    **committed to the database before a single byte reaches object storage**
    (design §17 — "queued" means a committed durable record exists). That
    ordering is what makes compensation and reconciliation possible: if the
    process dies between the object write and the metadata commit, the object is
    still discoverable instead of becoming an invisible orphan.

    States: ``staged`` -> ``committed`` | ``compensated`` |
    ``compensation_pending`` | ``write_failed``; ``compensation_pending`` ->
    ``compensated`` | ``orphaned``. Terminal: ``committed``, ``compensated``,
    ``write_failed``, ``orphaned``.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    application = models.ForeignKey(
        'applications.Application', on_delete=models.CASCADE, db_column='application_id'
    )
    document_type = models.CharField(max_length=100)
    object_key = models.TextField()
    content_hash = models.CharField(max_length=128, null=True, blank=True)
    file_size = models.IntegerField(null=True, blank=True)
    mime_type = models.CharField(max_length=100, null=True, blank=True)
    state = models.CharField(max_length=32, default='staged')
    document = models.ForeignKey(
        'documents.ApplicationDocument',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='upload_stages',
        db_column='document_id',
    )
    idempotency_key = models.TextField(null=True, blank=True)
    actor_id = models.UUIDField(null=True, blank=True)
    attempts = models.IntegerField(default=0)
    last_error = models.CharField(max_length=500, null=True, blank=True)
    created_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(null=True, blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = 'document_upload_stages'

    def __str__(self):
        return f"{self.state} stage for {self.application_id}/{self.document_type}"


class DocumentVerificationEvent(models.Model):
    """Append-only document lifecycle + verification history (task 7.3).

    Maps to ``document_verification_events``. One row per transition, carrying
    the actor, the structured reason, and the from/to lifecycle states (R11.7
    "verification actor and structured notes"; R11.8 "preserve prior evidence
    history"). Nothing here is ever updated or deleted by the runtime: a
    superseded version keeps its full verification story, and a reviewer's words
    are never overwritten by a machine's.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document = models.ForeignKey(
        'documents.ApplicationDocument',
        on_delete=models.CASCADE,
        related_name='verification_events',
        db_column='document_id',
    )
    application = models.ForeignKey(
        'applications.Application', on_delete=models.CASCADE, db_column='application_id'
    )
    from_state = models.CharField(max_length=32, null=True, blank=True)
    to_state = models.CharField(max_length=32)
    event_type = models.CharField(max_length=64)
    actor_id = models.UUIDField(null=True, blank=True)
    actor_role = models.CharField(max_length=32, null=True, blank=True)
    details = models.JSONField(default=dict)
    document_version = models.IntegerField(null=True, blank=True)
    created_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = 'document_verification_events'

    def __str__(self):
        return f"{self.event_type} {self.from_state}->{self.to_state} for {self.document_id}"


class ApplicationGrade(models.Model):
    """Maps to 'application_grades' table."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    application = models.ForeignKey(
        'applications.Application', on_delete=models.CASCADE
    )
    subject = models.ForeignKey('catalog.Subject', on_delete=models.CASCADE)
    grade = models.IntegerField()  # 1-9 ECZ scale
    created_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = 'application_grades'

    def __str__(self):
        return f"{self.subject_id}: grade {self.grade} for {self.application_id}"


class Payment(models.Model):
    """Maps to 'payments' table."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # Canonical Payment rows carry a mandatory application relationship (ADR-001,
    # R15.9). Enforced at the DB layer by the validated CHECK
    # ``payments_application_id_not_null`` (application_id IS NOT NULL OR
    # application_quarantined) added in task 3.5's
    # backend/scripts/2026_07_19_0{1,3}_payments_documents_*.sql. The column stays
    # nullable ONLY so a preserved legacy orphan (application_quarantined=true) can
    # be retained during the observation window instead of being deleted; every
    # runtime create path supplies application_id. The DB FK is ON DELETE CASCADE
    # (reconciled from the historical SET NULL in task 3.5, matching this
    # on_delete=CASCADE declaration and Django's own cascade behaviour).
    application = models.ForeignKey(
        'applications.Application', on_delete=models.CASCADE, null=True, blank=True,
        db_index=True,
    )
    # Set true only for a preserved legacy orphan payment whose owning application
    # could not be recovered (task 3.5 quarantine ledger). Exempts the row from the
    # mandatory-application CHECK without destroying its historical value.
    application_quarantined = models.BooleanField(default=False)
    user = models.ForeignKey('accounts.Profile', on_delete=models.CASCADE, db_index=True)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    currency = models.CharField(max_length=3, null=True, blank=True, default='ZMW')
    payment_method = models.CharField(max_length=50, null=True, blank=True)
    transaction_reference = models.CharField(max_length=100, null=True, blank=True)
    status = models.CharField(max_length=20, default='pending', blank=True, db_index=True)
    verified_by = models.ForeignKey(
        'accounts.Profile',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='verified_payments',
        db_column='verified_by',
    )
    verified_at = models.DateTimeField(null=True, blank=True)
    receipt_number = models.CharField(max_length=50, null=True, blank=True, unique=True)
    receipt_url = models.TextField(null=True, blank=True)
    metadata = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(null=True, blank=True)
    lenco_reference = models.CharField(max_length=100, null=True, blank=True)
    fee = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    bearer = models.CharField(max_length=20, null=True, blank=True)

    class Meta:
        managed = False
        db_table = 'payments'

    def __str__(self):
        return f"Payment {self.id} — {self.amount} {self.currency} ({self.status})"


class FeeQuote(models.Model):
    """Expiring, signed, server-authored fee quote (task 8.1).

    Maps to ``payment_fee_quotes``. One row is the money contract for one payment
    attempt: the amount the student was shown is the amount the server will later
    accept, and a stale or tampered quote cannot fund a payment.

    Every field here is server-authored. ``base_amount`` comes from the canonical
    ``FeeSchedule`` via :class:`~apps.documents.fee_resolver.FeeResolver` (task
    5.4), ``provider_fee`` from the server's provider-fee policy (this is the 1%
    the frontend used to compute — finding STU-08), and
    ``fee_configuration_version`` is the deterministic fingerprint of every input
    that decided the money, so redemption can detect drift (R12.1).

    Lifecycle: ``active`` -> ``redeemed`` | ``expired`` | ``superseded`` |
    ``cancelled``. Expiry is decided by ``expires_at``, never by the presence of
    the materialised ``expired`` status — see
    :meth:`apps.documents.fee_quote_service.FeeQuoteService.redeem`.

    See ``backend/scripts/2026_07_30_01_payment_fee_quotes.sql`` for the
    invariants the database enforces (total = base + provider fee, one active
    quote per application/fee type, one payment per quote).
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    application = models.ForeignKey(
        'applications.Application',
        on_delete=models.CASCADE,
        related_name='fee_quotes',
        db_column='application_id',
    )
    program_offering = models.ForeignKey(
        'catalog.Program',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='fee_quotes',
        db_column='program_offering_id',
    )
    fee_schedule = models.ForeignKey(
        'documents.ProgramFee',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='fee_quotes',
        db_column='fee_schedule_id',
    )
    fee_type = models.CharField(max_length=20, default='application')
    residency_category = models.CharField(max_length=20)
    configuration_version = models.CharField(max_length=64, null=True, blank=True)
    fee_configuration_version = models.CharField(max_length=64)
    base_amount = models.DecimalField(max_digits=10, decimal_places=2)
    provider_fee = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    total_amount = models.DecimalField(max_digits=10, decimal_places=2)
    currency = models.CharField(max_length=3)
    bearer = models.CharField(max_length=20, default='customer')
    policy = models.JSONField(default=dict)
    waiver_applied = models.BooleanField(default=False)
    status = models.CharField(max_length=20, default='active')
    expires_at = models.DateTimeField()
    signature = models.CharField(max_length=128)
    signature_version = models.IntegerField(default=1)
    payment = models.ForeignKey(
        'documents.Payment',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='fee_quotes',
        db_column='payment_id',
    )
    redeemed_at = models.DateTimeField(null=True, blank=True)
    issued_to = models.UUIDField(null=True, blank=True)
    created_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = 'payment_fee_quotes'

    def __str__(self):
        return (
            f"Quote {self.id} — {self.total_amount} {self.currency} "
            f"({self.status})"
        )


class ProgramFee(models.Model):
    """Maps to 'program_fees' table."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    program = models.ForeignKey('catalog.Program', on_delete=models.CASCADE)
    fee_type = models.CharField(max_length=20)  # 'application' or 'tuition'
    residency_category = models.CharField(max_length=20)  # 'local' or 'international'
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    currency = models.CharField(max_length=3, default='ZMW')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = 'program_fees'

    def __str__(self):
        return f"{self.fee_type} fee for {self.program_id} ({self.residency_category})"


class WebhookEventLog(models.Model):
    """Maps to 'webhook_event_logs' table."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    event_type = models.CharField(max_length=50)
    reference = models.CharField(max_length=100)
    payload = models.JSONField(default=dict)
    signature_valid = models.BooleanField(default=False)
    processed = models.BooleanField(default=False)
    processing_error = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = 'webhook_event_logs'

    def __str__(self):
        return f"{self.event_type} — {self.reference}"


class FeeWaiver(models.Model):
    """Maps to 'fee_waivers' table."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    application = models.ForeignKey(
        'applications.Application', on_delete=models.CASCADE
    )
    waiver_type = models.CharField(max_length=20)
    reason_code = models.CharField(max_length=30)
    discount_percentage = models.IntegerField(default=100)
    approved_by = models.ForeignKey(
        'accounts.Profile',
        on_delete=models.CASCADE,
        related_name='approved_waivers',
        db_column='approved_by',
    )
    notes = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        managed = False
        db_table = 'fee_waivers'

    def __str__(self):
        return f"Waiver {self.id} for {self.application_id} ({self.waiver_type})"
