"""Application models — maps to existing Neon Postgres tables."""

import uuid

from django.db import models


class Application(models.Model):
    """Maps to 'applications' table."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey('accounts.Profile', on_delete=models.CASCADE)
    application_number = models.CharField(max_length=50, unique=True)
    public_tracking_code = models.CharField(max_length=50, unique=True)
    full_name = models.CharField(max_length=255)
    nrc_number = models.CharField(max_length=20, blank=True)
    passport_number = models.CharField(max_length=50, blank=True)
    date_of_birth = models.DateField()
    sex = models.CharField(max_length=10)
    phone = models.CharField(max_length=20)
    email = models.EmailField()
    residence_town = models.CharField(max_length=255)
    nationality = models.CharField(max_length=100, default='Zambian')
    country = models.CharField(max_length=100, blank=True, null=True)
    address_line_1 = models.CharField(max_length=255, blank=True, null=True)
    address_line_2 = models.CharField(max_length=255, blank=True, null=True)
    postal_code = models.CharField(max_length=20, blank=True, null=True)
    next_of_kin_name = models.CharField(max_length=255, blank=True, null=True)
    next_of_kin_phone = models.CharField(max_length=20, blank=True, null=True)
    program = models.CharField(max_length=255)
    intake = models.CharField(max_length=100)
    institution = models.CharField(max_length=255)
    result_slip_url = models.URLField(max_length=500, blank=True, null=True)
    extra_kyc_url = models.URLField(max_length=500, blank=True, null=True)
    application_fee = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True)
    payment_method = models.CharField(max_length=20, blank=True, null=True)
    payer_name = models.CharField(max_length=255, blank=True, null=True)
    payer_phone = models.CharField(max_length=20, blank=True, null=True)
    amount = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True)
    paid_at = models.DateTimeField(blank=True, null=True)
    momo_ref = models.CharField(max_length=100, blank=True, null=True)
    pop_url = models.URLField(max_length=500, blank=True, null=True)
    receipt_number = models.CharField(max_length=50, blank=True, null=True)
    payment_status = models.CharField(max_length=20, blank=True, null=True)
    payment_verified_at = models.DateTimeField(blank=True, null=True)
    payment_verified_by = models.ForeignKey(
        'accounts.Profile',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='verified_applications',
        db_column='payment_verified_by',
    )
    status = models.CharField(max_length=50, default='draft')
    eligibility_status = models.CharField(max_length=20, blank=True, null=True)
    eligibility_score = models.IntegerField(blank=True, null=True)
    eligibility_notes = models.TextField(blank=True, null=True)
    admin_feedback = models.TextField(blank=True, null=True)
    admin_feedback_date = models.DateTimeField(blank=True, null=True)
    admin_feedback_by = models.ForeignKey(
        'accounts.Profile',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='feedback_applications',
        db_column='admin_feedback_by',
    )
    review_started_at = models.DateTimeField(blank=True, null=True)
    decision_date = models.DateTimeField(blank=True, null=True)
    reviewed_by = models.ForeignKey(
        'accounts.Profile',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='reviewed_applications',
        db_column='reviewed_by',
    )
    additional_subjects = models.JSONField(blank=True, null=True)
    version = models.IntegerField(default=1)
    submitted_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        managed = False
        db_table = 'applications'

    def __str__(self):
        return f"{self.application_number} — {self.full_name}"


class ApplicationStatusHistory(models.Model):
    """Maps to 'application_status_history' table."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    application = models.ForeignKey(Application, on_delete=models.CASCADE)
    status = models.CharField(max_length=50, blank=True, default="")
    old_status = models.CharField(max_length=50, blank=True, default="")
    new_status = models.CharField(max_length=50, blank=True, default="")
    changed_by = models.ForeignKey(
        'accounts.Profile', on_delete=models.SET_NULL, null=True
    )
    notes = models.TextField(blank=True)
    changes = models.JSONField(blank=True, null=True)
    ip_address = models.CharField(max_length=64, blank=True, default="")
    user_agent = models.CharField(max_length=255, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        managed = False
        db_table = 'application_status_history'

    def __str__(self):
        return f"{self.application_id}: {self.old_status} → {self.new_status}"


class ApplicationDraft(models.Model):
    """Maps to 'application_drafts' table."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    application = models.ForeignKey(Application, on_delete=models.CASCADE, null=True, blank=True)
    user = models.ForeignKey('accounts.Profile', on_delete=models.CASCADE)
    draft_data = models.JSONField()
    draft_name = models.CharField(max_length=255, blank=True, null=True)
    step_completed = models.IntegerField(blank=True, null=True)
    is_active = models.BooleanField(default=True)
    last_accessed_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

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
    mode = models.CharField(max_length=20, blank=True, null=True)
    location = models.CharField(max_length=255, blank=True, null=True)
    status = models.CharField(max_length=50)
    notes = models.TextField(blank=True)
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
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        managed = False
        db_table = 'application_interviews'

    def __str__(self):
        return f"Interview {self.id} for {self.application_id} ({self.status})"
