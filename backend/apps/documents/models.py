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
    status = models.CharField(max_length=20, null=True, blank=True, default='pending')
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

    class Meta:
        managed = False
        db_table = 'payments'

    def __str__(self):
        return f"Payment {self.id} — {self.amount} {self.currency} ({self.status})"
