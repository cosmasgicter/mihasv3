"""Student-facing application views.

Extracted during the views module split (production-readiness-hardening, task 9.1).
Contains views for application creation, drafts, submission, withdrawal,
enrollment confirmation, amendments, waitlist position, and conditions.
"""

import logging

from django.db import transaction
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

from apps.accounts.permissions import IsOwnerOrAdmin, is_super_admin
from apps.catalog.services import AccessScopeService
from apps.applications.duplicate_checker import DuplicateChecker
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
from apps.documents.models import Payment
from rest_framework.throttling import UserRateThrottle


from ._view_helpers import (
    ApplicationConditionSerializer,
    ApplicationDraftResponseSerializer,
    ApplicationDraftWriteSerializer,
    ApplicationDocumentsResponseSerializer,
    ApplicationGradeMutationResponseSerializer,
    ApplicationGradeReadSerializer,
    ApplicationGradeRequestSerializer,
    ApplicationGradeMutationSerializer,
    ApplicationRequiredDocumentsResponseSerializer,
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




# ---------------------------------------------------------------------------
# Application Documents (student read)
# ---------------------------------------------------------------------------


@extend_schema_view(
    get=extend_schema(
        operation_id="applications_documents_list",
        tags=["applications"],
        parameters=[
            OpenApiParameter("application_id", OpenApiTypes.UUID, OpenApiParameter.PATH, description="Application UUID."),
        ],
        responses={
            200: OpenApiResponse(response=ApplicationDocumentsResponseSerializer),
            403: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
    )
)
class ApplicationDocumentsView(APIView):
    permission_classes = [IsOwnerOrAdmin]

    def get(self, request, application_id):
        from apps.documents.serializers import DocumentSerializer

        try:
            app = _with_payment_summary(Application.objects.all()).get(id=application_id)
        except Application.DoesNotExist:
            return Response({"success": False, "error": "Application not found", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)
        if not IsOwnerOrAdmin().has_object_permission(request, self, app):
            return Response({"success": False, "error": "Permission denied", "code": "INSUFFICIENT_PERMISSIONS"}, status=status.HTTP_403_FORBIDDEN)
        # Tenant scope: a non-super-admin admin may only read documents for
        # applications within their membership/grant scope. An out-of-scope
        # read is masked as a genuine not-found so the other school's record
        # (and its documents) cannot be inferred (R4.4, R18.4). Scope comes
        # only from AccessScopeService — never from the admin role alone.
        role = getattr(request.user, "role", "student")
        if role == "admin" and not AccessScopeService().filter_applications(
            Application.objects.filter(id=app.id), request.user
        ).exists():
            return Response({"success": False, "error": "Application not found", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)
        docs = ApplicationDocument.objects.select_related('application', 'verified_by').filter(application_id=application_id).exclude(
            verification_status='deleted'
        )
        listed = list(docs)
        serialized = DocumentSerializer(listed, many=True).data

        # Synthesize entries for legacy applications whose ``result_slip_url``
        # or ``extra_kyc_url`` was set on the Application row directly without
        # a matching ApplicationDocument record. The snapshot columns hold
        # either a legacy value (a URL or key) or, since design R4-b, the id of
        # the current document: a presence marker, never a link. The check
        # therefore compares the snapshot with the listed ids and with the
        # STORED ``file_url`` / ``storage_key`` values (not the signed output),
        # and skips a pair when any document of a covering type is listed.
        known_values = (
            {str(d.id) for d in listed}
            | {d.file_url for d in listed if d.file_url}
            | {d.storage_key for d in listed if d.storage_key}
        )
        listed_types = {d.document_type for d in listed if d.document_type}
        legacy_pairs = [
            ("result_slip", {"result_slip"}, "Result Slip", getattr(app, "result_slip_url", None)),
            (
                "extra_kyc",
                {"extra_kyc", "nrc", "passport"},
                "Identity Support Document",
                getattr(app, "extra_kyc_url", None),
            ),
        ]
        synthesized: list[dict] = []
        for doc_type, covering_types, doc_name, value in legacy_pairs:
            if not value or value in known_values or covering_types & listed_types:
                continue
            from apps.common.storage import is_snapshot_presence_marker, resolve_document_open_url

            # A bare UUID is a presence marker for a document that is no longer
            # listed (for example removed); there is no file to synthesize.
            if is_snapshot_presence_marker(value):
                continue
            try:

                signed = resolve_document_open_url(
                    type("Synth", (), {"file_url": value, "storage_key": None, "id": None})()
                )
            except Exception:
                signed = None
            synthesized.append({
                "id": f"legacy:{doc_type}:{app.id}",
                "application": str(app.id),
                "document_type": doc_type,
                "document_name": doc_name,
                "file_url": signed,
                "verification_status": "pending",
                "system_generated": False,
                "is_legacy_synthetic": True,
            })
        return Response({"success": True, "data": serialized + synthesized})


# ---------------------------------------------------------------------------
# Required documents contract (admissions-v2 task 7.2)
# ---------------------------------------------------------------------------


@extend_schema_view(
    get=extend_schema(
        operation_id="applications_required_documents",
        tags=["applications"],
        summary="Required-document upload contract for one application",
        description=(
            "Returns the versioned required documents for this application — the "
            "tenant-configured requirements captured in the application's "
            "requirements snapshot, including custom tenant document types, plus "
            "the platform baseline the submission gate always enforces. Each row "
            "carries the label, whether it is required, help text, accepted MIME "
            "types and extensions, the maximum size, the current state, and the "
            "current document identity. A configuration that cannot be evaluated "
            "returns a retryable CONFIGURATION_UNAVAILABLE (503) rather than an "
            "empty requirement list."
        ),
        parameters=[
            OpenApiParameter(
                "application_id",
                OpenApiTypes.UUID,
                OpenApiParameter.PATH,
                description="Application UUID.",
            ),
        ],
        responses={
            200: OpenApiResponse(response=ApplicationRequiredDocumentsResponseSerializer),
            403: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
            503: OpenApiResponse(response=ErrorResponseSerializer),
        },
    )
)
class ApplicationRequiredDocumentsView(APIView):
    """``GET /api/v1/applications/{id}/required-documents/``.

    Task 7.2 / R11.6 / STU-13: the server contract the student wizard renders its
    upload controls from, so a tenant-configured document type is rendered and
    uploadable instead of being invisible behind two hardcoded fields.

    Authority mirrors :class:`ApplicationDocumentsView`: the owner reads their own
    application; a non-super-admin admin only within their ``AccessScopeService``
    scope, and an out-of-scope read is masked as a genuine not-found so another
    school's application (and its requirement configuration) cannot be inferred.
    """

    permission_classes = [IsOwnerOrAdmin]
    serializer_class = ApplicationRequiredDocumentsResponseSerializer

    def get(self, request, application_id):
        from apps.applications.assignment_resolution import AssignmentConfigurationError
        from apps.applications.required_documents import build_contract

        try:
            application = Application.objects.get(id=application_id)
        except Application.DoesNotExist:
            return Response(
                {"success": False, "error": "Application not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )

        if not IsOwnerOrAdmin().has_object_permission(request, self, application):
            return Response(
                {"success": False, "error": "Permission denied", "code": "INSUFFICIENT_PERMISSIONS"},
                status=status.HTTP_403_FORBIDDEN,
            )

        role = getattr(request.user, "role", "student")
        if role == "admin" and not AccessScopeService().filter_applications(
            Application.objects.filter(id=application.id), request.user
        ).exists():
            return Response(
                {"success": False, "error": "Application not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            contract = build_contract(application)
        except AssignmentConfigurationError as exc:
            # Fail closed (R11.6, DATA-04): never publish an empty requirement
            # list built on a configuration we could not evaluate.
            return Response(
                {
                    "success": False,
                    "error": exc.message,
                    "code": exc.code,
                    "retryable": True,
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response({"success": True, "data": contract})


# ---------------------------------------------------------------------------
# Email Slip — removed (admissions-v2 task 10.6, R13.5, finding API-04)
# ---------------------------------------------------------------------------
#
# ``EmailSlipView`` and ``POST /api/v1/applications/{id}/email-slip/`` are gone.
#
# It was the platform's original official-document email, and a parallel
# implementation of one: it authorized inline, built an inline HTML table of
# application fields, and called ``queue_email`` directly — bypassing task 10.1's
# delivery gate, so the message appeared in no communications history and its
# delivery state read ``unknown``. It also emailed to whatever address the request
# body named.
#
# Task 10.4 replaced its body with a proxy onto
# :class:`~apps.applications.official_document_views.OfficialDocumentEmailView`
# and kept the route for the measured V1 window R13.5 requires. That window is
# closed: zero production call sites, measured twice
# (``docs/v2-evidence/10.4/README.md`` §8 and
# ``docs/v2-evidence/10.6/raw/usage-measurement.txt``).
#
# The successor is
# ``POST /api/v1/applications/{id}/official-documents/application_slip/email/``.
