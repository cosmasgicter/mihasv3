"""Outreach serializers scaffold."""

from rest_framework import serializers


class OutreachContactSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    full_name = serializers.CharField()
    email = serializers.EmailField()
    company = serializers.CharField()
    role = serializers.CharField()
    relationship_status = serializers.CharField()
    tags = serializers.ListField(child=serializers.CharField())


class OutreachCampaignSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()
    campaign_type = serializers.CharField()
    status = serializers.CharField()
    target_count = serializers.IntegerField()


class OutreachMessageSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    subject = serializers.CharField()
    body = serializers.CharField()
    status = serializers.CharField()
    message_type = serializers.CharField()


class OutreachActionSerializer(serializers.Serializer):
    message = serializers.CharField()
    status = serializers.CharField()
    reference_id = serializers.UUIDField()

