"""Canonical admin Intake (global intake period) management API (task 5.1).

Spec: ``.kiro/specs/admissions-v2-canonical-rebuild/`` task 5.1
Requirements: **R7.1**, **R7.3** (the admin UI manages the catalog through the
canonical endpoints; legacy catalog write routes have no frontend caller after
migration), **R14.7**.
Findings: **TEN-03**.

Intakes are **global**, Beanola-platform calendar records (Jan/Jul periods),
not tenant-owned. Their canonical management home mirrors the tenant home
(``/api/v1/admin/institutions/``): platform-gated writes under ``/api/v1/admin/``,
while ``/api/v1/catalog/intakes/`` keeps its **public read** and its now-frozen
legacy write (deprecation-signalled, measured — R14.7).

Moving intake-period writes here lets the admin Intakes page leave the legacy
``/catalog/intakes/`` write route entirely (R7.3), so that route can be removed
in Phase 12.2 once telemetry proves zero callers. Every write is gated by the
single ``platform.intake.manage`` capability via
:class:`~apps.catalog.permissions.HasPlatformCapability` — never a raw
role-string comparison — and records a canonical ``tenant.intake.<verb>``
Audit_Event (global scope, ``institution_id=None``).
"""

from __future__ import annotations

from rest_framework import status
from drf_spectacular.utils import extend_schema
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.catalog.catalog_cache import invalidate_catalog_scopes
from apps.catalog.models import Intake
from apps.catalog.permissions import HasPlatformCapability
from apps.catalog.serializers import IntakeSerializer
from apps.catalog.tenant_audit_service import TenantAuditService

#: Intakes remain global, so every intake write requires the single
#: ``platform.intake.manage`` capability (mirrors
#: ``apps.catalog.views._INTAKE_WRITE_CAPABILITY``, R5.3/R8.1).
INTAKE_WRITE_CAPABILITY = "platform.intake.manage"


def _audit_intake_change(request, *, verb: str, entity_id) -> None:
    """Best-effort canonical ``tenant.intake.<verb>`` audit (global scope). Never raises."""
    try:
        TenantAuditService.record_config_change(
            resource="intake",
            verb=verb,
            entity_id=entity_id,
            institution_id=None,
            actor_id=getattr(request.user, "id", None),
            actor_role=getattr(request.user, "role", None),
            request=request,
        )
    except Exception:  # pragma: no cover - audit must never block a write
        pass


class AdminIntakeListCreateView(APIView):
    """``GET/POST /api/v1/admin/intakes/`` — canonical global intake management.

    * ``GET`` — list every intake (global calendar), newest year first.
    * ``POST`` — create an intake period. Validated by :class:`IntakeSerializer`.

    Both require ``platform.intake.manage`` (super-admin platform authority).
    """

    permission_classes = [HasPlatformCapability]
    required_capability = INTAKE_WRITE_CAPABILITY
    audit_resource_type = "intake"
    serializer_class = IntakeSerializer

    @extend_schema(operation_id="admin_intakes_list", responses=IntakeSerializer(many=True))
    def get(self, request):
        queryset = Intake.objects.all().order_by("-year", "name")
        serializer = IntakeSerializer(queryset, many=True)
        return Response({"success": True, "data": serializer.data})

    @extend_schema(
        operation_id="admin_intakes_create",
        request=IntakeSerializer,
        responses={201: IntakeSerializer},
    )
    def post(self, request):
        serializer = IntakeSerializer(data=request.data)
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
        intake = Intake.objects.create(**serializer.validated_data)
        invalidate_catalog_scopes(user=request.user)
        _audit_intake_change(request, verb="created", entity_id=intake.id)
        return Response(
            {"success": True, "data": IntakeSerializer(intake).data},
            status=status.HTTP_201_CREATED,
        )


class AdminIntakeDetailView(APIView):
    """``GET/PATCH/DELETE /api/v1/admin/intakes/{id}/`` — canonical intake detail.

    * ``GET`` — retrieve one intake.
    * ``PATCH`` — partial update (dates, capacity, activation).
    * ``DELETE`` — soft-deactivate (``is_active=False``).

    Every method requires ``platform.intake.manage``.
    """

    permission_classes = [HasPlatformCapability]
    required_capability = INTAKE_WRITE_CAPABILITY
    audit_resource_type = "intake"
    serializer_class = IntakeSerializer

    def _get(self, intake_id):
        return Intake.objects.filter(id=intake_id).first()

    @extend_schema(operation_id="admin_intakes_retrieve", responses=IntakeSerializer)
    def get(self, request, intake_id):
        intake = self._get(intake_id)
        if intake is None:
            return Response(
                {"success": False, "error": "Intake not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response({"success": True, "data": IntakeSerializer(intake).data})

    @extend_schema(
        operation_id="admin_intakes_partial_update",
        request=IntakeSerializer,
        responses=IntakeSerializer,
    )
    def patch(self, request, intake_id):
        intake = self._get(intake_id)
        if intake is None:
            return Response(
                {"success": False, "error": "Intake not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )
        serializer = IntakeSerializer(intake, data=request.data, partial=True)
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
        for attr, value in serializer.validated_data.items():
            setattr(intake, attr, value)
        intake.save()
        invalidate_catalog_scopes(user=request.user)
        verb = "deactivated" if request.data.get("is_active") in (False, "false", "False", 0, "0") else "updated"
        _audit_intake_change(request, verb=verb, entity_id=intake.id)
        return Response({"success": True, "data": IntakeSerializer(intake).data})

    @extend_schema(operation_id="admin_intakes_deactivate", request=None)
    def delete(self, request, intake_id):
        intake = self._get(intake_id)
        if intake is None:
            return Response(
                {"success": False, "error": "Intake not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )
        intake.is_active = False
        intake.save(update_fields=["is_active"])
        invalidate_catalog_scopes(user=request.user)
        _audit_intake_change(request, verb="deactivated", entity_id=intake.id)
        return Response({"success": True, "data": {"message": "Intake deactivated"}})


__all__ = [
    "AdminIntakeListCreateView",
    "AdminIntakeDetailView",
    "INTAKE_WRITE_CAPABILITY",
]
