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

from apps.accounts.permissions import IsOwnerOrAdmin
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
    ApplicationAiSummaryResponseSerializer,
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

from apps.common.throttling import AIUserScopedRateThrottle

from ._view_helpers import (
    ApplicationConditionSerializer,
    ApplicationDraftResponseSerializer,
    ApplicationDraftWriteSerializer,
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
    EmailSlipEnvelopeResponseSerializer,
    EmailSlipSerializer,
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
        docs = ApplicationDocument.objects.select_related('application', 'verified_by').filter(application_id=application_id).exclude(
            verification_status='deleted'
        )
        serialized = DocumentSerializer(docs, many=True).data

        # Synthesize entries for legacy applications whose ``result_slip_url``
        # or ``extra_kyc_url`` was set on the Application row directly without
        # a matching ApplicationDocument record. These entries get a fresh
        # short-lived signed URL inline so the frontend never has to open a
        # raw private R2/S3 URL (which always 403s).
        existing_urls = {d.get("file_url") for d in serialized if d.get("file_url")}
        existing_types = {d.get("document_type") for d in serialized if d.get("document_type")}
        legacy_pairs = [
            ("result_slip", "Result Slip", getattr(app, "result_slip_url", None)),
            ("extra_kyc", "Identity Support Document", getattr(app, "extra_kyc_url", None)),
        ]
        synthesized: list[dict] = []
        for doc_type, doc_name, file_url in legacy_pairs:
            if not file_url or file_url in existing_urls or doc_type in existing_types:
                continue
            try:
                from apps.common.storage import (
                    generate_signed_url,
                    get_document_storage_key,
                )

                key = get_document_storage_key(type("Synth", (), {"file_url": file_url})())
                signed = generate_signed_url(key) if key else None
            except Exception:
                signed = None
            synthesized.append({
                "id": f"legacy:{doc_type}:{app.id}",
                "application": str(app.id),
                "document_type": doc_type,
                "document_name": doc_name,
                "file_url": signed or file_url,
                "verification_status": "pending",
                "system_generated": False,
                "is_legacy_synthetic": True,
            })

        return Response({"success": True, "data": serialized + synthesized})


# ---------------------------------------------------------------------------
# Email Slip
# ---------------------------------------------------------------------------


class EmailSlipView(APIView):
    """POST /api/v1/applications/{id}/email-slip/

    Generates an HTML email with application slip details and queues it
    for delivery via the existing send_email_task + Resend infrastructure.
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(
        operation_id="applications_email_slip",
        tags=["applications"],
        parameters=[
            OpenApiParameter(
                "application_id",
                OpenApiTypes.UUID,
                OpenApiParameter.PATH,
                description="Application UUID.",
            ),
        ],
        request=EmailSlipSerializer,
        responses={
            200: OpenApiResponse(response=EmailSlipEnvelopeResponseSerializer),
            400: OpenApiResponse(response=ErrorResponseSerializer),
            403: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
    )
    def post(self, request, application_id):
        try:
            application = Application.objects.get(id=application_id)
        except Application.DoesNotExist:
            return Response(
                {"success": False, "error": "Application not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )

        if str(application.user_id) != str(request.user.id):
            role = getattr(request.user, "role", "student")
            if role not in ("admin", "super_admin"):
                return Response(
                    {"success": False, "error": "Permission denied", "code": "INSUFFICIENT_PERMISSIONS"},
                    status=status.HTTP_403_FORBIDDEN,
                )

        serializer = EmailSlipSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {"success": False, "error": "Validation failed", "code": "VALIDATION_ERROR", "details": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        email = serializer.validated_data["email"]

        from django.utils.html import escape as html_escape

        submitted_at = ""
        if application.submitted_at:
            submitted_at = application.submitted_at.strftime("%d %B %Y")
        created_at = ""
        if application.created_at:
            created_at = application.created_at.strftime("%d %B %Y")

        from apps.common.email_templates import get_base_email_html

        status_label = (application.status or "").replace("_", " ").title() or "Pending"

        def _row(label, value):
            return (
                f"<tr><td style='padding:12px 14px;border-bottom:1px solid #e2e8f0;font-weight:600;"
                f"color:#16324f;width:38%;background-color:#f8fbff;'>{label}</td>"
                f"<td style='padding:12px 14px;border-bottom:1px solid #e2e8f0;color:#334155;background-color:#ffffff;'>"
                f"{html_escape(str(value))}</td></tr>"
            )

        tracking_code = (
            getattr(application, "public_tracking_code", "")
            or getattr(application, "tracking_code", "")
            or ""
        )

        slip_html = (
            "<div style='padding-bottom:18px;'>"
            "<div style='font-size:13px;letter-spacing:0.16em;text-transform:uppercase;color:#64748b;font-weight:700;'>"
            "Application record"
            "</div>"
            "<div style='padding-top:10px;font-size:16px;line-height:1.7;color:#334155;'>"
            "Your application slip confirms that your submission has been received and recorded in the MIHAS admissions system."
            "</div>"
            "</div>"
            "<table role='presentation' style='width:100%;border-collapse:separate;border-spacing:0 0;"
            "border:1px solid #dbe5ef;border-radius:18px;overflow:hidden;'>"
            "<tr>"
            "<td style='padding:16px 18px;background:linear-gradient(135deg,#eff6ff 0%,#f8fafc 100%);' colspan='2'>"
            "<div style='font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#64748b;font-weight:700;'>"
            "Current status"
            "</div>"
            f"<div style='padding-top:8px;display:inline-block;background-color:#10233f;color:#ffffff;"
            "font-weight:700;font-size:13px;padding:8px 12px;border-radius:999px;'>"
            f"{html_escape(status_label)}</div>"
            "</td>"
            "</tr>"
            + _row("Application Number", application.application_number or "")
            + _row("Applicant Name", application.full_name or "")
            + _row("Program", application.program or "")
            + _row("Tracking Code", tracking_code)
            + _row("Submitted", submitted_at or "Not yet submitted")
            + _row("Created", created_at or "N/A")
            + "</table>"
            "<div style='padding-top:18px;font-size:14px;line-height:1.75;color:#475569;'>"
            "Keep this slip for reference when checking your application status or communicating with the admissions office."
            "</div>"
        )

        body_html = get_base_email_html(slip_html, title="Application Slip")

        from apps.common.outbox import queue_email

        email_record = queue_email(
            recipient_email=email,
            recipient_name=application.full_name,
            subject=f"Application Slip — {application.application_number}",
            body=body_html,
        )

        return Response(
            {"success": True, "data": {"queued_id": str(email_record.id)}},
            status=status.HTTP_200_OK,
        )

