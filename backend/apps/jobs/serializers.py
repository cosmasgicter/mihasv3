"""Jobs serializers scaffold."""

from rest_framework import serializers


class JobSummarySerializer(serializers.Serializer):
    id = serializers.UUIDField()
    title = serializers.CharField()
    company = serializers.CharField()
    location = serializers.CharField()
    work_mode = serializers.CharField()
    match_score = serializers.IntegerField()
    recommendation = serializers.CharField()


class JobDetailSerializer(JobSummarySerializer):
    application_url = serializers.URLField()
    fit_reasons = serializers.ListField(child=serializers.CharField())
    missing_signals = serializers.ListField(child=serializers.CharField())
    source_names = serializers.ListField(child=serializers.CharField())


class DiscoveryRunSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    source = serializers.CharField()
    status = serializers.CharField()
    jobs_discovered = serializers.IntegerField()
    started_at = serializers.DateTimeField(allow_null=True)
    completed_at = serializers.DateTimeField(allow_null=True)


class JobActionSerializer(serializers.Serializer):
    message = serializers.CharField()
    status = serializers.CharField()
    reference_id = serializers.UUIDField()


class JobApplicationSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    job_id = serializers.UUIDField()
    title = serializers.CharField()
    company = serializers.CharField()
    status = serializers.CharField()
    automation_mode = serializers.CharField()
    evidence_count = serializers.IntegerField()
    updated_at = serializers.DateTimeField()


