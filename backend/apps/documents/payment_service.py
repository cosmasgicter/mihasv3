"""Payment lifecycle service for Lenco integration.

All payment-status mutations flow through this module (ADR-007).
Constants, dataclasses, and pure helpers live in ``payment_constants.py``,
``payment_types.py``, and ``payment_helpers.py``. This module re-exports
every previously-public symbol for backward compatibility.
"""

from __future__ import annotations

import logging
from datetime import timedelta
from decimal import Decimal
from typing import Optional
from uuid import UUID

import time  # noqa: F401 - tests patch this name (payment_reference tests)
import requests as http_requests  # noqa: F401 - tests patch this name
from django.conf import settings  # noqa: F401 - tests patch this name
from django.db import IntegrityError
from django.utils import timezone  # noqa: F401 - tests patch this name

from apps.documents.fee_resolver import FeeResolver  # noqa: F401 - tests patch this name
from apps.documents.models import Payment  # noqa: F401 - tests patch this name

# Re-exported constants (backward-compatible public API).
from apps.documents.payment_constants import (  # noqa: F401
    ALLOWED_TRANSITIONS,
    CanonicalStatus,
    COMPLETED_PAYMENT_STATUSES,
    EXPIRED_EXCLUSION_DAYS,
    MAX_PAYMENT_ATTEMPTS,
    PAYMENT_TO_APP_MAP,
    PROVIDER_STATUS_ACCEPTED,
    PROVIDER_STATUS_NOT_STARTED,
    PROVIDER_STATUS_REJECTED,
    PROVIDER_STATUS_SENT,
    PROVIDER_STATUS_UNKNOWN,
    ProviderInitiationStatus,
    RECEIPT_ELIGIBLE_STATUSES,
    RESOLVED_PAYMENT_STATUSES,
    TransitionSource,
    _ALLOWED_TRANSITIONS,
    _LENCO_STATUS_MAP,
    _LENCO_TIMEOUT,
    _SECURITY_RETENTION_ACTION_PREFIXES,
)

# Re-exported result dataclasses.
from apps.documents.payment_types import (  # noqa: F401
    PaymentInitiationResult,
    PaymentSnapshot,
    PaymentVerificationResult,
    TransitionResult,
)

# Re-exported helpers.
from apps.documents.payment_helpers import (  # noqa: F401
    _ADMIN_REVIEW_STATUS_MAP,
    _AIRTEL_PREFIXES,
    _LEGACY_PAYMENT_TO_APP_STATUS,
    _MTN_PREFIXES,
    _PII_KEYS_IN_LENCO_RESPONSE,
    _build_snapshot_dict,
    _call_lenco_collection_status,
    _call_lenco_mobile_money,
    _check_retry_limit,
    _classify_mobile_money_response,
    _forward_only_enabled,
    _generate_receipt_number,
    _generate_reference as _generate_reference_base,  # base impl; shadowed below
    _normalize_phone_e164,
    _operator_for_msisdn,
    _parse_amount,
    _process_webhook_event_impl,
    _resolve_fee_for_application,
    _review_application_payment_impl,
    _sanitize_lenco_response,
)

from apps.documents.payment_service_mixins import (
    PaymentAdminMixin,
    PaymentCoreMixin,
    PaymentInitiationMixin,
    PaymentVerificationMixin,
)

logger = logging.getLogger(__name__)


def _generate_reference(application_number: str) -> str:  # noqa: F811
    """Build a unique payment reference - uses module-level ``time`` for testability.

    Uses the Beanola-owned ``BNL-`` platform prefix (R9.2). Reconciliation
    joins on the exact stored reference, never on the prefix, so legacy
    ``MIHAS-`` references remain matchable by value.
    """
    ts_ms = int(time.time() * 1000)
    return f"BNL-{application_number}-{ts_ms}"


class PaymentService(
    PaymentInitiationMixin,
    PaymentVerificationMixin,
    PaymentAdminMixin,
    PaymentCoreMixin,
):
    """Manages the full payment lifecycle: initiation, verification, webhooks."""

    def __init__(self) -> None:
        self._fee_resolver = FeeResolver()
