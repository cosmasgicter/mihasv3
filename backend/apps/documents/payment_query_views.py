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
from apps.documents.payment_constants import RECEIPT_ELIGIBLE_STATUSES
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
    """GET /api/v1/payments/ - list payments for the authenticated user.

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
    """GET /api/v1/payments/{id}/receipt/ - generate receipt data.

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

        if payment.status not in RECEIPT_ELIGIBLE_STATUSES:
            return Response(
                {
                    "success": False,
                    "error": "A receipt is only available for successful payments.",
                    "code": "RECEIPT_NOT_ELIGIBLE",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not payment.receipt_number:
            from apps.documents.payment_service import PaymentService

            PaymentService()._generate_receipt_idempotent(payment)
            payment.refresh_from_db()

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
            "receipt_number": payment.receipt_number,
            "created_at": payment.created_at.isoformat() if payment.created_at else None,
            "application_number": application.application_number if application else None,
            "program": application.program if application else None,
            "applicant_name": application.full_name if application else None,
            "override": payment.status == "force_approved",
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
    """POST /api/v1/payments/{id}/verify/ - verify payment via Lenco API.

    Authenticated. Students can only verify their own payments.
    Admins can verify any payment.
    Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
    """

    permission_classes = [IsAuthenticated]
    throttle_classes = [PaymentUserScopedRateThrottle]
    throttle_scope = "payment_verify"

    @require_not_dev_bypass_in_production
    @idempotent
    def post(self, request, payment_id):
        try:
            payment = Payment.objects.get(id=payment_id)
        except Payment.DoesNotExist:
            return Response(
                {"success": False, "error": {"code": "NOT_FOUND", "message": "Payment not found"}, "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )

        user = request.user
        role = getattr(user, "role", "student")

        if role not in ("admin", "super_admin") and str(payment.user_id) != str(user.id):
            return Response(
                {"success": False, "error": {"code": "NOT_OWNER", "message": "Not authorized"}, "code": "NOT_OWNER"},
                status=status.HTTP_403_FORBIDDEN,
            )

        from apps.documents.payment_service import PaymentService

        service = PaymentService()
        try:
            result = service.verify(payment_id, actor_id=user.id)
        except Exception:
            import sentry_sdk
            sentry_sdk.capture_exception()
            return Response(
                {"success": False, "error": {"code": "VERIFICATION_ERROR", "message": "Payment verification failed. Please try again later."}, "code": "VERIFICATION_ERROR"},
                status=status.HTTP_200_OK,
            )

        data = {
            "status": result.status,
            "amount": str(result.amount) if result.amount is not None else None,
            "currency": result.currency,
            "lenco_reference": result.lenco_reference,
            "payment_method": result.payment_method,
        }

        err = result.error
        if err is None:
            data["code"] = "PAYMENT_CONFIRMED"
            payment_metrics.increment("payment.verify.confirmed", tags={"endpoint": "verify", "user_role": role})
            return Response({"success": True, "data": data})

        if err == "PROVIDER_UNAVAILABLE":
            data["code"] = "PROVIDER_UNAVAILABLE"
            data["next_action"] = "check_status"
            payment_metrics.increment("payment.verify.provider_unavailable", tags={"endpoint": "verify"})
            return Response({"success": True, "data": data}, status=status.HTTP_200_OK)

        if err == "PAYMENT_PENDING":
            data["code"] = "PAYMENT_PENDING"
            data["next_action"] = "check_status"
            payment_metrics.increment("payment.verify.pending", tags={"endpoint": "verify"})
            return Response({"success": True, "data": data}, status=status.HTTP_200_OK)

        if err in ("AMOUNT_MISMATCH", "CURRENCY_MISMATCH", "MISSING_PROVIDER_REFERENCE"):
            data["code"] = err
            return Response(
                {"success": False, "error": {"code": err, "message": err.replace("_", " ").capitalize()}, "code": err, "data": data},
                status=status.HTTP_200_OK,
            )

        data["code"] = "VERIFICATION_ERROR"
        return Response(
            {"success": False, "error": {"code": "VERIFICATION_ERROR", "message": str(err)}, "code": "VERIFICATION_ERROR", "data": data},
            status=status.HTTP_200_OK,
        )


class FeeResolveView(APIView):
    """GET /api/v1/payments/resolve-fee/ - resolve application fee.

    Authenticated. Returns the resolved fee amount and currency for a
    given program code and student residency.

    Query params: program_code, nationality, country

    Requirements: 6.1, 6.2, 6.3
    """

    permission_classes = [IsAuthenticated]
    throttle_classes = [PaymentUserScopedRateThrottle]
    throttle_scope = "payment_resolve_fee"

    @extend_schema(
        request=None,
        responses={200: OpenApiTypes.ANY},
        parameters=[
            OpenApiParameter("program_code", OpenApiTypes.STR, OpenApiParameter.QUERY),
            OpenApiParameter("nationality", OpenApiTypes.STR, OpenApiParameter.QUERY, required=False),
            OpenApiParameter("country", OpenApiTypes.STR, OpenApiParameter.QUERY, required=False),
        ],
    )
    @require_not_dev_bypass_in_production
    def get(self, request):
        program_code = request.query_params.get("program_code")
        if not program_code:
            return Response(
                {"success": False, "error": {"code": "VALIDATION_ERROR", "message": "program_code query parameter is required"}, "code": "VALIDATION_ERROR"},
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
                {"success": False, "error": {"code": "FEE_UNAVAILABLE", "message": "Program not found"}, "code": "FEE_UNAVAILABLE"},
                status=status.HTTP_404_NOT_FOUND,
            )
        except Exception:
            logger.exception("Fee resolution failed for program %s", program_code)
            return Response(
                {"success": False, "error": {"code": "FEE_UNAVAILABLE", "message": "Unable to resolve fee."}, "code": "FEE_UNAVAILABLE"},
                status=status.HTTP_404_NOT_FOUND,
            )

        provider_fee_estimate = Decimal(
            str(getattr(resolved, "provider_fee_estimate", "0") or "0")
        )
        customer_total = Decimal(str(resolved.amount)) + provider_fee_estimate

        return Response({
            "success": True,
            "data": {
                "amount": str(resolved.amount),
                "currency": resolved.currency,
                "residency_category": resolved.residency_category,
                "source": resolved.source,
                "provider_fee_estimate": str(provider_fee_estimate),
                "customer_total": str(customer_total),
            },
        })


class ProgramFeeViewSet(ModelViewSet):
    """CRUD for /api/v1/programs/:id/fees/ - admin only.

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
