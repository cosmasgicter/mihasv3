"""Automation models scaffold."""

import uuid

from django.db import models


class AutomationTimestampedModel(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class AutomationRule(AutomationTimestampedModel):
    name = models.CharField(max_length=255)
    rule_type = models.CharField(max_length=100)
    is_enabled = models.BooleanField(default=True)
    config = models.JSONField(default=dict)

    class Meta:
        managed = False
        db_table = "automation_rules"


class AutomationRun(AutomationTimestampedModel):
    run_type = models.CharField(max_length=100)
    status = models.CharField(max_length=50, default="queued")
    trigger_source = models.CharField(max_length=100, blank=True)
    summary = models.TextField(blank=True)
    blocked_reason = models.TextField(blank=True)

    class Meta:
        managed = False
        db_table = "automation_runs"


class AutomationArtifact(AutomationTimestampedModel):
    automation_run = models.ForeignKey(AutomationRun, on_delete=models.CASCADE)
    artifact_type = models.CharField(max_length=100)
    artifact_url = models.URLField(blank=True)
    metadata = models.JSONField(default=dict)

    class Meta:
        managed = False
        db_table = "automation_artifacts"


class ReviewTask(AutomationTimestampedModel):
    automation_run = models.ForeignKey(AutomationRun, on_delete=models.SET_NULL, null=True, blank=True)
    task_type = models.CharField(max_length=100)
    status = models.CharField(max_length=50, default="pending")
    reason = models.TextField(blank=True)

    class Meta:
        managed = False
        db_table = "review_tasks"

