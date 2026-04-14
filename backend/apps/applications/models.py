"""Application models — maps to existing Neon Postgres tables."""

import uuid

from django.db import models


class Application(models.Model):
    """Maps to 'applications' table.

    Legacy unmapped columns (AUDIT-1.3-003):
    The database ``applications`` table contains 7 payment columns from the
    pre-Lenco manual/mobile-money payment flow that are intentionally NOT
    mapped in this Django model: ``payment_method``, ``payer_name``,
    ``payer_phone``, ``amount``, ``paid_at``, ``momo_ref``, ``pop_url``.
    These columns are deprecated since the Lenco payment integration.
    All payment data now lives in the ``payments`` table (see
    ``backend/apps/documents/models.py``).

    Legacy payment-status orphans (AUDIT-2.3-001):
    Approximately 20 legacy applications have a ``payment_status`` value
    (e.g. 'verified') but no corresponding record in the ``payments`` table.
    These predate the Lenco integration and used the manual proof-of-payment
    flow.  No remediation is needed for their payment records.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    application_number = models.CharField(max_length=50, unique=True)
    user = models.ForeignKey('accounts.Profile', on_delete=models.CASCADE)
    full_name = models.CharField(max_length=255)
    nrc_number = models.CharField(max_length=20, null=True, blank=True)
    passport_number = models.CharField(max_length=50, null=True, blank=True)
    date_of_birth = models.DateField()
    sex = models.CharField(max_length=10)
    phone = models.CharField(max_length=20)
    email = models.CharField(max_length=255)
    residence_town = models.CharField(max_length=100)
    nationality = models.CharField(max_length=100, null=True, blank=True)
    address_line_1 = models.CharField(max_length=255, null=True, blank=True)
    address_line_2 = models.CharField(max_length=255, null=True, blank=True)
    postal_code = models.CharField(max_length=20, null=True, blank=True)
    next_of_kin_name = models.CharField(max_length=255, null=True, blank=True)
    next_of_kin_phone = models.CharField(max_length=20, null=True, blank=True)
    program = models.CharField(max_length=50)
    intake = models.CharField(max_length=50)
    institution = models.CharField(max_length=50)
    result_slip_url = models.CharField(max_length=500, null=True, blank=True)
    extra_kyc_url = models.CharField(max_length=500, null=True, blank=True)
    application_fee = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    payment_status = models.CharField(max_length=20, null=True, blank=True)
    payment_verified_at = models.DateTimeField(null=True, blank=True)  # DEPRECATED — use payments table
    payment_verified_by = models.ForeignKey(  # DEPRECATED — use payments table
        'accounts.Profile',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='verified_applications',
        db_column='payment_verified_by',
    )
    status = models.CharField(max_length=20, default='draft')
    eligibility_status = models.CharField(max_length=20, null=True, blank=True)
    eligibility_score = models.IntegerField(null=True, blank=True)
    eligibility_notes = models.TextField(null=True, blank=True)
    admin_feedback = models.TextField(null=True, blank=True)
    admin_feedback_date = models.DateTimeField(null=True, blank=True)
    admin_feedback_by = models.ForeignKey(
        'accounts.Profile',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='feedback_applications',
        db_column='admin_feedback_by',
    )
    review_started_at = models.DateTimeField(null=True, blank=True)
    decision_date = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.ForeignKey(
        'accounts.Profile',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='reviewed_applications',
        db_column='reviewed_by',
    )
    additional_subjects = models.JSONField(null=True, blank=True)
    public_tracking_code = models.CharField(max_length=50, null=True, blank=True, unique=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(null=True, blank=True)
    version = models.IntegerField(default=1)
    country = models.CharField(max_length=100, null=True, blank=True)

    class Meta:
        managed = False
        db_table = 'applications'

    def __str__(self):
        return f"{self.application_number} — {self.full_name}"


class ApplicationStatusHistory(models.Model):
    """Maps to 'application_status_history' table."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    application = models.ForeignKey(Application, on_delete=models.CASCADE)
    status = models.CharField(max_length=20)
    changed_by = models.ForeignKey(
        'accounts.Profile', on_delete=models.SET_NULL, null=True, blank=True,
        db_column='changed_by',
    )
    notes = models.TextField(null=True, blank=True)
    changes = models.JSONField(null=True, blank=True)
    ip_address = models.CharField(max_length=64, null=True, blank=True)
    user_agent = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, null=True, blank=True)
    old_status = models.TextField(null=True, blank=True)
    new_status = models.TextField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = 'application_status_history'

    def __str__(self):
        return f"{self.application_id}: {self.old_status} → {self.new_status}"


class ApplicationDraft(models.Model):
    """Maps to 'application_drafts' table.

    DEPRECATED: This table is not used by the current application flow.
    The system uses applications.status='draft' instead. Kept for backward compatibility.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey('accounts.Profile', on_delete=models.CASCADE)
    draft_data = models.JSONField()
    draft_name = models.TextField(null=True, blank=True)
    step_completed = models.IntegerField(null=True, blank=True)
    is_active = models.BooleanField(null=True, blank=True, default=True)
    last_accessed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(null=True, blank=True)
    application = models.ForeignKey(Application, on_delete=models.CASCADE, null=True, blank=True)

    class Meta:
        managed = False
        db_table = 'application_drafts'

    def __str__(self):
        return f"Draft {self.id} for user {self.user_id}"


class ApplicationInterview(models.Model):
    """Maps to 'application_interviews' table."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    application = models.ForeignKey(Application, on_delete=models.CASCADE)
    scheduled_at = models.DateTimeField()
    mode = models.TextField()
    location = models.TextField(null=True, blank=True)
    status = models.TextField()
    notes = models.TextField(null=True, blank=True)
    created_by = models.ForeignKey(
        'accounts.Profile',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_interviews',
        db_column='created_by',
    )
    updated_by = models.ForeignKey(
        'accounts.Profile',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='updated_interviews',
        db_column='updated_by',
    )
    created_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = 'application_interviews'

    def __str__(self):
        return f"Interview {self.id} for {self.application_id} ({self.status})"
