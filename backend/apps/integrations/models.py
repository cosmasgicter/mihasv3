"""Integrations and messaging models scaffold."""

import uuid

from django.db import models


class IntegrationsTimestampedModel(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class IntegrationAccount(IntegrationsTimestampedModel):
    provider = models.CharField(max_length=100)
    display_name = models.CharField(max_length=255)
    status = models.CharField(max_length=50, default="planned")
    metadata = models.JSONField(default=dict)

    class Meta:
        managed = False
        db_table = "integration_accounts"


class TelegramSubscription(IntegrationsTimestampedModel):
    chat_id = models.CharField(max_length=255)
    status = models.CharField(max_length=50, default="planned")
    scope = models.CharField(max_length=100, default="operator")

    class Meta:
        managed = False
        db_table = "telegram_subscriptions"


class ProviderCredentialAudit(IntegrationsTimestampedModel):
    provider = models.CharField(max_length=100)
    action = models.CharField(max_length=100)
    actor_id = models.UUIDField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = "provider_credential_audits"


class EmailAccount(IntegrationsTimestampedModel):
    provider = models.CharField(max_length=100, default="zoho")
    email = models.EmailField()
    status = models.CharField(max_length=50, default="planned")

    class Meta:
        managed = False
        db_table = "email_accounts"


class EmailThread(IntegrationsTimestampedModel):
    subject = models.CharField(max_length=255)
    thread_key = models.CharField(max_length=255, unique=True)
    status = models.CharField(max_length=50, default="open")

    class Meta:
        managed = False
        db_table = "email_threads"


class EmailMessage(IntegrationsTimestampedModel):
    thread = models.ForeignKey(EmailThread, on_delete=models.CASCADE)
    direction = models.CharField(max_length=20, default="outbound")
    sender = models.EmailField()
    recipient = models.EmailField()
    subject = models.CharField(max_length=255)
    body_preview = models.TextField(blank=True)
    classification = models.CharField(max_length=50, default="unknown")

    class Meta:
        managed = False
        db_table = "email_messages"


class DeliveryEvent(IntegrationsTimestampedModel):
    message = models.ForeignKey(EmailMessage, on_delete=models.CASCADE)
    event_type = models.CharField(max_length=50)
    provider_reference = models.CharField(max_length=255, blank=True)

    class Meta:
        managed = False
        db_table = "delivery_events"

