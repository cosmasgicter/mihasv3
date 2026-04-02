"""Document and payment views.

Implements tasks 16.2, 16.3.
Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
"""

import hashlib
import logging
import uuid

from django.conf import settings
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, OpenApiTypes, extend_schema, extend_schema_view
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsAdmin, IsOwnerOrAdmin
from apps.documents.models import ApplicationDocument, Payment
from apps.documents.serializers import (
    DocumentSerializer,
    DocumentUploadSerializer,
    PaymentSerializer,
    PaymentVerifySerializer,
)
from apps.documents.validators import validate_file_magic_bytes
from apps.common.openapi_helpers import (
    ErrorResponseSerializer,
    PaymentReceiptSerializer,
    TaskQueuedSerializer,
    envelope_serializer,
)

logger = logging.getLogger(__name__)


DocumentResponseSerializer = envelope_serializer(
    "DocumentResponse",
    DocumentSerializer(),
)
TaskQueuedResponseSerializer = envelope_serializer(
    "DocumentTaskQueuedResponse",
    TaskQueuedSerializer(),
)
PaymentReceiptResponseSerializer = envelope_serializer(
    "PaymentReceiptResponse",
    PaymentReceiptSerializer(),
)
PaymentResponseSerializer = envelope_serializer(
    "PaymentResponse",
    PaymentSerializer(),
)


@extend_schema_view(
    post=extend_schema(
        operation_id="documents_upload",
        tags=["documents"],
        request=DocumentUploadSerializer,
        responses={
            201: OpenApiResponse(response=DocumentResponseSerializer),
            400: OpenApiResponse(response=ErrorResponseSerializer),
            403: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
            500: OpenApiResponse(response=ErrorResponseSerializer),
        },
    )
)
class DocumentUploadView(APIView):
    """POST /api/v1/documents/upload/ — upload a document.

    Validates magic bytes, stores in S3/R2, creates ApplicationDocument record.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = DocumentUploadSerializer

    def post(self, request):
        serializer = DocumentUploadSerializer(data=request.data)
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

        file_obj = serializer.validated_data["file"]
        document_type = serializer.validated_data["document_type"]
        application_id = serializer.validated_data["application_id"]

        # Verify ownership: student can only upload to their own application.
        from apps.applications.models import Application

        try:
            application = Application.objects.get(id=application_id)
        except Application.DoesNotExist:
            return Response(
                {"success": False, "error": "Application not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )

        user = request.user
        role = getattr(user, "role", "student")
        if role not in ("admin", "super_admin") and str(application.user_id) != str(user.id):
            return Response(
                {"success": False, "error": "Not authorized", "code": "INSUFFICIENT_PERMISSIONS"},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Magic byte validation.
        declared_mime = file_obj.content_type or ""
        try:
            validate_file_magic_bytes(file_obj, declared_mime)
        except Exception:
            logger.exception("File magic-byte validation failed for upload to application %s", application_id)
            return Response(
                {"success": False, "error": "Invalid file format", "code": "INVALID_FILE"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Store file in S3/R2.
        file_key = f"documents/{application_id}/{uuid.uuid4().hex}_{file_obj.name}"
        try:
            from apps.common.storage import MediaStorage

            storage = MediaStorage()
            saved_name = storage.save(file_key, file_obj)
            file_url = storage.url(saved_name)
        except Exception:
            logger.exception("Failed to upload file to storage")
            return Response(
                {"success": False, "error": "File storage error", "code": "STORAGE_ERROR"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        # Create ApplicationDocument record.
        doc = ApplicationDocument.objects.create(
            application_id=application_id,
            document_type=document_type,
            document_name=file_obj.name,
            file_url=file_url,
            file_size=getattr(file_obj, "size", None),
            mime_type=declared_mime or None,
            verification_status="pending",
            system_generated=False,
            uploaded_at=timezone.now(),
        )

        return Response(
            DocumentSerializer(doc).data,
            status=status.HTTP_201_CREATED,
        )


@extend_schema_view(
    post=extend_schema(
        operation_id="documents_extract",
        tags=["documents"],
        parameters=[
            OpenApiParameter("document_id", OpenApiTypes.UUID, OpenApiParameter.PATH, description="Document UUID."),
        ],
        request=None,
        responses={
            202: OpenApiResponse(response=TaskQueuedResponseSerializer),
            403: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
    )
)
class DocumentExtractView(APIView):
    """POST /api/v1/documents/{id}/extract/ — enqueue OCR Celery task."""

    permission_classes = [IsAuthenticated]
    serializer_class = TaskQueuedSerializer

    def post(self, request, document_id):
        try:
            document = ApplicationDocument.objects.get(id=document_id)
        except ApplicationDocument.DoesNotExist:
            return Response(
                {"success": False, "error": "Document not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Ownership check.
        from apps.applications.models import Application

        try:
            application = Application.objects.get(id=document.application_id)
        except Application.DoesNotExist:
            return Response(
                {"success": False, "error": "Application not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )

        user = request.user
        role = getattr(user, "role", "student")
        if role not in ("admin", "super_admin") and str(application.user_id) != str(user.id):
            return Response(
                {"success": False, "error": "Not authorized", "code": "INSUFFICIENT_PERMISSIONS"},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Enqueue OCR task.
        from apps.documents.tasks import extract_document_text_task

        task = extract_document_text_task.delay(str(document.id))

        return Response(
            {
                "task_id": task.id,
                "document_id": str(document.id),
                "status": "queued",
            },
            status=status.HTTP_202_ACCEPTED,
        )


@extend_schema_view(
    get=extend_schema(
        operation_id="payments_receipt",
        tags=["payments"],
        parameters=[
            OpenApiParameter("payment_id", OpenApiTypes.UUID, OpenApiParameter.PATH, description="Payment UUID."),
        ],
        responses={
            200: OpenApiResponse(response=PaymentReceiptResponseSerializer),
            403: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
    )
)
class PaymentReceiptView(APIView):
    """GET /api/v1/payments/{id}/receipt/ — generate receipt data.

    Auth required. Ownership check: student sees own, admin sees all.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = PaymentReceiptSerializer

    def get(self, request, payment_id):
        try:
            payment = Payment.objects.get(id=payment_id)
        except Payment.DoesNotExist:
            return Response(
                {"success": False, "error": "Payment not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Ownership check.
        user = request.user
        role = getattr(user, "role", "student")
        if role not in ("admin", "super_admin") and str(payment.user_id) != str(user.id):
            return Response(
                {"success": False, "error": "Not authorized", "code": "INSUFFICIENT_PERMISSIONS"},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Build receipt data.
        from apps.applications.models import Application

        application = None
        try:
            application = Application.objects.get(id=payment.application_id)
        except Application.DoesNotExist:
            pass

        receipt = {
            "payment_id": str(payment.id),
            "amount": str(payment.amount),
            "currency": payment.currency,
            "status": payment.status,
            "created_at": payment.created_at.isoformat() if payment.created_at else None,
            "application_number": application.application_number if application else None,
            "program": application.program if application else None,
            "applicant_name": application.full_name if application else None,
        }

        return Response(receipt)


@extend_schema_view(
    post=extend_schema(
        operation_id="payments_verify",
        tags=["payments"],
        parameters=[
            OpenApiParameter("payment_id", OpenApiTypes.UUID, OpenApiParameter.PATH, description="Payment UUID."),
        ],
        request=PaymentVerifySerializer,
        responses={
            200: OpenApiResponse(response=PaymentResponseSerializer),
            400: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
    )
)
class PaymentVerifyView(APIView):
    """POST /api/v1/payments/{id}/verify/ — admin verifies/rejects payment.

    Admin only. Records action in audit log with verifier identity.
    """

    permission_classes = [IsAdmin]
    serializer_class = PaymentVerifySerializer

    def post(self, request, payment_id):
        try:
            payment = Payment.objects.get(id=payment_id)
        except Payment.DoesNotExist:
            return Response(
                {"success": False, "error": "Payment not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = PaymentVerifySerializer(data=request.data)
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

        action = serializer.validated_data["action"]
        notes = serializer.validated_data.get("notes", "")

        new_status = "verified" if action == "verify" else "rejected"
        old_status = payment.status

        payment.status = new_status
        payment.verified_by_id = str(request.user.id)
        payment.notes = notes
        payment.save()

        # Record in audit log.
        from apps.common.models import AuditLog

        ip_address = request.META.get("HTTP_X_FORWARDED_FOR", "")
        if ip_address:
            ip_address = ip_address.split(",")[0].strip()
        else:
            ip_address = request.META.get("REMOTE_ADDR", "")

        AuditLog.objects.create(
            actor_id=str(request.user.id),
            action=f"payment_{action}",
            entity_type="payments",
            entity_id=payment.id,
            changes={
                "old_status": old_status,
                "new_status": new_status,
                "notes": notes,
            },
            ip_address=hashlib.sha256(ip_address.encode()).hexdigest(),
            user_agent=hashlib.sha256(
                request.META.get("HTTP_USER_AGENT", "").encode()
            ).hexdigest(),
            retention_category="standard",
        )

        return Response(PaymentSerializer(payment).data)
