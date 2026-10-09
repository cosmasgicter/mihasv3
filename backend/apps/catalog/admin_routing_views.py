"""Tenant routing-simulation admin view.

``POST /api/v1/admin/routing/simulate/`` — a dry run of the canonical
:class:`~apps.catalog.services.OfferingAssignmentService` that creates no
application row. Split out of ``admin_views.py`` by task 12.1; the view is the
one that was there, lifted verbatim.
"""

from __future__ import annotations

from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsAdmin
from apps.catalog._admin_view_helpers import _forbidden_write_response, _write_allowed
from apps.catalog.admin_serializers import AdminRoutingSimulationSerializer
from apps.catalog.models import CanonicalProgram, Intake, ProgramIntake
from apps.catalog.services import (
    InstitutionContextService,
    OfferingAssignmentError,
    OfferingAssignmentService,
)

class AdminRoutingSimulateView(APIView):
    """POST /api/v1/admin/routing/simulate/ - dry-run the real assignment service.

    Tenant onboarding "Test routing" simulator (R11.3): given a canonical
    ``program_id`` + ``intake_id`` (plus optional ``country``/``nationality``
    and white-label ``institution_id``), this re-runs the canonical
    :class:`OfferingAssignmentService` and returns *exactly* the offering it
    would assign for the same inputs — it never reimplements the routing logic.
    The result is read-only (no application row is created) and carries enough
    detail for an operator to understand *why* an offering was (or was not)
    chosen.

    Gated by ``platform.routing.simulate_all`` because routing config spans
    every school; unauthorized actors receive the same FORBIDDEN response used
    by every other tenant write surface.
    """

    permission_classes = [IsAdmin]
    serializer_class = AdminRoutingSimulationSerializer

    @extend_schema(
        operation_id="admin_routing_simulate",
        tags=["admin"],
        request=AdminRoutingSimulationSerializer,
        responses={200: OpenApiResponse(description="Assignment result or NO_ELIGIBLE_OFFERING failure detail.")},
    )
    def post(self, request):
        if not _write_allowed(request.user, "platform.routing.simulate_all"):
            return _forbidden_write_response()
        serializer = AdminRoutingSimulationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = serializer.validated_data

        program_id = str(payload["program_id"])
        intake_id = str(payload["intake_id"])
        country = payload.get("country") or None
        nationality = payload.get("nationality") or None
        host = payload.get("host") or None
        institution_id = str(payload["institution_id"]) if payload.get("institution_id") else None
        resolved_institution_id = None
        if host:
            context = InstitutionContextService().resolve(host)
            if context.portal_type == "white_label" and context.institution is not None:
                resolved_institution_id = str(context.institution.id)
                if institution_id is None:
                    institution_id = resolved_institution_id

        inputs = {
            "program_id": program_id,
            "intake_id": intake_id,
            "country": country,
            "nationality": nationality,
            "institution_id": institution_id,
            "host": host,
            "resolved_institution_id": resolved_institution_id,
        }

        try:
            assigned = OfferingAssignmentService().assign(
                program_id=program_id,
                intake_id=intake_id,
                country=country,
                nationality=nationality,
                institution_id=institution_id,
            )
        except OfferingAssignmentError as exc:
            return Response(
                {
                    "success": True,
                    "data": {
                        "assigned": False,
                        "inputs": inputs,
                        "error": {
                            "code": getattr(exc, "code", "NO_ELIGIBLE_OFFERING"),
                            "message": str(exc),
                        },
                    },
                }
            )
        except (CanonicalProgram.DoesNotExist, Intake.DoesNotExist):
            return Response(
                {
                    "success": True,
                    "data": {
                        "assigned": False,
                        "inputs": inputs,
                        "error": {
                            "code": "NO_ELIGIBLE_OFFERING",
                            "message": "The selected program or intake is not active or does not exist.",
                        },
                    },
                }
            )

        offering = assigned.offering
        institution = assigned.institution
        program_intake = ProgramIntake.objects.filter(
            program_id=offering.id, intake_id=assigned.intake.id
        ).first()

        return Response(
            {
                "success": True,
                "data": {
                    "assigned": True,
                    "inputs": inputs,
                    "program_id": str(assigned.canonical_program.id),
                    "program_name": assigned.canonical_program.name,
                    "intake_id": str(assigned.intake.id),
                    "intake_name": assigned.intake.name,
                    "program_offering_id": str(offering.id),
                    "offering_code": offering.code,
                    "offering_name": offering.name,
                    "institution_id": str(institution.id),
                    "institution": {
                        "id": str(institution.id),
                        "name": institution.brand_name or institution.name,
                        "full_name": institution.full_name or institution.name,
                        "code": institution.code,
                    },
                    # Routing decision factors so an operator can see *why* this
                    # offering won (lower priority numbers win during sort).
                    "decision": {
                        "offering_priority": offering.assignment_priority,
                        "program_intake_priority": (
                            program_intake.assignment_priority if program_intake else None
                        ),
                        "offering_status": offering.offering_status,
                    },
                    "required_documents": assigned.required_documents,
                },
            }
        )
