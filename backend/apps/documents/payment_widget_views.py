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

from django.conf import settings
from django.db.models import Q
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, OpenApiTypes, extend_schema, extend_schema_view, inline_serializer
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet

from apps.accounts.permissions import IsAdmin, IsOwnerOrAdmin, IsSuperAdmin
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
from apps.common.dev_bypass import require_not_dev_bypass_in_production
from apps.common.throttling import AIUserScopedRateThrottle, PaymentUserScopedRateThrottle
from apps.documents import payment_metrics
from apps.documents.payment_helpers import _build_tenant_payment_metadata

from django.http import HttpResponseRedirect

logger = logging.getLogger(__name__)


from apps.common.request_utils import get_client_ip as _client_ip


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




# ---------------------------------------------------------------------------
# Lenco payment views (tasks 5.1, 5.3, 5.4, 5.5)
# ---------------------------------------------------------------------------


class PaymentInitiateView(APIView):
    """POST /api/v1/payments/initiate/ - create a pending payment record.

    Authenticated. Creates a Payment via PaymentService and returns the
    reference, amount, currency, and Lenco public key so the frontend can
    open the Lenco widget.

    Requirements: 2.1, 2.2, 2.3
    """

    permission_classes = [IsAuthenticated]
    throttle_classes = [PaymentUserScopedRateThrottle]
    throttle_scope = "payment_initiate"

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
    @require_not_dev_bypass_in_production
    @idempotent
    def post(self, request):
        application_id = request.data.get("application_id")
        if not application_id:
            return Response(
                {"success": False, "error": {"code": "VALIDATION_ERROR", "message": "application_id is required"}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from apps.applications.models import Application

        try:
            application = Application.objects.get(id=application_id)
        except Application.DoesNotExist:
            payment_metrics.increment(
                "payment.initiation.failure",
                tags={"endpoint": "initiate", "outcome": "failure"},
            )
            return Response(
                {"success": False, "error": {"code": "APPLICATION_NOT_FOUND", "message": "Application not found"}},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Ownership check
        user = request.user
        role = getattr(user, "role", "student")
        if role not in ("admin", "super_admin") and str(application.user_id) != str(user.id):
            payment_metrics.increment(
                "payment.initiation.failure",
                tags={"endpoint": "initiate", "outcome": "failure"},
            )
            return Response(
                {"success": False, "error": {"code": "NOT_OWNER", "message": "Not authorized"}},
                status=status.HTTP_403_FORBIDDEN,
            )

        from apps.documents.payment_service import PaymentService

        service = PaymentService()

        try:
            result = service.initiate(
                application_id=application.id,
                user_id=user.id,
            )
        except ValueError as exc:
            error_msg = str(exc)

            if error_msg.startswith("MAX_PAYMENT_ATTEMPTS_EXCEEDED"):
                parts = error_msg.split("|")
                remaining = int(parts[1]) if len(parts) > 1 else 0
                emit_metric('payment.initiation_failed', method='card', reason='max_attempts_exceeded', application_id=str(application_id))
                payment_metrics.increment("payment.initiation.failure", tags={"endpoint": "initiate", "outcome": "failure"})
                return Response(
                    {"success": False, "error": {"code": "MAX_PAYMENT_ATTEMPTS_EXCEEDED", "message": "Maximum payment attempts exceeded. Please contact support."}, "code": "MAX_PAYMENT_ATTEMPTS_EXCEEDED", "remaining_attempts": remaining},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            stable_codes = {
                "NOT_OWNER": (status.HTTP_403_FORBIDDEN, "Not authorized"),
                "APPLICATION_NOT_FOUND": (status.HTTP_404_NOT_FOUND, "Application not found"),
                "APPLICATION_NOT_PAYABLE": (status.HTTP_400_BAD_REQUEST, "Application is not payable"),
                "ALREADY_PAID": (status.HTTP_200_OK, "Application is already paid"),
            }
            if error_msg in stable_codes:
                emit_metric('payment.initiation_failed', method='card', reason=error_msg, application_id=str(application_id))
                payment_metrics.increment("payment.initiation.failure", tags={"endpoint": "initiate", "outcome": "failure"})
                http_status, message = stable_codes[error_msg]
                return Response(
                    {"success": False, "error": {"code": error_msg, "message": message}},
                    status=http_status,
                )

            logger.exception("Failed to initiate payment for application %s", application_id)
            emit_metric('payment.initiation_failed', method='card', reason=str(exc), application_id=str(application_id))
            payment_metrics.increment("payment.initiation.failure", tags={"endpoint": "initiate", "outcome": "failure"})
            return Response(
                {"success": False, "error": {"code": "PAYMENT_ERROR", "message": str(exc)}},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except Exception:
            logger.exception("Failed to initiate payment for application %s", application_id)
            emit_metric('payment.initiation_failed', method='card', reason='unexpected_error', application_id=str(application_id))
            payment_metrics.increment("payment.initiation.failure", tags={"endpoint": "initiate", "outcome": "failure"})
            return Response(
                {"success": False, "error": {"code": "PAYMENT_ERROR", "message": "Failed to initiate payment"}},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        lenco_public_key = getattr(settings, "LENCO_PUBLIC_KEY", "") or ""

        if not result.payment_id:
            emit_metric('payment.initiated', method='card', application_id=str(application_id))
            payment_metrics.increment("payment.initiation.duplicate", tags={"endpoint": "initiate"})
            return Response(
                {"success": True, "data": {"payment_id": None, "reference": "", "amount": "0", "currency": "", "lenco_public_key": lenco_public_key, "next_action": "already_paid"}},
                status=status.HTTP_200_OK,
            )

        emit_metric('payment.initiated', method='card', application_id=str(application_id))
        payment_metrics.increment("payment.initiation.success", tags={"endpoint": "initiate", "user_role": role})
        return Response(
            {"success": True, "data": {"payment_id": str(result.payment_id), "reference": result.reference, "amount": str(result.amount), "currency": result.currency, "lenco_public_key": lenco_public_key}},
            status=status.HTTP_201_CREATED,
        )


class DeferPaymentView(APIView):
    """POST /api/v1/payments/defer/ - create a deferred payment record."""

    permission_classes = [IsAuthenticated]
    throttle_classes = [PaymentUserScopedRateThrottle]
    throttle_scope = "payment_defer"
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
    @require_not_dev_bypass_in_production
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
                    "payment_id": str(result.payment_id) if result.payment_id else None,
                    "reference": result.reference,
                    "amount": str(result.amount),
                    "currency": result.currency,
                    "status": "deferred",
                },
            },
            status=status.HTTP_201_CREATED,
        )


class PaymentDevBypassView(APIView):
    """POST /api/v1/payments/dev-bypass/ - simulate payment in local development.

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
            **_build_tenant_payment_metadata(application),
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
                status="pending",
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
            # Do NOT mutate payment.status here - PaymentService._transition()
            # below is the sole authority for status writes. The admin_override
            # source allows transition from any state to force_approved.
            payment.payment_method = payment.payment_method or "development_bypass"
            payment.lenco_reference = payment.lenco_reference or f"DEV-{uuid.uuid4().hex[:12]}"
            payment.verified_by_id = user.id
            payment.verified_at = now
            payment.notes = payment.notes or "Development payment simulation."
            payment.metadata = merged_metadata
            payment.updated_at = now
            payment.save(update_fields=[
                "payment_method",
                "lenco_reference",
                "verified_by",
                "verified_at",
                "notes",
                "metadata",
                "updated_at",
            ])

        # Route through PaymentService._transition() for audit trail and
        # correct application status derivation (PAYMENT_TO_APP_MAP).
        from apps.documents.payment_service import PaymentService

        svc = PaymentService()
        result = svc._transition(
            payment,
            target_status="force_approved",
            source="admin_override",
            actor=user.id,
            reason="dev_bypass",
        )

        # Fallback: if _transition didn't sync app status (e.g. flag off
        # and legacy path skipped force_approved), ensure correctness.
        application.refresh_from_db(fields=["payment_status"])
        if application.payment_status != "verified":
            application.payment_status = "verified"
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
                "status": result.status,
                "payment_status": "verified",
            },
        })
