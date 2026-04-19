"""Admin views for communication templates.

Implements task 10.2.
Requirements: 9.6
"""

import logging

from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsAdmin
from apps.common.models import CommunicationTemplate

logger = logging.getLogger(__name__)


class CommunicationTemplateSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    template_key = serializers.CharField(read_only=True)
    subject_template = serializers.CharField(required=False, allow_blank=True)
    body_template = serializers.CharField(required=False, allow_blank=True)
    channel = serializers.ChoiceField(
        choices=["email", "notification", "both"], required=False
    )
    is_active = serializers.BooleanField(required=False)
    created_at = serializers.DateTimeField(read_only=True)
    updated_at = serializers.DateTimeField(read_only=True)


class CommunicationTemplateListView(APIView):
    """GET /api/v1/admin/templates/ — list all communication templates (admin only)."""

    permission_classes = [IsAdmin]

    def get(self, request):
        templates = CommunicationTemplate.objects.all().order_by("template_key")
        data = CommunicationTemplateSerializer(templates, many=True).data
        return Response({"success": True, "data": data})


class CommunicationTemplateUpdateView(APIView):
    """PUT /api/v1/admin/templates/{key}/ — update a template by key (admin only)."""

    permission_classes = [IsAdmin]

    def put(self, request, key):
        try:
            template = CommunicationTemplate.objects.get(template_key=key)
        except CommunicationTemplate.DoesNotExist:
            return Response(
                {"success": False, "error": "Template not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = CommunicationTemplateSerializer(data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(
                {
                    "success": False,
                    "error": "Validation failed",
                    "code": "VALIDATION_ERROR",
                    "details": serializer.errors,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        validated = serializer.validated_data
        if "subject_template" in validated:
            template.subject_template = validated["subject_template"]
        if "body_template" in validated:
            template.body_template = validated["body_template"]
        if "channel" in validated:
            template.channel = validated["channel"]
        if "is_active" in validated:
            template.is_active = validated["is_active"]

        template.save()
        logger.info("Template '%s' updated by admin %s", key, request.user.id)

        return Response(
            {"success": True, "data": CommunicationTemplateSerializer(template).data}
        )
