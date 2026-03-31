"""Outreach models scaffold."""

import uuid

from django.db import models


class OutreachTimestampedModel(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class OutreachContact(OutreachTimestampedModel):
    full_name = models.CharField(max_length=255)
    email = models.EmailField(blank=True)
    company = models.CharField(max_length=255, blank=True)
    role = models.CharField(max_length=255, blank=True)
    relationship_status = models.CharField(max_length=50, default="new")
    tags = models.JSONField(default=list)

    class Meta:
        managed = False
        db_table = "outreach_contacts"


class OutreachCampaign(OutreachTimestampedModel):
    name = models.CharField(max_length=255)
    campaign_type = models.CharField(max_length=100, default="follow_up")
    status = models.CharField(max_length=50, default="draft")
    target_count = models.IntegerField(default=0)

    class Meta:
        managed = False
        db_table = "outreach_campaigns"


class OutreachMessage(OutreachTimestampedModel):
    contact = models.ForeignKey(OutreachContact, on_delete=models.CASCADE)
    campaign = models.ForeignKey(OutreachCampaign, on_delete=models.SET_NULL, null=True, blank=True)
    message_type = models.CharField(max_length=100, default="introduction")
    subject = models.CharField(max_length=255, blank=True)
    body = models.TextField(blank=True)
    status = models.CharField(max_length=50, default="draft")

    class Meta:
        managed = False
        db_table = "outreach_messages"


class Opportunity(OutreachTimestampedModel):
    contact = models.ForeignKey(OutreachContact, on_delete=models.CASCADE)
    title = models.CharField(max_length=255)
    stage = models.CharField(max_length=50, default="new")
    notes = models.TextField(blank=True)

    class Meta:
        managed = False
        db_table = "outreach_opportunities"

