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




# ---------------------------------------------------------------------------
# Super-admin payment correction (payment-hardening Task 46.1)
# ---------------------------------------------------------------------------


class SuperAdminPaymentCorrectionRequestSerializer(serializers.Serializer):
    """Request body for ``POST /api/v1/payments/<uuid>/correct/``.

    The serializer enforces the reason-length guard at the boundary so a
    short reason never reaches the service layer. Field-level errors are
    mapped to stable codes (``OVERRIDE_REASON_REQUIRED`` /
    ``VALIDATION_ERROR``) by the view on validation failure.
    """

    target_status = serializers.ChoiceField(
        choices=[
            "pending",
            "deferred",
            "successful",
            "failed",
            "expired",
            "force_approved",
        ],
    )
    reason = serializers.CharField(min_length=10, max_length=500)


class SuperAdminPaymentCorrectionView(APIView):
    """POST /api/v1/payments/<uuid:payment_id>/correct/ — super-admin override.

    Super_Admin_Correction_Path (design § State Machine): allows a
    super-admin to move a Payment to any canonical status, including
    from a terminal state. The audit row is emitted **before** the
    transition persists so the governance trail survives a rollback
    (R1.5). The action ``payment.super_admin_corrected`` auto-promotes
    to the 365-day security retention window via
    ``SECURITY_RETENTION_ACTION_PREFIXES`` (R2.6).

    Permission: ``IsAuthenticated`` + ``IsSuperAdmin`` (R17.5 analogue —
    actor role must equal ``super_admin``). Dev-bypass vectors are
    locked out in production via ``require_not_dev_bypass_in_production``
    (R16.1). Per-user rate limit of ``3/min`` via the ``payment_correct``
    scope on ``PaymentUserScopedRateThrottle`` (R19.1, R19.2).

    Requirements: R2.5, R2.6, R17.1.
    """

    permission_classes = [IsAuthenticated, IsSuperAdmin]
    throttle_classes = [PaymentUserScopedRateThrottle]
    throttle_scope = "payment_correct"

    @extend_schema(
        operation_id="payments_super_admin_correct",
        tags=["payments"],
        request=SuperAdminPaymentCorrectionRequestSerializer,
        responses={
            200: OpenApiTypes.OBJECT,
            400: OpenApiResponse(response=ErrorResponseSerializer),
            403: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
            429: OpenApiResponse(response=ErrorResponseSerializer),
        },
        summary="Super-admin correction — move a Payment to any canonical status.",
    )
    @require_not_dev_bypass_in_production
    def post(self, request, payment_id):
        serializer = SuperAdminPaymentCorrectionRequestSerializer(data=request.data)
        if not serializer.is_valid():
            # Map short-reason errors to the stable ``OVERRIDE_REASON_REQUIRED``
            # code (R2.5); everything else flows through the generic
            # ``VALIDATION_ERROR`` path.
            reason_errors = serializer.errors.get("reason")
            code = (
                "OVERRIDE_REASON_REQUIRED"
                if reason_errors
                else "VALIDATION_ERROR"
            )
            return Response(
                {
                    "success": False,
                    "error": {
                        "code": code,
                        "message": (
                            "Reason must be at least 10 characters."
                            if code == "OVERRIDE_REASON_REQUIRED"
                            else "Invalid request body."
                        ),
                        "details": serializer.errors,
                    },
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        target_status = serializer.validated_data["target_status"]
        reason = serializer.validated_data["reason"]

        from apps.documents.payment_service import PaymentService

        service = PaymentService()
        try:
            result = service.super_admin_correct(
                payment_id=payment_id,
                target_status=target_status,
                actor_id=request.user.id,
                reason=reason,
            )
        except ValueError as exc:
            code = str(exc)
            if code == "PAYMENT_NOT_FOUND":
                return Response(
                    {
                        "success": False,
                        "error": {
                            "code": "NOT_FOUND",
                            "message": "Payment not found.",
                        },
                    },
                    status=status.HTTP_404_NOT_FOUND,
                )
            if code in ("OVERRIDE_REASON_REQUIRED", "INVALID_TARGET_STATUS"):
                return Response(
                    {
                        "success": False,
                        "error": {
                            "code": code,
                            "message": code.replace("_", " ").capitalize(),
                        },
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            raise

        return Response(
            {
                "success": True,
                "data": {
                    "payment_id": str(result.payment_id),
                    "status": result.status,
                    "target_status": target_status,
                    "reason_accepted": True,
                },
            },
            status=status.HTTP_200_OK,
        )

