"""Common models - maps to existing Neon Postgres tables."""

import uuid

from django.db import models


class AuditLog(models.Model):
    """Maps to 'audit_logs' table.

    Long-retention network context is stored as SHA-256 hashes. Raw network
    context may also be stored in encrypted form for restricted forensic use.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    actor_id = models.UUIDField(null=True, blank=True, db_index=True)
    action = models.CharField(max_length=50)
    entity_type = models.CharField(max_length=50)
    entity_id = models.UUIDField(null=True, blank=True, db_index=True)
    changes = models.JSONField(null=True, blank=True)
    ip_address = models.CharField(max_length=64, null=True, blank=True)  # SHA-256 hash of IP
    user_agent = models.TextField(null=True, blank=True)  # SHA-256 hash of user-agent
    ip_address_encrypted = models.TextField(null=True, blank=True)
    user_agent_encrypted = models.TextField(null=True, blank=True)
    retention_category = models.CharField(max_length=20, default='standard')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        managed = False
        db_table = 'audit_logs'

    def __str__(self):
        return f"{self.action} on {self.entity_type} {self.entity_id}"


class IdempotencyKey(models.Model):
    """Maps to 'idempotency_keys' table - command-identity keying."""

    PENDING = "pending"
    COMPLETED = "completed"
    FAILED = "failed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    idempotency_key = models.TextField()
    actor_id = models.UUIDField()
    method = models.CharField(max_length=10)
    path = models.TextField()
    request_hash = models.CharField(max_length=64)
    status = models.CharField(max_length=10, default=PENDING)
    response_status = models.SmallIntegerField(null=True, blank=True)
    response_body = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = "idempotency_keys"
        constraints = [
            models.UniqueConstraint(
                fields=["idempotency_key", "actor_id", "method", "path"],
                name="uq_idempotency_actor_method_path",
            ),
        ]

    def __str__(self):
        return f"IdempotencyKey {self.idempotency_key} → {self.path}"


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

    def save(self, *args, **kwargs):
        from django.utils import timezone as tz
        now = tz.now()
        if not self.created_at:
            self.created_at = now
        self.updated_at = now
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.title} → {self.user_id}"


class UserNotificationPreference(models.Model):
    """Maps to 'user_notification_preferences' table."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField('accounts.Profile', on_delete=models.CASCADE)
    email_enabled = models.BooleanField(null=True, blank=True, default=True)
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


class OutboxEvent(models.Model):
    """Maps to 'outbox_events' table."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    event_type = models.CharField(max_length=100)
    channel = models.CharField(max_length=50)
    aggregate_type = models.CharField(max_length=100, null=True, blank=True)
    aggregate_id = models.UUIDField(null=True, blank=True)
    payload = models.JSONField(default=dict)
    status = models.CharField(max_length=20, default="published")
    target_table = models.CharField(max_length=100, null=True, blank=True)
    target_id = models.UUIDField(null=True, blank=True)
    idempotency_key = models.TextField(null=True, blank=True, unique=True)
    error_message = models.TextField(null=True, blank=True)
    retry_count = models.IntegerField(null=True, blank=True, default=0)
    created_at = models.DateTimeField(null=True, blank=True)
    processed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = "outbox_events"

    def __str__(self):
        return f"{self.channel}:{self.event_type} ({self.status})"


class ErrorLog(models.Model):
    """DEPRECATED: Maps to 'error_logs' table.

    This model is no longer actively written to. Error monitoring has been
    migrated to GlitchTip (Sentry-compatible). The table and existing records
    are preserved for historical reference. Do not create new ErrorLog rows -
    use sentry_sdk.capture_exception() or sentry_sdk.capture_message() instead.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    source = models.CharField(max_length=20)  # 'backend' or 'frontend'
    level = models.CharField(max_length=20)  # 'error' or 'warning'
    message = models.TextField()
    stack_trace = models.TextField(null=True, blank=True)
    context = models.JSONField(null=True, blank=True)
    request_path = models.TextField(null=True, blank=True)
    user_id = models.UUIDField(null=True, blank=True)
    ip_hash = models.CharField(max_length=64, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

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


class CommunicationTemplate(models.Model):
    """Maps to 'communication_templates' table."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    template_key = models.CharField(max_length=100, unique=True)
    subject_template = models.TextField(default='')
    body_template = models.TextField(default='')
    channel = models.CharField(max_length=20, default='both')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        managed = False
        db_table = 'communication_templates'

    def __str__(self):
        return f"Template: {self.template_key} ({self.channel})"
