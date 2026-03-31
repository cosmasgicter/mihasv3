"""Analytics models scaffold."""

import uuid

from django.db import models


class AnalyticsTimestampedModel(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class AnalyticsSnapshot(AnalyticsTimestampedModel):
    snapshot_type = models.CharField(max_length=100)
    payload = models.JSONField(default=dict)

    class Meta:
        managed = False
        db_table = "analytics_snapshots"


class SourcePerformanceSummary(AnalyticsTimestampedModel):
    source_key = models.CharField(max_length=120)
    freshness_hours = models.IntegerField(default=0)
    duplicate_ratio = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    success_rate = models.DecimalField(max_digits=5, decimal_places=2, default=0)

    class Meta:
        managed = False
        db_table = "analytics_source_performance_summaries"


class DailyDigestReport(AnalyticsTimestampedModel):
    headline = models.CharField(max_length=255)
    summary = models.TextField(blank=True)
    payload = models.JSONField(default=dict)

    class Meta:
        managed = False
        db_table = "daily_digest_reports"

