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




class LencoWebhookView(APIView):
    """POST /api/v1/payments/webhook/lenco/ - receive Lenco webhook events.

    Unauthenticated (AllowAny). Validates X-Lenco-Signature header via
    WebhookProcessor. Returns 200 for every syntactically valid delivery so
    Lenco does not retry aggressively; invalid signatures are logged and ignored.

    Requirements: 4.1, 4.2, 4.7, 10.1
    """

    # Webhook ingress is gated by HMAC signature validation, not DRF throttle (R19.4).
    authentication_classes = []
    permission_classes = [AllowAny]

    @extend_schema(request=OpenApiTypes.ANY, responses={200: OpenApiTypes.ANY})
    @require_not_dev_bypass_in_production
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
            # Log the event with invalid signature, then acknowledge delivery
            # without processing it. Provider retry storms are worse than a
            # truthful non-200 here; the invalid event is already recorded.
            processor.process(event_type, payload, signature_valid=False)
            return Response(
                {"success": False, "error": "Invalid webhook signature"},
                status=status.HTTP_200_OK,
            )

        # Process the valid event.
        processor.process(event_type, payload, signature_valid=True)

        return Response({"received": True}, status=status.HTTP_200_OK)
