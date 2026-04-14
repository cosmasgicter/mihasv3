"""Document and payment models — maps to existing Neon Postgres tables."""

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

    class Meta:
        managed = False
        db_table = 'application_documents'

    def __str__(self):
        return f"{self.document_type} for {self.application_id}"


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
    application = models.ForeignKey(
        'applications.Application', on_delete=models.CASCADE, null=True, blank=True
    )
    user = models.ForeignKey('accounts.Profile', on_delete=models.CASCADE)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    currency = models.CharField(max_length=3, null=True, blank=True, default='ZMW')
    payment_method = models.CharField(max_length=50, null=True, blank=True)
    transaction_reference = models.CharField(max_length=100, null=True, blank=True)
    status = models.CharField(max_length=20, default='pending', blank=True)
    verified_by = models.ForeignKey(
        'accounts.Profile',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='verified_payments',
        db_column='verified_by',
    )
    verified_at = models.DateTimeField(null=True, blank=True)
    receipt_number = models.CharField(max_length=50, null=True, blank=True)
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
