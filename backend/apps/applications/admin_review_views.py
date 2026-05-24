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

from apps.common.request_utils import get_client_ip
from rest_framework.views import APIView

from apps.accounts.permissions import IsAdmin, IsOwnerOrAdmin, IsSuperAdmin, is_super_admin
from apps.common.throttling import AIUserScopedRateThrottle
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
    ApplicationAiSummaryResponseSerializer,
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
# Application List + Create
# ---------------------------------------------------------------------------


@extend_schema_view(
    get=extend_schema(
        operation_id="applications_list",
        tags=["applications"],
        parameters=[
            OpenApiParameter("status", OpenApiTypes.STR, OpenApiParameter.QUERY, description="Filter by application status."),
            OpenApiParameter("search", OpenApiTypes.STR, OpenApiParameter.QUERY, description="Searchable fields handled by the application filter."),
            OpenApiParameter("sort", OpenApiTypes.STR, OpenApiParameter.QUERY, description="Custom sort expression."),
            OpenApiParameter("page", OpenApiTypes.INT, OpenApiParameter.QUERY, description="Page number."),
            OpenApiParameter("pageSize", OpenApiTypes.INT, OpenApiParameter.QUERY, description="Page size."),
        ],
        responses={200: OpenApiResponse(response=ApplicationListResponseSerializer)},
    ),
    post=extend_schema(
        operation_id="applications_create",
        tags=["applications"],
        request=ApplicationCreateSerializer,
        responses={
            201: OpenApiResponse(response=ApplicationResponseSerializer),
            400: OpenApiResponse(response=ErrorResponseSerializer),
        },
    ),
)
class ApplicationListCreateView(APIView):
    permission_classes = [IsAuthenticated]
    serializer_class = ApplicationSerializer

    def get(self, request):
        user = request.user
        role = getattr(user, "role", "student")
        if role in ("admin", "super_admin"):
            queryset = Application.objects.select_related(
                'user', 'payment_verified_by', 'reviewed_by', 'admin_feedback_by',
                'assigned_reviewer_id',
            ).prefetch_related(
                'applicationdocument_set', 'applicationgrade_set', 'payment_set',
                'applicationcondition_set', 'applicationamendment_set',
            ).all()
            queryset = _with_payment_summary(queryset)
        else:
            # Student path: lightweight query — no payment summary subqueries,
            # no document prefetch. Grades prefetched for serializer computed fields.
            queryset = Application.objects.select_related(
                'payment_verified_by'
            ).prefetch_related(
                'applicationgrade_set'
            ).filter(
                user_id=str(user.id)
            )
        filterset = ApplicationFilter(request.query_params, queryset=queryset)
        queryset = filterset.qs

        sort_param = request.query_params.get("sort")
        is_priority_sort = sort_param == "priority" and role in ("admin", "super_admin")

        if not sort_param and not request.query_params.get("sortBy"):
            queryset = annotate_activity_at(queryset).order_by("-activity_at", "-created_at", "-id")

        paginator = StandardPagination()
        page = paginator.paginate_queryset(queryset, request)
        if page is not None:
            serializer = ApplicationListSerializer(page, many=True)
            data = serializer.data

            if is_priority_sort:
                data = self._annotate_priority(page, data)

            return paginator.get_paginated_response(data)

        serializer = ApplicationListSerializer(queryset, many=True)
        data = serializer.data

        if is_priority_sort:
            data = self._annotate_priority(list(queryset), data)

        return Response(data)

    @staticmethod
    def _annotate_priority(applications, serialized_data):
        """Compute priority scores via ReviewQueueScorer and annotate response data."""
        scorer = ReviewQueueScorer()
        doc_intel = DocumentIntelligence()
        annotated = []
        for app, item in zip(applications, serialized_data):
            try:
                completeness = doc_intel.compute_completeness(app)
                has_warnings = bool(completeness.warnings)
                priority = scorer.score(app, completeness.score, has_warnings)
                item["priority_score"] = priority.score
                item["priority_classification"] = priority.classification
            except Exception:
                logger.exception("Failed to compute priority for application %s", getattr(app, "id", "?"))
                item["priority_score"] = 0.0
                item["priority_classification"] = "waiting_for_student"
            annotated.append(item)
        annotated.sort(key=lambda x: x["priority_score"], reverse=True)
        return annotated

    def post(self, request):
        from apps.applications.duplicate_checker import DuplicateChecker

        serializer = ApplicationCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"success": False, "error": "Validation failed", "code": "VALIDATION_ERROR", "details": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)
        data = serializer.validated_data

        from apps.applications.intake_enforcer import IntakeEnforcer
        intake_check = IntakeEnforcer.check_draft_creation(data["intake"])
        if not intake_check.allowed:
            return Response(
                {"success": False, "error": intake_check.message, "code": intake_check.code},
                status=status.HTTP_400_BAD_REQUEST,
            )

        dup_result = DuplicateChecker.check_at_create(
            user_id=str(request.user.id),
            program=data["program"],
            intake=data["intake"],
            nrc_number=data.get("nrc_number"),
            passport_number=data.get("passport_number"),
        )
        if dup_result.has_duplicate:
            return Response(
                {
                    "success": False,
                    "error": "A non-terminal application already exists for this program and intake.",
                    "code": "DUPLICATE_APPLICATION",
                    "existing_id": dup_result.existing_id,
                    "existing_status": dup_result.existing_status,
                    "resume_url": dup_result.resume_url,
                },
                status=status.HTTP_409_CONFLICT,
            )

        application_fee = None
        try:
            from apps.catalog.models import Program
            from apps.documents.fee_resolver import FeeResolver

            program = Program.objects.get(name=data["program"], is_active=True)
            resolved_fee = FeeResolver().resolve_fee(
                program_code=program.code,
                nationality=data.get("nationality"),
                country=data.get("country"),
            )
            application_fee = resolved_fee.amount
        except Exception:
            logger.exception("Failed to resolve application fee during application create")

        application = Application.objects.create(
            user_id=str(request.user.id), application_number=_generate_application_number(data.get('institution', '')),
            public_tracking_code=_generate_tracking_code(data.get('institution', '')), full_name=data["full_name"],
            nrc_number=data.get("nrc_number") or "", passport_number=data.get("passport_number") or "",
            date_of_birth=data["date_of_birth"], sex=data["sex"], phone=data["phone"],
            email=data["email"], residence_town=data["residence_town"],
            country=data.get("country") or "Zambia",
            nationality=data.get("nationality", "Zambian"), program=data["program"],
            next_of_kin_name=data.get("next_of_kin_name") or "",
            next_of_kin_phone=data.get("next_of_kin_phone") or "",
            intake=data["intake"], institution=data["institution"], application_fee=application_fee,
            status="draft", version=1,
        )
        return Response({"success": True, "data": ApplicationSerializer(application).data}, status=status.HTTP_201_CREATED)


# ---------------------------------------------------------------------------
# Application Review
# ---------------------------------------------------------------------------


@extend_schema_view(
    post=extend_schema(
        operation_id="applications_review",
        tags=["applications"],
        parameters=[
            OpenApiParameter("application_id", OpenApiTypes.UUID, OpenApiParameter.PATH, description="Application UUID."),
        ],
        request=ApplicationReviewSerializer,
        responses={
            200: OpenApiResponse(response=ApplicationReviewResponseSerializer),
            400: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
    ),
    patch=extend_schema(
        operation_id="applications_review_patch",
        tags=["applications"],
        parameters=[
            OpenApiParameter("application_id", OpenApiTypes.UUID, OpenApiParameter.PATH, description="Application UUID."),
        ],
        request=ApplicationReviewSerializer,
        responses={
            200: OpenApiResponse(response=ApplicationReviewResponseSerializer),
            400: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
    ),
)
class ApplicationReviewView(APIView):
    permission_classes = [IsAdmin]
    serializer_class = ApplicationReviewSerializer

    @staticmethod
    def _normalize_legacy_review_payload(request_data):
        if not isinstance(request_data, dict):
            return request_data

        if request_data.get("new_status"):
            return request_data

        normalized = request_data.copy()
        legacy_status = normalized.get("status")
        if legacy_status and not normalized.get("new_status"):
            normalized["new_status"] = legacy_status
        return normalized

    @staticmethod
    def _get_client_ip(request) -> str:
        """Extract client IP, respecting X-Forwarded-For behind a proxy."""
        return get_client_ip(request)

    def patch(self, request, application_id):
        return self.post(request, application_id)

    @idempotent
    def post(self, request, application_id):
        try:
            app = Application.objects.get(id=application_id)
        except Application.DoesNotExist:
            return Response({"success": False, "error": "Application not found", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)

        if isinstance(request.data, dict) and (request.data.get("paymentStatus") or request.data.get("payment_status")):
            raw_payment_status = request.data.get("paymentStatus") or request.data.get("payment_status")
            raw_notes = request.data.get("verificationNotes") or request.data.get("notes") or ""

            ps_serializer = PaymentStatusUpdateSerializer(data={
                "payment_status": raw_payment_status,
                "notes": raw_notes,
            })
            if not ps_serializer.is_valid():
                return Response({"success": False, "error": "Validation failed", "code": "VALIDATION_ERROR", "details": ps_serializer.errors}, status=status.HTTP_400_BAD_REQUEST)

            payment_status = ps_serializer.validated_data["payment_status"]
            notes = ps_serializer.validated_data["notes"]

            # Phase 5 gate (Task 45.2): ``PAYMENT_HARDENING_FORCE_APPROVED``
            # routes admin verifications with no prior Payment through
            # ``PaymentService.force_approve`` so the ledger gets a
            # canonical ``force_approved`` row instead of the legacy
            # synthetic zero-amount ``successful`` row (R2.3, R22.6).
            force_approved_hardening = bool(
                getattr(settings, "PAYMENT_HARDENING_FORCE_APPROVED", False)
            )

            try:
                from apps.documents.payment_service import PaymentService
                from apps.documents.models import Payment as _Payment

                service = PaymentService()

                # Hardened path: admin force-approving a fresh application
                # with no prior Payment row goes through ``force_approve``
                # so the mutation routes through ``_transition`` and the
                # security-retention audit is emitted.
                use_force_approve = (
                    force_approved_hardening
                    and payment_status == "verified"
                    and not _Payment.objects.filter(application_id=app.id).exists()
                )
                if use_force_approve:
                    reviewer = request.user
                    try:
                        service.force_approve(
                            application_id=app.id,
                            actor_id=reviewer.id,
                            actor_role=getattr(reviewer, "role", "admin"),
                            reason=(notes or "").strip() or "Admin force-approved payment (no prior record)",
                        )
                    except ValueError as exc:
                        code = str(exc)
                        if code == "OVERRIDE_REASON_REQUIRED":
                            return Response(
                                {
                                    "success": False,
                                    "error": {
                                        "code": "OVERRIDE_REASON_REQUIRED",
                                        "message": "A reason of at least 10 characters is required.",
                                    },
                                },
                                status=status.HTTP_400_BAD_REQUEST,
                            )
                        if code == "CANNOT_REVERSE_SUCCESSFUL_PAYMENT":
                            return Response(
                                {
                                    "success": False,
                                    "error": {
                                        "code": "CANNOT_REVERSE_SUCCESSFUL_PAYMENT",
                                        "message": "A successful payment cannot be reversed.",
                                    },
                                },
                                status=status.HTTP_409_CONFLICT,
                            )
                        raise

                    app.refresh_from_db()
                else:
                    # LEGACY: Task 45.2 — when
                    # ``PAYMENT_HARDENING_FORCE_APPROVED`` is False (or the
                    # admin is targeting an application that already has a
                    # Payment row), the legacy
                    # ``PaymentService.review_application_payment`` path
                    # is preserved. That path continues to create a
                    # synthetic zero-amount ``successful`` Payment for
                    # fresh ``verified`` reviews and mutate the latest
                    # Payment row for reviews where one already exists.
                    # The CANNOT_REVERSE_SUCCESSFUL_PAYMENT guard below
                    # applies to both modes (Phase 2, R2.1 + R2.2). Once
                    # the flag ships on by default this branch is
                    # retired per spec Task 45.
                    app = service.review_application_payment(
                        application_id=app.id,
                        payment_status=payment_status,
                        reviewed_by_id=str(request.user.id),
                        notes=notes,
                    )
            except ValueError as exc:
                code = str(exc)
                if code == "PAYMENT_RECORD_REQUIRED":
                    return Response(
                        {
                            "success": False,
                            "error": "A payment record is required before this payment status can be reviewed.",
                            "code": "PAYMENT_RECORD_REQUIRED",
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                if code == "CANNOT_REVERSE_SUCCESSFUL_PAYMENT":
                    return Response(
                        {
                            "success": False,
                            "error": {
                                "code": "CANNOT_REVERSE_SUCCESSFUL_PAYMENT",
                                "message": "A successful payment cannot be reversed.",
                            },
                        },
                        status=status.HTTP_409_CONFLICT,
                    )
                if code == "OVERRIDE_REASON_REQUIRED":
                    return Response(
                        {
                            "success": False,
                            "error": {
                                "code": "OVERRIDE_REASON_REQUIRED",
                                "message": "A reason of at least 10 characters is required.",
                            },
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                raise

            return Response({"success": True, "data": {
                "message": f"Payment status updated to {payment_status}",
                "application_id": str(app.id),
                "payment_status": payment_status,
            }})

        serializer = ApplicationReviewSerializer(data=self._normalize_legacy_review_payload(request.data))
        if not serializer.is_valid():
            return Response({"success": False, "error": "Validation failed", "code": "VALIDATION_ERROR", "details": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)
        new_status = serializer.validated_data["new_status"]
        notes = serializer.validated_data.get("notes", "")
        force = serializer.validated_data.get("force", False)
        reason = serializer.validated_data.get("reason", "")

        with transaction.atomic():
            app = Application.objects.select_for_update().get(id=application_id)

            if new_status == "approved" and not force:
                # All statuses that mean "payment resolved" — includes legacy (verified, paid) and current (successful, force_approved, deferred)
                _RESOLVED_PAYMENT_STATUSES = ("successful", "force_approved", "verified", "paid", "deferred")
                has_verified = (
                    app.payment_status in _RESOLVED_PAYMENT_STATUSES
                    or Payment.objects.filter(
                        application_id=application_id,
                        status__in=_RESOLVED_PAYMENT_STATUSES,
                    ).exists()
                )
                if not has_verified:
                    return Response({"success": False, "error": "Payment must be verified before approval. Set force=true to override.", "code": "PAYMENT_UNVERIFIED"}, status=status.HTTP_400_BAD_REQUEST)

            raw_ip = self._get_client_ip(request) or ""
            ip_hash = hashlib.sha256(str(raw_ip).encode("utf-8")).hexdigest()
            user_agent = str(request.META.get("HTTP_USER_AGENT", "") or "")

            if force and new_status == "approved":
                bypass_notes = f"[FORCE-BYPASS] Payment verification bypassed. Reason: {reason or 'Not provided'}"
                bypass_changes = {"force_bypass": True, "reason": reason or "Not provided"}
                logger.warning(
                    "Force-bypass: app=%s admin=%s status=%s",
                    app.id, request.user.id, new_status,
                )
            else:
                bypass_notes = notes
                bypass_changes = None

            if new_status == "submitted":
                try:
                    locked_app, old_status = submit_application(
                        application=app,
                        changed_by=str(request.user.id),
                        ip_address=ip_hash,
                        user_agent=user_agent,
                        admin_force=True,
                    )
                except ApplicationSubmissionError as exc:
                    return Response(
                        {"success": False, "error": exc.message, "code": exc.code},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                return Response({"success": True, "data": {"message": f"Status updated from {old_status} to {new_status}", "application_id": str(locked_app.id), "old_status": old_status, "new_status": new_status}})

            conditions_payload = request.data.get("conditions") if isinstance(request.data, dict) else None
            if new_status == "conditionally_approved" and conditions_payload:
                from apps.applications.condition_manager import ConditionError, ConditionManager

                try:
                    old_status = app.status
                    ConditionManager.assign_conditions(
                        application_id=str(application_id),
                        conditions=conditions_payload,
                        admin_id=str(request.user.id),
                    )
                    app.refresh_from_db()
                except ConditionError as exc:
                    return Response(
                        {"success": False, "error": exc.message, "code": exc.code},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
            else:
                try:
                    old_status = transition_application_status(
                        application=app,
                        new_status=new_status,
                        changed_by=str(request.user.id),
                        notes=bypass_notes,
                        ip_address=ip_hash,
                        user_agent=user_agent,
                    )
                except ValueError as exc:
                    return Response(
                        {"success": False, "error": str(exc), "code": "INVALID_TRANSITION"},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

            if bypass_changes:
                history = ApplicationStatusHistory.objects.filter(
                    application=app,
                ).order_by('-created_at').first()
                if history:
                    history.changes = bypass_changes
                    history.save(update_fields=['changes'])

        if new_status == "waitlisted":
            try:
                from apps.applications.waitlist_manager import WaitlistManager
                position = WaitlistManager.assign_position(app, app.program, app.intake)
                CommunicationService.send('waitlist_position_assigned', app, {'position': str(position)})
            except Exception:
                logger.exception(
                    "Failed to assign waitlist position for app=%s", app.id,
                )

        if old_status == "waitlisted" and new_status == "approved":
            if app.waitlist_position is not None and app.waitlist_position != 1:
                try:
                    from apps.applications.waitlist_manager import WaitlistManager
                    WaitlistManager.log_override(app, str(request.user.id))
                except Exception:
                    logger.exception(
                        "Failed to log waitlist override for app=%s", app.id,
                    )

        intake_name = getattr(app, "intake", None)
        has_resolved_intake = isinstance(intake_name, str) and bool(intake_name.strip())

        if new_status in ("approved", "rejected") and has_resolved_intake:
            try:
                from apps.applications.intake_enforcer import IntakeEnforcer
                IntakeEnforcer.sync_enrollment(intake_name)
            except Exception:
                logger.exception(
                    "Failed to sync intake enrollment for app=%s intake=%s",
                    app.id,
                    intake_name,
                )

        if new_status == "approved" and has_resolved_intake:
            try:
                from apps.applications.enrollment_service import EnrollmentService
                deadline = EnrollmentService.compute_deadline(app)
                app.enrollment_confirmation_deadline = deadline
                app.save(update_fields=["enrollment_confirmation_deadline"])
            except Exception:
                logger.exception("Failed to set enrollment deadline for app=%s", app.id)

        if new_status == "rejected":
            try:
                from apps.applications.waitlist_manager import WaitlistManager
                WaitlistManager.promote_next(app.program, app.intake)
            except Exception:
                logger.exception(
                    "Failed to trigger waitlist promotion after rejection for app=%s",
                    app.id,
                )

        if new_status in ("under_review", "approved", "rejected", "conditionally_approved"):
            try:
                extra_ctx = {"admin_feedback": notes or ""}
                if new_status == "under_review":
                    CommunicationService.send("application_under_review", app)
                elif new_status == "approved":
                    extra_ctx["enrollment_deadline"] = str(getattr(app, "enrollment_confirmation_deadline", "") or "")
                    CommunicationService.send("application_approved", app, extra_ctx)
                elif new_status == "conditionally_approved":
                    CommunicationService.send("condition_assigned", app, extra_ctx)
                else:
                    CommunicationService.send("application_rejected", app, extra_ctx)
            except Exception:
                logger.exception("Failed to create notification/email for application %s", app.id)

        response_data = {
            "message": f"Status updated from {old_status} to {new_status}",
            "application_id": str(app.id),
            "old_status": old_status,
            "new_status": new_status,
        }
        try:
            from apps.catalog.models import Intake
            intake = None
            if has_resolved_intake:
                intake = Intake.objects.filter(name=intake_name, is_active=True).first()
            if intake:
                response_data["intake_capacity"] = intake.max_capacity
                response_data["intake_enrollment"] = intake.current_enrollment
        except Exception:
            pass
        return Response({"success": True, "data": response_data})

