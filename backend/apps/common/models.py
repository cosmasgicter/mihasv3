"""Common models — maps to existing Neon Postgres tables."""

import uuid

from django.db import models


class AuditLog(models.Model):
    """Maps to 'audit_logs' table. No PII stored."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    actor_id = models.UUIDField(null=True)
    action = models.CharField(max_length=100)
    entity_type = models.CharField(max_length=100)
    entity_id = models.UUIDField(null=True)
    changes = models.JSONField(default=dict)
    ip_address = models.CharField(max_length=64)  # SHA-256 hash
    user_agent = models.CharField(max_length=64, blank=True)  # SHA-256 hash
    retention_category = models.CharField(
        max_length=20, default='standard'
    )  # standard (90d) / security (365d)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        managed = False
        db_table = 'audit_logs'

    def __str__(self):
        return f"{self.action} on {self.entity_type} {self.entity_id}"


class IdempotencyKey(models.Model):
    """Maps to 'idempotency_keys' table."""

    key = models.CharField(max_length=255, primary_key=True)
    endpoint = models.CharField(max_length=255)
    response_json = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        managed = False
        db_table = 'idempotency_keys'

    def __str__(self):
        return f"IdempotencyKey {self.key} → {self.endpoint}"


class Setting(models.Model):
    """Maps to 'settings' table."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    key = models.CharField(max_length=255, unique=True)
    value = models.TextField()
    category = models.CharField(max_length=100, blank=True)
    description = models.TextField(blank=True)
    is_public = models.BooleanField(default=False)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        managed = False
        db_table = 'settings'

    def __str__(self):
        return f"{self.key} = {self.value[:50]}"


class Notification(models.Model):
    """Maps to 'notifications' table."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey('accounts.Profile', on_delete=models.CASCADE)
    title = models.CharField(max_length=255)
    message = models.TextField()
    type = models.CharField(max_length=50)
    is_read = models.BooleanField(default=False)
    idempotency_key = models.CharField(max_length=255, unique=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        managed = False
        db_table = 'notifications'

    def __str__(self):
        return f"{self.title} → {self.user_id}"


class UserNotificationPreference(models.Model):
    """Maps to 'user_notification_preferences' table."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField('accounts.Profile', on_delete=models.CASCADE)
    email_enabled = models.BooleanField(default=True)
    push_enabled = models.BooleanField(default=False)
    quiet_hours = models.JSONField(default=dict)

    class Meta:
        managed = False
        db_table = 'user_notification_preferences'

    def __str__(self):
        return f"NotifPrefs for {self.user_id}"


class EmailQueue(models.Model):
    """Maps to 'email_queue' table."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    recipient_email = models.EmailField()
    subject = models.CharField(max_length=500)
    body = models.TextField()
    status = models.CharField(max_length=50, default='pending')
    retry_count = models.IntegerField(default=0)
    error_message = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

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
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        managed = False
        db_table = 'error_logs'

    def __str__(self):
        return f"[{self.source}/{self.level}] {self.message[:80]}"


class MigrationHistory(models.Model):
    """Maps to 'migration_history' table."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    migration_name = models.CharField(max_length=255)
    applied_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        managed = False
        db_table = 'migration_history'

    def __str__(self):
        return f"{self.migration_name} applied at {self.applied_at}"
