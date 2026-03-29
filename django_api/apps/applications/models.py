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
    program = models.CharField(max_length=255)
    intake = models.CharField(max_length=100)
    institution = models.CharField(max_length=255)
    status = models.CharField(max_length=50, default='draft')
    version = models.IntegerField(default=1)
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
    old_status = models.CharField(max_length=50)
    new_status = models.CharField(max_length=50)
    changed_by = models.ForeignKey(
        'accounts.Profile', on_delete=models.SET_NULL, null=True
    )
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        managed = False
        db_table = 'application_status_history'

    def __str__(self):
        return f"{self.application_id}: {self.old_status} → {self.new_status}"


class ApplicationDraft(models.Model):
    """Maps to 'application_drafts' table."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    application = models.ForeignKey(Application, on_delete=models.CASCADE, null=True)
    user = models.ForeignKey('accounts.Profile', on_delete=models.CASCADE)
    draft_data = models.JSONField()
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
    status = models.CharField(max_length=50)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        managed = False
        db_table = 'application_interviews'

    def __str__(self):
        return f"Interview {self.id} for {self.application_id} ({self.status})"
