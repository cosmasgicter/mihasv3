"""Fee-quote endpoint — the server-authored money contract (task 8.1).

``POST /api/v1/payments/quote/`` is the ``CreateFeeQuote`` command from design
§10.1: it accepts **only** an application id, resolves the canonical offering,
residency, fee, provider-fee policy, and configuration version on the server, and
returns a signed, expiring quote. ``GET`` reads the live quote back so a refreshed
payment step shows the same price it showed before the reload.

The frontend renders these numbers and computes nothing — no percentage, no total,
no fallback amount (finding **STU-08**; requirements **R12.1**, **R12.2**,
**R12.6**).

Authority notes
---------------
* **Owner-class action.** Quoting reveals an application's fee, so it follows the
  same disclosure policy as payment initiation (AUTH-07): a valid-but-non-owned
  application id returns the canonical 404 mask, never a distinguishable 403.
* **Tenant scoping happens before lookup by construction.** The fee is resolved
  from the application's canonical ``program_offering`` binding (task 5.2), so a
  same-name offering in another tenant can never satisfy this quote (R7.7). No
  display-name lookup exists on this path (DATA-05).
* **Fail closed.** A missing or ambiguous fee returns the stable
  ``FEE_NOT_CONFIGURED`` / ``FEE_AMBIGUOUS`` envelope. The endpoint has no
  fallback amount to offer, by design (R12.2).
"""

from __future__ import annotations

import logging

from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, OpenApiTypes, extend_schema
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.dev_bypass import require_not_dev_bypass_in_production
from apps.common.object_authorization import authorize_owned_application
from apps.common.openapi_helpers import ErrorResponseSerializer
from apps.common.throttling import PaymentUserScopedRateThrottle
from apps.documents.fee_quote_service import FeeQuoteError, FeeQuoteService
from apps.documents.fee_resolver import FeeConfigurationError
from apps.documents.serializers import (
    FeeQuoteRequestSerializer,
    FeeQuoteResponseSerializer,
)

logger = logging.getLogger(__name__)


def _error(code: str, message: str, http_status: int) -> Response:
    """Canonical nested payment-error envelope with a stable code."""
    return Response(
        {
            "success": False,
            "error": {"code": code, "message": message},
            "code": code,
        },
        status=http_status,
    )


def _load_owned_application(request, application_id):
    """Return ``(application, None)`` or ``(None, canonical_404_mask)``.

    A malformed id, a missing id, and a valid-but-non-owned id all collapse to the
    same not-found envelope so existence is never confirmed to a non-owner.
    """
    from django.core.exceptions import ValidationError as DjangoValidationError

    from apps.applications.models import Application

    try:
        application = Application.objects.get(id=application_id)
    except (Application.DoesNotExist, ValueError, TypeError, DjangoValidationError):
        return None, _error(
            "APPLICATION_NOT_FOUND", "Application not found", status.HTTP_404_NOT_FOUND
        )

    denied = authorize_owned_application(
        request, application, allow_scoped_staff=False, nested=True
    )
    if denied is not None:
        return None, denied
    return application, None


class FeeQuoteView(APIView):
    """Create (or read) the expiring server-authored fee quote for an application."""

    permission_classes = [IsAuthenticated]
    throttle_classes = [PaymentUserScopedRateThrottle]
    throttle_scope = "payment_resolve_fee"
    serializer_class = FeeQuoteRequestSerializer

    @extend_schema(
        operation_id="payments_create_fee_quote",
        tags=["payments"],
        request=FeeQuoteRequestSerializer,
        responses={
            200: OpenApiResponse(response=FeeQuoteResponseSerializer),
            400: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
            409: OpenApiResponse(response=ErrorResponseSerializer),
            422: OpenApiResponse(response=ErrorResponseSerializer),
        },
        summary="Create the expiring server-authored fee quote for an application",
        description=(
            "Mints (or returns the still-valid) fee quote for the application: "
            "canonical base amount, server-policy provider fee, total, currency, "
            "bearer, residency, expiry, status, and signature. The client performs "
            "no amount arithmetic and has no default fee."
        ),
    )
    @require_not_dev_bypass_in_production
    def post(self, request):
        serializer = FeeQuoteRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return _error(
                "VALIDATION_ERROR",
                "application_id is required",
                status.HTTP_400_BAD_REQUEST,
            )

        application, denied = _load_owned_application(
            request, serializer.validated_data["application_id"]
        )
        if denied is not None:
            return denied

        service = FeeQuoteService()
        try:
            quote = service.create_quote(
                application, actor_id=getattr(request.user, "id", None)
            )
        except FeeConfigurationError as exc:
            # No unique active fee. Fail closed with the stable code — there is no
            # hardcoded amount to substitute (R12.2, DATA-05, STU-08).
            return _error(exc.code, exc.message, exc.status_code)
        except FeeQuoteError as exc:
            return _error(exc.code, exc.message, exc.status_code)
        except Exception:
            logger.exception(
                "Fee quote creation failed for application %s", application.id
            )
            return _error(
                "FEE_UNAVAILABLE",
                "Unable to prepare the fee right now. Please try again.",
                status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response({"success": True, "data": FeeQuoteService.as_dict(quote)})

    @extend_schema(
        operation_id="payments_read_fee_quote",
        tags=["payments"],
        parameters=[
            OpenApiParameter(
                "application_id",
                OpenApiTypes.UUID,
                OpenApiParameter.QUERY,
                required=True,
                description="Application whose live fee quote should be returned.",
            ),
        ],
        responses={
            200: OpenApiResponse(response=FeeQuoteResponseSerializer),
            400: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
        summary="Read the live fee quote for an application",
        description=(
            "Returns the current unexpired, untampered quote. An expired, redeemed, "
            "superseded, or signature-mismatched quote is not returned — the client "
            "must request a new quote rather than reuse a stale price."
        ),
    )
    @require_not_dev_bypass_in_production
    def get(self, request):
        application_id = request.query_params.get("application_id")
        if not application_id:
            return _error(
                "VALIDATION_ERROR",
                "application_id query parameter is required",
                status.HTTP_400_BAD_REQUEST,
            )

        application, denied = _load_owned_application(request, application_id)
        if denied is not None:
            return denied

        quote = FeeQuoteService().active_quote(application.id)
        if quote is None:
            return _error(
                "QUOTE_NOT_FOUND",
                "No live fee quote exists for this application.",
                status.HTTP_404_NOT_FOUND,
            )
        return Response({"success": True, "data": FeeQuoteService.as_dict(quote)})


__all__ = ["FeeQuoteView"]
