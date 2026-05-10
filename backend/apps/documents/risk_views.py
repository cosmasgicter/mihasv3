"""Super-admin risk-flag inspection endpoint — payment-hardening Task 47.

``GET /api/v1/payments/risk-flags/``

Provides paginated, filterable access to payment risk flags stored in
``Payment.metadata.risk_flags`` (jsonb array). Super-admin only. PII is
redacted from ``details`` before serialisation.

Query parameters
----------------

* ``type`` — optional; one of the design's canonical risk-flag types:
  ``amount_mismatch``, ``currency_mismatch``, ``invalid_amount``,
  ``missing_provider_reference``.
* ``since`` / ``until`` — optional ISO8601 timestamps bounding
  ``recorded_at``; inclusive on both ends.
* ``page`` — 1-based page number, default ``1``.
* ``page_size`` — default ``25``, clamped to ``[1, 100]``.

The endpoint returns the platform envelope:

    {
      "success": true,
      "data": {
        "page": int,
        "pageSize": int,
        "totalCount": int,
        "results": [
          {
            "payment_id": "...",
            "application_id": "... | null",
            "type": "amount_mismatch",
            "details": { ...redacted... },
            "recorded_at": "2026-04-21T..."
          }
        ]
      }
    }

Security
--------

* ``IsAuthenticated`` + ``IsSuperAdmin`` permissions (R17.5).
* ``@require_not_dev_bypass_in_production`` on ``get`` (R16.1, R16.3).
* Per-user throttle scope ``payment_risk_flags`` at ``30/min`` via
  :class:`PaymentUserScopedRateThrottle` (R19.1, R19.2).
* ``details`` is redacted through :meth:`PaymentAuditService._redact_pii`
  so phone numbers, NRC/Passport, PAN, document bodies, and raw payloads
  never leave the server (R17.4).

Validates: Requirements R17.1, R17.2, R17.5.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Optional

from django.db import connection
from django.utils.dateparse import parse_datetime
from drf_spectacular.utils import (
    OpenApiParameter,
    OpenApiResponse,
    OpenApiTypes,
    extend_schema,
)
from rest_framework import serializers, status
from rest_framework.generics import GenericAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import IsSuperAdmin
from apps.common.dev_bypass import require_not_dev_bypass_in_production
from apps.common.throttling import PaymentUserScopedRateThrottle
from apps.documents.payment_audit_service import PaymentAuditService

logger = logging.getLogger(__name__)


#: The four canonical risk-flag ``type`` values. Anything outside this set is
#: rejected with ``VALIDATION_ERROR`` — mirrors the types emitted by
#: :meth:`PaymentService._record_payment_risk` (design § Integrity Gate).
ALLOWED_RISK_TYPES: frozenset[str] = frozenset(
    {
        "amount_mismatch",
        "currency_mismatch",
        "invalid_amount",
        "missing_provider_reference",
    }
)

#: Default and maximum page sizes for the paginated response.
DEFAULT_PAGE_SIZE = 25
MAX_PAGE_SIZE = 100


class RiskFlagItemSerializer(serializers.Serializer):
    payment_id = serializers.UUIDField()
    application_id = serializers.UUIDField(allow_null=True)
    type = serializers.ChoiceField(choices=sorted(ALLOWED_RISK_TYPES))
    details = serializers.JSONField()
    recorded_at = serializers.DateTimeField(allow_null=True)


class RiskFlagsDataSerializer(serializers.Serializer):
    page = serializers.IntegerField()
    pageSize = serializers.IntegerField()
    totalCount = serializers.IntegerField()
    results = RiskFlagItemSerializer(many=True)


class RiskFlagsResponseSerializer(serializers.Serializer):
    success = serializers.BooleanField()
    data = RiskFlagsDataSerializer()


def _validation_error(message: str, details: Optional[dict] = None) -> Response:
    """Build a stable ``VALIDATION_ERROR`` envelope (HTTP 400)."""
    body: dict[str, Any] = {
        "success": False,
        "error": {
            "code": "VALIDATION_ERROR",
            "message": message,
        },
    }
    if details:
        body["error"]["details"] = details
    return Response(body, status=status.HTTP_400_BAD_REQUEST)


def _parse_positive_int(
    raw: Optional[str], *, default: int, minimum: int, maximum: Optional[int] = None
) -> tuple[Optional[int], Optional[str]]:
    """Parse a positive-integer query param with clamping.

    Returns ``(value, error_message)``. If ``raw`` is ``None``/empty the
    ``default`` is returned. If parsing fails or the value is below
    ``minimum`` a human-readable error message is returned and ``value`` is
    ``None``. Values above ``maximum`` are clamped (not rejected) so clients
    can ask for ``page_size=9999`` without error.
    """
    if raw is None or raw == "":
        return default, None
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return None, "must be an integer"
    if value < minimum:
        return None, f"must be >= {minimum}"
    if maximum is not None and value > maximum:
        value = maximum
    return value, None


def _parse_iso_datetime(raw: Optional[str]) -> tuple[Optional[datetime], Optional[str]]:
    """Parse an ISO8601 timestamp query param.

    Returns ``(datetime, error_message)``. ``None``/empty input returns
    ``(None, None)`` — the caller treats that as "no bound".
    """
    if raw is None or raw == "":
        return None, None
    parsed = parse_datetime(raw)
    if parsed is None:
        return None, "must be a valid ISO8601 timestamp"
    return parsed, None


class RiskFlagsListView(GenericAPIView):
    """``GET /api/v1/payments/risk-flags/`` — super-admin risk-flag review.

    See module docstring for the full contract. The view uses raw SQL to
    unnest ``payments.metadata->'risk_flags'`` via ``jsonb_array_elements``
    because the ``payments`` table is ``managed=False`` and the risk-flag
    schema lives entirely inside jsonb.
    """

    permission_classes = [IsAuthenticated, IsSuperAdmin]
    throttle_classes = [PaymentUserScopedRateThrottle]
    throttle_scope = "payment_risk_flags"
    serializer_class = RiskFlagsResponseSerializer

    @extend_schema(
        operation_id="payment_risk_flags_list",
        tags=["payments"],
        parameters=[
            OpenApiParameter(
                "type",
                OpenApiTypes.STR,
                OpenApiParameter.QUERY,
                required=False,
                enum=sorted(ALLOWED_RISK_TYPES),
                description="Filter by canonical payment risk flag type.",
            ),
            OpenApiParameter(
                "since",
                OpenApiTypes.DATETIME,
                OpenApiParameter.QUERY,
                required=False,
                description="Inclusive lower bound for risk flag recorded_at.",
            ),
            OpenApiParameter(
                "until",
                OpenApiTypes.DATETIME,
                OpenApiParameter.QUERY,
                required=False,
                description="Inclusive upper bound for risk flag recorded_at.",
            ),
            OpenApiParameter(
                "page",
                OpenApiTypes.INT,
                OpenApiParameter.QUERY,
                required=False,
                description="1-based page number.",
            ),
            OpenApiParameter(
                "page_size",
                OpenApiTypes.INT,
                OpenApiParameter.QUERY,
                required=False,
                description="Page size, clamped to 100.",
            ),
        ],
        responses={200: OpenApiResponse(response=RiskFlagsResponseSerializer)},
    )
    @require_not_dev_bypass_in_production
    def get(self, request):  # noqa: D401 — DRF convention
        params = request.query_params

        # ---- Validate & parse query params -----------------------------------
        risk_type = params.get("type") or None
        if risk_type is not None and risk_type not in ALLOWED_RISK_TYPES:
            return _validation_error(
                "Invalid risk-flag type.",
                details={"type": sorted(ALLOWED_RISK_TYPES)},
            )

        since, since_err = _parse_iso_datetime(params.get("since"))
        if since_err:
            return _validation_error(f"`since` {since_err}.")

        until, until_err = _parse_iso_datetime(params.get("until"))
        if until_err:
            return _validation_error(f"`until` {until_err}.")

        page, page_err = _parse_positive_int(
            params.get("page"), default=1, minimum=1
        )
        if page_err:
            return _validation_error(f"`page` {page_err}.")

        page_size, page_size_err = _parse_positive_int(
            params.get("page_size"),
            default=DEFAULT_PAGE_SIZE,
            minimum=1,
            maximum=MAX_PAGE_SIZE,
        )
        if page_size_err:
            return _validation_error(f"`page_size` {page_size_err}.")

        offset = (page - 1) * page_size

        # ---- Build the shared WHERE clause ----------------------------------
        # ``jsonb_array_elements`` fans out the ``risk_flags`` array into one
        # row per flag. ``COALESCE`` ensures payments without a ``risk_flags``
        # key produce zero rows (no NULL-vs-missing surprises).
        where_sql = (
            "WHERE (%s::text IS NULL OR flag->>'type' = %s) "
            "AND (%s::timestamptz IS NULL "
            "     OR (flag->>'recorded_at')::timestamptz >= %s) "
            "AND (%s::timestamptz IS NULL "
            "     OR (flag->>'recorded_at')::timestamptz <= %s)"
        )
        where_params = [
            risk_type, risk_type,
            since, since,
            until, until,
        ]

        count_sql = (
            "SELECT COUNT(*) "
            "FROM payments p, "
            "     jsonb_array_elements("
            "       COALESCE(p.metadata->'risk_flags', '[]'::jsonb)"
            "     ) AS flag "
            f"{where_sql}"
        )
        select_sql = (
            "SELECT p.id AS payment_id, "
            "       p.application_id, "
            "       flag->>'type' AS type, "
            "       flag->'details' AS details, "
            "       (flag->>'recorded_at')::timestamptz AS recorded_at "
            "FROM payments p, "
            "     jsonb_array_elements("
            "       COALESCE(p.metadata->'risk_flags', '[]'::jsonb)"
            "     ) AS flag "
            f"{where_sql} "
            "ORDER BY (flag->>'recorded_at')::timestamptz DESC NULLS LAST "
            "LIMIT %s OFFSET %s"
        )

        with connection.cursor() as cursor:
            cursor.execute(count_sql, where_params)
            total_count = int(cursor.fetchone()[0] or 0)

            cursor.execute(select_sql, where_params + [page_size, offset])
            rows = cursor.fetchall()

        # ---- Redact + serialise ---------------------------------------------
        results: list[dict[str, Any]] = []
        for payment_id, application_id, flag_type, details, recorded_at in rows:
            # psycopg returns ``jsonb`` as a Python dict/list/scalar. Pass the
            # raw value through ``_redact_pii`` so nested PII (phone, NRC,
            # passport, PAN, card_number, raw_payload, document_body) is
            # redacted at any depth before it leaves the server.
            redacted_details = PaymentAuditService._redact_pii(details)
            results.append(
                {
                    "payment_id": str(payment_id),
                    "application_id": (
                        str(application_id) if application_id is not None else None
                    ),
                    "type": flag_type,
                    "details": redacted_details,
                    "recorded_at": (
                        recorded_at.isoformat() if recorded_at is not None else None
                    ),
                }
            )

        return Response(
            {
                "success": True,
                "data": {
                    "page": page,
                    "pageSize": page_size,
                    "totalCount": total_count,
                    "results": results,
                },
            },
            status=status.HTTP_200_OK,
        )


__all__ = ["RiskFlagsListView"]
