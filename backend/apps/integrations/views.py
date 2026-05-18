"""Integrations scaffold views."""

import uuid

from django.conf import settings
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.openapi_helpers import envelope_serializer
from apps.integrations.serializers import IntegrationActionSerializer, TelegramSubscriptionSerializer


ACTION_RESPONSE = envelope_serializer("IntegrationsActionResponse", IntegrationActionSerializer())
TELEGRAM_RESPONSE = envelope_serializer("TelegramSubscriptionResponse", TelegramSubscriptionSerializer())


class TelegramConnectView(APIView):
    permission_classes = [IsAuthenticated]
    serializer_class = TelegramSubscriptionSerializer

    @extend_schema(operation_id="integrations_telegram_connect", tags=["integrations"], responses={201: OpenApiResponse(response=TELEGRAM_RESPONSE)})
    def post(self, request):
        return Response(
            {"success": True, "data": {
                "id": uuid.uuid4(),
                "chat_id": "scaffold-chat-id",
                "status": "connected",
                "scope": "operator",
            }},
            status=status.HTTP_201_CREATED,
        )


class TelegramTestView(APIView):
    permission_classes = [IsAuthenticated]
    serializer_class = IntegrationActionSerializer

    @extend_schema(operation_id="integrations_telegram_test", tags=["integrations"], responses={200: OpenApiResponse(response=ACTION_RESPONSE)})
    def post(self, request):
        return Response(
            {"success": True, "data": {
                "message": "Telegram test scaffold acknowledged.",
                "status": "sent",
                "reference_id": uuid.uuid4(),
            }}
        )


class TelegramWebhookView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    serializer_class = IntegrationActionSerializer

    @extend_schema(operation_id="integrations_telegram_webhook", tags=["integrations"], auth=[], responses={200: OpenApiResponse(response=ACTION_RESPONSE)})
    def post(self, request):
        # Validate Telegram secret token header
        expected_token = getattr(settings, "TELEGRAM_WEBHOOK_SECRET", None)
        if expected_token:
            provided = request.headers.get("X-Telegram-Bot-Api-Secret-Token", "")
            if not provided or provided != expected_token:
                return Response({"error": "Unauthorized"}, status=403)

        return Response(
            {"success": True, "data": {
                "message": "Telegram webhook scaffold received payload.",
                "status": "accepted",
                "reference_id": uuid.uuid4(),
            }}
        )


class OpenAITestView(APIView):
    permission_classes = [IsAuthenticated]
    serializer_class = IntegrationActionSerializer

    @extend_schema(operation_id="integrations_openai_test", tags=["integrations"], responses={200: OpenApiResponse(response=ACTION_RESPONSE)})
    def post(self, request):
        return Response(
            {"success": True, "data": {
                "message": "OpenAI integration scaffold reachable.",
                "status": "ok",
                "reference_id": uuid.uuid4(),
            }}
        )
