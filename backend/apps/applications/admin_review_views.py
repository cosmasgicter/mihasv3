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
from apps.common.metrics import emit_metric
from apps.documents.payment_constants import RESOLVED_PAYMENT_STATUSES

# Alias kept for backward-compat grep tests.
_RESOLVED_PAYMENT_STATUSES = RESOLVED_PAYMENT_STATUSES  # "successful", "force_approved", "verified", "paid", "deferred"
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
        from apps.catalog.services import (
            AccessScopeService,
            AdminCapabilityService,
            CapabilityResolutionError,
        )

        try:
            staff_can_read = AdminCapabilityService().has_any_application_capability(
                user, "tenant.application.read"
            )
        except CapabilityResolutionError:
            # Owner reads remain available even if staff capability resolution
            # fails; the staff branch itself fails closed.
            staff_can_read = False

        if staff_can_read:
            queryset = Application.objects.select_related(
                'user', 'payment_verified_by', 'reviewed_by', 'admin_feedback_by',
                'assigned_reviewer_id',
                'institution_ref', 'canonical_program', 'program_offering', 'intake_ref',
            ).prefetch_related(
                # NOTE: ``payment_set`` is intentionally NOT prefetched here as a
                # plain string. ``_with_payment_summary`` (below) attaches a
                # window-function-bounded ``Prefetch("payment_set", ...)`` (R3);
                # listing the plain lookup as well makes Django raise
                # "'payment_set' lookup was already seen with a different
                # queryset" at query evaluation. The bounded Prefetch is the
                # sole ``payment_set`` prefetch on this branch.
                'applicationdocument_set', 'applicationgrade_set',
                'applicationcondition_set', 'applicationamendment_set',
            ).all()
            queryset = AccessScopeService().filter_applications(queryset, user)
            # R8.2 / AUTH-01: a Reviewer's queue contains only tenant-authorized
            # AND assigned work. This composes with (runs after) the tenant
            # scope filter; it is a no-op for Tenant_Admins and platform admins.
            from apps.common.tenant_authorization import apply_reviewer_assignment_scope

            queryset = apply_reviewer_assignment_scope(queryset, user)
            queryset = _with_payment_summary(queryset)
        else:
            # Student path: lightweight query - no payment summary subqueries,
            # no document prefetch. Grades + payments prefetched for serializer
            # computed fields (avoids 2 payment queries per row, N+1).
            queryset = Application.objects.select_related(
                'payment_verified_by'
            ).prefetch_related(
                'applicationgrade_set', 'payment_set'
            ).filter(
                user_id=str(user.id)
            )
        filterset = ApplicationFilter(request.query_params, queryset=queryset)
        queryset = filterset.qs

        sort_param = request.query_params.get("sort")
        is_priority_sort = sort_param == "priority" and staff_can_read

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

        # R7.11 / R7.12: bind application creation to the resolved tenant.
        # Resolve the host this request arrived on (mirrors
        # ``catalog/views.py._resolve_request_context``). When the request
        # arrives on an active white-label domain the resolved tenant is the
        # source of truth: a posted ``institution_id`` that differs is rejected
        # without mutation (override not permitted), and the resolved binding is
        # retained by forcing the assignment onto the resolved institution. On
        # the shared Beanola portal (no resolved tenant) existing behaviour is
        # preserved — a posted ``institution_id`` may still act as a
        # white-label restriction as before.
        from apps.catalog.services import InstitutionContextService

        host = request.headers.get("X-Forwarded-Host") or request.get_host()
        resolved_institution = InstitutionContextService().resolve(host).institution
        if resolved_institution is not None:
            posted_institution_id = data.get("institution_id")
            if posted_institution_id is not None and str(posted_institution_id) != str(resolved_institution.id):
                return Response(
                    {
                        "success": False,
                        "error": "The submitted institution does not match the tenant resolved for this domain.",
                        "code": "INSTITUTION_OVERRIDE_NOT_PERMITTED",
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )
            # Resolved binding wins (R7.11): force the assignment onto the
            # resolved tenant so the offering is bound to that institution.
            data["institution_id"] = resolved_institution.id

        from apps.applications.intake_enforcer import IntakeEnforcer
        assigned = None
        required_documents = []
        if data.get("program_id") and data.get("intake_id"):
            # Canonical write path (R7.1, DATA-01): resolve ONLY the canonical
            # offering + intake IDs, derive every field server-side, and snapshot
            # the dynamic required documents + eligibility + configuration version
            # onto the application. No IdentifierResolver / name / code fallback.
            # Resolution fails closed: a dependency failure returns a stable
            # retryable CONFIGURATION_UNAVAILABLE (503), never a silent
            # empty-requirements create (DATA-04, STU-13).
            from apps.applications.assignment_resolution import (
                AssignmentConfigurationError,
                resolve_assignment_snapshot,
            )
            from apps.catalog.services import OfferingAssignmentError

            try:
                assigned = resolve_assignment_snapshot(
                    program_id=str(data["program_id"]),
                    intake_id=str(data["intake_id"]),
                    country=data.get("country"),
                    nationality=data.get("nationality"),
                    institution_id=str(data["institution_id"]) if data.get("institution_id") else None,
                    emit_audit=True,
                    audit_source="application_create",
                    audit_actor_id=str(getattr(request.user, "id", "")) or None,
                    audit_actor_role=getattr(request.user, "role", None),
                    audit_domain_host=host,
                )
            except AssignmentConfigurationError as exc:
                return Response(
                    {
                        "success": False,
                        "error": exc.message,
                        "code": exc.code,
                        "retryable": True,
                    },
                    status=status.HTTP_503_SERVICE_UNAVAILABLE,
                )
            except OfferingAssignmentError as exc:
                return Response(
                    {"success": False, "error": str(exc), "code": getattr(exc, "code", "NO_ELIGIBLE_OFFERING")},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            data["program"] = assigned.program_name
            data["intake"] = assigned.intake_name
            data["institution"] = assigned.institution_name
            required_documents = assigned.required_documents
        else:
            # Legacy string-create path (R15.7): the application is created from
            # the legacy ``program``/``intake``/``institution`` display strings
            # rather than canonical ``program_id``/``intake_id``. This remains
            # fully functional for backward compatibility; we only record a
            # warning + metric so legacy-path usage is observable. Labels carry
            # no PII — only the actor role and whether a legacy institution
            # string was supplied.
            emit_metric(
                "legacy_string_create",
                actor_role=getattr(request.user, "role", None) or "unknown",
                has_institution=bool(data.get("institution")),
            )
            logger.warning(
                "Legacy string-create path used for application creation "
                "(no canonical program_id/intake_id supplied)."
            )
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
            program_id=str(assigned.canonical_program.id) if assigned else None,
            intake_id=str(assigned.intake.id) if assigned else None,
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
        # Pre-populate the (stale) application_fee snapshot column ONLY from the
        # canonical offering — never a display-name lookup or an invented default
        # (DATA-05, R7.4/R7.5). A missing/ambiguous fee leaves the column NULL;
        # payment-time resolution fails closed with FEE_NOT_CONFIGURED (task 5.4).
        offering = assigned.offering if assigned else None
        if offering is not None:
            try:
                from apps.documents.fee_resolver import FeeResolver

                resolved_fee = FeeResolver().resolve_for_offering(
                    offering,
                    data.get("nationality"),
                    data.get("country"),
                )
                application_fee = resolved_fee.amount
            except Exception:
                logger.info(
                    "No canonical application fee for offering %s during create; "
                    "leaving snapshot NULL (fail closed at payment time)",
                    getattr(offering, "id", None),
                )

        create_kwargs = {
            "user_id": str(request.user.id), "application_number": _generate_application_number(data.get('institution', '')),
            "public_tracking_code": _generate_tracking_code(data.get('institution', '')), "full_name": data["full_name"],
            "nrc_number": data.get("nrc_number") or "", "passport_number": data.get("passport_number") or "",
            "date_of_birth": data["date_of_birth"], "sex": data["sex"], "phone": data["phone"],
            "email": data["email"], "residence_town": data["residence_town"],
            "country": data.get("country") or "Zambia",
            "nationality": data.get("nationality", "Zambian"), "program": data["program"],
            "next_of_kin_name": data.get("next_of_kin_name") or "",
            "next_of_kin_phone": data.get("next_of_kin_phone") or "",
            "intake": data["intake"], "institution": data["institution"], "application_fee": application_fee,
            "status": "draft", "version": 1,
        }
        # Optional student-facing draft label (admissions-v2 task 6.2, R10.9).
        # The serializer validates it (<=255); persist a real value and
        # normalise an empty string to NULL so the client falls back to the
        # program display snapshot. Before task 6.2 this field was silently
        # dropped here (finding STU-12).
        _draft_name = (data.get("draft_name") or "").strip()
        if _draft_name:
            create_kwargs["draft_name"] = _draft_name
        if assigned:
            # Snapshot the derived canonical assignment + configuration onto the
            # application row (design §7.2/§9.3). The display strings above are
            # snapshots too; the canonical IDs are the sole routing authority.
            create_kwargs.update(assigned.snapshot_columns())
        application = Application.objects.create(**create_kwargs)
        response_data = ApplicationSerializer(application).data
        response_data["assigned_school"] = {
            "id": str(assigned.institution.id),
            "name": assigned.institution.name,
            "code": assigned.institution.code,
        } if assigned else None
        response_data["required_documents"] = required_documents
        # Return the configuration version so the client can pin the snapshot it
        # was assigned against (R7.2); null on the legacy string-create path.
        response_data["configuration_version"] = (
            assigned.configuration_version if assigned else None
        )
        return Response({"success": True, "data": response_data}, status=status.HTTP_201_CREATED)


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
    # R3.1/R3.2: authority is the derived tenant capability
    # (``tenant.application.review``) composed with scope-before-lookup, not a
    # raw-role permission class. ``IsAuthenticated`` only rejects anonymous
    # callers (401); the capability + scope decision is made per-object in the
    # view via ``resolve_scoped_application`` so the disclosure policy (Student /
    # out-of-tenant → 404 mask; in-scope missing capability → 403) is enforced.
    permission_classes = [IsAuthenticated]
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
        from apps.applications.review_workspace_service import (
            ApplicationReviewWorkspaceService,
            read_expected_version,
        )
        from apps.common.tenant_authorization import (
            require_application_capability,
            resolve_scoped_application,
        )

        # Scope-before-lookup + tenant.application.review capability (role is only
        # an input to the derivation inside AdminCapabilityService, never a second
        # raw-role gate). Masks a Student / cross-tenant id as 404; a reviewer in
        # scope without the review capability gets a non-revealing 403.
        app = resolve_scoped_application(
            request, application_id, capability="tenant.application.review"
        )

        # Versioned command (task 9.4). The workspace publishes the version it
        # read; a decision carrying an older one is refused with VERSION_CONFLICT
        # (409) rather than overwriting a newer decision that is not on the
        # reviewer's screen. Opt-in: a caller that supplies nothing is unaffected.
        expected_version = read_expected_version(request)
        ApplicationReviewWorkspaceService.assert_version(app, expected_version)

        if isinstance(request.data, dict) and (request.data.get("paymentStatus") or request.data.get("payment_status")):
            # A payment decision is *money*, and it needs its own capability
            # (task 9.4, AUTH-02). This route carries two different commands
            # behind one path, and until now both were authorised by
            # ``tenant.application.review``: an operator granted review authority
            # could verify a fee they were never granted authority over, and the
            # workspace's published ``verify_payment: tenant.payment.verify``
            # promised a check the backend did not make. The composition is
            # deliberate — review scope still has to hold, because the actor is
            # deciding about *this* application — and this adds the second
            # capability the ledger write requires.
            require_application_capability(request, app, "tenant.payment.verify")

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
                from apps.documents.models import Payment as _Payment

                service = PaymentService()

                # An admin verifying an application that has no Payment row at
                # all is recording money that arrived outside the platform. That
                # is a ``force_approved`` ledger row (ADR-002), routed through
                # ``force_approve`` → ``_transition`` so the security-retention
                # audit is emitted. Task 8.2 deleted the alternative — the
                # synthetic zero-amount ``successful`` row — because it was
                # indistinguishable in the ledger from a real collection.
                use_force_approve = (
                    payment_status == "verified"
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
                    # The application already has a Payment row, so the review
                    # is a decision *about that row* (verify / reject / defer /
                    # reopen) rather than a record of off-platform money.
                    # ``review_application_payment`` owns that decision, with
                    # the CANNOT_REVERSE_SUCCESSFUL_PAYMENT guard below (R2.1,
                    # R2.2).
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
                if code == "INVALID_STATUS_TRANSITION":
                    return Response(
                        {
                            "success": False,
                            "error": {
                                "code": "INVALID_STATUS_TRANSITION",
                                "message": "This payment is in a terminal state and cannot be changed.",
                            },
                        },
                        status=status.HTTP_409_CONFLICT,
                    )
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

            # R10.5/R10.8: emit an institution-scoped tenant Audit_Event for
            # the admin payment-verification (review) decision so a tenant
            # admin can audit it for their own school. Never blocks the
            # response — TenantAuditService swallows writer failures.
            try:
                from apps.catalog.tenant_audit_service import TenantAuditService

                latest_payment_id = (
                    Payment.objects.filter(application_id=app.id)
                    .order_by("-created_at")
                    .values_list("id", flat=True)
                    .first()
                )
                TenantAuditService.record_payment_verification(
                    payment_id=latest_payment_id,
                    application_id=app.id,
                    institution_id=getattr(app, "institution_ref_id", None),
                    outcome_status=payment_status,
                    outcome_code="ADMIN_REVIEW",
                    actor_id=getattr(request.user, "id", None),
                    actor_role=getattr(request.user, "role", None),
                    reason=notes,
                    request=request,
                )
            except Exception:  # pragma: no cover - audit must never block a write
                pass

            # The payment decision changed what the workspace shows, so the
            # version every other command is checked against advances (task 9.4).
            new_version = ApplicationReviewWorkspaceService.bump_version(app)
            return Response({"success": True, "data": {
                "message": f"Payment status updated to {payment_status}",
                "application_id": str(app.id),
                "payment_status": payment_status,
                "version": new_version,
                "allowed_transitions": ApplicationReviewWorkspaceService.allowed_transitions(app),
            }})

        serializer = ApplicationReviewSerializer(data=self._normalize_legacy_review_payload(request.data))
        if not serializer.is_valid():
            return Response({"success": False, "error": "Validation failed", "code": "VALIDATION_ERROR", "details": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)
        new_status = serializer.validated_data["new_status"]
        notes = serializer.validated_data.get("notes", "")
        force = serializer.validated_data.get("force", False)
        reason = serializer.validated_data.get("reason", "")

        try:
            with transaction.atomic():
                app = resolve_scoped_application(
                    request,
                    application_id,
                    capability="tenant.application.review",
                    select_for_update=True,
                )

                # Re-checked on the LOCKED row (task 9.4). The check above the
                # transaction rejects an obviously stale command early; this one
                # is the authoritative guard, because only here can no concurrent
                # command move the row between the read and the write.
                ApplicationReviewWorkspaceService.assert_version(app, expected_version)

                if new_status == "approved" and not force:
                    # All statuses that mean "payment resolved" - includes legacy (verified, paid) and current (successful, force_approved, deferred)
                    has_verified = (
                        app.payment_status in RESOLVED_PAYMENT_STATUSES
                        or Payment.objects.filter(
                            application_id=application_id,
                            status__in=RESOLVED_PAYMENT_STATUSES,
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
                            status=getattr(exc, "status_code", None) or status.HTTP_400_BAD_REQUEST,
                        )
                    # R10.5/R10.8: an admin-forced submission is a review decision;
                    # emit an institution-scoped tenant Audit_Event before the early
                    # return so this path is observable alongside other review
                    # decisions. Never blocks the response.
                    try:
                        from apps.catalog.tenant_audit_service import TenantAuditService

                        TenantAuditService.record_review_decision(
                            application_id=locked_app.id,
                            institution_id=getattr(locked_app, "institution_ref_id", None),
                            old_status=old_status,
                            new_status=new_status,
                            actor_id=getattr(request.user, "id", None),
                            actor_role=getattr(request.user, "role", None),
                            reason=reason or notes,
                            request=request,
                        )
                    except Exception:  # pragma: no cover - audit must never block a write
                        pass
                    locked_app.refresh_from_db(fields=["status"])
                    new_version = ApplicationReviewWorkspaceService.bump_version(locked_app)
                    return Response({"success": True, "data": {
                        "message": f"Status updated from {old_status} to {new_status}",
                        "application_id": str(locked_app.id),
                        "old_status": old_status,
                        "new_status": new_status,
                        "version": new_version,
                        "allowed_transitions": ApplicationReviewWorkspaceService.allowed_transitions(locked_app),
                    }})

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
        except Application.DoesNotExist:
            return Response({"success": False, "error": "Application not found", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)

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

        if new_status in ("approved", "rejected"):
            # Reconcile the Intake_Offering counter from the canonical rows
            # (admissions-v2 task 5.3, R10.6 / DATA-02): when the application
            # carries the canonical offering + intake identity, recompute the
            # ProgramIntake counter keyed on those IDs so a same-name other
            # tenant is never swept in. Legacy rows fall back to the name-based
            # sync.
            from apps.applications.capacity_service import CapacityService
            from apps.applications.intake_enforcer import IntakeEnforcer

            offering_id, intake_id = CapacityService.offering_ids(app)
            try:
                if offering_id and intake_id:
                    # Canonical: reconcile only by IDs. The name-based
                    # sync_enrollment must NOT run for a canonical app — it keys
                    # program_intakes by program NAME and would sweep a same-name
                    # other tenant's applications into this counter (DATA-02).
                    CapacityService.reconcile(offering_id, intake_id)
                elif has_resolved_intake:
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

        # R8.4: every command returns the allowed next actions and the version a
        # follow-up command must carry, so the reviewer's next move comes from the
        # server rather than from a client-side transition table.
        response_data = {
            "message": f"Status updated from {old_status} to {new_status}",
            "application_id": str(app.id),
            "old_status": old_status,
            "new_status": new_status,
            "version": ApplicationReviewWorkspaceService.bump_version(app),
            "allowed_transitions": ApplicationReviewWorkspaceService.allowed_transitions(app),
        }
        # Capacity echo resolved through the reviewed application's own canonical
        # ``intake_id`` — never the ``intake`` display snapshot (remediation L1,
        # DATA-01 / STU-01). ``app`` came from ``resolve_scoped_application``
        # under ``tenant.application.review``, so the canonical-id lookup is
        # scoped-before-lookup by construction. A legacy row without a canonical
        # intake id echoes no capacity rather than a same-name other tenant's.
        # Logged at ERROR rather than DEBUG so a resolution failure is observable.
        try:
            from apps.applications.canonical_reads import intake_capacity_fields

            response_data.update(intake_capacity_fields(app))
        except Exception:
            logger.exception(
                "Could not enrich review response for application %s with its "
                "canonical intake capacity",
                app.id,
            )
        # R10.5/R10.8: emit an institution-scoped tenant Audit_Event for the
        # application review decision so a tenant admin can audit review
        # activity for their own school (filtered on ``changes.institution_id``).
        # Never blocks the response — TenantAuditService swallows failures.
        try:
            from apps.catalog.tenant_audit_service import TenantAuditService

            TenantAuditService.record_review_decision(
                application_id=app.id,
                institution_id=getattr(app, "institution_ref_id", None),
                old_status=old_status,
                new_status=new_status,
                actor_id=getattr(request.user, "id", None),
                actor_role=getattr(request.user, "role", None),
                reason=reason or notes,
                request=request,
            )
        except Exception:  # pragma: no cover - audit must never block a write
            pass

        return Response({"success": True, "data": response_data})
