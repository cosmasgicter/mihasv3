"""Document and payment views.

Implements tasks 16.2, 16.3, 5.1, 5.2, 5.3, 5.4, 5.5.
Requirements: 2.1, 2.2, 2.3, 3.1–3.5, 4.1, 4.2, 4.7, 6.1–6.3, 10.1, 13.1–13.6
"""

import hashlib
import ipaddress
import json
import logging
import uuid
from decimal import Decimal
from urllib.parse import unquote, urlparse

from django.conf import settings
from django.db.models import Q
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, OpenApiTypes, extend_schema, extend_schema_view, inline_serializer
from rest_framework import serializers, status
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
    MobileMoneyInitiateRequestSerializer,
    MobileMoneyInitiateResponseSerializer,
    DeferPaymentRequestSerializer,
    DeferPaymentResponseSerializer,
)
from apps.documents.throttles import MobileMoneyThrottle, PaymentInitiateThrottle, PaymentVerifyThrottle
from apps.documents.validators import validate_file_magic_bytes
from apps.common.openapi_helpers import (
    ErrorResponseSerializer,
    PaymentReceiptSerializer,
    TaskQueuedSerializer,
    envelope_serializer,
)
from apps.common.metrics import emit_metric
from apps.common.idempotency import idempotent

from django.http import HttpResponseRedirect

logger = logging.getLogger(__name__)


def _client_ip(request) -> str:
    forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if forwarded_for:
        return forwarded_for.split(",", 1)[0].strip()
    return request.META.get("REMOTE_ADDR", "")


def _ip_allowed(ip_address: str, allowed_ranges: list[str]) -> bool:
    if not allowed_ranges:
        return True
    try:
        candidate = ipaddress.ip_address(ip_address)
    except ValueError:
        return False
    for allowed in allowed_ranges:
        try:
            if candidate in ipaddress.ip_network(allowed, strict=False):
                return True
        except ValueError:
            if ip_address == allowed:
                return True
    return False


def _parse_ai_analysis(verification_notes: str | None) -> dict | None:
    """Extract AI analysis JSON from verification_notes field."""
    if not verification_notes:
        return None
    try:
        data = json.loads(verification_notes)
        return data.get("ai_analysis") if isinstance(data, dict) else None
    except (json.JSONDecodeError, TypeError):
        return None


def _document_not_found_response():
    return Response(
        {"success": False, "error": "Document not found", "code": "NOT_FOUND"},
        status=status.HTTP_404_NOT_FOUND,
    )


def _document_permission_denied_response():
    return Response(
        {"success": False, "error": "Permission denied", "code": "INSUFFICIENT_PERMISSIONS"},
        status=status.HTTP_403_FORBIDDEN,
    )


def _get_authorized_document(request, view, document_id):
    """Load a document and enforce ownership through its parent application."""
    try:
        document = ApplicationDocument.objects.select_related("application").get(id=document_id)
    except ApplicationDocument.DoesNotExist:
        return None, _document_not_found_response()

    application = getattr(document, "application", None)
    if application is None:
        return None, _document_not_found_response()

    if not IsOwnerOrAdmin().has_object_permission(request, view, application):
        return None, _document_permission_denied_response()

    return document, None


def _get_document_storage_key(document):
    """Convert persisted file URLs/keys into a MediaStorage-relative file name."""
    raw_file_url = (getattr(document, "file_url", None) or "").strip()
    if not raw_file_url:
        return ""

    if raw_file_url.startswith(("http://", "https://")):
        key = unquote(urlparse(raw_file_url).path.lstrip("/"))
    else:
        key = raw_file_url.lstrip("/")

    bucket_name = getattr(settings, "AWS_STORAGE_BUCKET_NAME", "")
    if bucket_name and key.startswith(f"{bucket_name}/"):
        key = key[len(bucket_name) + 1:]

    # MediaStorage uses location='media', so strip the prefix to avoid media/media/...
    if key.startswith("media/"):
        key = key[len("media/"):]

    return key


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
            queryset = Payment.objects.select_related('application', 'user').all()
        else:
            queryset = Payment.objects.select_related('application', 'user').filter(user_id=str(user.id))

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
        return Response({"success": True, "data": serializer.data})


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
        # Enforce 10MB file size limit
        uploaded_file = request.FILES.get('file')
        if uploaded_file and uploaded_file.size > 10 * 1024 * 1024:
            return Response(
                {"success": False, "error": "File size exceeds 10MB limit", "code": "FILE_TOO_LARGE"},
                status=status.HTTP_400_BAD_REQUEST,
            )

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
            # Allow application_slip uploads for any status (slips are system-generated)
            if document_type != "application_slip":
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
        import os as _os
        import re as _re
        safe_name = _os.path.basename(file_obj.name or "unnamed")
        safe_name = _re.sub(r'[^\w\s\-.]', '_', safe_name)[:255] or "unnamed"
        file_key = f"documents/{application_id}/{uuid.uuid4().hex}_{safe_name}"
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
            document_name=safe_name,
            file_url=file_url,
            file_size=getattr(file_obj, "size", None),
            mime_type=declared_mime or None,
            verification_status="pending",
            system_generated=False,
            uploaded_at=timezone.now(),
        )

        application_url_field = None
        if document_type == "result_slip":
            application_url_field = "result_slip_url"
        elif document_type in ("extra_kyc", "nrc", "passport"):
            application_url_field = "extra_kyc_url"

        if application_url_field:
            setattr(application, application_url_field, file_url)
            application.updated_at = timezone.now()
            application.save(update_fields=[application_url_field, "updated_at"])

        return Response(
            {"success": True, "data": DocumentSerializer(doc).data},
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

        force = request.data.get("force", False) is True
        task = extract_document_text_task.delay(str(document.id), force=force)

        return Response(
            {
                "success": True,
                "data": {
                    "task_id": task.id,
                    "document_id": str(document.id),
                    "status": "queued",
                },
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

        return Response({"success": True, "data": receipt})


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
    throttle_classes = [PaymentVerifyThrottle]

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
        try:
            result = service.verify_payment(payment_id)
        except Exception:
            import sentry_sdk
            sentry_sdk.capture_exception()
            return Response(
                {"success": False, "error": "Payment verification failed. Please try again later.", "code": "VERIFICATION_ERROR"},
                status=status.HTTP_200_OK,
            )

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
    throttle_classes = [PaymentInitiateThrottle]

    @extend_schema(
        request=inline_serializer('PaymentInitiateRequest', fields={
            'application_id': serializers.UUIDField(),
        }),
        responses={201: inline_serializer('PaymentInitiateResponse', fields={
            'payment_id': serializers.UUIDField(),
            'reference': serializers.CharField(),
            'amount': serializers.DecimalField(max_digits=10, decimal_places=2),
            'currency': serializers.CharField(),
        })},
    )
    @idempotent
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
        except ValueError as exc:
            error_msg = str(exc)
            if error_msg.startswith("MAX_PAYMENT_ATTEMPTS_EXCEEDED"):
                parts = error_msg.split("|")
                remaining = int(parts[1]) if len(parts) > 1 else 0
                emit_metric('payment.initiation_failed', method='card', reason='max_attempts_exceeded', application_id=str(application_id))
                return Response(
                    {
                        "success": False,
                        "error": "Maximum payment attempts exceeded. Please contact support.",
                        "code": "MAX_PAYMENT_ATTEMPTS_EXCEEDED",
                        "remaining_attempts": remaining,
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            logger.exception("Failed to initiate payment for application %s", application_id)
            emit_metric('payment.initiation_failed', method='card', reason=str(exc), application_id=str(application_id))
            return Response(
                {"success": False, "error": str(exc), "code": "PAYMENT_ERROR"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except Exception:
            logger.exception("Failed to initiate payment for application %s", application_id)
            emit_metric('payment.initiation_failed', method='card', reason='unexpected_error', application_id=str(application_id))
            return Response(
                {"success": False, "error": "Failed to initiate payment", "code": "PAYMENT_ERROR"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        lenco_public_key = getattr(settings, "LENCO_PUBLIC_KEY", "") or ""

        emit_metric('payment.initiated', method='card', application_id=str(application_id))
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


class DeferPaymentView(APIView):
    """POST /api/v1/payments/defer/ — create a deferred payment record."""

    permission_classes = [IsAuthenticated]
    serializer_class = DeferPaymentRequestSerializer

    @extend_schema(
        request=DeferPaymentRequestSerializer,
        responses={
            201: OpenApiResponse(response=DeferPaymentResponseSerializer),
            400: OpenApiResponse(response=ErrorResponseSerializer),
            403: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
            500: OpenApiResponse(response=ErrorResponseSerializer),
        },
        tags=["payments"],
        summary="Defer payment — submit application without paying upfront",
    )
    @idempotent
    def post(self, request):
        # Validate via serializer but preserve the {success: false, error, code} envelope.
        serializer = DeferPaymentRequestSerializer(data=request.data)
        if not serializer.is_valid():
            first_error = next(iter(serializer.errors.values()))[0]
            return Response(
                {"success": False, "error": str(first_error), "code": "VALIDATION_ERROR"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        application_id = serializer.validated_data["application_id"]

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

        from apps.documents.payment_service import PaymentService

        try:
            result = PaymentService().defer_payment(
                application_id=application.id, user_id=user.id,
            )
        except ValueError as exc:
            return Response(
                {"success": False, "error": str(exc), "code": "PAYMENT_ERROR"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except Exception:
            logger.exception("Failed to defer payment for application %s", application_id)
            return Response(
                {"success": False, "error": "Failed to defer payment", "code": "PAYMENT_ERROR"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return Response(
            {
                "success": True,
                "data": {
                    "payment_id": str(result.payment_id),
                    "reference": result.reference,
                    "amount": str(result.amount),
                    "currency": result.currency,
                    "status": "deferred",
                },
            },
            status=status.HTTP_201_CREATED,
        )


class MobileMoneyInitiateView(APIView):
    """POST /api/v1/payments/mobile-money/ — initiate mobile money collection.

    Creates a pending Payment record then calls the Lenco mobile money API.
    The student authorizes the payment on their phone (pay-offline flow).
    """

    permission_classes = [IsAuthenticated]
    throttle_classes = [MobileMoneyThrottle]
    serializer_class = MobileMoneyInitiateRequestSerializer

    @staticmethod
    def _mask_phone(phone: str) -> str:
        if len(phone) <= 4:
            return "****"
        return f"{'*' * (len(phone) - 4)}{phone[-4:]}"

    @staticmethod
    def _normalize_phone_e164(raw: str) -> str:
        """Normalize any Zambian phone input to E.164 (+260XXXXXXXXX)."""
        digits = "".join(c for c in raw if c.isdigit())
        if digits.startswith("260") and len(digits) >= 12:
            return f"+{digits[:12]}"
        if digits.startswith("0") and len(digits) == 10:
            return f"+260{digits[1:]}"
        if len(digits) == 9:
            return f"+260{digits}"
        # Already has + prefix or unknown format — return cleaned
        return f"+{digits}" if not raw.startswith("+") else raw.strip()

    @extend_schema(
        request=MobileMoneyInitiateRequestSerializer,
        responses={
            200: OpenApiResponse(response=MobileMoneyInitiateResponseSerializer),
            201: OpenApiResponse(response=MobileMoneyInitiateResponseSerializer),
            202: OpenApiResponse(response=MobileMoneyInitiateResponseSerializer),
            400: OpenApiResponse(response=ErrorResponseSerializer),
            403: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
            500: OpenApiResponse(response=ErrorResponseSerializer),
        },
        tags=["payments"],
        summary="Initiate mobile money payment collection (Airtel/MTN)",
    )
    @idempotent
    def post(self, request):
        # Validate via serializer; keep the legacy envelope on validation error.
        serializer = MobileMoneyInitiateRequestSerializer(data=request.data)
        if not serializer.is_valid():
            # Preserve the previous legacy error message for existing frontend consumers.
            return Response(
                {
                    "success": False,
                    "error": "application_id, phone, and operator (airtel/mtn) are required",
                    "code": "VALIDATION_ERROR",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        application_id = serializer.validated_data["application_id"]
        phone_raw = serializer.validated_data["phone"].strip()
        operator = serializer.validated_data["operator"].strip().lower()

        phone = self._normalize_phone_e164(phone_raw)

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

        from apps.documents.payment_service import PaymentService

        service = PaymentService()

        # Check if already paid
        if application.payment_status in ('successful', 'verified', 'force_approved'):
            return Response(
                {"success": True, "data": {"status": "already_paid"}},
                status=status.HTTP_200_OK,
            )

        # Check for existing pending payment first (reuse without creating new)
        from django.db import transaction as db_transaction

        with db_transaction.atomic():
            existing_pending = (
                Payment.objects.select_for_update()
                .filter(application_id=application_id, status='pending').first()
            )
            if existing_pending:
                payment_id = existing_pending.id
                amount = existing_pending.amount
                reference = existing_pending.transaction_reference
                currency = existing_pending.currency
                provider_state = ((existing_pending.metadata or {}).get("provider_initiation") or {}).get("status")
                if provider_state in {"accepted", "unknown", "sent"}:
                    return Response(
                        {
                            "success": True,
                            "data": {
                                "payment_id": str(payment_id),
                                "reference": reference,
                                "amount": str(amount),
                                "currency": currency,
                                "status": "pending",
                                "provider_status": provider_state,
                                "operator": operator,
                                "masked_phone": self._mask_phone(phone),
                                "message": "Payment is still being confirmed. Please do not start another payment yet.",
                            },
                        },
                        status=status.HTTP_202_ACCEPTED,
                    )
            else:
                # Only create a new payment record if none is pending
                try:
                    result = service.initiate_payment(application_id=application.id, user_id=user.id)
                except ValueError as exc:
                    error_msg = str(exc)
                    if error_msg.startswith("MAX_PAYMENT_ATTEMPTS_EXCEEDED"):
                        emit_metric('payment.initiation_failed', method='mobile_money', reason='max_attempts_exceeded', application_id=str(application_id))
                        return Response(
                            {"success": False, "error": "Maximum payment attempts exceeded. Please contact support.", "code": "MAX_PAYMENT_ATTEMPTS_EXCEEDED"},
                            status=status.HTTP_400_BAD_REQUEST,
                        )
                    emit_metric('payment.initiation_failed', method='mobile_money', reason=str(exc), application_id=str(application_id))
                    return Response(
                        {"success": False, "error": str(exc), "code": "PAYMENT_ERROR"},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                except Exception:
                    logger.exception("Failed to initiate payment for application %s", application_id)
                    return Response(
                        {"success": False, "error": "Failed to initiate payment. Please try again.", "code": "PAYMENT_ERROR"},
                        status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    )

                if not result.payment_id:
                    return Response(
                        {"success": True, "data": {"status": "already_paid"}},
                        status=status.HTTP_200_OK,
                    )

                payment_id = result.payment_id
                amount = result.amount
                reference = result.reference
                currency = result.currency

        # Call Lenco mobile money API
        api_secret = getattr(settings, "LENCO_API_SECRET_KEY", "")
        base_url = getattr(settings, "LENCO_API_BASE_URL", "")

        if not api_secret or not base_url:
            try:
                service.mark_provider_initiation(
                    payment_id,
                    status="not_started",
                    operator=operator,
                    phone_hash=hashlib.sha256(phone.encode("utf-8")).hexdigest(),
                    phone_last4=phone[-4:],
                    error="Payment provider credentials are not configured.",
                )
            except Exception:
                logger.exception("Failed to mark provider unavailable for payment %s", payment_id)
            return Response(
                {"success": False, "error": "Payment processing is unavailable.", "code": "PAYMENT_UNAVAILABLE"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        import requests as http_requests

        url = f"{base_url.rstrip('/')}/collections/mobile-money"
        lenco_data = {}
        try:
            resp = http_requests.post(
                url,
                json={
                    "amount": str(amount),
                    "reference": reference,
                    "phone": phone,
                    "operator": operator,
                    "country": "zm",
                    "bearer": "customer",
                },
                headers={"Authorization": f"Bearer {api_secret}", "User-Agent": "MIHAS/2.0", "Accept": "application/json"},
                timeout=15,
            )
            lenco_data = resp.json() if resp.content else {}
            if not resp.ok:
                lenco_error = lenco_data.get("message") or lenco_data.get("error") or resp.reason
                provider_data = {
                    **(lenco_data.get("data", {}) or {}),
                    "type": (lenco_data.get("data", {}) or {}).get("type") or "mobile-money",
                }
                logger.error(
                    "Lenco mobile money API returned %s for payment %s: %s",
                    resp.status_code, payment_id, lenco_error,
                )
                try:
                    service.mark_provider_initiation(
                        payment_id,
                        status="rejected",
                        provider_data=provider_data,
                        operator=operator,
                        phone_hash=hashlib.sha256(phone.encode("utf-8")).hexdigest(),
                        phone_last4=phone[-4:],
                        error=lenco_error,
                    )
                except Exception:
                    logger.exception("Failed to mark provider rejection for payment %s", payment_id)
                try:
                    Payment.objects.filter(id=payment_id, status="pending").update(
                        status="failed",
                        updated_at=timezone.now(),
                    )
                except Exception:
                    logger.exception("Failed to mark rejected provider payment %s as failed", payment_id)
                emit_metric('payment.initiation_failed', method='mobile_money', reason='provider_rejected', application_id=str(application_id))
                return Response(
                    {"success": False, "error": f"Payment provider error: {lenco_error}", "code": "PROVIDER_ERROR"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        except http_requests.RequestException:
            logger.exception("Lenco mobile money API failed for payment %s", payment_id)
            try:
                service.mark_provider_initiation(
                    payment_id,
                    status="unknown",
                    operator=operator,
                    phone_hash=hashlib.sha256(phone.encode("utf-8")).hexdigest(),
                    phone_last4=phone[-4:],
                    error="Provider request failed before a definitive response was received.",
                )
            except Exception:
                logger.exception("Failed to mark provider uncertainty for payment %s", payment_id)
            emit_metric('payment.initiation_failed', method='mobile_money', reason='provider_error', application_id=str(application_id))
            return Response(
                {
                    "success": True,
                    "data": {
                        "payment_id": str(payment_id),
                        "reference": reference,
                        "amount": str(amount),
                        "currency": currency,
                        "status": "pending",
                        "provider_status": "unknown",
                        "operator": operator,
                        "masked_phone": self._mask_phone(phone),
                        "message": "Payment is still being confirmed. Please do not start another payment yet.",
                    },
                },
                status=status.HTTP_202_ACCEPTED,
            )
        except Exception:
            logger.exception("Unexpected error during Lenco mobile money call for payment %s", payment_id)
            return Response(
                {"success": False, "error": "Payment processing failed. Please try again.", "code": "PAYMENT_ERROR"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        lenco_status = lenco_data.get("data", {}).get("status", "")
        lenco_ref = lenco_data.get("data", {}).get("lencoReference", "")
        provider_data = {
            **(lenco_data.get("data", {}) or {}),
            "type": (lenco_data.get("data", {}) or {}).get("type") or "mobile-money",
        }

        # Update payment with Lenco reference/provider status.
        try:
            service.mark_provider_initiation(
                payment_id,
                status="accepted",
                provider_data=provider_data,
                operator=operator,
                phone_hash=hashlib.sha256(phone.encode("utf-8")).hexdigest(),
                phone_last4=phone[-4:],
            )
        except Exception:
            logger.exception("Failed to update payment %s with Lenco reference", payment_id)

        emit_metric('payment.initiated', method='mobile_money', application_id=str(application_id))
        return Response(
            {
                "success": True,
                "data": {
                    "payment_id": str(payment_id),
                    "reference": reference,
                    "amount": str(amount),
                    "currency": currency,
                    "lenco_status": lenco_status,
                    "lenco_reference": lenco_ref,
                    "provider_status": "accepted",
                    "operator": operator,
                    "masked_phone": self._mask_phone(phone),
                },
            },
            status=status.HTTP_201_CREATED,
        )


class PaymentDevBypassView(APIView):
    """POST /api/v1/payments/dev-bypass/ — simulate payment in local development.

    This endpoint is intentionally unavailable unless DEBUG is true and
    PAYMENT_DEV_BYPASS is enabled. It exists only to unblock end-to-end
    application-flow testing without real Lenco credentials.
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(request=OpenApiTypes.ANY, responses={200: OpenApiTypes.ANY})
    def post(self, request):
        if not settings.DEBUG or not getattr(settings, "PAYMENT_DEV_BYPASS", False):
            return Response(
                {"success": False, "error": "Not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )

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

        user = request.user
        role = getattr(user, "role", "student")
        if role not in ("admin", "super_admin") and str(application.user_id) != str(user.id):
            return Response(
                {"success": False, "error": "Not authorized", "code": "INSUFFICIENT_PERMISSIONS"},
                status=status.HTTP_403_FORBIDDEN,
            )

        now = timezone.now()
        amount = application.application_fee if application.application_fee is not None else Decimal("0.00")
        payment = (
            Payment.objects.filter(application_id=application.id)
            .order_by("-created_at")
            .first()
        )

        metadata = {
            "dev_bypass": True,
            "simulated_by": str(user.id),
            "simulated_at": now.isoformat(),
        }

        if payment is None:
            payment = Payment.objects.create(
                application_id=application.id,
                user_id=user.id,
                amount=amount,
                currency="ZMW",
                status="successful",
                payment_method="development_bypass",
                transaction_reference=f"DEV-{application.application_number}-{uuid.uuid4().hex[:8]}",
                lenco_reference=f"DEV-{uuid.uuid4().hex[:12]}",
                verified_by_id=user.id,
                verified_at=now,
                notes="Development payment simulation.",
                metadata=metadata,
                created_at=now,
                updated_at=now,
            )
        else:
            merged_metadata = payment.metadata or {}
            merged_metadata.update(metadata)
            payment.status = "successful"
            payment.payment_method = payment.payment_method or "development_bypass"
            payment.lenco_reference = payment.lenco_reference or f"DEV-{uuid.uuid4().hex[:12]}"
            payment.verified_by_id = user.id
            payment.verified_at = now
            payment.notes = payment.notes or "Development payment simulation."
            payment.metadata = merged_metadata
            payment.updated_at = now
            payment.save(update_fields=[
                "status",
                "payment_method",
                "lenco_reference",
                "verified_by",
                "verified_at",
                "notes",
                "metadata",
                "updated_at",
            ])

        application.payment_status = "successful"
        application.payment_verified_by_id = user.id
        application.payment_verified_at = now
        application.updated_at = now
        application.save(update_fields=[
            "payment_status",
            "payment_verified_by",
            "payment_verified_at",
            "updated_at",
        ])

        return Response({
            "success": True,
            "data": {
                "payment_id": str(payment.id),
                "status": "successful",
                "payment_status": "successful",
            },
        })


class LencoWebhookView(APIView):
    """POST /api/v1/payments/webhook/lenco/ — receive Lenco webhook events.

    Unauthenticated (AllowAny). Validates X-Lenco-Signature header via
    WebhookProcessor. Returns 401 for invalid signature, 200 for valid events.

    Requirements: 4.1, 4.2, 4.7, 10.1
    """

    authentication_classes = []
    permission_classes = [AllowAny]

    @extend_schema(request=OpenApiTypes.ANY, responses={200: OpenApiTypes.ANY})
    def post(self, request):
        allowed_ips = getattr(settings, "LENCO_WEBHOOK_ALLOWED_IPS", [])
        client_ip = _client_ip(request)
        if not _ip_allowed(client_ip, allowed_ips):
            logger.warning("Rejected Lenco webhook from disallowed IP: %s", client_ip)
            return Response(
                {"success": False, "error": "Webhook source not allowed"},
                status=status.HTTP_403_FORBIDDEN,
            )

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

    @extend_schema(
        request=None,
        responses={200: OpenApiTypes.ANY},
        parameters=[
            OpenApiParameter("program_code", OpenApiTypes.STR, OpenApiParameter.QUERY),
            OpenApiParameter("nationality", OpenApiTypes.STR, OpenApiParameter.QUERY, required=False),
            OpenApiParameter("country", OpenApiTypes.STR, OpenApiParameter.QUERY, required=False),
        ],
    )
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
            Q(is_active=True) | Q(is_active__isnull=True),
            program_id=program_id,
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


# ---------------------------------------------------------------------------
# Bug 3 fix: Missing document endpoints (signed-url, download, info, delete)
# ---------------------------------------------------------------------------


class DocumentSignedUrlView(APIView):
    """GET /api/v1/documents/{id}/signed-url/ — generate a time-limited signed URL.

    Returns {"url": "https://..."} for the document's file in R2/S3.
    Requires authentication.
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(request=None, responses={200: OpenApiTypes.ANY})
    def get(self, request, document_id):
        document, error_response = _get_authorized_document(request, self, document_id)
        if error_response is not None:
            return error_response

        file_key = _get_document_storage_key(document)
        if not file_key:
            return Response(
                {"success": False, "error": "Document has no file", "code": "NO_FILE"},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            from apps.common.storage import generate_signed_url

            signed_url = generate_signed_url(file_key)
        except Exception:
            logger.exception("Failed to generate signed URL for document %s", document_id)
            return Response(
                {"success": False, "error": "Failed to generate signed URL", "code": "STORAGE_ERROR"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return Response({"success": True, "data": {"url": signed_url}})


class DocumentDownloadView(APIView):
    """GET /api/v1/documents/{id}/download/ — redirect to signed download URL.

    Generates a signed URL and returns HTTP 302 redirect.
    Requires authentication.
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(request=None, responses={302: None})
    def get(self, request, document_id):
        document, error_response = _get_authorized_document(request, self, document_id)
        if error_response is not None:
            return error_response

        file_key = _get_document_storage_key(document)
        if not file_key:
            return Response(
                {"success": False, "error": "Document has no file", "code": "NO_FILE"},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            from apps.common.storage import generate_signed_url

            signed_url = generate_signed_url(file_key)
        except Exception:
            logger.exception("Failed to generate download URL for document %s", document_id)
            return Response(
                {"success": False, "error": "Failed to generate download URL", "code": "STORAGE_ERROR"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return HttpResponseRedirect(signed_url)


class DocumentInfoView(APIView):
    """GET /api/v1/documents/{id}/info/ — return document metadata.

    Returns document_name, document_type, verification_status,
    uploaded_at, file_size, and mime_type.
    Requires authentication.
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(request=None, responses={200: OpenApiTypes.ANY})
    def get(self, request, document_id):
        document, error_response = _get_authorized_document(request, self, document_id)
        if error_response is not None:
            return error_response

        ai_analysis = _parse_ai_analysis(document.verification_notes) if document.extracted_text else None
        ocr_state = document.verification_status if document.verification_status in {
            "ocr_processing",
            "ocr_complete",
            "ocr_no_text",
            "ocr_no_grades",
            "ocr_failed",
            "ocr_skipped",
        } else None
        data = {
            "id": str(document.id),
            "document_name": document.document_name,
            "document_type": document.document_type,
            "verification_status": document.verification_status,
            "ocr_state": ocr_state,
            "uploaded_at": document.uploaded_at.isoformat() if document.uploaded_at else None,
            "file_size": document.file_size,
            "mime_type": document.mime_type,
            "extracted_text": bool(document.extracted_text),
            "ai_analysis": ai_analysis,
            "ai_analysis_available": bool(ai_analysis),
        }

        return Response({"success": True, "data": data})


class DocumentDeleteView(APIView):
    """DELETE /api/v1/documents/{id}/delete/ — soft-delete a document record.

    Sets verification_status to 'deleted' as a soft-delete marker.
    Requires authentication.
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(request=None, responses={200: OpenApiTypes.ANY})
    def delete(self, request, document_id):
        document, error_response = _get_authorized_document(request, self, document_id)
        if error_response is not None:
            return error_response

        document.verification_status = "deleted"
        document.updated_at = timezone.now()
        document.save(update_fields=["verification_status", "updated_at"])

        application = document.application
        if document.document_type == "result_slip":
            remaining_result_slip = ApplicationDocument.objects.filter(
                application_id=application.id,
                document_type="result_slip",
            ).exclude(
                id=document.id,
            ).exclude(
                verification_status="deleted",
            ).exists()
            if not remaining_result_slip and application.result_slip_url:
                application.result_slip_url = None
                application.updated_at = timezone.now()
                application.save(update_fields=["result_slip_url", "updated_at"])
        elif document.document_type in ("extra_kyc", "nrc", "passport"):
            remaining_identity_document = ApplicationDocument.objects.filter(
                application_id=application.id,
                document_type__in=("extra_kyc", "nrc", "passport"),
            ).exclude(
                id=document.id,
            ).exclude(
                verification_status="deleted",
            ).exists()
            if not remaining_identity_document and application.extra_kyc_url:
                application.extra_kyc_url = None
                application.updated_at = timezone.now()
                application.save(update_fields=["extra_kyc_url", "updated_at"])

        return Response(
            {"success": True, "message": "Document deleted"},
            status=status.HTTP_200_OK,
        )
