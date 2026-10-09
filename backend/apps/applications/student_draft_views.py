"""Student-facing application views.

Extracted during the views module split (production-readiness-hardening, task 9.1).
Contains views for application creation, drafts, submission, withdrawal,
enrollment confirmation, amendments, waitlist position, and conditions.
"""

import logging

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
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

from apps.accounts.permissions import IsOwnerOrAdmin
from apps.applications.duplicate_checker import DuplicateChecker
from apps.catalog.services import AccessScopeService
from apps.applications.models import (
    Application,
    ApplicationAmendment,
    ApplicationCondition,
    ApplicationDraft,
    ApplicationInterview,
    ApplicationStatusHistory,
)
from apps.documents.models import ApplicationDocument, ApplicationGrade
from apps.applications.serializers import (
    ApplicationCreateSerializer,
    ApplicationListSerializer,
    ApplicationGradeSerializer,
    ApplicationSerializer,
    build_grades_payload,
    build_grades_summary,
    # T15 API remediation
    ApplicationAmendmentRequestSerializer,
    ApplicationConfirmEnrollmentRequestSerializer,
    ApplicationEnvelopeResponseSerializer,
    ApplicationWaitlistPositionResponseSerializer,
)
from apps.applications.services import (
    ApplicationSubmissionError,
    submit_application,
)
from apps.common.idempotency import idempotent
from apps.common.openapi_helpers import ErrorResponseSerializer
from apps.common.pagination import StandardPagination
from apps.documents.models import Payment
from apps.documents.payment_constants import RESOLVED_PAYMENT_STATUSES
from rest_framework.throttling import UserRateThrottle


from ._view_helpers import (
    ApplicationConditionSerializer,
    ApplicationDraftResponseSerializer,
    ApplicationDraftWriteSerializer,
    ApplicationListResponseSerializer,
    ApplicationDocumentsResponseSerializer,
    ApplicationGradeMutationResponseSerializer,
    ApplicationGradeReadSerializer,
    ApplicationGradeRequestSerializer,
    ApplicationGradeMutationSerializer,
    ApplicationResponseSerializer,
    ApplicationSummaryResponseSerializer,
    ApplicationSummarySerializer,
    ApplicationGradesResponseSerializer,
    ConditionVerifyRequestSerializer,
    WithdrawalReasonSerializer,
    WithdrawalResponseSerializer,
    _generate_application_number,
    _generate_tracking_code,
    _with_payment_summary,
)

logger = logging.getLogger(__name__)


def _get_owned_draft_application(request, application_id):
    try:
        application = Application.objects.get(
            id=application_id,
            user_id=str(request.user.id),
            status="draft",
        )
    except (Application.DoesNotExist, DjangoValidationError):
        return None
    return application


def _json_depth(obj, current=0, max_depth=11):
    """Return nesting depth of a JSON-like structure. Stops early if exceeds max_depth."""
    if current > max_depth:
        return current
    if isinstance(obj, dict):
        return max((_json_depth(v, current + 1, max_depth) for v in obj.values()), default=current)
    if isinstance(obj, list):
        return max((_json_depth(item, current + 1, max_depth) for item in obj), default=current)
    return current


APPLICATION_DRAFT_UPDATE_REQUEST_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["expected_version"],
    "properties": {
        "expected_version": {"type": "integer", "minimum": 1},
        "full_name": {"type": "string", "maxLength": 255},
        "nrc_number": {"type": "string", "nullable": True, "maxLength": 20},
        "passport_number": {"type": "string", "nullable": True, "maxLength": 50},
        "date_of_birth": {"type": "string", "format": "date"},
        "sex": {"type": "string", "maxLength": 10},
        "phone": {"type": "string", "maxLength": 20},
        "email": {"type": "string", "format": "email", "maxLength": 255},
        "residence_town": {"type": "string", "maxLength": 100},
        "nationality": {"type": "string", "nullable": True, "maxLength": 100},
        "country": {"type": "string", "nullable": True, "maxLength": 100},
        "address_line_1": {"type": "string", "nullable": True, "maxLength": 255},
        "address_line_2": {"type": "string", "nullable": True, "maxLength": 255},
        "postal_code": {"type": "string", "nullable": True, "maxLength": 20},
        "next_of_kin_name": {"type": "string", "nullable": True, "maxLength": 255},
        "next_of_kin_phone": {"type": "string", "nullable": True, "maxLength": 20},
        "additional_subjects": {},
    },
}


class ApplicationDraftConflictResponseSerializer(ErrorResponseSerializer):
    """A draft conflict, including the version a client must reload."""

    # Idempotency-key conflicts share the 409 status but have no row version,
    # hence optional on the combined response contract.
    current_version = serializers.IntegerField(required=False, min_value=1)


# ---------------------------------------------------------------------------
# Application Create (POST /api/v1/applications/)
# ---------------------------------------------------------------------------

# Note: ApplicationListCreateView handles both list (admin) and create (student).
# It lives in admin_views.py since the GET is admin-oriented; the POST portion
# is student-oriented but kept together for URL routing simplicity.


# ---------------------------------------------------------------------------
# Application Detail / Update / Delete
# ---------------------------------------------------------------------------


@extend_schema_view(
    get=extend_schema(
        operation_id="applications_retrieve",
        tags=["applications"],
        parameters=[
            OpenApiParameter("application_id", OpenApiTypes.UUID, OpenApiParameter.PATH, description="Application UUID."),
        ],
        responses={
            200: OpenApiResponse(response=ApplicationResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
    ),
    patch=extend_schema(
        operation_id="applications_update",
        tags=["applications"],
        parameters=[
            OpenApiParameter("application_id", OpenApiTypes.UUID, OpenApiParameter.PATH, description="Application UUID."),
        ],
        request=ApplicationSerializer,
        responses={
            200: OpenApiResponse(response=ApplicationResponseSerializer),
            400: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
    ),
    delete=extend_schema(
        operation_id="applications_delete",
        tags=["applications"],
        parameters=[
            OpenApiParameter("application_id", OpenApiTypes.UUID, OpenApiParameter.PATH, description="Application UUID."),
        ],
        request=None,
        responses={204: OpenApiResponse(description="Application deleted or already absent.")},
    ),
)
@extend_schema_view(
    get=extend_schema(operation_id="application_retrieve", tags=["applications"]),
    put=extend_schema(operation_id="application_update", tags=["applications"]),
    patch=extend_schema(operation_id="application_partial_update", tags=["applications"]),
    delete=extend_schema(operation_id="application_delete", tags=["applications"]),
)
class ApplicationDetailView(APIView):
    permission_classes = [IsOwnerOrAdmin]
    serializer_class = ApplicationSerializer

    @staticmethod
    def _student_can_mutate_application(request, app) -> bool:
        role = getattr(request.user, 'role', 'student')
        return role in ('admin', 'super_admin') or app.status == 'draft'

    def get(self, request, application_id):
        app = self._get_application(request, application_id)
        if app is None:
            return Response({"success": False, "error": "Application not found", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)
        data = ApplicationSerializer(app).data
        # Include intake capacity info for admin users (Req 18.1). Canonical
        # roles only — the retired non-canonical staff role is removed
        # (task 2.4, R3.4); the backend never issues it.
        #
        # Resolved through the canonical ``intake_id`` this application already
        # carries, never through the ``intake`` display snapshot (remediation
        # L1, DATA-01 / STU-01). ``app`` has already passed scope-before-lookup
        # in ``_get_application``, so keying on its own canonical id cannot
        # reach another tenant — and a legacy row without a canonical intake id
        # publishes nothing at all rather than a same-name other tenant's
        # capacity. The previous ``logger.debug`` hid exactly this defect for as
        # long as it existed, so a resolution failure is now logged at ERROR
        # (observable in error monitoring) while the read still succeeds without
        # the enrichment.
        role = getattr(request.user, 'role', 'student')
        if role in ('admin', 'super_admin'):
            try:
                from apps.applications.canonical_reads import intake_capacity_fields

                data.update(intake_capacity_fields(app))
            except Exception:
                logger.exception(
                    "Could not enrich application %s with its canonical intake capacity",
                    application_id,
                )
        return Response({"success": True, "data": data})

    def patch(self, request, application_id):
        return self._update_application(request, application_id)

    def put(self, request, application_id):
        return self._update_application(request, application_id)

    def _update_application(self, request, application_id):
        app = self._get_application(request, application_id)
        if app is None:
            return Response({"success": False, "error": "Application not found", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)
        if not self._student_can_mutate_application(request, app):
            return Response(
                {"success": False, "error": "Application is not editable", "code": "APPLICATION_NOT_EDITABLE"},
                status=status.HTTP_403_FORBIDDEN,
            )

        role = getattr(request.user, "role", "student")
        if role not in ("admin", "super_admin"):
            # Student draft answers have one write authority: the canonical
            # `/applications/drafts/{id}/` command below. It requires both the
            # version the browser read and a stable idempotency key under a row
            # lock. Leaving this older endpoint writable gave stale clients an
            # unversioned escape hatch and reproduced GATE-13.2-03 (a reload in
            # one tab overwrote a newer answer from another device).
            return Response(
                {
                    "success": False,
                    "error": (
                        "Student draft updates must use the versioned draft "
                        "endpoint and include expected_version and Idempotency-Key."
                    ),
                    "code": "CANONICAL_DRAFT_UPDATE_REQUIRED",
                },
                status=status.HTTP_409_CONFLICT,
            )

        serializer = ApplicationSerializer(app, data=request.data, partial=True, context={'request': request})
        if not serializer.is_valid():
            return Response({"success": False, "error": "Validation failed", "code": "VALIDATION_ERROR", "details": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)
        serializer.save()
        return Response({"success": True, "data": serializer.data})

    def delete(self, request, application_id):
        app = self._get_application(request, application_id)
        if app is None:
            return Response(status=status.HTTP_204_NO_CONTENT)
        if app.status != 'draft':
            return Response(
                {"success": False, "error": "Only draft applications can be deleted", "code": "APPLICATION_NOT_EDITABLE"},
                status=status.HTTP_403_FORBIDDEN,
            )
        role = getattr(request.user, 'role', 'student')
        if role not in ('admin', 'super_admin') and str(app.user_id) != str(request.user.id):
            return Response(
                {"success": False, "error": "Permission denied", "code": "INSUFFICIENT_PERMISSIONS"},
                status=status.HTTP_403_FORBIDDEN,
            )
        if Payment.objects.filter(
            application_id=app.id,
            status__in=RESOLVED_PAYMENT_STATUSES,
        ).exists():
            return Response(
                {
                    "success": False,
                    "error": (
                        "This draft has payment activity and cannot be deleted. "
                        "Continue the application or contact admissions for help."
                    ),
                    "code": "DRAFT_HAS_PAYMENT_ACTIVITY",
                },
                status=status.HTTP_409_CONFLICT,
            )

        try:
            self._delete_application_graph(app)
        except Exception:
            logger.exception("Failed to delete application %s", application_id)
            return Response(
                {
                    "success": False,
                    "error": "Application could not be deleted. Please try again.",
                    "code": "APPLICATION_DELETE_FAILED",
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)

    @staticmethod
    def _delete_application_graph(application):
        """Delete an application and dependents in one transaction.

        Use the application instance rather than a hand-maintained child-table
        list so reverse relations and database-level cascades stay aligned with
        the live schema.
        """
        with transaction.atomic():
            application.delete()

    def _get_application(self, request, application_id):
        try:
            app = _with_payment_summary(
                Application.objects.select_related('user').prefetch_related(
                    'applicationdocument_set', 'applicationgrade_set', 'applicationinterview_set',
                )
            ).get(id=application_id)
        except Application.DoesNotExist:
            return None
        if not IsOwnerOrAdmin().has_object_permission(request, self, app):
            return None
        # Tenant scope: a non-super-admin admin may only read applications within
        # their membership/grant scope. An out-of-scope read must be
        # indistinguishable from not-found (return None → 404), never a 200 that
        # leaks the other school's record (R4.4).
        role = getattr(request.user, 'role', 'student')
        if role == 'admin' and not AccessScopeService().filter_applications(
            Application.objects.filter(id=app.id), request.user
        ).exists():
            try:
                from apps.catalog.tenant_audit_service import TenantAuditService

                TenantAuditService.record_scope_denied(
                    resource_type="application",
                    resource_id=app.id,
                    actor_id=getattr(request.user, "id", None),
                    actor_role=role,
                    request=request,
                )
            except Exception:  # pragma: no cover - audit must never block the read
                pass
            return None
        return app


@extend_schema_view(
    get=extend_schema(operation_id="application_details_retrieve", tags=["applications"]),
    put=extend_schema(operation_id="application_details_update", tags=["applications"]),
    patch=extend_schema(operation_id="application_details_partial_update", tags=["applications"]),
    delete=extend_schema(operation_id="application_details_delete", tags=["applications"]),
)
class ApplicationDetailsView(ApplicationDetailView):
    """Alias for ApplicationDetailView at /<id>/details/ with distinct operation IDs."""
    pass


# ---------------------------------------------------------------------------
# Draft
# ---------------------------------------------------------------------------


@extend_schema_view(
    get=extend_schema(
        operation_id="applications_drafts_list",
        tags=["applications"],
        responses={200: OpenApiResponse(response=ApplicationListResponseSerializer)},
    ),
    post=extend_schema(
        operation_id="applications_drafts_create",
        tags=["applications"],
        request=ApplicationCreateSerializer,
        responses={
            201: OpenApiResponse(response=ApplicationResponseSerializer),
            400: OpenApiResponse(response=ErrorResponseSerializer),
            403: OpenApiResponse(response=ErrorResponseSerializer),
            409: OpenApiResponse(response=ErrorResponseSerializer),
        },
    ),
)
class ApplicationDraftListView(APIView):
    """Canonical student draft collection.

    Online drafts are real ``Application`` rows with ``status='draft'``. The
    historical ``/applications/draft/`` endpoint remains as a compatibility
    cache for wizard snapshots; this collection exposes the canonical resource
    the frontend already uses for multi-draft lists.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = ApplicationListSerializer

    def get(self, request):
        queryset = (
            Application.objects.select_related("payment_verified_by")
            .prefetch_related("applicationgrade_set", "payment_set")
            .filter(user_id=str(request.user.id), status="draft")
        )
        queryset = queryset.order_by("-updated_at", "-created_at", "-id")

        paginator = StandardPagination()
        page = paginator.paginate_queryset(queryset, request)
        if page is not None:
            return paginator.get_paginated_response(ApplicationListSerializer(page, many=True).data)

        return Response(ApplicationListSerializer(queryset, many=True).data)

    @idempotent
    def post(self, request):
        """Start a canonical online draft application (admissions-v2 task 6.2).

        The draft START is the canonical entry point for the multi-draft
        lifecycle (R10.1/R10.9):

        * It requires the **minimum canonical selection** — a canonical program
          and intake — so a fresh draft is always canonically assigned and never
          a legacy display-string-only row. A start without that selection fails
          closed with the stable ``MINIMUM_SELECTION_REQUIRED`` code (finding
          STU-12: the client used to POST an empty payload here).
        * It is **idempotent** under an ``Idempotency-Key`` header (R10.3, design
          §14.2): replaying the same key + body returns the same draft instead of
          creating a second row. Absent a key, a duplicate program+intake start
          still returns a 409 that names the existing draft — it never silently
          adopts it (steering: Student Draft Lifecycle).

        Creation itself is delegated to the canonical application create so
        ``/applications/`` and ``/applications/drafts/`` cannot drift (tenant
        binding, offering assignment, duplicate protection, fee snapshot).
        """
        if not (request.data.get("program_id") and request.data.get("intake_id")):
            return Response(
                {
                    "success": False,
                    "error": "Select a programme and intake to start an application.",
                    "code": "MINIMUM_SELECTION_REQUIRED",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        from apps.applications.admin_review_views import ApplicationListCreateView

        return ApplicationListCreateView().post(request)


@extend_schema_view(
    get=extend_schema(
        operation_id="applications_drafts_retrieve",
        tags=["applications"],
        parameters=[
            OpenApiParameter("application_id", OpenApiTypes.UUID, OpenApiParameter.PATH, description="Draft application UUID."),
        ],
        responses={
            200: OpenApiResponse(response=ApplicationResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
    ),
    patch=extend_schema(
        operation_id="applications_drafts_update",
        tags=["applications"],
        parameters=[
            OpenApiParameter("application_id", OpenApiTypes.UUID, OpenApiParameter.PATH, description="Draft application UUID."),
            OpenApiParameter(
                "Idempotency-Key",
                OpenApiTypes.STR,
                OpenApiParameter.HEADER,
                required=True,
                description="Stable key for this exact draft update command.",
            ),
        ],
        request={"application/json": APPLICATION_DRAFT_UPDATE_REQUEST_SCHEMA},
        responses={
            200: OpenApiResponse(response=ApplicationResponseSerializer),
            400: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
            409: OpenApiResponse(response=ApplicationDraftConflictResponseSerializer),
        },
    ),
    delete=extend_schema(
        operation_id="applications_drafts_delete",
        tags=["applications"],
        parameters=[
            OpenApiParameter("application_id", OpenApiTypes.UUID, OpenApiParameter.PATH, description="Draft application UUID."),
        ],
        request=None,
        responses={
            204: OpenApiResponse(description="Draft application deleted."),
            404: OpenApiResponse(response=ErrorResponseSerializer),
            409: OpenApiResponse(response=ErrorResponseSerializer),
        },
    ),
)
class ApplicationDraftDetailView(APIView):
    """Canonical student draft detail/update/delete for real draft applications."""

    permission_classes = [IsAuthenticated]
    serializer_class = ApplicationSerializer

    def get(self, request, application_id):
        application = _get_owned_draft_application(request, application_id)
        if application is None:
            return Response({"success": False, "error": "Draft not found", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)
        return Response({"success": True, "data": ApplicationSerializer(application).data})

    @idempotent
    def patch(self, request, application_id):
        """Update one owned draft under an optimistic-concurrency row lock.

        ``expected_version`` is part of the JSON command body so the
        idempotency request hash covers both the proposed answers and the
        version they were based on. The lock makes two distinct keys carrying
        the same version serialize: exactly one advances the row; the other
        observes the new version and is refused without mutation.
        """

        if not request.headers.get("Idempotency-Key"):
            return Response(
                {
                    "success": False,
                    "error": "Idempotency-Key header is required for draft updates.",
                    "code": "IDEMPOTENCY_KEY_REQUIRED",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        raw_expected_version = request.data.get("expected_version")
        if raw_expected_version in (None, ""):
            return Response(
                {
                    "success": False,
                    "error": "expected_version is required for draft updates.",
                    "code": "EXPECTED_VERSION_REQUIRED",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            if isinstance(raw_expected_version, bool):
                raise ValueError
            expected_version = int(raw_expected_version)
            if expected_version < 1:
                raise ValueError
        except (TypeError, ValueError):
            return Response(
                {
                    "success": False,
                    "error": "expected_version must be a positive integer.",
                    "code": "EXPECTED_VERSION_INVALID",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            try:
                application = Application.objects.select_for_update().get(
                    id=application_id,
                    user_id=str(request.user.id),
                    status="draft",
                )
            except (Application.DoesNotExist, DjangoValidationError):
                return Response(
                    {"success": False, "error": "Draft not found", "code": "NOT_FOUND"},
                    status=status.HTTP_404_NOT_FOUND,
                )

            current_version = int(application.version or 1)
            if expected_version != current_version:
                return Response(
                    {
                        "success": False,
                        "error": "This draft changed since you loaded it. Reload it before saving again.",
                        "code": "VERSION_CONFLICT",
                        "current_version": current_version,
                    },
                    status=status.HTTP_409_CONFLICT,
                )

            update_data = request.data.copy()
            update_data.pop("expected_version", None)
            serializer = ApplicationSerializer(
                application,
                data=update_data,
                partial=True,
                context={"request": request},
            )
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

            updated = serializer.save()
            payload = ApplicationSerializer(updated).data

        return Response({"success": True, "data": payload})

    def delete(self, request, application_id):
        application = _get_owned_draft_application(request, application_id)
        if application is None:
            return Response({"success": False, "error": "Draft not found", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)

        has_payment_activity = Payment.objects.filter(
            application_id=application.id,
            status__in=RESOLVED_PAYMENT_STATUSES,
        ).exists()
        if has_payment_activity:
            return Response(
                {
                    "success": False,
                    "error": (
                        "This draft has payment activity and cannot be deleted. "
                        "Continue the application or contact admissions for help."
                    ),
                    "code": "DRAFT_HAS_PAYMENT_ACTIVITY",
                },
                status=status.HTTP_409_CONFLICT,
            )

        application.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class DraftRenameSerializer(serializers.Serializer):
    """Validated request body for the draft rename command (task 6.2, R10.9).

    ``draft_name`` is trimmed (DRF default) and may not be blank, so a rename to
    empty/whitespace fails validation rather than silently clearing the label.
    """

    draft_name = serializers.CharField(max_length=255)


@extend_schema_view(
    patch=extend_schema(
        operation_id="applications_drafts_rename",
        tags=["applications"],
        parameters=[
            OpenApiParameter("application_id", OpenApiTypes.UUID, OpenApiParameter.PATH, description="Draft application UUID."),
        ],
        request=DraftRenameSerializer,
        responses={
            200: OpenApiResponse(response=ApplicationResponseSerializer),
            400: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
    ),
)
class ApplicationDraftRenameView(APIView):
    """Rename (label) a student's own online draft — a narrow, validated command.

    R10.9: draft rename is a *supported, validated server field* (``draft_name``),
    not the silently-dropped unsupported field of finding STU-12. The command:

    * is **owner-scoped** — ``_get_owned_draft_application`` scopes to the caller
      before lookup, so a non-owned or absent draft id is masked as an
      indistinguishable 404 (design §5.2 owner disclosure policy);
    * writes **only** ``draft_name`` — it never mutates the canonical assignment
      identifiers or their display snapshots (design §7.2; reassignment is the
      reroute command, task 6.4).
    """

    permission_classes = [IsAuthenticated]
    serializer_class = DraftRenameSerializer

    def patch(self, request, application_id):
        application = _get_owned_draft_application(request, application_id)
        if application is None:
            return Response(
                {"success": False, "error": "Draft not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = DraftRenameSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {"success": False, "error": "Validation failed", "code": "VALIDATION_ERROR", "details": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from django.utils import timezone

        application.draft_name = serializer.validated_data["draft_name"].strip()
        application.updated_at = timezone.now()
        application.save(update_fields=["draft_name", "updated_at"])
        return Response({"success": True, "data": ApplicationSerializer(application).data})


class DraftChangeSelectionSerializer(serializers.Serializer):
    """Request body for the change-selection (reroute) command (task 6.4).

    Canonical IDs only (R7.1/R7.2, DATA-01): a display programme/intake string
    is not accepted here — or anywhere else on a draft write.
    ``assignment_version`` is the optional optimistic version the client last
    read; a stale value returns ``VERSION_CONFLICT`` instead of overwriting a
    concurrent reroute (R10.3).
    """

    program_id = serializers.UUIDField()
    intake_id = serializers.UUIDField()
    institution_id = serializers.UUIDField(required=False, allow_null=True)
    assignment_version = serializers.IntegerField(required=False, min_value=1)


@extend_schema_view(
    post=extend_schema(
        operation_id="applications_drafts_change_selection",
        tags=["applications"],
        parameters=[
            OpenApiParameter("application_id", OpenApiTypes.UUID, OpenApiParameter.PATH, description="Draft application UUID."),
        ],
        request=DraftChangeSelectionSerializer,
        responses={
            200: OpenApiResponse(response=ApplicationResponseSerializer),
            400: OpenApiResponse(response=ErrorResponseSerializer),
            403: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
            409: OpenApiResponse(response=ErrorResponseSerializer),
            503: OpenApiResponse(response=ErrorResponseSerializer),
        },
    ),
)
class ApplicationDraftChangeSelectionView(APIView):
    """Change a draft application's programme/intake selection — one command.

    Admissions-v2 task 6.4 (R7.2, R10.5; findings STU-01, DATA-01; design §7.2).

    The generic draft PATCH no longer accepts any assignment field, so this is
    the *only* way an assignment moves. In one transaction the command:

    * scopes the draft to the caller **before** lookup and locks the row (a
      non-owned or absent draft id is an indistinguishable 404);
    * honours the trusted tenant host — a mismatching explicit
      ``institution_id`` is rejected with ``INSTITUTION_OVERRIDE_NOT_PERMITTED``
      and no mutation;
    * resolves the target from canonical IDs only, fail-closed
      (``CONFIGURATION_UNAVAILABLE`` 503 retryable);
    * rejects a genuine reassignment once **any** payment activity exists
      (``ASSIGNMENT_LOCKED_BY_PAYMENT`` 409) and returns a structured recovery
      path so the student is never dead-ended;
    * otherwise updates every canonical ID, display snapshot, configuration
      version, requirement + eligibility snapshot, the re-resolved fee, and the
      cleared dependent answers together, bumping the optimistic versions;
    * returns the change summary. Replaying the same selection is an idempotent
      no-op (``changed: false``).
    """

    permission_classes = [IsAuthenticated]
    serializer_class = DraftChangeSelectionSerializer

    @idempotent
    def post(self, request, application_id):
        from apps.applications.change_selection_service import (
            SelectionChangeError,
            change_application_selection,
        )
        from apps.catalog.services import InstitutionContextService

        serializer = DraftChangeSelectionSerializer(data=request.data)
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
        data = serializer.validated_data

        host = request.headers.get("X-Forwarded-Host") or request.get_host()
        resolved_institution = InstitutionContextService().resolve(host).institution

        try:
            result = change_application_selection(
                application_id=application_id,
                actor_id=request.user.id,
                program_id=str(data["program_id"]),
                intake_id=str(data["intake_id"]),
                expected_assignment_version=data.get("assignment_version"),
                resolved_institution=resolved_institution,
                requested_institution_id=data.get("institution_id"),
                actor_role=getattr(request.user, "role", None),
                host=host,
            )
        except SelectionChangeError as exc:
            body = {"success": False, "error": exc.message, "code": exc.code}
            if exc.retryable:
                body["retryable"] = True
            if exc.recovery:
                body["recovery"] = exc.recovery
            body.update(exc.details)
            return Response(body, status=exc.status_code)

        payload = ApplicationSerializer(result.application).data
        payload["required_documents"] = result.application.requirements_snapshot or []
        payload["change_summary"] = result.summary()
        return Response({"success": True, "data": payload})


@extend_schema_view(
    get=extend_schema(
        operation_id="applications_draft_retrieve",
        tags=["applications"],
        responses={
            200: OpenApiResponse(response=ApplicationDraftResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
    ),
    post=extend_schema(
        operation_id="applications_draft_save",
        tags=["applications"],
        request=ApplicationDraftWriteSerializer,
        responses={
            200: OpenApiResponse(response=ApplicationDraftResponseSerializer),
            201: OpenApiResponse(response=ApplicationDraftResponseSerializer),
        },
    ),
)
class ApplicationDraftView(APIView):
    """Deprecated compatibility endpoint for latest wizard snapshot payloads.

    Do not use this endpoint for production multi-draft routing. Canonical
    online drafts are ``Application(status='draft')`` rows exposed through
    ``/applications/drafts/`` and ``/applications/drafts/{id}/``.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = ApplicationDraftWriteSerializer

    def get(self, request):
        from apps.applications.serializers import ApplicationDraftSerializer

        user_id = str(request.user.id)
        draft = ApplicationDraft.objects.filter(user_id=user_id).order_by("-updated_at").first()
        if not draft:
            return Response({"success": False, "error": "No draft found", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)
        return Response({"success": True, "data": ApplicationDraftSerializer(draft).data})

    def post(self, request):
        import json as _json
        from apps.applications.serializers import ApplicationDraftSerializer

        user_id = str(request.user.id)
        draft_data = request.data.get("draft_data", {})

        # --- Input validation: size and depth caps (DoS prevention) ---
        MAX_DRAFT_DATA_BYTES = 512 * 1024  # 512KB
        try:
            serialized = _json.dumps(draft_data)
        except (TypeError, ValueError):
            return Response(
                {"success": False, "error": {"code": "INVALID_DRAFT_DATA", "message": "draft_data must be JSON-serializable"}},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(serialized.encode("utf-8")) > MAX_DRAFT_DATA_BYTES:
            return Response(
                {"success": False, "error": {"code": "DRAFT_TOO_LARGE", "message": f"draft_data exceeds {MAX_DRAFT_DATA_BYTES} bytes"}},
                status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            )
        if _json_depth(draft_data) > 10:
            return Response(
                {"success": False, "error": {"code": "DRAFT_TOO_NESTED", "message": "draft_data exceeds maximum nesting depth of 10"}},
                status=status.HTTP_400_BAD_REQUEST,
            )
        application_id = request.data.get("application_id")
        if application_id:
            try:
                application = Application.objects.only("id", "user_id").get(id=application_id)
            except DjangoValidationError:
                return Response(
                    {"success": False, "error": "Invalid application id", "code": "VALIDATION_ERROR"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            except Application.DoesNotExist:
                return Response(
                    {"success": False, "error": "Application not found", "code": "NOT_FOUND"},
                    status=status.HTTP_404_NOT_FOUND,
                )

            role = getattr(request.user, "role", "student")
            if role not in ("admin", "super_admin") and str(application.user_id) != user_id:
                return Response(
                    {"success": False, "error": "Permission denied", "code": "INSUFFICIENT_PERMISSIONS"},
                    status=status.HTTP_403_FORBIDDEN,
                )

        draft, created = ApplicationDraft.objects.update_or_create(user_id=user_id, application_id=application_id, defaults={"draft_data": draft_data})
        resp_status = status.HTTP_201_CREATED if created else status.HTTP_200_OK
        return Response({"success": True, "data": ApplicationDraftSerializer(draft).data}, status=resp_status)
