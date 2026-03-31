"""Integrations scaffold views."""

import uuid

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
            {
                "id": uuid.uuid4(),
                "chat_id": "scaffold-chat-id",
                "status": "connected",
                "scope": "operator",
            },
            status=status.HTTP_201_CREATED,
        )


class TelegramTestView(APIView):
    permission_classes = [IsAuthenticated]
    serializer_class = IntegrationActionSerializer

    @extend_schema(operation_id="integrations_telegram_test", tags=["integrations"], responses={200: OpenApiResponse(response=ACTION_RESPONSE)})
    def post(self, request):
        return Response(
            {
                "message": "Telegram test scaffold acknowledged.",
                "status": "sent",
                "reference_id": uuid.uuid4(),
            }
        )


class TelegramWebhookView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    serializer_class = IntegrationActionSerializer

    @extend_schema(operation_id="integrations_telegram_webhook", tags=["integrations"], auth=[], responses={200: OpenApiResponse(response=ACTION_RESPONSE)})
    def post(self, request):
        return Response(
            {
                "message": "Telegram webhook scaffold received payload.",
                "status": "accepted",
                "reference_id": uuid.uuid4(),
            }
        )


class OpenAITestView(APIView):
    permission_classes = [IsAuthenticated]
    serializer_class = IntegrationActionSerializer

    @extend_schema(operation_id="integrations_openai_test", tags=["integrations"], responses={200: OpenApiResponse(response=ACTION_RESPONSE)})
    def post(self, request):
        return Response(
            {
                "message": "OpenAI integration scaffold reachable.",
                "status": "ok",
                "reference_id": uuid.uuid4(),
            }
        )
