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




class MobileMoneyInitiateView(APIView):
    """POST /api/v1/payments/mobile-money/ — initiate mobile money collection.

    Creates a pending Payment record then calls the Lenco mobile money API.
    The student authorizes the payment on their phone (pay-offline flow).
    """

    permission_classes = [IsAuthenticated]
    throttle_classes = [PaymentUserScopedRateThrottle]
    throttle_scope = "payment_mobile_money"
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

    def _hardened_post(self, request, application_id, phone_raw):
        """Forward-only path — delegate to ``PaymentService.initiate_mobile_money``.

        The service handles normalisation, operator derivation, Lenco HTTP
        call, and ``mark_provider_initiation``. This view only shapes the
        HTTP envelope with stable codes and metric counters.

        Any ``operator`` field submitted by the client is ignored — the
        backend is the sole authority on operator classification.
        """
        from apps.applications.models import Application
        from apps.documents.payment_service import PaymentService

        try:
            application = Application.objects.get(id=application_id)
        except Application.DoesNotExist:
            payment_metrics.increment(
                "payment.initiation.failure",
                tags={"endpoint": "mobile_money", "outcome": "failure"},
            )
            return Response(
                {
                    "success": False,
                    "error": {
                        "code": "APPLICATION_NOT_FOUND",
                        "message": "Application not found",
                    },
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        user = request.user
        role = getattr(user, "role", "student")
        if role not in ("admin", "super_admin") and str(application.user_id) != str(user.id):
            payment_metrics.increment(
                "payment.initiation.failure",
                tags={"endpoint": "mobile_money", "outcome": "failure"},
            )
            return Response(
                {
                    "success": False,
                    "error": {
                        "code": "NOT_OWNER",
                        "message": "Not authorized",
                    },
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        # Already-paid fast path — mirrors the legacy behaviour.
        if application.payment_status in ("successful", "verified", "force_approved"):
            return Response(
                {
                    "success": True,
                    "data": {
                        "status": "already_paid",
                        "next_action": "already_paid",
                    },
                },
                status=status.HTTP_200_OK,
            )

        service = PaymentService()

        try:
            result = service.initiate_mobile_money(
                application_id=application.id,
                user_id=user.id,
                phone_raw=phone_raw,
            )
        except ValueError as exc:
            error_msg = str(exc)
            if error_msg == "PROVIDER_UNAVAILABLE":
                # Unknown MSISDN prefix — no Airtel/MTN match.
                payment_metrics.increment(
                    "payment.provider.rejected",
                    tags={"endpoint": "mobile_money"},
                )
                return Response(
                    {
                        "success": False,
                        "error": {
                            "code": "PROVIDER_UNAVAILABLE",
                            "message": "Unable to determine mobile money operator for this number.",
                        },
                        "data": {"next_action": "retry_with_different_number"},
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if error_msg == "INVALID_PHONE_FORMAT":
                return Response(
                    {
                        "success": False,
                        "error": {
                            "code": "VALIDATION_ERROR",
                            "message": "Phone number format is not recognised.",
                        },
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if error_msg == "NOT_OWNER":
                return Response(
                    {
                        "success": False,
                        "error": {"code": "NOT_OWNER", "message": "Not authorized"},
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )
            if error_msg.startswith("MAX_PAYMENT_ATTEMPTS_EXCEEDED"):
                parts = error_msg.split("|")
                remaining = int(parts[1]) if len(parts) > 1 else 0
                payment_metrics.increment(
                    "payment.initiation.failure",
                    tags={"endpoint": "mobile_money", "outcome": "failure"},
                )
                return Response(
                    {
                        "success": False,
                        "error": {
                            "code": "MAX_PAYMENT_ATTEMPTS_EXCEEDED",
                            "message": "Maximum payment attempts exceeded. Please contact support.",
                        },
                        "remaining_attempts": remaining,
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            payment_metrics.increment(
                "payment.initiation.failure",
                tags={"endpoint": "mobile_money", "outcome": "failure"},
            )
            logger.exception(
                "Mobile money initiate failed for application %s", application_id
            )
            return Response(
                {
                    "success": False,
                    "error": {"code": "PAYMENT_ERROR", "message": str(exc)},
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        except Exception as exc:
            logger.exception(
                "mobile_money_initiate failure for application=%s, user=%s, phone_last4=%s",
                application_id,
                user_id,
                phone_raw[-4:] if phone_raw else None,
            )
            payment_metrics.increment(
                "payment.initiation.failure",
                tags={"endpoint": "mobile_money", "outcome": "failure"},
            )
            return Response(
                {
                    "success": False,
                    "error": {
                        "code": "PAYMENT_ERROR",
                        "message": "Payment processing failed. Please try again.",
                    },
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        # ``initiate_mobile_money`` returns an empty-payment_id result when
        # the application is already paid.
        if not result.payment_id:
            return Response(
                {
                    "success": True,
                    "data": {
                        "status": "already_paid",
                        "next_action": "already_paid",
                    },
                },
                status=status.HTTP_200_OK,
            )

        # Re-read the Payment row to inspect the provider_initiation status
        # recorded by the service; status drives HTTP and next_action.
        try:
            payment = Payment.objects.get(id=result.payment_id)
        except Payment.DoesNotExist:  # pragma: no cover — defensive
            logger.warning(
                "Payment %s not found after initiate_mobile_money",
                result.payment_id,
            )
            provider_state = "unknown"
            provider_operator = None
            provider_last4 = None
            payment_currency = "ZMW"
        else:
            initiation = (payment.metadata or {}).get("provider_initiation") or {}
            provider_state = initiation.get("status") or "sent"
            provider_operator = initiation.get("operator")
            provider_last4 = initiation.get("phone_last4")
            payment_currency = payment.currency

        emit_metric(
            "payment.initiated",
            method="mobile_money",
            application_id=str(application_id),
        )

        base_data = {
            "payment_id": str(result.payment_id),
            "reference": result.reference,
            "amount": str(result.amount),
            "currency": result.currency or payment_currency,
            "operator": provider_operator,
            "masked_phone": (
                f"***{provider_last4}" if provider_last4 else None
            ),
        }

        if provider_state == "accepted":
            payment_metrics.increment(
                "payment.provider.accepted",
                tags={"endpoint": "mobile_money", "provider_status": "accepted"},
            )
            payment_metrics.increment(
                "payment.initiation.success",
                tags={"endpoint": "mobile_money", "user_role": role},
            )
            return Response(
                {
                    "success": True,
                    "data": {
                        **base_data,
                        "status": "accepted",
                        "provider_status": "accepted",
                        "next_action": None,
                    },
                },
                status=status.HTTP_201_CREATED,
            )

        if provider_state == "unknown":
            payment_metrics.increment(
                "payment.provider.unknown",
                tags={"endpoint": "mobile_money", "provider_status": "unknown"},
            )
            return Response(
                {
                    "success": True,
                    "data": {
                        **base_data,
                        "status": "pending",
                        "provider_status": "unknown",
                        "next_action": "check_status",
                    },
                },
                status=status.HTTP_202_ACCEPTED,
            )

        if provider_state == "rejected":
            payment_metrics.increment(
                "payment.provider.rejected",
                tags={"endpoint": "mobile_money", "provider_status": "rejected"},
            )
            err_message = (initiation.get("error") or "Provider rejected the request.")[:500]
            return Response(
                {
                    "success": False,
                    "error": {
                        "code": "PROVIDER_UNAVAILABLE",
                        "message": err_message,
                    },
                    "data": {
                        **base_data,
                        "status": "pending",
                        "provider_status": "rejected",
                        "next_action": "retry_with_different_number",
                    },
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # not_started / sent / anything else — pending, still in flight.
        payment_metrics.increment(
            "payment.provider.unknown",
            tags={"endpoint": "mobile_money", "provider_status": "unknown"},
        )
        return Response(
            {
                "success": True,
                "data": {
                    **base_data,
                    "status": "pending",
                    "provider_status": provider_state,
                    "next_action": "check_status",
                },
            },
            status=status.HTTP_202_ACCEPTED,
        )

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
    @require_not_dev_bypass_in_production
    @idempotent
    def post(self, request):
        serializer = MobileMoneyInitiateRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {
                    "success": False,
                    "error": {
                        "code": "VALIDATION_ERROR",
                        "message": "application_id and phone are required",
                    },
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        application_id = serializer.validated_data["application_id"]
        phone_raw = serializer.validated_data["phone"].strip()
        logger.info(
            "mobile_money_initiate received",
            extra={
                "application_id": str(serializer.validated_data.get("application_id", "")),
                "user_id": str(getattr(request.user, "id", "")),
                "phone_last4": (serializer.validated_data.get("phone", "") or "")[-4:],
                "idempotency_key_present": bool(request.META.get("HTTP_IDEMPOTENCY_KEY")),
            },
        )
        return self._hardened_post(request, application_id, phone_raw)

