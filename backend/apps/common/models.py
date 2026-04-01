"""Common models — maps to existing Neon Postgres tables."""

import uuid

from django.db import models


class AuditLog(models.Model):
    """Maps to 'audit_logs' table. No PII stored."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    actor_id = models.UUIDField(null=True, blank=True)
    action = models.CharField(max_length=50)
    entity_type = models.CharField(max_length=50)
    entity_id = models.UUIDField(null=True, blank=True)
    changes = models.JSONField(null=True, blank=True)
    ip_address = models.CharField(max_length=64, null=True, blank=True)  # SHA-256 hash of IP
    user_agent = models.TextField(null=True, blank=True)
    retention_category = models.CharField(max_length=20, default='standard')
    created_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = 'audit_logs'

    def __str__(self):
        return f"{self.action} on {self.entity_type} {self.entity_id}"


class IdempotencyKey(models.Model):
    """Maps to 'idempotency_keys' table."""

    key = models.TextField(primary_key=True)
    endpoint = models.TextField()
    response_json = models.JSONField()
    created_at = models.DateTimeField()

    class Meta:
        managed = False
        db_table = 'idempotency_keys'

    def __str__(self):
        return f"IdempotencyKey {self.key} → {self.endpoint}"


class Setting(models.Model):
    """Maps to 'settings' table."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    key = models.CharField(max_length=100, unique=True)
    value = models.JSONField()
    description = models.TextField(null=True, blank=True)
    category = models.CharField(max_length=50, null=True, blank=True)
    is_public = models.BooleanField(null=True, blank=True, default=False)
    updated_by = models.UUIDField(null=True, blank=True)
    created_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = 'settings'

    def __str__(self):
        return f"{self.key}"


class Notification(models.Model):
    """Maps to 'notifications' table."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey('accounts.Profile', on_delete=models.CASCADE)
    title = models.CharField(max_length=255)
    message = models.TextField()
    type = models.CharField(max_length=50, null=True, blank=True)
    priority = models.CharField(max_length=20, null=True, blank=True)
    action_url = models.TextField(null=True, blank=True)
    metadata = models.JSONField(null=True, blank=True)
    is_read = models.BooleanField(null=True, blank=True, default=False)
    read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(null=True, blank=True)
    idempotency_key = models.TextField(null=True, blank=True, unique=True)

    class Meta:
        managed = False
        db_table = 'notifications'

    def __str__(self):
        return f"{self.title} → {self.user_id}"


class UserNotificationPreference(models.Model):
    """Maps to 'user_notification_preferences' table."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField('accounts.Profile', on_delete=models.CASCADE)
    email_enabled = models.BooleanField(null=True, blank=True, default=True)
    push_enabled = models.BooleanField(null=True, blank=True, default=False)
    sms_enabled = models.BooleanField(null=True, blank=True, default=False)
    application_updates = models.BooleanField(null=True, blank=True)
    payment_reminders = models.BooleanField(null=True, blank=True)
    interview_reminders = models.BooleanField(null=True, blank=True)
    marketing_emails = models.BooleanField(null=True, blank=True)
    quiet_hours_start = models.TimeField(null=True, blank=True)
    quiet_hours_end = models.TimeField(null=True, blank=True)
    timezone = models.CharField(max_length=50, null=True, blank=True)
    created_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = 'user_notification_preferences'

    def __str__(self):
        return f"NotifPrefs for {self.user_id}"


class EmailQueue(models.Model):
    """Maps to 'email_queue' table."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    recipient_email = models.CharField(max_length=255)
    recipient_name = models.CharField(max_length=255, null=True, blank=True)
    subject = models.CharField(max_length=255)
    body = models.TextField()
    html_body = models.TextField(null=True, blank=True)
    template_name = models.CharField(max_length=100, null=True, blank=True)
    template_data = models.JSONField(null=True, blank=True)
    status = models.CharField(max_length=20, null=True, blank=True, default='pending')
    priority = models.IntegerField(null=True, blank=True)
    retry_count = models.IntegerField(null=True, blank=True, default=0)
    max_retries = models.IntegerField(null=True, blank=True)
    error_message = models.TextField(null=True, blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = 'email_queue'

    def __str__(self):
        return f"Email to {self.recipient_email} ({self.status})"


class ErrorLog(models.Model):
    """Maps to 'error_logs' table. Self-hosted error monitoring."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    source = models.CharField(max_length=20)  # 'backend' or 'frontend'
    level = models.CharField(max_length=20)  # 'error' or 'warning'
    message = models.TextField()
    stack_trace = models.TextField(null=True, blank=True)
    context = models.JSONField(null=True, blank=True)
    request_path = models.TextField(null=True, blank=True)
    user_id = models.UUIDField(null=True, blank=True)
    ip_hash = models.CharField(max_length=64, null=True, blank=True)
    created_at = models.DateTimeField()

    class Meta:
        managed = False
        db_table = 'error_logs'

    def __str__(self):
        return f"[{self.source}/{self.level}] {self.message[:80]}"


class MigrationHistory(models.Model):
    """Maps to 'migration_history' table."""

    id = models.AutoField(primary_key=True)
    migration_name = models.TextField()
    applied_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = 'migration_history'

    def __str__(self):
        return f"{self.migration_name} applied at {self.applied_at}"
