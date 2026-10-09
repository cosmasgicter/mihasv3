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
from apps.catalog.services import AccessScopeService
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
# Bulk Status Update
# ---------------------------------------------------------------------------


@extend_schema_view(
    post=extend_schema(
        operation_id="applications_bulk_status_update",
        tags=["applications"],
        request=ApplicationBulkStatusSerializer,
        responses={
            200: OpenApiResponse(response=ApplicationBulkStatusResponseSerializer),
            400: OpenApiResponse(response=ErrorResponseSerializer),
        },
    )
)
class ApplicationBulkStatusView(APIView):
    """Batch status transitions with safety guardrails.

    Requirements: 13.1–13.9
    """

    # R3.1/R3.2: derived tenant.application.review capability + scope, not a raw
    # role gate. Per-id scope-before-lookup below masks out-of-scope ids.
    permission_classes = [IsAuthenticated]
    serializer_class = ApplicationBulkStatusSerializer

    MAX_BATCH_SIZE = 25

    def post(self, request):
        import hashlib as _hashlib

        from apps.applications.review_workspace_service import (
            ApplicationReviewWorkspaceService,
        )
        from apps.applications.services import ALLOWED_TRANSITIONS, transition_application_status
        from apps.common.tenant_authorization import (
            apply_reviewer_assignment_scope,
            authorize_tenant_surface,
        )

        # Authorize the bulk review surface: a Student (no tenant scope) is
        # masked as 404; a reviewer in scope without tenant.application.review is
        # a non-revealing 403; a Tenant_Admin with the capability (or a
        # Super_Admin) proceeds. Per-application cross-tenant isolation is still
        # enforced by the scope-before-lookup narrowing further down.
        authorize_tenant_surface(request, capability="tenant.application.review")

        serializer = ApplicationBulkStatusSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"success": False, "error": "Validation failed", "code": "VALIDATION_ERROR", "details": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)
        app_ids = serializer.validated_data["application_ids"]
        new_status = serializer.validated_data["new_status"]
        notes = serializer.validated_data.get("notes", "")
        confirmation_token = (request.data or {}).get("confirmation_token", "")

        if len(app_ids) > self.MAX_BATCH_SIZE:
            return Response(
                {
                    "success": False,
                    "error": f"Batch size exceeds maximum of {self.MAX_BATCH_SIZE}.",
                    "code": "BATCH_SIZE_EXCEEDED",
                    "limit": self.MAX_BATCH_SIZE,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        sorted_ids = sorted(str(aid) for aid in app_ids)
        expected_token = _hashlib.sha256(
            ("".join(sorted_ids) + new_status).encode("utf-8")
        ).hexdigest()

        if confirmation_token != expected_token:
            return Response(
                {
                    "success": False,
                    "error": "Invalid confirmation_token. Compute SHA-256 of sorted application IDs + target status.",
                    "code": "INVALID_CONFIRMATION_TOKEN",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Versioned command (task 9.4). A bulk decision is the *most* dangerous
        # place for a stale write, so the caller may state the version it read for
        # each application it selected; any that has moved since fails the batch
        # rather than being quietly overwritten. Opt-in and per-id, because a
        # bulk command is a set of decisions, not one.
        expected_versions = (request.data or {}).get("expected_versions") or {}
        if not isinstance(expected_versions, dict):
            return Response(
                {
                    "success": False,
                    "error": "expected_versions must be an object of application id → version.",
                    "code": "VALIDATION_ERROR",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        failures = []
        applications: list[Application] = []
        try:
            with transaction.atomic():
                # Scope **before** the lookup (task 9.4). This used to fetch every
                # requested row and then intersect the result with the actor's
                # scope; the mask was right, but the rows were read first. The
                # scoped queryset is now what the lock is taken on, composed with
                # ``apply_reviewer_assignment_scope`` so an assignment-scoped
                # Reviewer cannot bulk-decide work that was never assigned to
                # them (R8.2 / AUTH-01 — the single-application command has
                # enforced this since task 2.2; the bulk command did not).
                scoped = apply_reviewer_assignment_scope(
                    AccessScopeService().filter_applications(
                        Application.objects.filter(id__in=app_ids), request.user
                    ),
                    request.user,
                )
                applications = list(scoped.select_for_update().order_by("id"))

                found_ids = {str(a.id) for a in applications}
                for aid in app_ids:
                    if str(aid) not in found_ids:
                        failures.append({"application_id": str(aid), "code": "NOT_FOUND"})

                for app in applications:
                    allowed = ALLOWED_TRANSITIONS.get(app.status, set())
                    if new_status not in allowed:
                        failures.append({
                            "application_id": str(app.id),
                            "code": "INVALID_STATUS_TRANSITION",
                            "current_status": app.status,
                        })
                        continue
                    supplied = expected_versions.get(str(app.id))
                    if supplied in (None, ""):
                        continue
                    current = int(getattr(app, "version", 1) or 1)
                    try:
                        stated = int(supplied)
                    except (TypeError, ValueError):
                        stated = -1
                    if stated != current:
                        failures.append({
                            "application_id": str(app.id),
                            "code": "VERSION_CONFLICT",
                            "current_version": current,
                        })

                if failures:
                    raise ValueError("Validation failed")

                for app in applications:
                    transition_application_status(
                        application=app,
                        new_status=new_status,
                        changed_by=str(request.user.id),
                        notes=notes,
                    )
                    ApplicationReviewWorkspaceService.bump_version(app)

        except ValueError:
            return Response(
                {
                    "success": False,
                    "error": "Batch validation failed. No applications were updated.",
                    "code": "BATCH_VALIDATION_FAILED",
                    "failures": failures,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        except Exception:
            logger.exception("Bulk status update failed for applications %s", app_ids)
            return Response({"success": False, "error": "Bulk status update failed", "code": "BULK_UPDATE_ERROR"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        # Trigger waitlist promotion for batch rejections
        if new_status == "rejected":
            try:
                from apps.applications.waitlist_manager import WaitlistManager
                programs_intakes = {(a.program, a.intake) for a in applications}
                for program, intake in programs_intakes:
                    WaitlistManager.promote_next(program, intake)
            except Exception:
                logger.exception("Failed to trigger waitlist promotion after bulk rejection")

        # R8.3/R8.4/R10.5: one Audit_Event for the command that was authorised,
        # carrying the actor, the institution scope it touched, the target status
        # and the affected ids — never an applicant field. Never blocks the
        # response.
        try:
            from apps.catalog.tenant_audit_service import TenantAuditService

            TenantAuditService.record_bulk_review_decision(
                new_status=new_status,
                application_ids=[a.id for a in applications],
                institution_ids=sorted(
                    {
                        str(a.institution_ref_id)
                        for a in applications
                        if a.institution_ref_id
                    }
                ),
                actor_id=getattr(request.user, "id", None),
                actor_role=getattr(request.user, "role", None),
                reason=notes,
                request=request,
            )
        except Exception:  # pragma: no cover - audit must never block a write
            pass

        return Response({"success": True, "data": {
            # The count of applications this command actually transitioned. It
            # equals ``len(app_ids)`` on success because the batch is
            # all-or-nothing, but reporting the applied set rather than the
            # requested one is what makes that a fact instead of an assumption.
            "updated_count": len(applications),
            "versions": {
                str(app.id): ApplicationReviewWorkspaceService.current_version(app)
                for app in applications
            },
        }})

