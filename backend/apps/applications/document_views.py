"""Document-related application views.

Extracted during the views module split (production-readiness-hardening, task 9.1).
Contains views for document verification, acceptance letter generation,
and finance receipt generation.
"""

import logging

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

from apps.accounts.permissions import IsAdmin
from apps.applications.models import Application
from apps.applications.serializers import ApplicationSerializer
from apps.common.openapi_helpers import ErrorResponseSerializer
from apps.documents.models import ApplicationDocument, Payment
from apps.documents.serializers import DocumentSerializer

from ._view_helpers import (
    ApplicationAsyncTaskResponseSerializer,
    ApplicationAsyncTaskSerializer,
    ApplicationDocumentMutationResponseSerializer,
    DocumentVerifySerializer,
    _enqueue_document_task,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Document Verification
# ---------------------------------------------------------------------------


class ApplicationVerifyDocumentView(APIView):
    """POST /api/v1/applications/{id}/verify-document/"""

    permission_classes = [IsAdmin]
    serializer_class = DocumentVerifySerializer

    @extend_schema(
        operation_id="applications_verify_document",
        tags=["applications"],
        request=DocumentVerifySerializer,
        responses={
            200: OpenApiResponse(response=ApplicationDocumentMutationResponseSerializer),
            400: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
    )
    def post(self, request, application_id):
        from apps.common.audit_network import build_audit_network_fields

        try:
            application = Application.objects.select_related(
                'user'
            ).get(id=application_id)
        except Application.DoesNotExist:
            return Response(
                {"success": False, "error": "Application not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = DocumentVerifySerializer(data=request.data)
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

        document_id = serializer.validated_data["documentId"]
        verification_status = serializer.validated_data["status"]
        notes = serializer.validated_data.get("notes", "")

        try:
            document = ApplicationDocument.objects.select_related(
                'application', 'verified_by'
            ).get(
                id=document_id, application_id=application.id
            )
        except ApplicationDocument.DoesNotExist:
            return Response(
                {
                    "success": False,
                    "error": "Document not found for this application",
                    "code": "NOT_FOUND",
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        old_status = document.verification_status
        document.verification_status = verification_status
        document.verified_by_id = str(request.user.id)
        document.verified_at = timezone.now()
        document.verification_notes = notes
        document.save(
            update_fields=[
                "verification_status",
                "verified_by",
                "verified_at",
                "verification_notes",
                "updated_at",
            ]
        )

        from apps.common.models import AuditLog

        network_fields = build_audit_network_fields(request)

        AuditLog.objects.create(
            actor_id=str(request.user.id),
            action=f"document_{verification_status}",
            entity_type="application_documents",
            entity_id=document.id,
            changes={
                "old_status": old_status,
                "new_status": verification_status,
                "notes": notes,
            },
            ip_address=network_fields["ip_address"],
            user_agent=network_fields["user_agent"],
            ip_address_encrypted=network_fields["ip_address_encrypted"],
            user_agent_encrypted=network_fields["user_agent_encrypted"],
            retention_category="standard",
        )

        try:
            from apps.common.communication_service import CommunicationService
            app = Application.objects.filter(id=document.application_id).first()
            if app:
                template = 'document_verified' if verification_status == 'verified' else 'document_rejected'
                CommunicationService.send(template, app, {'document_name': document.document_type or 'Document'})
        except Exception:
            pass

        return Response({"success": True, "data": DocumentSerializer(document).data})


# ---------------------------------------------------------------------------
# Acceptance Letter
# ---------------------------------------------------------------------------


class AcceptanceLetterView(APIView):
    """POST /api/v1/applications/{id}/acceptance-letter/

    Enqueues a Celery task to generate an acceptance letter PDF.
    Returns 202 immediately with task metadata.
    Idempotent within a 1-hour window.
    """

    permission_classes = [IsAdmin]
    serializer_class = ApplicationAsyncTaskSerializer

    @extend_schema(
        operation_id="applications_generate_acceptance_letter",
        tags=["applications"],
        request=None,
        responses={
            202: OpenApiResponse(response=ApplicationAsyncTaskResponseSerializer),
            400: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
            503: OpenApiResponse(response=ErrorResponseSerializer),
        },
    )
    def post(self, request, application_id):
        try:
            application = Application.objects.select_related(
                'user'
            ).get(id=application_id)
        except Application.DoesNotExist:
            return Response(
                {"success": False, "error": "Application not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )

        if application.status != "approved":
            return Response(
                {
                    "success": False,
                    "error": "Application must be in accepted status to generate an acceptance letter",
                    "code": "INVALID_STATUS",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            from apps.applications.tasks import generate_acceptance_letter_task
            task_func = generate_acceptance_letter_task
        except ImportError:
            task_func = None

        return _enqueue_document_task(application, "acceptance-letter", task_func, request)


# ---------------------------------------------------------------------------
# Finance Receipt
# ---------------------------------------------------------------------------


class FinanceReceiptView(APIView):
    """POST /api/v1/applications/{id}/finance-receipt/

    Enqueues a Celery task to generate a finance receipt PDF.
    Returns 202 immediately with task metadata.
    Idempotent within a 1-hour window.
    """

    permission_classes = [IsAdmin]
    serializer_class = ApplicationAsyncTaskSerializer

    @extend_schema(
        operation_id="applications_generate_finance_receipt",
        tags=["applications"],
        request=None,
        responses={
            202: OpenApiResponse(response=ApplicationAsyncTaskResponseSerializer),
            400: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
            503: OpenApiResponse(response=ErrorResponseSerializer),
        },
    )
    def post(self, request, application_id):
        try:
            application = Application.objects.select_related(
                'user'
            ).get(id=application_id)
        except Application.DoesNotExist:
            return Response(
                {"success": False, "error": "Application not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )

        has_verified_payment = Payment.objects.filter(
            application_id=application.id, status__in=("successful", "force_approved", "verified", "paid")
        ).exists()
        if not has_verified_payment:
            return Response(
                {
                    "success": False,
                    "error": "Application must have a completed payment to generate a finance receipt",
                    "code": "PAYMENT_REQUIRED",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            from apps.applications.tasks import generate_finance_receipt_task
            task_func = generate_finance_receipt_task
        except ImportError:
            task_func = None

        return _enqueue_document_task(application, "finance-receipt", task_func, request)
