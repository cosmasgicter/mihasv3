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
    file_key = models.CharField(max_length=500)  # S3/R2 object key
    file_url = models.URLField(blank=True)
    verification_status = models.CharField(max_length=50, default='pending')
    extracted_text = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

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
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        managed = False
        db_table = 'application_grades'

    def __str__(self):
        return f"{self.subject_id}: grade {self.grade} for {self.application_id}"


class Payment(models.Model):
    """Maps to 'payments' table."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    application = models.ForeignKey(
        'applications.Application', on_delete=models.CASCADE
    )
    user = models.ForeignKey('accounts.Profile', on_delete=models.CASCADE)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    currency = models.CharField(max_length=10, default='ZMW')
    status = models.CharField(max_length=50, default='pending')
    verified_by = models.ForeignKey(
        'accounts.Profile',
        on_delete=models.SET_NULL,
        null=True,
        related_name='verified_payments',
    )
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        managed = False
        db_table = 'payments'

    def __str__(self):
        return f"Payment {self.id} — {self.amount} {self.currency} ({self.status})"
