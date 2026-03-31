"""Automation serializers scaffold."""

from rest_framework import serializers


class AutomationRuleSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()
    rule_type = serializers.CharField()
    is_enabled = serializers.BooleanField()
    config = serializers.JSONField()


class AutomationRunSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    run_type = serializers.CharField()
    status = serializers.CharField()
    trigger_source = serializers.CharField()
    summary = serializers.CharField()
    blocked_reason = serializers.CharField()
    updated_at = serializers.DateTimeField()


class AutomationActionSerializer(serializers.Serializer):
    message = serializers.CharField()
    status = serializers.CharField()
    reference_id = serializers.UUIDField()

