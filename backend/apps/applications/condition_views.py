"""Condition evidence endpoints (task 10.2, R13.9, finding STU-16).

Three surfaces, three authorities, one service:

* ``GET  /api/v1/applications/{id}/conditions/{cid}/`` — owner **or**
  capability-scoped staff. One condition with its state definition, evidence
  versions, comments, review reason, history, and the actions the reader may
  take next.
* ``POST /api/v1/applications/{id}/conditions/{cid}/evidence/`` — **owner only**
  (multipart). Attach or replace this condition's evidence, with an optional
  note. A valid-but-non-owned id is the canonical 404 mask (AUTH-07).
* ``POST /api/v1/applications/{id}/conditions/{cid}/review/`` — staff holding
  ``tenant.application.review``, resolved through ``AdminCapabilityService``
  with scope **before** lookup. Verify, request changes (with a reason the
  student is shown), or waive.

The views hold no lifecycle logic: every decision lives in
:mod:`apps.applications.condition_evidence_service`, which is the one authority
for the condition state machine, the evidence pipeline, the audit record and the
messages. This is the same split 9.5 used for the audit feed — an endpoint that
holds query or transition logic becomes a second implementation of it.
"""

import logging

from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import serializers, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.applications import condition_evidence_service as conditions
from apps.common.object_authorization import (
    actor_owns_application,
    resolve_owned_application,
)
from apps.common.openapi_helpers import ErrorResponseSerializer

logger = logging.getLogger(__name__)


class ConditionEvidenceRequestSerializer(serializers.Serializer):
    """Documents the multipart body; the service performs the validation."""

    file = serializers.FileField(help_text="PDF, JPEG or PNG evidence for this condition.")
    comment = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=conditions.MAX_COMMENT_CHARS,
        help_text="Optional note explaining the evidence.",
    )


class ConditionReviewRequestSerializer(serializers.Serializer):
    outcome = serializers.ChoiceField(
        choices=sorted(conditions.ConditionStateMachine.REVIEW_OUTCOMES),
        help_text="met (accept), changes_required (ask for something else), or waived.",
    )
    reason = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=conditions.ConditionStateMachine.MAX_REASON_CHARS,
        help_text="Required for changes_required and waived; shown to the applicant.",
    )


def _error(exc: conditions.ConditionEvidenceError) -> Response:
    """One refusal shape for every condition command."""
    return Response(
        {"success": False, "error": exc.message, "code": exc.code},
        status=exc.status_code,
    )


class ApplicationConditionDetailView(APIView):
    """GET one condition with its evidence and history.

    Owner or capability-scoped staff: the application is resolved through the
    owner disclosure policy first, so a non-owned application id is the canonical
    404 mask, and the condition is then looked up **within that application** —
    a condition id from another application cannot be confirmed to exist.
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(
        # Named explicitly so it cannot collide with the conditions *list* read and
        # be resolved with a numeral suffix (R14.2: the schema describes actual
        # behaviour, and a generated suffix describes nothing).
        operation_id="applications_condition_retrieve",
        request=None,
        responses={
            200: OpenApiResponse(description="One condition with evidence and history."),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
        tags=["applications"],
        summary="Read one admission condition with its evidence, comments and history",
    )
    def get(self, request, application_id, condition_id):
        application, denied = resolve_owned_application(
            request, application_id, allow_scoped_staff=True
        )
        if denied is not None:
            return denied

        try:
            condition = conditions.resolve_condition(application, condition_id)
        except conditions.ConditionEvidenceError as exc:
            return _error(exc)

        is_owner = actor_owns_application(application, request.user)
        payload = conditions.conditions_payload(application, [condition], is_owner=is_owner)[0]
        payload["vocabulary"] = conditions.condition_vocabulary()
        return Response({"success": True, "data": payload})


class ApplicationConditionEvidenceView(APIView):
    """POST evidence (or a replacement) for one condition — owner only.

    Owner-only for the same reason the withdraw and amendment-request commands
    are: this is the applicant's own evidence about their own offer. Staff who
    need to attach something use the document endpoints under their own
    capability; letting them post *as* the student here would make the provenance
    on the version row untrue.
    """

    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]
    serializer_class = ConditionEvidenceRequestSerializer

    @extend_schema(
        operation_id="applications_condition_evidence_submit",
        request=ConditionEvidenceRequestSerializer,
        responses={
            201: OpenApiResponse(description="The condition, with its new current evidence."),
            400: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
            409: OpenApiResponse(response=ErrorResponseSerializer),
        },
        tags=["applications"],
        summary="Submit or replace the evidence for one admission condition (owner only)",
    )
    def post(self, request, application_id, condition_id):
        application, denied = resolve_owned_application(
            request, application_id, allow_scoped_staff=False
        )
        if denied is not None:
            return denied

        try:
            condition = conditions.resolve_condition(application, condition_id)
            payload = conditions.submit_evidence(
                application=application,
                condition=condition,
                file_obj=request.FILES.get("file"),
                comment=(request.data or {}).get("comment", ""),
                actor_id=getattr(request.user, "id", None),
                actor_role=getattr(request.user, "role", "student"),
                idempotency_key=request.headers.get("Idempotency-Key") or None,
                request=request,
            )
        except conditions.ConditionEvidenceError as exc:
            return _error(exc)

        return Response({"success": True, "data": payload}, status=status.HTTP_201_CREATED)


class ApplicationConditionReviewView(APIView):
    """POST a review outcome for one condition — staff, capability-derived.

    Three outcomes, not two: ``changes_required`` is what STU-16 was missing, and
    it carries the reason the student reads. Authority is
    ``tenant.application.review`` resolved through ``AdminCapabilityService``,
    with scope before lookup — the same seam the amendment review and the
    two-outcome ``verify`` command use, so no role string is compared here.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = ConditionReviewRequestSerializer

    @extend_schema(
        operation_id="applications_condition_review",
        request=ConditionReviewRequestSerializer,
        responses={
            200: OpenApiResponse(description="The condition after the decision."),
            400: OpenApiResponse(response=ErrorResponseSerializer),
            403: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
            409: OpenApiResponse(response=ErrorResponseSerializer),
        },
        tags=["applications"],
        summary="Verify, request changes on, or waive one admission condition",
    )
    def post(self, request, application_id, condition_id):
        from apps.applications.review_workspace_service import (
            ApplicationReviewWorkspaceService,
            read_expected_version,
        )
        from apps.common.tenant_authorization import resolve_scoped_application

        application = resolve_scoped_application(
            request, application_id, capability="tenant.application.review"
        )

        # Versioned command (task 9.4): a condition decision changes the answers a
        # later decision is made on, so a stale command is refused rather than
        # applied from a view the reviewer can no longer see.
        ApplicationReviewWorkspaceService.assert_version(
            application, read_expected_version(request)
        )

        serializer = ConditionReviewRequestSerializer(data=request.data or {})
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

        try:
            condition = conditions.resolve_condition(application, condition_id)
            payload = conditions.review_condition(
                application=application,
                condition=condition,
                outcome=serializer.validated_data["outcome"],
                reason=serializer.validated_data.get("reason", ""),
                actor_id=getattr(request.user, "id", None),
                actor_role=getattr(request.user, "role", None),
                request=request,
            )
        except conditions.ConditionEvidenceError as exc:
            return _error(exc)

        application.refresh_from_db(fields=["status"])
        payload["version"] = ApplicationReviewWorkspaceService.bump_version(application)
        payload["allowed_transitions"] = ApplicationReviewWorkspaceService.allowed_transitions(
            application
        )
        return Response({"success": True, "data": payload})


__all__ = [
    "ApplicationConditionDetailView",
    "ApplicationConditionEvidenceView",
    "ApplicationConditionReviewView",
    "ConditionEvidenceRequestSerializer",
    "ConditionReviewRequestSerializer",
]
