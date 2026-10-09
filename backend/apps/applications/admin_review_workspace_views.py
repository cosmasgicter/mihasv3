"""The one admin review-workspace detail query (task 9.4).

Spec: ``.kiro/specs/admissions-v2-canonical-rebuild/`` task 9.4 — "Build one
deterministic admin review workspace".
Requirements: **R8.5** (the review surface shows canonical identity, submitted
answers, evidence, payment, interview, communication, and history without
requiring parallel legacy detail calls), **R8.2**/**R8.3** (authority matrix),
**R11.3** (the reviewer readiness query is served by deterministic services).
Findings: **AUTH-01**, **AUTH-02**, **API-02**, **MAINT-01**.
Design: §11.1 — one application detail query returning structured sections and
versions; commands stay separate.

One route, one read
-------------------
``GET /api/v1/admin/applications/{application_id}/`` replaces the six requests
the workspace used to issue (``/details/``, ``/documents/``, ``/grades/``,
``/summary/``, ``/interviews/``, ``/payments/?application_id=``) plus the
generative ``/admin-summary/`` task 7.4 deleted. It returns named sections, the
deterministic readiness checklist, the actor's command authority, the allowed
transitions, and the **version** every command must carry.

Authority is ``tenant.application.read`` resolved through
``AdminCapabilityService``, composed with scope-before-lookup and the Reviewer
assignment restriction — the same ``resolve_scoped_application`` seam every
application command already uses (task 2.2). A Student, an out-of-tenant actor,
an unassigned Reviewer and an unknown id are one indistinguishable **404**.

This view holds no domain logic. Everything it answers comes from
:class:`~apps.applications.review_workspace_service.ApplicationReviewWorkspaceService`.
"""

from __future__ import annotations

import logging

from drf_spectacular.utils import (
    OpenApiParameter,
    OpenApiResponse,
    OpenApiTypes,
    extend_schema,
    extend_schema_view,
)
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.applications.models import Application
from apps.applications.review_workspace_service import (
    READ_CAPABILITY,
    ApplicationReviewWorkspaceService,
)
from apps.common.openapi_helpers import ErrorResponseSerializer
from apps.common.tenant_authorization import resolve_scoped_application

logger = logging.getLogger(__name__)


class ReviewWorkspaceResponseSerializer(serializers.Serializer):
    """Documents the workspace payload shape (design §11.1) for the schema."""

    application_id = serializers.CharField()
    version = serializers.IntegerField()
    status = serializers.CharField()
    identity = serializers.DictField()
    answers = serializers.DictField()
    assignment = serializers.DictField()
    evidence = serializers.DictField()
    payment = serializers.DictField()
    interview = serializers.DictField()
    conditions = serializers.DictField()
    amendments = serializers.DictField()
    communication = serializers.DictField()
    history = serializers.DictField()
    readiness = serializers.DictField(allow_null=True)
    allowed_next_actions = serializers.ListField(child=serializers.DictField())
    allowed_transitions = serializers.ListField(child=serializers.CharField())
    capabilities = serializers.DictField(child=serializers.BooleanField())
    redaction = serializers.DictField()
    definitions = serializers.DictField(child=serializers.CharField())
    row_limit = serializers.IntegerField()


@extend_schema_view(
    get=extend_schema(
        operation_id="admin_application_review_workspace",
        tags=["admin"],
        summary="One structured application detail + readiness query",
        description=(
            "The whole admin review workspace for one application in a single "
            "read: canonical identity, submitted answers, canonical assignment, "
            "evidence (current document versions and persisted grades), the "
            "canonical payment ledger, interviews, offer conditions, amendment "
            "requests, communication, status history, and the **deterministic** "
            "reviewer readiness checklist. No generative model is involved. "
            "``readiness`` is null — never a zeroed checklist — when the "
            "canonical configuration could not be evaluated. ``version`` is the "
            "value every workspace command must carry; a command supplying an "
            "older version is refused with VERSION_CONFLICT (409)."
        ),
        parameters=[
            OpenApiParameter(
                "application_id",
                OpenApiTypes.UUID,
                OpenApiParameter.PATH,
                description="Application UUID. Out-of-scope, unassigned-for-a-Reviewer, and unknown ids are one indistinguishable 404.",
            ),
        ],
        responses={
            200: OpenApiResponse(response=ReviewWorkspaceResponseSerializer),
            401: OpenApiResponse(response=ErrorResponseSerializer),
            403: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
    )
)
class AdminApplicationReviewWorkspaceView(APIView):
    """GET /api/v1/admin/applications/{application_id}/ — the one detail query."""

    permission_classes = [IsAuthenticated]
    serializer_class = ReviewWorkspaceResponseSerializer
    audit_resource_type = "application"

    def get(self, request, application_id):
        application = resolve_scoped_application(
            request,
            application_id,
            capability=READ_CAPABILITY,
            queryset=Application.objects.select_related(
                "user",
                "institution_ref",
                "canonical_program",
                "program_offering",
                "intake_ref",
                "assigned_reviewer_id",
                "admin_feedback_by",
                "reviewed_by",
            ),
        )

        payload = ApplicationReviewWorkspaceService.detail(
            application, user=request.user
        )
        response = Response({"success": True, "data": payload})
        # design §11.1 asks for "structured sections and ETags/versions". The
        # version is in the body (a command carries it) and on the wire as a weak
        # ETag, so a conditional GET has something to quote without the client
        # inventing a hash of a payload it does not own.
        response["ETag"] = f'W/"{payload["version"]}"'
        return response


__all__ = [
    "AdminApplicationReviewWorkspaceView",
    "ReviewWorkspaceResponseSerializer",
]
