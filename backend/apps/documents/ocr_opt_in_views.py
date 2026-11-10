"""The OCR opt-in command: ``GET`` / ``PUT /api/v1/admin/documents/ocr-opt-in/``.

platform-simplification task 18.1 (Requirement 11.4, decision D4 option B).

This is the only reader and writer of the ``documents.ocr_enabled_institution_ids``
setting (see :mod:`apps.documents.ocr_policy`). Authority is the platform
capability ``platform.settings.manage``, resolved through
``AdminCapabilityService`` by :class:`HasPlatformCapability`, so a denial is
audited and non-revealing. Every successful ``PUT`` writes the row and one
``settings.change`` Audit_Event in the same transaction.

There is no UI for it in this spec; operators call it through the API
(``docs/runbooks/multi-tenant-operations.md``).
"""

from __future__ import annotations

import uuid

from django.db import transaction
from django.utils import timezone
from drf_spectacular.utils import OpenApiResponse, extend_schema, extend_schema_view
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.catalog.permissions import HasPlatformCapability
from apps.common.openapi_helpers import ErrorResponseSerializer, envelope_serializer
from apps.documents.ocr_policy import (
    OCR_OPT_IN_SETTING_CATEGORY,
    OCR_OPT_IN_SETTING_DESCRIPTION,
    OCR_OPT_IN_SETTING_KEY,
    opted_in_institution_ids,
)


class OcrOptInSerializer(serializers.Serializer):
    """The opt-in set: the institutions whose students get OCR suggestions."""

    institution_ids = serializers.ListField(child=serializers.UUIDField(), allow_empty=True)


OcrOptInResponseSerializer = envelope_serializer("OcrOptInResponse", OcrOptInSerializer())


def _validation_error(field: str, message: str) -> Response:
    return Response(
        {
            "success": False,
            "error": "Validation failed",
            "code": "VALIDATION_ERROR",
            "details": {field: [message]},
        },
        status=status.HTTP_400_BAD_REQUEST,
    )


def _validated_institution_ids(data) -> tuple[list[str] | None, Response | None]:
    """Validate the ``PUT`` body. Returns ``(ids, None)`` or ``(None, 400 response)``."""
    from apps.catalog.models import Institution

    if not isinstance(data, dict) or "institution_ids" not in data:
        return None, _validation_error("institution_ids", "This field is required.")
    raw = data.get("institution_ids")
    if not isinstance(raw, list):
        return None, _validation_error("institution_ids", "Must be a list of institution ids.")
    ids: list[str] = []
    for entry in raw:
        if not isinstance(entry, str):
            return None, _validation_error("institution_ids", "Each entry must be a UUID string.")
        try:
            ids.append(str(uuid.UUID(entry)))
        except ValueError:
            return None, _validation_error("institution_ids", "Each entry must be a UUID string.")
    if len(set(ids)) != len(ids):
        return None, _validation_error("institution_ids", "Entries must not repeat.")
    if len(ids) > Institution.objects.count():
        return None, _validation_error("institution_ids", "More entries than institutions.")
    if ids:
        existing = {str(pk) for pk in Institution.objects.filter(id__in=ids).values_list("id", flat=True)}
        if existing != set(ids):
            return None, _validation_error("institution_ids", "Each entry must name an existing institution.")
    return ids, None


@extend_schema_view(
    get=extend_schema(
        operation_id="admin_documents_ocr_opt_in_retrieve",
        tags=["admin"],
        responses={
            200: OpenApiResponse(response=OcrOptInResponseSerializer),
            403: OpenApiResponse(response=ErrorResponseSerializer),
        },
    ),
    put=extend_schema(
        operation_id="admin_documents_ocr_opt_in_update",
        tags=["admin"],
        request=OcrOptInSerializer,
        responses={
            200: OpenApiResponse(response=OcrOptInResponseSerializer),
            400: OpenApiResponse(response=ErrorResponseSerializer),
            403: OpenApiResponse(response=ErrorResponseSerializer),
        },
    ),
)
class OcrOptInView(APIView):
    """Read or replace the set of institutions that have opted in to OCR."""

    permission_classes = [IsAuthenticated, HasPlatformCapability]
    required_capability = "platform.settings.manage"
    audit_resource_type = "setting"
    serializer_class = OcrOptInSerializer

    def get(self, request):
        return Response({"success": True, "data": {"institution_ids": opted_in_institution_ids()}})

    def put(self, request):
        ids, error = _validated_institution_ids(request.data)
        if error is not None:
            return error

        from apps.catalog.tenant_audit_service import ACTION_SETTINGS_CHANGED, TenantAuditService
        from apps.common.models import Setting

        now = timezone.now()
        actor_id = getattr(request.user, "id", None)
        with transaction.atomic():
            setting = Setting.objects.select_for_update().filter(key=OCR_OPT_IN_SETTING_KEY).first()
            before = opted_in_institution_ids()
            if setting is None:
                setting = Setting.objects.create(
                    key=OCR_OPT_IN_SETTING_KEY,
                    value=ids,
                    description=OCR_OPT_IN_SETTING_DESCRIPTION,
                    category=OCR_OPT_IN_SETTING_CATEGORY,
                    is_public=False,
                    updated_by=_uuid_or_none(actor_id),
                    created_at=now,
                    updated_at=now,
                )
            else:
                setting.value = ids
                setting.updated_by = _uuid_or_none(actor_id)
                setting.updated_at = now
                setting.save(update_fields=["value", "updated_by", "updated_at"])
            TenantAuditService.record_event(
                action=ACTION_SETTINGS_CHANGED,
                entity_type="setting",
                entity_id=setting.id,
                actor_id=actor_id,
                actor_role=getattr(request.user, "role", None),
                metadata={"key": OCR_OPT_IN_SETTING_KEY, "before": before, "after": ids},
                request=request,
            )
        return Response({"success": True, "data": {"institution_ids": ids}})


def _uuid_or_none(value) -> uuid.UUID | None:
    if value is None:
        return None
    try:
        return uuid.UUID(str(value))
    except ValueError:
        return None
