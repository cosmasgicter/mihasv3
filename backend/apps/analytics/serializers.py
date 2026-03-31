"""Analytics serializers scaffold."""

from rest_framework import serializers


class FunnelAnalyticsSerializer(serializers.Serializer):
    discovered = serializers.IntegerField()
    reviewed = serializers.IntegerField()
    applied = serializers.IntegerField()
    interviews = serializers.IntegerField()
    offers = serializers.IntegerField()


class SourceAnalyticsSerializer(serializers.Serializer):
    source = serializers.CharField()
    freshness_hours = serializers.IntegerField()
    duplicate_ratio = serializers.FloatField()
    success_rate = serializers.FloatField()


class OutreachAnalyticsSerializer(serializers.Serializer):
    campaigns_sent = serializers.IntegerField()
    positive_replies = serializers.IntegerField()
    interviews_generated = serializers.IntegerField()


class DailyDigestSerializer(serializers.Serializer):
    headline = serializers.CharField()
    summary = serializers.CharField()
    generated_at = serializers.DateTimeField()

