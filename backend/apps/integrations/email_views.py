"""Email integration scaffold views."""

import uuid

from drf_spectacular.utils import OpenApiResponse, extend_schema, extend_schema_view
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.jobs_ops_seed import build_action_payload, sample_email_messages, sample_email_threads
from apps.common.openapi_helpers import envelope_serializer, paginated_serializer
from apps.integrations.serializers import EmailAccountSerializer, EmailMessageSerializer, EmailThreadSerializer, IntegrationActionSerializer


EMAIL_ACCOUNT_RESPONSE = envelope_serializer("EmailAccountResponse", EmailAccountSerializer())
EMAIL_MESSAGE_LIST_RESPONSE = envelope_serializer(
    "EmailMessageListResponse",
    paginated_serializer("EmailMessagePage", EmailMessageSerializer),
)
EMAIL_THREAD_LIST_RESPONSE = envelope_serializer(
    "EmailThreadListResponse",
    paginated_serializer("EmailThreadPage", EmailThreadSerializer),
)
EMAIL_ACTION_RESPONSE = envelope_serializer("EmailActionResponse", IntegrationActionSerializer())


class ZohoConnectView(APIView):
    permission_classes = [IsAuthenticated]
    serializer_class = EmailAccountSerializer

    @extend_schema(operation_id="email_zoho_connect", tags=["email"], responses={201: OpenApiResponse(response=EMAIL_ACCOUNT_RESPONSE)})
    def post(self, request):
        return Response(
            {
                "id": uuid.uuid4(),
                "provider": "zoho",
                "email": "operator@example.com",
                "status": "connected",
            },
            status=status.HTTP_201_CREATED,
        )


@extend_schema_view(
    get=extend_schema(operation_id="email_messages_list", tags=["email"], responses={200: OpenApiResponse(response=EMAIL_MESSAGE_LIST_RESPONSE)})
)
class EmailMessageListView(APIView):
    permission_classes = [IsAuthenticated]
    serializer_class = EmailMessageSerializer

    def get(self, request):
        messages = sample_email_messages()
        return Response({"success": True, "data": {"page": 1, "pageSize": 20, "totalCount": len(messages), "results": messages}})


@extend_schema_view(
    get=extend_schema(operation_id="email_threads_list", tags=["email"], responses={200: OpenApiResponse(response=EMAIL_THREAD_LIST_RESPONSE)})
)
class EmailThreadListView(APIView):
    permission_classes = [IsAuthenticated]
    serializer_class = EmailThreadSerializer

    def get(self, request):
        threads = sample_email_threads()
        return Response({"success": True, "data": {"page": 1, "pageSize": 20, "totalCount": len(threads), "results": threads}})


class EmailDeliveryWebhookView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    serializer_class = IntegrationActionSerializer

    @extend_schema(operation_id="email_delivery_webhook", tags=["email"], auth=[], responses={200: OpenApiResponse(response=EMAIL_ACTION_RESPONSE)})
    def post(self, request):
        # Validate webhook secret if configured
        from django.conf import settings as django_settings
        expected = getattr(django_settings, "EMAIL_WEBHOOK_SECRET", None)
        if expected:
            provided = request.headers.get("X-Webhook-Secret", "")
            if not provided or provided != expected:
                return Response({"error": "Unauthorized"}, status=status.HTTP_403_FORBIDDEN)

        return Response(build_action_payload(uuid.uuid4(), "Email delivery webhook scaffold accepted.", "accepted"))
