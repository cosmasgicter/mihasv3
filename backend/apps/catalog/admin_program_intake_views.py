"""Admin ProgramIntake (Intake_Offering) create API (R8.1-R8.4, Phase 6).

Links a tenant's :class:`~apps.catalog.models.Program` offering to a global
:class:`~apps.catalog.models.Intake` period by creating a
:class:`~apps.catalog.models.ProgramIntake` junction row (the
**Intake_Offering** concept — see ``apps.catalog.services`` module docstring
and ``.kiro/steering/enterprise-tenancy.md`` -> "Program Offering Model",
which names ``Intake_Offering`` as platform-managed via
``platform.intake.manage``).

Intakes are global, exactly like the legacy ``IntakeListCreateView`` /
``IntakeDetailView`` write paths in ``apps/catalog/views.py``, so this endpoint
is gated by the single ``platform.intake.manage`` capability via
``HasPlatformCapability`` — never a raw role-string comparison (see
``AdminCapabilityService`` in ``apps/catalog/services.py``).
"""

from __future__ import annotations

import uuid

from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.catalog.models import Intake, Program, ProgramIntake
from apps.catalog.permissions import HasPlatformCapability
from apps.catalog.tenant_audit_service import TenantAuditService

#: Intakes remain global, so every ProgramIntake (Intake_Offering) write
#: requires the single ``platform.intake.manage`` capability (mirrors
#: ``apps.catalog.views._INTAKE_WRITE_CAPABILITY``, R5.3/R8.1).
PROGRAM_INTAKE_WRITE_CAPABILITY = "platform.intake.manage"


class AdminProgramIntakeCreateInputSerializer(serializers.Serializer):
    """Validate the ``program_id`` / ``intake_id`` request body (R8.2)."""

    program_id = serializers.UUIDField()
    intake_id = serializers.UUIDField()


class AdminProgramIntakeSerializer(serializers.ModelSerializer):
    """Read shape for a created ``ProgramIntake`` junction row.

    ``program_id`` / ``intake_id`` are declared explicitly so the response
    exposes the FK ids directly (matching the ``AdminMembershipSerializer`` /
    ``AdminAccessGrantSerializer`` convention in ``admin_serializers.py``)
    rather than nested objects.
    """

    program_id = serializers.UUIDField(read_only=True)
    intake_id = serializers.UUIDField(read_only=True)

    class Meta:
        model = ProgramIntake
        fields = [
            "id",
            "program_id",
            "intake_id",
            "max_capacity",
            "current_enrollment",
            "assignment_priority",
            "residency_rules",
            "is_active",
            "created_at",
        ]
        read_only_fields = fields


class AdminProgramIntakeCreateView(APIView):
    """``POST /api/v1/admin/program-intakes/`` — create an Intake_Offering (R8.1).

    Request body: ``program_id`` (UUID, must reference an existing active
    ``Program``), ``intake_id`` (UUID, must reference an existing active
    ``Intake``).

    * 201 — the junction row is created; response is the created object.
    * 404 ``PROGRAM_NOT_FOUND`` — ``program_id`` does not reference an
      existing active ``Program``.
    * 404 ``INTAKE_NOT_FOUND`` — ``intake_id`` does not reference an existing
      active ``Intake``.
    * 409 ``ALREADY_LINKED`` — a ``ProgramIntake`` row already links this
      exact ``(program_id, intake_id)`` pair.
    * 403 — the actor lacks ``platform.intake.manage`` (non-revealing, per
      ``.kiro/steering/enterprise-tenancy.md`` -> "Data-Leakage Prevention
      Rules"); enforced by ``HasPlatformCapability``, which also emits an
      ``auth.denied`` Audit_Event on denial.

    On success, a ``tenant.program_intake.created`` Audit_Event is emitted via
    :class:`TenantAuditService`, scoped to the offering's institution.
    """

    permission_classes = [HasPlatformCapability]
    required_capability = PROGRAM_INTAKE_WRITE_CAPABILITY
    audit_resource_type = "program_intake"
    serializer_class = AdminProgramIntakeCreateInputSerializer

    def post(self, request):
        input_serializer = AdminProgramIntakeCreateInputSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)
        program_id = input_serializer.validated_data["program_id"]
        intake_id = input_serializer.validated_data["intake_id"]

        try:
            program = Program.objects.get(id=program_id, is_active=True)
        except Program.DoesNotExist:
            return Response(
                {
                    "success": False,
                    "error": "Program not found or is not active.",
                    "code": "PROGRAM_NOT_FOUND",
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            intake = Intake.objects.get(id=intake_id, is_active=True)
        except Intake.DoesNotExist:
            return Response(
                {
                    "success": False,
                    "error": "Intake not found or is not active.",
                    "code": "INTAKE_NOT_FOUND",
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        # Uniqueness (R8.2): no DB-level unique constraint exists on
        # (program_id, intake_id) in the ``program_intakes`` schema, so the
        # pair is checked explicitly here — any existing row (active or not)
        # for this exact pair is treated as already linked.
        if ProgramIntake.objects.filter(program_id=program.id, intake_id=intake.id).exists():
            return Response(
                {
                    "success": False,
                    "error": "This program is already linked to this intake.",
                    "code": "ALREADY_LINKED",
                },
                status=status.HTTP_409_CONFLICT,
            )

        program_intake = ProgramIntake.objects.create(
            id=uuid.uuid4(),
            program=program,
            intake=intake,
            is_active=True,
            created_at=timezone.now(),
        )

        TenantAuditService.record_config_change(
            resource="program_intake",
            verb="created",
            entity_id=program_intake.id,
            institution_id=program.institution_id,
            actor_id=getattr(request.user, "id", None),
            actor_role=getattr(request.user, "role", None),
            metadata={"program_id": str(program.id), "intake_id": str(intake.id)},
            request=request,
        )

        return Response(
            {"success": True, "data": AdminProgramIntakeSerializer(program_intake).data},
            status=status.HTTP_201_CREATED,
        )


__all__ = [
    "AdminProgramIntakeCreateView",
    "AdminProgramIntakeCreateInputSerializer",
    "AdminProgramIntakeSerializer",
    "PROGRAM_INTAKE_WRITE_CAPABILITY",
]
