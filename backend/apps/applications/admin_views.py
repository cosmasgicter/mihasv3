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

from apps.accounts.permissions import IsAdmin, IsOwnerOrAdmin, IsSuperAdmin
from apps.applications.document_intelligence import DocumentIntelligence
from apps.applications.filters import ApplicationFilter
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
                'user', 'payment_verified_by', 'reviewed_by', 'admin_feedback_by'
            ).prefetch_related(
                'applicationdocument_set', 'applicationgrade_set', 'payment_set'
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

        if not sort_param:
            queryset = queryset.order_by("-created_at")

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
        xff = request.META.get("HTTP_X_FORWARDED_FOR")
        if xff and isinstance(xff, str):
            return xff.split(",")[0].strip()
        addr = request.META.get("REMOTE_ADDR", "")
        return addr if isinstance(addr, str) else ""

    def patch(self, request, application_id):
        return self.post(request, application_id)

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

            try:
                from apps.documents.payment_service import PaymentService

                app = PaymentService().review_application_payment(
                    application_id=app.id,
                    payment_status=payment_status,
                    reviewed_by_id=str(request.user.id),
                    notes=notes,
                )
            except ValueError as exc:
                if str(exc) == "PAYMENT_RECORD_REQUIRED":
                    return Response(
                        {
                            "success": False,
                            "error": "A payment record is required before this payment status can be reviewed.",
                            "code": "PAYMENT_RECORD_REQUIRED",
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
        if new_status == "approved" and not force:
            has_verified = (
                app.payment_status in ("successful", "force_approved")
                or Payment.objects.filter(application_id=application_id, status__in=("successful", "force_approved")).exists()
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
                    notes=bypass_notes,
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
            old_status = transition_application_status(
                application=app,
                new_status=new_status,
                changed_by=str(request.user.id),
                notes=bypass_notes,
                ip_address=ip_hash,
                user_agent=user_agent,
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

    permission_classes = [IsAdmin]
    serializer_class = ApplicationBulkStatusSerializer

    MAX_BATCH_SIZE = 25

    def post(self, request):
        import hashlib as _hashlib

        from apps.applications.services import ALLOWED_TRANSITIONS, transition_application_status

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

        failures = []
        try:
            with transaction.atomic():
                applications = list(Application.objects.filter(id__in=app_ids).select_for_update())

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

                if failures:
                    raise ValueError("Validation failed")

                for app in applications:
                    transition_application_status(
                        application=app,
                        new_status=new_status,
                        changed_by=str(request.user.id),
                        notes=notes,
                    )

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

        return Response({"success": True, "data": {"updated_count": len(app_ids)}})


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------


@extend_schema_view(
    get=extend_schema(
        operation_id="applications_export",
        tags=["applications"],
        parameters=[
            OpenApiParameter("status", OpenApiTypes.STR, OpenApiParameter.QUERY, description="Filter by status."),
            OpenApiParameter("search", OpenApiTypes.STR, OpenApiParameter.QUERY, description="Search term applied by the application filter."),
            OpenApiParameter("sort", OpenApiTypes.STR, OpenApiParameter.QUERY, description="Optional sort expression."),
        ],
        responses={
            200: OpenApiResponse(
                response=OpenApiTypes.BINARY,
                description="CSV export of applications that match the current filters.",
            ),
        },
    )
)
class ApplicationExportView(APIView):
    permission_classes = [IsAdmin]
    serializer_class = ApplicationListSerializer

    def get(self, request):
        from django.http import HttpResponse

        queryset = _with_payment_summary(Application.objects.all()).order_by("-created_at")
        filterset = ApplicationFilter(request.query_params, queryset=queryset)
        queryset = filterset.qs
        queryset = queryset[:10000]  # Cap export at 10,000 rows
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["Application Number", "Full Name", "Email", "Phone", "Program", "Intake", "Institution", "Status", "Created At"])
        for app in queryset:
            writer.writerow([app.application_number, app.full_name, app.email, app.phone, app.program, app.intake, app.institution, app.status, app.created_at.isoformat() if app.created_at else ""])
        response = HttpResponse(output.getvalue(), content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="applications_export.csv"'
        return response


# ---------------------------------------------------------------------------
# Reviewer Assignment (Req 11)
# ---------------------------------------------------------------------------


class ApplicationAssignView(APIView):
    """Assign an application to a specific reviewer.

    POST /api/v1/applications/{id}/assign/
    Super admin only.

    Requirements: 11.1–11.4, 11.10
    """

    permission_classes = [IsSuperAdmin]

    def post(self, request, application_id):
        from apps.accounts.models import Profile

        try:
            app = Application.objects.get(id=application_id)
        except Application.DoesNotExist:
            return Response(
                {"success": False, "error": "Application not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )

        reviewer_id = (request.data or {}).get("reviewer_id")
        if not reviewer_id:
            return Response(
                {"success": False, "error": "reviewer_id is required.", "code": "VALIDATION_ERROR"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            reviewer = Profile.objects.get(id=reviewer_id)
        except Profile.DoesNotExist:
            return Response(
                {"success": False, "error": "Reviewer not found.", "code": "REVIEWER_NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )

        if reviewer.role not in ("admin", "reviewer", "super_admin"):
            return Response(
                {
                    "success": False,
                    "error": "Target user must have admin or reviewer role.",
                    "code": "INVALID_REVIEWER_ROLE",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        old_reviewer_id = str(app.assigned_reviewer_id_id) if app.assigned_reviewer_id_id else None
        app.assigned_reviewer_id = reviewer
        app.save(update_fields=["assigned_reviewer_id"])

        ApplicationStatusHistory.objects.create(
            application=app,
            status=app.status,
            old_status=app.status,
            new_status=app.status,
            changed_by_id=str(request.user.id),
            notes=f"Reviewer assigned: {reviewer.email} (was: {old_reviewer_id or 'unassigned'})",
        )

        try:
            from apps.common.outbox import create_notification
            create_notification(
                user_id=reviewer.id,
                title="Application Assigned to You",
                message=f"Application {app.application_number} for {app.program} ({app.intake}) has been assigned to you for review.",
                type="info",
                priority="normal",
                action_url=f"/admin/applications/{app.id}",
            )
        except Exception:
            logger.exception("Failed to notify reviewer for app=%s", app.id)

        try:
            CommunicationService.send('reviewer_assigned', app)
        except Exception:
            pass

        return Response({
            "success": True,
            "data": {
                "application_id": str(app.id),
                "assigned_reviewer_id": str(reviewer.id),
                "assigned_reviewer_email": reviewer.email,
            },
        })


class ApplicationAutoAssignView(APIView):
    """Auto-assign unassigned submitted applications using round-robin.

    POST /api/v1/applications/auto-assign/
    Super admin only.

    Requirements: 11.5–11.7
    """

    permission_classes = [IsSuperAdmin]

    def post(self, request):
        from apps.accounts.models import Profile
        from apps.common.models import Setting

        max_workload = 20
        try:
            setting = Setting.objects.filter(key="max_reviewer_workload").first()
            if setting and setting.value:
                max_workload = int(setting.value)
        except Exception:
            pass

        reviewers = list(
            Profile.objects.filter(
                role__in=["admin", "reviewer", "super_admin"],
                is_active=True,
            ).order_by("created_at")
        )

        if not reviewers:
            return Response(
                {"success": False, "error": "No active reviewers available.", "code": "NO_REVIEWERS"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        unassigned = Application.objects.filter(
            status__in=["submitted", "under_review"],
            assigned_reviewer_id__isnull=True,
        ).order_by("created_at")

        assigned_count = 0
        assignments = []
        reviewer_idx = 0

        for app in unassigned:
            assigned = False
            for _ in range(len(reviewers)):
                reviewer = reviewers[reviewer_idx % len(reviewers)]
                reviewer_idx += 1

                current_workload = Application.objects.filter(
                    assigned_reviewer_id=reviewer.id,
                    status__in=["submitted", "under_review", "waitlisted"],
                ).count()

                if current_workload < max_workload:
                    app.assigned_reviewer_id = reviewer
                    app.save(update_fields=["assigned_reviewer_id"])

                    ApplicationStatusHistory.objects.create(
                        application=app,
                        status=app.status,
                        old_status=app.status,
                        new_status=app.status,
                        changed_by_id=str(request.user.id),
                        notes=f"Auto-assigned to reviewer: {reviewer.email}",
                    )

                    try:
                        from apps.common.outbox import create_notification
                        create_notification(
                            user_id=reviewer.id,
                            title="Application Assigned",
                            message=f"Application {app.application_number} has been assigned to you for review.",
                            type="assignment",
                            action_url=f"/admin/applications/{app.id}",
                        )
                    except Exception:
                        pass

                    assignments.append({
                        "application_id": str(app.id),
                        "reviewer_id": str(reviewer.id),
                    })
                    assigned_count += 1
                    assigned = True
                    break

            if not assigned:
                break

        return Response({
            "success": True,
            "data": {
                "assigned_count": assigned_count,
                "assignments": assignments,
            },
        })


# ---------------------------------------------------------------------------
# Fee Waiver (Req 12)
# ---------------------------------------------------------------------------


class ApplicationFeeWaiverView(APIView):
    """Grant a fee waiver for an application.

    POST /api/v1/applications/{id}/fee-waiver/
    Super admin only.

    Requirements: 12.2, 12.7
    """

    permission_classes = [IsSuperAdmin]

    def post(self, request, application_id):
        from apps.documents.fee_waiver_service import FeeWaiverError, FeeWaiverService

        try:
            app = Application.objects.get(id=application_id)
        except Application.DoesNotExist:
            return Response(
                {"success": False, "error": "Application not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
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
            },
        })


# ---------------------------------------------------------------------------
# Amendment Review (Req 14.7)
# ---------------------------------------------------------------------------


class ApplicationAmendmentReviewView(APIView):
    """Review (approve/reject) an amendment.

    POST /api/v1/applications/{id}/amendments/{aid}/review/
    Admin only.

    Requirements: 14.7
    """

    permission_classes = [IsAdmin]

    def post(self, request, application_id, amendment_id):
        from apps.applications.amendment_service import AmendmentError, AmendmentService

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

        try:
            amendment = AmendmentService.review_amendment(
                amendment_id=str(amendment_id),
                status=target_status,
                admin_id=str(request.user.id),
            )
        except AmendmentError as exc:
            return Response(
                {"success": False, "error": exc.message, "code": exc.code},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response({
            "success": True,
            "data": {
                "amendment_id": str(amendment.id),
                "application_id": str(application_id),
                "field_name": amendment.field_name,
                "new_value": amendment.new_value,
                "status": amendment.status,
            },
        })


# ---------------------------------------------------------------------------
# Condition Verify (Req 5.10)
# ---------------------------------------------------------------------------


class ApplicationConditionVerifyView(APIView):
    """Verify a condition as met or waived.

    POST /api/v1/applications/{id}/conditions/{cid}/verify/
    Admin only.

    Requirements: 5.10
    """

    permission_classes = [IsAdmin]
    serializer_class = ConditionVerifyRequestSerializer

    def post(self, request, application_id, condition_id):
        from apps.applications.condition_manager import ConditionError, ConditionManager

        try:
            Application.objects.get(id=application_id)
        except Application.DoesNotExist:
            return Response(
                {"success": False, "error": "Application not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            condition = ApplicationCondition.objects.get(
                id=condition_id, application_id=application_id,
            )
        except ApplicationCondition.DoesNotExist:
            return Response(
                {"success": False, "error": "Condition not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = ConditionVerifyRequestSerializer(data=request.data)
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

        target_status = serializer.validated_data["status"]

        try:
            updated_condition = ConditionManager.verify_condition(
                condition_id=str(condition_id),
                status=target_status,
                admin_id=str(request.user.id),
            )
        except ConditionError as exc:
            return Response(
                {"success": False, "error": exc.message, "code": exc.code},
                status=status.HTTP_400_BAD_REQUEST,
            )

        data = ApplicationConditionSerializer(updated_condition).data
        return Response({"success": True, "data": data})


class ApplicationAdminSummaryView(APIView):
    """GET /api/v1/applications/{id}/admin-summary/

    Returns an AI-generated review brief for admins. Best-effort.
    """

    permission_classes = [IsAdmin]

    def get(self, request, application_id):
        try:
            app = Application.objects.get(id=application_id)
        except Application.DoesNotExist:
            return Response(
                {"success": False, "error": "Application not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )

        from apps.applications.serializers import build_grades_summary

        docs = ApplicationDocument.objects.filter(application_id=app.id).values_list("document_type", flat=True)
        docs_summary = ", ".join(docs) if docs else "No documents uploaded"

        summary = None
        try:
            from apps.common.ai_service import generate_admin_review_summary

            summary = generate_admin_review_summary(
                {
                    "full_name": app.full_name,
                    "program": app.program,
                    "institution": app.institution,
                    "intake": app.intake,
                    "nrc_number": app.nrc_number or app.passport_number or "Not provided",
                    "nationality": getattr(app, "nationality", None) or "Unknown",
                    "sex": app.sex,
                    "date_of_birth": str(app.date_of_birth) if app.date_of_birth else "Unknown",
                    "payment_status": app.payment_status or "unpaid",
                    "documents_summary": docs_summary,
                    "grades_summary": build_grades_summary(app),
                }
            )
        except Exception:
            pass

        return Response(
            {
                "success": True,
                "data": {"summary": summary},
            }
        )