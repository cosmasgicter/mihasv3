"""Admin-facing application views.

Extracted during the views module split (production-readiness-hardening, task 9.1).
Contains views for application listing, review, bulk status, export, grading,
reviewer assignment, auto-assign, fee waivers, amendment review, and condition verification.
"""

import csv
import hashlib
import io
import logging

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
from apps.accounts.session_lifecycle import revoke_sessions_for_authority_change
from apps.applications.document_intelligence import DocumentIntelligence
from apps.applications.filters import ApplicationFilter, annotate_activity_at
from apps.applications.models import (
    Application,
    ApplicationCondition,
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
# Reviewer Assignment (Req 11 / Admissions V2 task 2.5, AUTH-01/AUTH-03)
# ---------------------------------------------------------------------------


def _notify_reviewer_assigned(app, reviewer_id, *, auto: bool) -> None:
    """Best-effort in-app notification for a newly-assigned reviewer."""
    try:
        from apps.common.outbox import create_notification

        if auto:
            message = (
                f"Application {app.application_number} has been assigned to you "
                "for review."
            )
            notif_type = "assignment"
        else:
            message = (
                f"Application {app.application_number} for {app.program} "
                f"({app.intake}) has been assigned to you for review."
            )
            notif_type = "info"
        create_notification(
            user_id=reviewer_id,
            title="Application Assigned to You" if not auto else "Application Assigned",
            message=message,
            type=notif_type,
            priority="normal",
            action_url=f"/admin/applications/{app.id}",
        )
    except Exception:
        logger.warning(
            "Failed to notify reviewer %s for app=%s", reviewer_id, app.id, exc_info=True
        )


class AssignmentCandidatesView(APIView):
    """List tenant-scoped reviewer candidates for an application (R8.2).

    GET /api/v1/applications/{id}/assignment-candidates/?search=<q>

    Returns only members eligible to review for the application's tenant
    (active membership + reviewer-capable role), so the assignment UI never has
    to post a raw or empty reviewer id (AUTH-03).

    Authority (admissions-v2 task 9.4, AUTH-02/AUTH-03): the derived
    ``tenant.application.review`` capability for **this application's**
    institution, composed with scope-before-lookup. This used to be
    ``IsSuperAdmin`` — a raw role class — which meant a Tenant_Admin could not
    staff their own review queue at all. Design §5.3 puts reviewer assignment
    behind "active membership in the application's tenant and an eligible
    reviewer policy", and ``ReviewerAssignmentService`` enforces the eligible-
    member half under row locks, so no cross-tenant reviewer can be selected
    however the actor is authorised.

    Requirements: R8.2, R8.3, R3
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(
        responses={
            200: OpenApiResponse(response=ApplicationEnvelopeResponseSerializer),
            403: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
        tags=["applications"],
        summary="List eligible reviewer candidates for an application",
    )
    def get(self, request, application_id):
        from apps.applications.reviewer_assignment_service import ReviewerAssignmentService
        from apps.common.tenant_authorization import resolve_scoped_application

        app = resolve_scoped_application(
            request,
            application_id,
            capability="tenant.application.review",
            # An assignment-scoped Reviewer is not restricted to their own
            # assigned work here: choosing *who* reviews is a queue-staffing act,
            # and a Reviewer who holds the review capability but has not been
            # assigned this application would otherwise be unable to see the
            # candidate list for work they are being asked to hand over.
            enforce_reviewer_assignment=False,
        )

        institution_id = app.institution_ref_id
        if not institution_id:
            # No tenant to scope candidates to → empty candidate set (fail
            # closed: never fall back to a global reviewer list).
            return Response({"success": True, "data": []})

        search = request.query_params.get("search")
        candidates = (
            ReviewerAssignmentService.eligible_reviewers_queryset(
                [institution_id], search=search
            )
            .order_by("first_name", "last_name", "email")
            .values("id", "email", "first_name", "last_name", "role")[:50]
        )

        data = [
            {
                "id": str(row["id"]),
                "email": row["email"],
                "first_name": row["first_name"] or "",
                "last_name": row["last_name"] or "",
                "full_name": (
                    f"{row['first_name'] or ''} {row['last_name'] or ''}".strip()
                    or row["email"]
                ),
                "role": row["role"],
            }
            for row in candidates
        ]
        return Response({"success": True, "data": data})


class ApplicationAssignView(APIView):
    """Assign an application to a specific reviewer.

    POST /api/v1/applications/{id}/assign/

    Authority (admissions-v2 task 9.4, AUTH-02/AUTH-03): the derived
    ``tenant.application.review`` capability for this application's institution,
    composed with scope-before-lookup, replacing the ``IsSuperAdmin`` role class.
    The *assigned reviewer* must still be an eligible member of the application's
    tenant — enforced under row locks by ``ReviewerAssignmentService`` — so the
    widened actor set cannot select a reviewer outside the tenant (design §5.3).

    Versioned command (task 9.4): assignment changes who may act on the
    application, so a stale command is refused rather than applied.

    Requirements: R3, R8.2-R8.4
    """

    permission_classes = [IsAuthenticated]
    serializer_class = ApplicationAssignRequestSerializer

    @extend_schema(
        request=ApplicationAssignRequestSerializer,
        responses={
            200: OpenApiResponse(response=ApplicationEnvelopeResponseSerializer),
            400: OpenApiResponse(response=ErrorResponseSerializer),
            403: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
            409: OpenApiResponse(response=ErrorResponseSerializer),
        },
        tags=["applications"],
        summary="Assign an application to a reviewer",
    )
    def post(self, request, application_id):
        from apps.applications.review_workspace_service import (
            ApplicationReviewWorkspaceService,
            read_expected_version,
        )
        from apps.applications.reviewer_assignment_service import (
            ReviewerAssignmentError,
            ReviewerAssignmentService,
        )
        from apps.common.tenant_authorization import resolve_scoped_application

        scoped_app = resolve_scoped_application(
            request,
            application_id,
            capability="tenant.application.review",
            enforce_reviewer_assignment=False,
        )
        ApplicationReviewWorkspaceService.assert_version(
            scoped_app, read_expected_version(request)
        )

        # Validate the payload contract: reviewer_id must be a present, valid
        # UUID. This rejects the empty/blank reviewer_id the old client posted
        # (AUTH-03) with a stable VALIDATION_ERROR before any DB work.
        serializer = ApplicationAssignRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {
                    "success": False,
                    "error": "reviewer_id is required and must be a valid UUID.",
                    "code": "VALIDATION_ERROR",
                    "details": serializer.errors,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        reviewer_id = serializer.validated_data["reviewer_id"]

        try:
            outcome = ReviewerAssignmentService.assign_reviewer(
                application_id=application_id,
                reviewer_id=reviewer_id,
                actor_id=getattr(request.user, "id", None),
            )
        except ReviewerAssignmentError as exc:
            return Response(
                {"success": False, "error": exc.message, "code": exc.code},
                status=exc.status_code,
            )

        # R3.5: a reviewer assignment changes the assignment-scoped authority of
        # both the new reviewer (gains access) and the prior reviewer (loses
        # it) — revoke their in-flight sessions so stale assignment authority
        # does not persist. Done after the assignment transaction commits.
        revoke_sessions_for_authority_change(
            outcome.reviewer_id,
            reason="reviewer_assigned",
            actor_id=getattr(request.user, "id", None),
        )
        if outcome.old_reviewer_id and outcome.old_reviewer_id != outcome.reviewer_id:
            revoke_sessions_for_authority_change(
                outcome.old_reviewer_id,
                reason="reviewer_unassigned",
                actor_id=getattr(request.user, "id", None),
            )

        # Best-effort notifications (outside the assignment transaction).
        try:
            app = Application.objects.get(id=outcome.application_id)
            _notify_reviewer_assigned(app, outcome.reviewer_id, auto=False)
            try:
                CommunicationService.send("reviewer_assigned", app)
            except Exception:
                logger.warning(
                    "Failed to send reviewer_assigned notification for app=%s",
                    app.id,
                    exc_info=True,
                )
        except Application.DoesNotExist:  # pragma: no cover - defensive
            pass

        return Response({
            "success": True,
            "data": {
                "application_id": outcome.application_id,
                "assigned_reviewer_id": outcome.reviewer_id,
                "assigned_reviewer_email": outcome.reviewer_email,
                "version": ApplicationReviewWorkspaceService.bump_version(scoped_app),
            },
        })


class ApplicationAutoAssignView(APIView):
    """Auto-assign unassigned submitted applications using round-robin.

    POST /api/v1/applications/auto-assign/

    Authority (admissions-v2 task 9.4, AUTH-02): the **platform**
    ``platform.user.manage_all`` capability, resolved through
    ``AdminCapabilityService`` rather than compared as a role string. Deliberately
    *not* widened to the tenant matrix like the manual assign command: this
    command sweeps every unassigned application the platform holds, so a
    tenant-scoped actor issuing it would act far outside their own scope. A
    tenant operator staffs their own queue with ``/assign/``.

    Selects only reviewers with an active membership in each application's tenant
    and locks workload counters so concurrent runs never exceed
    ``max_reviewer_workload`` (design §5.3).

    Requirements: R3, R8.2-R8.4
    """

    permission_classes = [IsAuthenticated]
    serializer_class = ApplicationAutoAssignRequestSerializer

    @extend_schema(
        request=ApplicationAutoAssignRequestSerializer,
        responses={
            200: OpenApiResponse(response=ApplicationEnvelopeResponseSerializer),
            400: OpenApiResponse(response=ErrorResponseSerializer),
        },
        tags=["applications"],
        summary="Auto-assign unassigned applications via round-robin",
    )
    def post(self, request):
        from apps.applications.reviewer_assignment_service import (
            ReviewerAssignmentError,
            ReviewerAssignmentService,
        )
        from apps.catalog.services import AdminCapabilityService

        # Raises a non-revealing PermissionDenied (403) when the capability is
        # absent, and fails closed on a resolution error.
        AdminCapabilityService().require_capability(
            request.user, "platform.user.manage_all"
        )

        try:
            result = ReviewerAssignmentService.auto_assign(
                actor_id=getattr(request.user, "id", None)
            )
        except ReviewerAssignmentError as exc:
            return Response(
                {"success": False, "error": exc.message, "code": exc.code},
                status=exc.status_code,
            )

        assignments = result["assignments"]

        # Best-effort in-app notifications (after the assignment transaction).
        for outcome in assignments:
            try:
                app = Application.objects.get(id=outcome.application_id)
                _notify_reviewer_assigned(app, outcome.reviewer_id, auto=True)
            except Application.DoesNotExist:  # pragma: no cover - defensive
                continue

        # R3.5: revoke each newly-assigned reviewer's sessions once so their new
        # assignment-scoped authority is re-resolved on the next request.
        for reviewer_id in {o.reviewer_id for o in assignments}:
            revoke_sessions_for_authority_change(
                reviewer_id,
                reason="reviewer_auto_assigned",
                actor_id=getattr(request.user, "id", None),
            )

        return Response({
            "success": True,
            "data": {
                "assigned_count": result["assigned_count"],
                "assignments": [
                    {"application_id": o.application_id, "reviewer_id": o.reviewer_id}
                    for o in assignments
                ],
            },
        })


# ---------------------------------------------------------------------------
# Fee Waiver (Req 12)
# ---------------------------------------------------------------------------


class ApplicationFeeWaiverView(APIView):
    """Grant a fee waiver for an application.

    POST /api/v1/applications/{id}/fee-waiver/

    Authority (admissions-v2 task 9.4, AUTH-02): the **platform**
    ``platform.settings.manage`` capability resolved through
    ``AdminCapabilityService``, replacing the ``IsSuperAdmin`` role class — the
    same actors, but the decision now comes from the capability service. A waiver
    forgives money the tenant is owed, so it stays a platform act rather than
    joining the tenant matrix; task 8.4 put fee *writes* behind a platform
    capability for the same reason.

    Scope-before-lookup is applied so the not-found mask is consistent with every
    other application route, and the command is version-guarded.

    Requirements: 12.2, 12.7, R8.3, R8.4
    """

    permission_classes = [IsAuthenticated]
    serializer_class = ApplicationFeeWaiverRequestSerializer

    @extend_schema(
        request=ApplicationFeeWaiverRequestSerializer,
        responses={
            200: OpenApiResponse(response=ApplicationEnvelopeResponseSerializer),
            400: OpenApiResponse(response=ErrorResponseSerializer),
            403: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
            409: OpenApiResponse(response=ErrorResponseSerializer),
        },
        tags=["applications"],
        summary="Grant a fee waiver (platform settings authority)",
    )
    @idempotent
    def post(self, request, application_id):
        from apps.applications.review_workspace_service import (
            ApplicationReviewWorkspaceService,
            read_expected_version,
        )
        from apps.catalog.services import AdminCapabilityService
        from apps.common.tenant_authorization import resolve_scoped_application
        from apps.documents.fee_waiver_service import FeeWaiverError, FeeWaiverService

        AdminCapabilityService().require_capability(
            request.user, "platform.settings.manage"
        )
        app = resolve_scoped_application(request, application_id)
        ApplicationReviewWorkspaceService.assert_version(
            app, read_expected_version(request)
        )

        data = request.data or {}
        waiver_type = data.get("waiver_type")
        reason_code = data.get("reason_code")
        discount_percentage = data.get("discount_percentage", 100)
        notes = data.get("notes", "")

        if not waiver_type or not reason_code:
            return Response(
                {
                    "success": False,
                    "error": "waiver_type and reason_code are required.",
                    "code": "VALIDATION_ERROR",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            waiver = FeeWaiverService.grant_waiver(
                application_id=str(application_id),
                waiver_type=waiver_type,
                reason_code=reason_code,
                discount_percentage=int(discount_percentage),
                admin_id=str(request.user.id),
                notes=notes,
            )
        except FeeWaiverError as exc:
            return Response(
                {"success": False, "error": exc.message, "code": exc.code},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response({
            "success": True,
            "data": {
                "waiver_id": str(waiver.id),
                "application_id": str(app.id),
                "waiver_type": waiver.waiver_type,
                "reason_code": waiver.reason_code,
                "discount_percentage": waiver.discount_percentage,
                "version": ApplicationReviewWorkspaceService.bump_version(app),
            },
        })

