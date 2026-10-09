"""Admin-facing application views.

Extracted during the views module split (production-readiness-hardening, task 9.1).
Contains views for application listing, review, bulk status, export, grading,
reviewer assignment, auto-assign, fee waivers, amendment review, and condition verification.
"""

import csv
import hashlib
import io
import logging

from django.db import transaction
from django.conf import settings
from django.utils import timezone
from drf_spectacular.utils import (
    OpenApiParameter,
    OpenApiResponse,
    OpenApiTypes,
    extend_schema,
    extend_schema_view,
)
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsAdmin, IsOwnerOrAdmin, IsSuperAdmin, is_super_admin
from apps.applications.document_intelligence import DocumentIntelligence
from apps.applications.filters import ApplicationFilter, annotate_activity_at
from apps.applications.models import (
    Application,
    ApplicationCondition,
    ApplicationStatusHistory,
)
from apps.applications.review_queue import ReviewQueueScorer
from apps.applications.serializers import (
    ApplicationBulkStatusSerializer,
    ApplicationCreateSerializer,
    ApplicationListSerializer,
    ApplicationReviewSerializer,
    ApplicationSerializer,
    PaymentStatusUpdateSerializer,
    # T15 API remediation
    ApplicationAmendmentReviewRequestSerializer,
    ApplicationAssignRequestSerializer,
    ApplicationAutoAssignRequestSerializer,
    ApplicationEnvelopeResponseSerializer,
    ApplicationFeeWaiverRequestSerializer,
)
from apps.applications.services import (
    ApplicationSubmissionError,
    submit_application,
    transition_application_status,
)
from apps.common.communication_service import CommunicationService
from apps.common.idempotency import idempotent
from apps.common.openapi_helpers import ErrorResponseSerializer
from apps.common.pagination import StandardPagination
from apps.documents.models import ApplicationDocument, ApplicationGrade, Payment

from ._view_helpers import (
    ApplicationBulkStatusResponseSerializer,
    ApplicationConditionSerializer,
    ApplicationListResponseSerializer,
    ApplicationResponseSerializer,
    ApplicationReviewResponseSerializer,
    ConditionVerifyRequestSerializer,
    _generate_application_number,
    _generate_tracking_code,
    _staff_can_access_application,
    _with_payment_summary,
)

logger = logging.getLogger(__name__)


def _redact_name(value: str | None) -> str:
    value = (value or "").strip()
    if not value:
        return ""
    parts = value.split()
    return " ".join(f"{part[:1]}***" for part in parts)


def _redact_email(value: str | None) -> str:
    value = (value or "").strip()
    if "@" not in value:
        return "***"
    local, domain = value.split("@", 1)
    return f"{local[:1]}***@{domain}"


def _redact_phone(value: str | None) -> str:
    digits = "".join(ch for ch in (value or "") if ch.isdigit())
    if len(digits) <= 4:
        return "***"
    return f"***{digits[-4:]}"




# ---------------------------------------------------------------------------
# Amendment Review (Req 14.7)
# ---------------------------------------------------------------------------


class ApplicationAmendmentReviewView(APIView):
    """Review (approve/reject) an amendment.

    POST /api/v1/applications/{id}/amendments/{aid}/review/
    Admin only.

    Requirements: 14.7
    """

    # R3.1/R3.2: derived tenant.application.review capability + scope-before-lookup.
    permission_classes = [IsAuthenticated]
    serializer_class = ApplicationAmendmentReviewRequestSerializer

    @extend_schema(
        request=ApplicationAmendmentReviewRequestSerializer,
        responses={
            200: OpenApiResponse(response=ApplicationEnvelopeResponseSerializer),
            400: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
        tags=["applications"],
        summary="Approve or reject an amendment request (admin only)",
    )
    def post(self, request, application_id, amendment_id):
        from apps.applications.amendment_service import AmendmentError, AmendmentService
        from apps.applications.review_workspace_service import (
            ApplicationReviewWorkspaceService,
            read_expected_version,
        )
        from apps.common.tenant_authorization import resolve_scoped_application

        data = request.data or {}
        target_status = data.get("status")

        if target_status not in ("approved", "rejected"):
            return Response(
                {
                    "success": False,
                    "error": "status must be 'approved' or 'rejected'.",
                    "code": "VALIDATION_ERROR",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Scope **before** lookup (task 9.4, R3.2). This used to fetch the row and
        # then ask ``_staff_can_access_application`` whether the actor was allowed
        # to have it — the mask was right, but the row was read first, and an
        # unassigned Reviewer was never restricted at all. One seam now decides
        # all three: a Student, an out-of-tenant id, an unknown id, and an
        # application a Reviewer is not assigned to are one indistinguishable 404,
        # and an in-scope actor without tenant.application.review is a
        # non-revealing 403.
        application = resolve_scoped_application(
            request,
            application_id,
            capability="tenant.application.review",
        )

        # Versioned command (task 9.4): approving an amendment changes the answers
        # a decision would be made on, so a stale command is refused rather than
        # applied under a reviewer who cannot see it.
        expected_version = read_expected_version(request)
        ApplicationReviewWorkspaceService.assert_version(application, expected_version)

        try:
            amendment = AmendmentService.review_amendment(
                amendment_id=str(amendment_id),
                status=target_status,
                admin_id=str(request.user.id),
                application_id=str(application_id),
            )
        except AmendmentError as exc:
            return Response(
                {"success": False, "error": exc.message, "code": exc.code},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # R10.5/R10.8: an amendment decision is a tenant-sensitive write, so it is
        # auditable for the school that owns the application. Never blocks the
        # response — TenantAuditService swallows writer failures.
        try:
            from apps.catalog.tenant_audit_service import TenantAuditService

            TenantAuditService.record_amendment_review(
                amendment_id=amendment.id,
                application_id=application.id,
                institution_id=getattr(application, "institution_ref_id", None),
                field_name=amendment.field_name,
                outcome_status=amendment.status,
                actor_id=getattr(request.user, "id", None),
                actor_role=getattr(request.user, "role", None),
                reason=(data.get("notes") or data.get("reason") or ""),
                request=request,
            )
        except Exception:  # pragma: no cover - audit must never block a write
            pass

        new_version = ApplicationReviewWorkspaceService.bump_version(application)
        return Response({
            "success": True,
            "data": {
                "amendment_id": str(amendment.id),
                "application_id": str(application_id),
                "field_name": amendment.field_name,
                "new_value": amendment.new_value,
                "status": amendment.status,
                "version": new_version,
                "allowed_transitions": ApplicationReviewWorkspaceService.allowed_transitions(application),
            },
        })


# ---------------------------------------------------------------------------
# Condition Verify — the deprecated two-outcome front door (task 10.6)
# ---------------------------------------------------------------------------


class ApplicationConditionVerifyView(APIView):
    """Verify a condition as met or waived — **deprecated**.

    ``POST /api/v1/applications/{id}/conditions/{cid}/verify/``

    Deprecated in favour of the canonical three-outcome command
    ``POST /api/v1/applications/{id}/conditions/{cid}/review/``
    (admissions-v2 task **10.6**, R13.9 / R13.13, findings **STU-23** /
    **MAINT-01**).

    Two staff front doors decided one thing. Task 10.2 made them share the one
    ``ConditionStateMachine``, so they could not disagree about which conditions
    were *decidable* — but they were still two implementations of the decision
    itself, and the shorter one was missing three things the canonical one does:

    * the third outcome. ``changes_required`` is the STU-16 dead end: a reviewer
      who needed something different from the applicant had to either accept
      unsuitable evidence or reject the whole offer;
    * the append-only **evidence history** row against the version being judged
      (``document_evidence.record_event``), so "which upload was this verdict
      about" had no answer through this door;
    * the reviewer's **reason**, which is what the student reads.

    So this view no longer decides anything. It normalises its own two-outcome
    request into the canonical command and delegates, which makes
    ``condition_evidence_service.review_condition`` the single implementation.
    The route stays, unremoved, for the measured V1 window R2.5/R13.5 require —
    it answers with deprecation headers naming its successor.

    **Two contract details are preserved deliberately**, because a deprecated
    route that changes its own rules is worse than one that is merely old:

    * ``waived`` still needs **no** reason here. The canonical command requires
      one (design §11.2's "explicit authorized reason"); an existing caller of
      this route never sent one, so a documented fallback reason is recorded
      instead of turning their working request into a 400;
    * the response is still ``ApplicationConditionSerializer``'s shape plus
      ``version`` and ``allowed_transitions``, not the canonical read-back
      payload.

    Requirements: 5.10, R13.9, R13.13.
    """

    # R3.1/R3.2: derived tenant.application.review capability + scope-before-lookup.
    permission_classes = [IsAuthenticated]
    serializer_class = ConditionVerifyRequestSerializer

    #: What is recorded when a legacy caller waives a condition without saying
    #: why. Stated as a constant so the audit trail and the student-facing note
    #: are honest about where the sentence came from, rather than looking like a
    #: reviewer wrote it.
    LEGACY_WAIVER_REASON = (
        "Waived by the admissions team through the deprecated verify endpoint; "
        "no reason was recorded."
    )

    def post(self, request, application_id, condition_id):
        from apps.applications import condition_evidence_service as conditions
        from apps.applications.review_workspace_service import (
            ApplicationReviewWorkspaceService,
            read_expected_version,
        )
        from apps.common.tenant_authorization import resolve_scoped_application

        # Scope **before** lookup (task 9.4, R3.2) — see the amendment command
        # above. One seam masks a Student, an out-of-tenant id, an unknown id and
        # an application an assignment-scoped Reviewer is not assigned to.
        application = resolve_scoped_application(
            request,
            application_id,
            capability="tenant.application.review",
        )

        # Versioned command (task 9.4): waiving a mandatory condition is the
        # difference between a conditional and an unconditional place, so it may
        # not be applied from a stale view.
        ApplicationReviewWorkspaceService.assert_version(
            application, read_expected_version(request)
        )

        serializer = ConditionVerifyRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return _with_condition_deprecation_headers(
                Response(
                    {
                        "success": False,
                        "error": "Validation failed",
                        "code": "VALIDATION_ERROR",
                        "details": serializer.errors,
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            )

        target_status = serializer.validated_data["status"]

        # This route's published request body is ``{status}`` and always was —
        # ``ConditionVerifyRequestSerializer`` declares nothing else, so a caller
        # has never been able to send a reason through this door. It is not given
        # one on the way out either: a deprecated route that grows an input field
        # is a surface being extended, not retired. An extra key in the body is
        # *ignored* rather than rejected (DRF's default), so a legacy caller that
        # sends one is unaffected — `test_an_extra_body_key_is_ignored_not_rejected`.
        #
        # The canonical command still needs a reason for the outcomes design
        # §11.2 requires one for, so the documented fallback is recorded and it
        # says where it came from rather than reading as if a reviewer wrote it.
        reason = ""
        if target_status in conditions.ConditionStateMachine.OUTCOMES_REQUIRING_REASON:
            reason = self.LEGACY_WAIVER_REASON

        try:
            condition = conditions.resolve_condition(application, condition_id)
            conditions.review_condition(
                application=application,
                condition=condition,
                outcome=target_status,
                reason=reason,
                actor_id=getattr(request.user, "id", None),
                actor_role=getattr(request.user, "role", None),
                request=request,
            )
        except conditions.ConditionEvidenceError as exc:
            # The canonical refusals, mapped back onto the stable codes a legacy
            # caller of *this* route branches on. ``CONDITION_NOT_PENDING`` was
            # this door's answer for an already-resolved condition and stays it.
            code = exc.code
            http_status = exc.status_code
            if code in ("CONDITION_ALREADY_RESOLVED", "CONDITION_TRANSITION_REJECTED"):
                code = "CONDITION_NOT_PENDING"
                http_status = status.HTTP_400_BAD_REQUEST
            return _with_condition_deprecation_headers(
                Response(
                    {"success": False, "error": exc.message, "code": code},
                    status=http_status,
                )
            )

        # Re-read rather than trust the in-memory row: the canonical command may
        # itself promote or reject the application (all conditions resolved), so
        # the published status and transitions must come from the database (R8.4).
        condition.refresh_from_db()
        application.refresh_from_db(fields=["status"])
        data = ApplicationConditionSerializer(condition).data
        data["version"] = ApplicationReviewWorkspaceService.bump_version(application)
        data["allowed_transitions"] = ApplicationReviewWorkspaceService.allowed_transitions(
            application
        )
        return _with_condition_deprecation_headers(
            Response({"success": True, "data": data})
        )


def _with_condition_deprecation_headers(response):
    """Point a legacy condition-verify caller at the canonical route (R2.5).

    Task 12.2 (R2.6, R14.7) added the RFC 8594 ``Sunset`` date. Task 10.6
    deprecated this route on its **first** zero-use reading and said in its own
    evidence that removal "needs a window that starts with this task's
    measurement, not one that ends with it". Task 12.2 is the second reading, so
    the window now has an announced end, registered with an owner and exit
    criteria in ``apps.common.compatibility_register``. A ``Deprecation`` with no
    ``Sunset`` is an open-ended exemption; this closes it without removing a
    published staff route a school's own integration may still call.
    """
    response["Deprecation"] = "true"
    response["Link"] = (
        "</api/v1/applications/{id}/conditions/{cid}/review/>; "
        'rel="successor-version"'
    )
    try:
        from apps.common.compatibility_register import sunset_for

        response["Sunset"] = sunset_for("applications.condition_verify")
    except Exception:  # pragma: no cover - a header must never break the decision
        pass
    return response
