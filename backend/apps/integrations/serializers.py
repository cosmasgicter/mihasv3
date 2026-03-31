"""Integrations serializers scaffold."""

from rest_framework import serializers


class IntegrationActionSerializer(serializers.Serializer):
    message = serializers.CharField()
    status = serializers.CharField()
    reference_id = serializers.UUIDField()


class TelegramSubscriptionSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    chat_id = serializers.CharField()
    status = serializers.CharField()
    scope = serializers.CharField()


class EmailAccountSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    provider = serializers.CharField()
    email = serializers.EmailField()
    status = serializers.CharField()


class EmailThreadSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    subject = serializers.CharField()
    thread_key = serializers.CharField()
    status = serializers.CharField()


class EmailMessageSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    thread_id = serializers.UUIDField()
    direction = serializers.CharField()
    sender = serializers.EmailField()
    recipient = serializers.EmailField()
    subject = serializers.CharField()
    body_preview = serializers.CharField()
    classification = serializers.CharField()

