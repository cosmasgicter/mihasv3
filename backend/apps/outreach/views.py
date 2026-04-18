"""Outreach scaffold views."""

import uuid

from django.utils import timezone
from drf_spectacular.utils import OpenApiResponse, extend_schema, extend_schema_view
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.jobs_ops_seed import build_action_payload, sample_outreach_campaigns, sample_outreach_contacts
from apps.common.openapi_helpers import envelope_serializer, paginated_serializer
from apps.outreach.serializers import (
    OutreachActionSerializer,
    OutreachCampaignSerializer,
    OutreachContactSerializer,
    OutreachMessageSerializer,
)


CONTACT_LIST_RESPONSE = envelope_serializer(
    "OutreachContactListResponse",
    paginated_serializer("OutreachContactPage", OutreachContactSerializer),
)
CAMPAIGN_LIST_RESPONSE = envelope_serializer(
    "OutreachCampaignListResponse",
    paginated_serializer("OutreachCampaignPage", OutreachCampaignSerializer),
)
MESSAGE_RESPONSE = envelope_serializer("OutreachMessageResponse", OutreachMessageSerializer())
ACTION_RESPONSE = envelope_serializer("OutreachActionResponse", OutreachActionSerializer())


class PublicReadWriteProtectedMixin:
    def get_permissions(self):
        if self.request.method == "GET":
            return [AllowAny()]
        return [permission() for permission in self.permission_classes]


@extend_schema_view(
    get=extend_schema(operation_id="outreach_contacts_list", tags=["outreach"], responses={200: OpenApiResponse(response=CONTACT_LIST_RESPONSE)}),
    post=extend_schema(operation_id="outreach_contacts_create", tags=["outreach"], responses={201: OpenApiResponse(response=envelope_serializer("OutreachContactResponse", OutreachContactSerializer()))}),
)
class OutreachContactListCreateView(PublicReadWriteProtectedMixin, APIView):
    permission_classes = [IsAuthenticated]
    serializer_class = OutreachContactSerializer

    def get(self, request):
        contacts = sample_outreach_contacts()
        return Response({
            "success": True,
            "data": {
                "page": 1,
                "pageSize": 20,
                "totalCount": len(contacts),
                "results": contacts,
            },
        })

    def post(self, request):
        contact = sample_outreach_contacts()[0].copy()
        contact["id"] = uuid.uuid4()
        return Response({"success": True, "data": contact}, status=status.HTTP_201_CREATED)


class OutreachContactEnrichView(APIView):
    permission_classes = [IsAuthenticated]
    serializer_class = OutreachActionSerializer

    @extend_schema(operation_id="outreach_contacts_enrich", tags=["outreach"], responses={202: OpenApiResponse(response=ACTION_RESPONSE)})
    def post(self, request):
        return Response({"success": True, "data": build_action_payload(uuid.uuid4(), "Contact enrichment scaffold queued.")}, status=status.HTTP_202_ACCEPTED)


@extend_schema_view(
    get=extend_schema(operation_id="outreach_campaigns_list", tags=["outreach"], responses={200: OpenApiResponse(response=CAMPAIGN_LIST_RESPONSE)}),
    post=extend_schema(operation_id="outreach_campaigns_create", tags=["outreach"], responses={201: OpenApiResponse(response=envelope_serializer("OutreachCampaignResponse", OutreachCampaignSerializer()))}),
)
class OutreachCampaignListCreateView(PublicReadWriteProtectedMixin, APIView):
    permission_classes = [IsAuthenticated]
    serializer_class = OutreachCampaignSerializer

    def get(self, request):
        campaigns = sample_outreach_campaigns()
        return Response({
            "success": True,
            "data": {
                "page": 1,
                "pageSize": 20,
                "totalCount": len(campaigns),
                "results": campaigns,
            },
        })

    def post(self, request):
        campaign = sample_outreach_campaigns()[0].copy()
        campaign["id"] = uuid.uuid4()
        return Response({"success": True, "data": campaign}, status=status.HTTP_201_CREATED)


class OutreachMessageGenerateView(APIView):
    permission_classes = [IsAuthenticated]
    serializer_class = OutreachMessageSerializer

    @extend_schema(operation_id="outreach_messages_generate", tags=["outreach"], responses={200: OpenApiResponse(response=MESSAGE_RESPONSE)})
    def post(self, request):
        return Response({"success": True, "data": {
            "id": uuid.uuid4(),
            "subject": "Exploring relevant opportunities",
            "body": "This is a scaffold outreach draft. Replace it with approved AI generation and guardrails.",
            "status": "draft",
            "message_type": "introduction",
        }})


class OutreachMessageSendView(APIView):
    permission_classes = [IsAuthenticated]
    serializer_class = OutreachActionSerializer

    @extend_schema(operation_id="outreach_messages_send", tags=["outreach"], responses={202: OpenApiResponse(response=ACTION_RESPONSE)})
    def post(self, request):
        return Response({"success": True, "data": build_action_payload(uuid.uuid4(), "Outreach send scaffold queued.")}, status=status.HTTP_202_ACCEPTED)
