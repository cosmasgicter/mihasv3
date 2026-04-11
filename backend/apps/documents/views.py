"""Document and payment views.

Implements tasks 16.2, 16.3, 5.1, 5.2, 5.3, 5.4, 5.5.
Requirements: 2.1, 2.2, 2.3, 3.1–3.5, 4.1, 4.2, 4.7, 6.1–6.3, 10.1, 13.1–13.6
"""

import hashlib
import json
import logging
import uuid

from django.conf import settings
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, OpenApiTypes, extend_schema, extend_schema_view
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet

from apps.accounts.permissions import IsAdmin, IsOwnerOrAdmin
from apps.common.pagination import StandardPagination
from apps.documents.models import ApplicationDocument, Payment, ProgramFee
from apps.documents.serializers import (
    DocumentSerializer,
    DocumentUploadSerializer,
    PaymentSerializer,
    PaymentVerifySerializer,
    ProgramFeeSerializer,
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
    get=extend_schema(
        operation_id="payments_list",
        tags=["payments"],
        parameters=[
            OpenApiParameter("application_id", OpenApiTypes.UUID, OpenApiParameter.QUERY, required=False, description="Filter by application UUID."),
        ],
        responses={
            200: OpenApiResponse(response=PaymentResponseSerializer),
        },
    )
)
class PaymentListView(APIView):
    """GET /api/v1/payments/ — list payments for the authenticated user.

    Students see their own payments. Admins see all payments.
    Supports optional ?application_id= filter.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = PaymentSerializer

    def get(self, request):
        user = request.user
        role = getattr(user, "role", "student")

        if role in ("admin", "super_admin"):
            queryset = Payment.objects.all()
        else:
            queryset = Payment.objects.filter(user_id=str(user.id))

        application_id = request.query_params.get("application_id")
        if application_id:
            queryset = queryset.filter(application_id=application_id)

        queryset = queryset.order_by("-created_at")

        paginator = StandardPagination()
        page = paginator.paginate_queryset(queryset, request)
        if page is not None:
            serializer = PaymentSerializer(page, many=True)
            return paginator.get_paginated_response(serializer.data)

        serializer = PaymentSerializer(queryset, many=True)
        return Response(serializer.data)


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
        if role not in ("admin", "super_admin") and application.status != "draft":
            return Response(
                {"success": False, "error": "Application is not editable", "code": "APPLICATION_NOT_EDITABLE"},
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
            document = ApplicationDocument.objects.select_related('application').get(id=document_id)
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
        request=None,
        responses={
            200: OpenApiResponse(response=PaymentResponseSerializer),
            403: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
    )
)
class PaymentVerifyView(APIView):
    """POST /api/v1/payments/{id}/verify/ — verify payment via Lenco API.

    Authenticated. Students can only verify their own payments.
    Admins can verify any payment.
    Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, payment_id):
        try:
            payment = Payment.objects.get(id=payment_id)
        except Payment.DoesNotExist:
            return Response(
                {"success": False, "error": "Payment not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Ownership check: students can only verify their own payments.
        user = request.user
        role = getattr(user, "role", "student")
        if role not in ("admin", "super_admin") and str(payment.user_id) != str(user.id):
            return Response(
                {"success": False, "error": "Not authorized", "code": "INSUFFICIENT_PERMISSIONS"},
                status=status.HTTP_403_FORBIDDEN,
            )

        from apps.documents.payment_service import PaymentService

        service = PaymentService()
        result = service.verify_payment(payment_id)

        data = {
            "status": result.status,
            "amount": str(result.amount) if result.amount is not None else None,
            "currency": result.currency,
            "lenco_reference": result.lenco_reference,
            "payment_method": result.payment_method,
        }

        if result.error:
            return Response(
                {"success": False, "error": result.error, "code": "VERIFICATION_ERROR", "data": data},
                status=status.HTTP_200_OK,
            )

        return Response({"success": True, "data": data})


# ---------------------------------------------------------------------------
# Lenco payment views (tasks 5.1, 5.3, 5.4, 5.5)
# ---------------------------------------------------------------------------


class PaymentInitiateView(APIView):
    """POST /api/v1/payments/initiate/ — create a pending payment record.

    Authenticated. Creates a Payment via PaymentService and returns the
    reference, amount, currency, and Lenco public key so the frontend can
    open the Lenco widget.

    Requirements: 2.1, 2.2, 2.3
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        application_id = request.data.get("application_id")
        if not application_id:
            return Response(
                {"success": False, "error": "application_id is required", "code": "VALIDATION_ERROR"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from apps.applications.models import Application

        try:
            application = Application.objects.get(id=application_id)
        except Application.DoesNotExist:
            return Response(
                {"success": False, "error": "Application not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Ownership check: students can only initiate payments for their own applications.
        user = request.user
        role = getattr(user, "role", "student")
        if role not in ("admin", "super_admin") and str(application.user_id) != str(user.id):
            return Response(
                {"success": False, "error": "Not authorized", "code": "INSUFFICIENT_PERMISSIONS"},
                status=status.HTTP_403_FORBIDDEN,
            )

        from apps.documents.payment_service import PaymentService

        service = PaymentService()

        try:
            result = service.initiate_payment(
                application_id=application.id,
                user_id=user.id,
            )
        except Exception:
            logger.exception("Failed to initiate payment for application %s", application_id)
            return Response(
                {"success": False, "error": "Failed to initiate payment", "code": "PAYMENT_ERROR"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        lenco_public_key = getattr(settings, "LENCO_PUBLIC_KEY", "") or ""

        return Response(
            {
                "success": True,
                "data": {
                    "payment_id": str(result.payment_id),
                    "reference": result.reference,
                    "amount": str(result.amount),
                    "currency": result.currency,
                    "lenco_public_key": lenco_public_key,
                },
            },
            status=status.HTTP_201_CREATED,
        )


class LencoWebhookView(APIView):
    """POST /api/v1/payments/webhook/lenco/ — receive Lenco webhook events.

    Unauthenticated (AllowAny). Validates X-Lenco-Signature header via
    WebhookProcessor. Returns 401 for invalid signature, 200 for valid events.

    Requirements: 4.1, 4.2, 4.7, 10.1
    """

    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        raw_body = request.body
        signature = request.META.get("HTTP_X_LENCO_SIGNATURE", "")

        from apps.documents.webhook_processor import WebhookProcessor

        processor = WebhookProcessor()

        # Parse the payload.
        try:
            payload = json.loads(raw_body) if raw_body else {}
        except (json.JSONDecodeError, ValueError):
            return Response(
                {"success": False, "error": "Invalid JSON payload"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        event_type = payload.get("event", "")

        # Validate signature.
        sig_valid = processor.validate_signature(raw_body, signature)

        if not sig_valid:
            # Log the event with invalid signature, then return 401.
            processor.process(event_type, payload, signature_valid=False)
            return Response(
                {"success": False, "error": "Invalid webhook signature"},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        # Process the valid event.
        processor.process(event_type, payload, signature_valid=True)

        return Response({"received": True}, status=status.HTTP_200_OK)


class FeeResolveView(APIView):
    """GET /api/v1/payments/resolve-fee/ — resolve application fee.

    Authenticated. Returns the resolved fee amount and currency for a
    given program code and student residency.

    Query params: program_code, nationality, country

    Requirements: 6.1, 6.2, 6.3
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        program_code = request.query_params.get("program_code")
        if not program_code:
            return Response(
                {"success": False, "error": "program_code query parameter is required", "code": "VALIDATION_ERROR"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        nationality = request.query_params.get("nationality")
        country = request.query_params.get("country")

        from apps.documents.fee_resolver import FeeResolver
        from apps.catalog.models import Program

        resolver = FeeResolver()

        try:
            resolved = resolver.resolve_fee(
                program_code=program_code,
                nationality=nationality,
                country=country,
            )
        except Program.DoesNotExist:
            return Response(
                {"success": False, "error": "Program not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response({
            "success": True,
            "data": {
                "amount": str(resolved.amount),
                "currency": resolved.currency,
                "residency_category": resolved.residency_category,
                "source": resolved.source,
            },
        })


class ProgramFeeViewSet(ModelViewSet):
    """CRUD for /api/v1/programs/:id/fees/ — admin only.

    - GET: list active fees for a program
    - POST: create a new fee
    - PUT/PATCH: update an existing fee
    - DELETE: soft delete (set is_active=false)

    Validates unique active (program, fee_type, residency_category) on
    create and update.

    Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6
    """

    permission_classes = [IsAdmin]
    serializer_class = ProgramFeeSerializer

    def get_queryset(self):
        program_id = self.kwargs.get("program_id")
        return ProgramFee.objects.filter(
            program_id=program_id,
            is_active=True,
        ).order_by("-created_at")

    def perform_create(self, serializer):
        program_id = self.kwargs.get("program_id")
        fee_type = serializer.validated_data.get("fee_type")
        residency_category = serializer.validated_data.get("residency_category")

        # Validate unique active constraint.
        if ProgramFee.objects.filter(
            program_id=program_id,
            fee_type=fee_type,
            residency_category=residency_category,
            is_active=True,
        ).exists():
            from rest_framework.exceptions import ValidationError

            raise ValidationError(
                {"detail": f"An active {fee_type} fee for {residency_category} already exists for this program."}
            )

        serializer.save(
            program_id=program_id,
            is_active=True,
            created_at=timezone.now(),
            updated_at=timezone.now(),
        )

    def perform_update(self, serializer):
        program_id = self.kwargs.get("program_id")
        fee_type = serializer.validated_data.get("fee_type", serializer.instance.fee_type)
        residency_category = serializer.validated_data.get(
            "residency_category", serializer.instance.residency_category
        )

        # Validate unique active constraint (exclude current record).
        duplicate = ProgramFee.objects.filter(
            program_id=program_id,
            fee_type=fee_type,
            residency_category=residency_category,
            is_active=True,
        ).exclude(id=serializer.instance.id)

        if duplicate.exists():
            from rest_framework.exceptions import ValidationError

            raise ValidationError(
                {"detail": f"An active {fee_type} fee for {residency_category} already exists for this program."}
            )

        serializer.save(updated_at=timezone.now())

    def destroy(self, request, *args, **kwargs):
        """Soft delete: set is_active=false instead of deleting the record."""
        instance = self.get_object()
        instance.is_active = False
        instance.updated_at = timezone.now()
        instance.save(update_fields=["is_active", "updated_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)
