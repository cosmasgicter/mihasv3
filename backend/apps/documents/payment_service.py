"""Payment lifecycle service for Lenco integration.

Stream 9 Phase 2 of the canonical-truth program: extracted constants,
result dataclasses, and module-level helpers into separate modules
(``payment_constants.py``, ``payment_types.py``, ``payment_helpers.py``).
The ``PaymentService`` class itself is intentionally NOT split — the
forward-only state machine, integrity gates, and Lenco interactions are
deeply interdependent and decomposing them is its own dedicated spec.
This module remains the public import path; every previously-defined
symbol is re-exported below.

Central service for creating payment records, verifying payment status with
the Lenco API, and processing webhook events.  All payment-status mutations
flow through this module so that forward-only transition rules and amount-
mismatch detection are enforced in a single place.

Requirements: 2.1, 2.2, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.3, 4.4, 4.9,
              9.1, 9.2, 9.5, 9.6, 10.3, 10.4, 10.5, 10.7
"""

from __future__ import annotations

import base64
import logging
import secrets
import time
from dataclasses import dataclass
from datetime import timedelta
from decimal import Decimal, InvalidOperation
from typing import Literal, Optional
from uuid import UUID

import requests as http_requests
from django.conf import settings
from django.db import IntegrityError
from django.utils import timezone

from apps.documents.fee_resolver import FeeResolver
from apps.documents.models import Payment

# Stream 9 Phase 2 — extracted modules. Re-exported below for back-compat.
from apps.documents.payment_constants import (  # noqa: F401
    ALLOWED_TRANSITIONS,
    CanonicalStatus,
    EXPIRED_EXCLUSION_DAYS,
    MAX_PAYMENT_ATTEMPTS,
    PAYMENT_TO_APP_MAP,
    PROVIDER_STATUS_ACCEPTED,
    PROVIDER_STATUS_NOT_STARTED,
    PROVIDER_STATUS_REJECTED,
    PROVIDER_STATUS_SENT,
    PROVIDER_STATUS_UNKNOWN,
    ProviderInitiationStatus,
    TransitionSource,
    _ALLOWED_TRANSITIONS,
    _LENCO_STATUS_MAP,
    _LENCO_TIMEOUT,
    _SECURITY_RETENTION_ACTION_PREFIXES,
)
from apps.documents.payment_types import (  # noqa: F401
    PaymentInitiationResult,
    PaymentSnapshot,
    PaymentVerificationResult,
    TransitionResult,
)
from apps.documents.payment_helpers import (  # noqa: F401
    _AIRTEL_PREFIXES,
    _MTN_PREFIXES,
    _generate_receipt_number,
    _generate_reference,
    _normalize_phone_e164,
    _operator_for_msisdn,
    _parse_amount,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Feature flag default — flipped by Task 15.1 (payment-hardening)
# ---------------------------------------------------------------------------
def _forward_only_enabled() -> bool:
    """Return True when the forward-only transition matrix should be enforced."""
    return bool(getattr(settings, "PAYMENT_HARDENING_FORWARD_ONLY", False))


# ---------------------------------------------------------------------------
# Canonical type aliases / dataclasses / constants are imported above from
# the dedicated modules. The legacy in-file definitions that follow are
# preserved verbatim so the diff against the previous file is minimal and
# the PaymentService class has identical resolution. They shadow the
# imports but are equivalent.
# ---------------------------------------------------------------------------

CanonicalStatus = Literal[
    "pending",
    "deferred",
    "successful",
    "failed",
    "expired",
    "force_approved",
]

ProviderInitiationStatus = Literal[
    "not_started",
    "sent",
    "accepted",
    "rejected",
    "unknown",
]

TransitionSource = Literal[
    "initiate",
    "verify",
    "webhook",
    "admin_override",
    "reconciliation",
    "super_admin_correction",
]


# ---------------------------------------------------------------------------
# Result dataclasses
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class PaymentInitiationResult:
    """Returned by ``initiate_payment``."""

    payment_id: UUID | None
    reference: str
    amount: Decimal
    currency: str


@dataclass(frozen=True)
class PaymentVerificationResult:
    """Returned by ``verify_payment``."""

    status: str
    amount: Decimal | None
    currency: str | None
    lenco_reference: str | None
    payment_method: str | None
    error: str | None


@dataclass(frozen=True)
class PaymentSnapshot:
    """Immutable snapshot of fee/resolution state captured at initiation.

    Persisted to ``Payment.metadata["snapshot"]`` and used by the integrity
    gate in ``_transition()`` for successful-payment verification.

    Requirements: R6.2, R6.3.
    """

    expected_amount: Decimal
    currency: str
    residency_category: str
    program_code: str
    intake_id: Optional[str]
    waiver_applied: bool
    original_amount: Decimal
    fee_source: str


@dataclass(frozen=True)
class TransitionResult:
    """Result of ``PaymentService._transition()``.

    ``risk_flag`` is set to a short string (e.g. ``"amount_mismatch"``,
    ``"currency_mismatch"``, ``"missing_provider_reference"``,
    ``"invalid_amount"``) when an integrity-gate check blocked the
    transition; it is ``None`` otherwise. When blocked, ``status`` reflects
    the unchanged current payment status.
    """

    payment_id: UUID
    status: CanonicalStatus
    risk_flag: Optional[str]


# ---------------------------------------------------------------------------
# Allowed forward-only transitions
# ---------------------------------------------------------------------------

# LEGACY: used by ``_update_payment_status`` prior to payment-hardening.
# Kept as-is so the pre-hardening code paths continue to work when
# ``PAYMENT_HARDENING_FORWARD_ONLY`` is disabled.
_ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    'pending': {'successful', 'failed', 'expired'},
    'deferred': {'pending', 'successful', 'failed', 'expired'},
}


# ---------------------------------------------------------------------------
# Forward-only state machine (payment-hardening Task 11.2)
# ---------------------------------------------------------------------------
#
# Mirrors the "State Machine (Formal)" table in
# ``.kiro/specs/payment-hardening/design.md``. Keys are
# ``(from_status, target_status)`` and values are the set of sources allowed
# to perform that transition. ``from_status=""`` represents creation (no
# prior row).
#
# ``super_admin_correction`` is permitted for any ``from`` → any ``to`` pair
# when the caller supplies a reason ≥ 10 chars (enforced at the service
# layer, not here). Listing every pair here would be noisy, so the
# ``_transition`` code allows ``source == "super_admin_correction"`` when
# the tuple is not in ``ALLOWED_TRANSITIONS`` (terminal → anything).
ALLOWED_TRANSITIONS: dict[tuple[str, str], set[str]] = {
    # (none) → pending / deferred / force_approved
    ("", "pending"): {"initiate"},
    ("", "deferred"): {"initiate"},
    ("", "force_approved"): {"admin_override", "super_admin_correction"},

    # pending → *
    ("pending", "successful"): {"verify", "webhook", "reconciliation", "super_admin_correction"},
    ("pending", "failed"): {"verify", "webhook", "super_admin_correction"},
    ("pending", "expired"): {"reconciliation", "super_admin_correction"},

    # deferred → *
    ("deferred", "pending"): {"initiate", "super_admin_correction"},
    ("deferred", "successful"): {"verify", "webhook", "reconciliation", "super_admin_correction"},
    ("deferred", "failed"): {"verify", "webhook", "super_admin_correction"},
    ("deferred", "expired"): {"reconciliation", "super_admin_correction"},

    # Admin override onto a live row — supports ``force_approve`` when a
    # pending/deferred Payment already exists. The design's visual state
    # table focuses on non-admin paths; this row encodes the documented
    # admin-override behaviour in the formal matrix so ``_transition``
    # accepts it without falling through to the ``super_admin_correction``
    # escape hatch.
    ("pending", "force_approved"): {"admin_override", "super_admin_correction"},
    ("deferred", "force_approved"): {"admin_override", "super_admin_correction"},
}


# ADR-1: ``applications.payment_status`` is a derived summary of the
# canonical Payment state. The mapping below is the single source of truth
# for the derived value and MUST be kept in sync with the ADR.
PAYMENT_TO_APP_MAP: dict[str, str] = {
    "successful": "verified",
    "force_approved": "verified",
    "failed": "failed",
    "expired": "not_paid",
    "deferred": "deferred",
    "pending": "pending_review",
}


# Audit action prefixes that should be retained for the longer security
# retention window (365 days). Everything else defaults to "standard".
_SECURITY_RETENTION_ACTION_PREFIXES: tuple[str, ...] = (
    "payment.force_approved",
    "payment.super_admin_corrected",
    "payment.dev_bypass_used",
    "payment.rate_limited",
)

# Maximum payment attempts per application (Req 8.4)
MAX_PAYMENT_ATTEMPTS = 5

# Expired payments older than this are excluded from attempt count (Req 8.5)
EXPIRED_EXCLUSION_DAYS = 7

# Lenco API status → internal status mapping
_LENCO_STATUS_MAP: dict[str, str] = {
    'successful': 'successful',
    'paid': 'successful',
    'failed': 'failed',
    'pending': 'pending',
    'pay-offline': 'pending',
    'otp-required': 'pending',
}

# Lenco API timeout in seconds
_LENCO_TIMEOUT = 15

PROVIDER_STATUS_NOT_STARTED = "not_started"
PROVIDER_STATUS_SENT = "sent"
PROVIDER_STATUS_ACCEPTED = "accepted"
PROVIDER_STATUS_REJECTED = "rejected"
PROVIDER_STATUS_UNKNOWN = "unknown"


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------


class PaymentService:
    """Manages the full payment lifecycle: initiation, verification, webhooks."""

    def __init__(self) -> None:
        self._fee_resolver = FeeResolver()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def initiate_payment(
        self, application_id: UUID, user_id: UUID
    ) -> PaymentInitiationResult:
        """Create a *pending* Payment record with the resolved fee.

        If a pending payment already exists for the same application, the
        existing record is returned instead of creating a duplicate.  This
        prevents double-payment initiation from rapid clicks or retries.

        Enforces a maximum of MAX_PAYMENT_ATTEMPTS per application (Req 8.4).
        Raises ``Application.DoesNotExist`` when the application is not found.
        Raises ``ValueError`` with code MAX_PAYMENT_ATTEMPTS_EXCEEDED when limit reached.
        """
        from django.db import transaction

        from apps.applications.identifier_resolver import IdentifierResolver
        from apps.applications.models import Application

        # Double-payment prevention: atomic + select_for_update to close TOCTOU race.
        with transaction.atomic():
            existing = (
                Payment.objects.select_for_update()
                .filter(application_id=application_id, status='pending')
                .first()
            )
            if existing:
                logger.info(
                    "Returning existing pending payment %s for application %s",
                    existing.id,
                    application_id,
                )
                return PaymentInitiationResult(
                    payment_id=existing.id,
                    reference=existing.transaction_reference,
                    amount=existing.amount,
                    currency=existing.currency,
                )

            # Retry limit enforcement (Req 8.4, 8.5)
            expired_cutoff = timezone.now() - timedelta(days=EXPIRED_EXCLUSION_DAYS)
            attempt_count = Payment.objects.filter(
                application_id=application_id,
            ).exclude(
                status='expired', created_at__lt=expired_cutoff,
            ).count()

            if attempt_count >= MAX_PAYMENT_ATTEMPTS:
                remaining = 0
                logger.warning(
                    "Payment attempt limit reached for application %s (%d attempts)",
                    application_id, attempt_count,
                )
                raise ValueError(
                    f"MAX_PAYMENT_ATTEMPTS_EXCEEDED|{remaining}"
                )

            application = Application.objects.get(id=application_id)

            if application.payment_status in ('successful', 'verified', 'force_approved'):
                return PaymentInitiationResult(
                    payment_id=None,
                    reference='',
                    amount=Decimal('0'),
                    currency='',
                )

            resolved_program = IdentifierResolver.resolve_program(application.program)
            if resolved_program.source == "not_found":
                logger.error(
                    "Payment initiation failed: program '%s' not found for application %s",
                    application.program, application_id,
                )
                raise ValueError(
                    f"Cannot resolve program '{application.program}'. "
                    f"Please verify the program exists and is active."
                )

            resolved = self._fee_resolver.resolve_fee(
                program_code=resolved_program.code,
                nationality=application.nationality,
                country=getattr(application, 'country', None),
            )

            # Apply partial fee waiver if active (Req 12.4, 12.5)
            effective_amount = resolved.amount
            try:
                from apps.documents.fee_waiver_service import FeeWaiverService
                effective_amount = FeeWaiverService.get_effective_fee(
                    str(application_id), resolved.amount,
                )
            except Exception:
                logger.warning(
                    "Fee waiver check failed for application %s, using full fee",
                    application_id,
                    exc_info=True,
                )

            reference = _generate_reference(application.application_number)

            payment = Payment.objects.create(
                application_id=application_id,
                user_id=user_id,
                amount=effective_amount,
                currency=resolved.currency,
                status='pending',
                transaction_reference=reference,
                payment_method=None,
                metadata={
                    'residency_category': resolved.residency_category,
                    'fee_source': resolved.source,
                    'original_amount': str(resolved.amount),
                    'waiver_applied': str(effective_amount) != str(resolved.amount),
                },
                created_at=timezone.now(),
                updated_at=timezone.now(),
            )

            logger.info(
                "Payment initiated: payment=%s reference=%s amount=%s %s",
                payment.id,
                reference,
                effective_amount,
                resolved.currency,
            )

            return PaymentInitiationResult(
                payment_id=payment.id,
                reference=reference,
                amount=effective_amount,
                currency=resolved.currency,
            )

    def review_application_payment(
        self,
        *,
        application_id: UUID,
        payment_status: str,
        reviewed_by_id: str,
        notes: str = "",
    ) -> "Application":
        """Apply an admin payment review against the canonical payment record.

        Admin review may override the latest payment record, but it must not
        update only ``Application.payment_status`` when a payment record exists.
        This keeps application summary state aligned with the payment ledger.

        If no payment record exists and the admin is force-approving (verified),
        a synthetic payment record is created to maintain ledger consistency.
        """
        from django.db import transaction

        from apps.applications.models import Application

        payment_status_map = {
            'pending_review': 'pending',
            'verified': 'successful',
            'rejected': 'failed',
            'deferred': 'deferred',
        }
        target_payment_status = payment_status_map.get(payment_status)

        with transaction.atomic():
            application = Application.objects.select_for_update().get(id=application_id)
            latest_payment = (
                Payment.objects.select_for_update()
                .filter(application_id=application_id)
                .order_by('-created_at')
                .first()
            )

            # If no payment record exists and admin is verifying, create a
            # synthetic admin-override record instead of rejecting.
            if target_payment_status and latest_payment is None:
                if payment_status in ('verified', 'deferred'):
                    latest_payment = Payment.objects.create(
                        application_id=application_id,
                        status=target_payment_status,
                        amount=0,
                        currency='ZMW',
                        payment_method='admin_override',
                        notes=notes or f'Admin set payment to {payment_status} (no prior record)',
                        verified_by_id=reviewed_by_id if payment_status == 'verified' else None,
                        verified_at=timezone.now() if payment_status == 'verified' else None,
                        metadata={
                            'admin_review': {
                                'status': payment_status,
                                'reviewed_by': reviewed_by_id,
                                'reviewed_at': timezone.now().isoformat(),
                                'notes': notes,
                                'synthetic': True,
                            }
                        },
                    )
                    logger.warning(
                        "Admin force-approved payment without record: app=%s admin=%s",
                        application_id, reviewed_by_id,
                    )
                else:
                    raise ValueError("PAYMENT_RECORD_REQUIRED")

            now = timezone.now()

            if latest_payment is not None and target_payment_status:
                # Block all admin demotions from terminal paid states. A
                # provider-confirmed payment must not be turned into failed,
                # pending, or deferred through the review UI.
                if latest_payment.status in ('successful', 'force_approved') and target_payment_status != latest_payment.status:
                    raise ValueError("CANNOT_REVERSE_SUCCESSFUL_PAYMENT")

                metadata = latest_payment.metadata or {}
                metadata['admin_review'] = {
                    'status': payment_status,
                    'reviewed_by': reviewed_by_id,
                    'reviewed_at': now.isoformat(),
                    'notes': notes,
                }
                latest_payment.status = target_payment_status
                latest_payment.metadata = metadata
                latest_payment.notes = notes or latest_payment.notes
                latest_payment.verified_by_id = (
                    reviewed_by_id if payment_status == 'verified' else latest_payment.verified_by_id
                )
                latest_payment.verified_at = now if payment_status == 'verified' else latest_payment.verified_at
                latest_payment.updated_at = now
                latest_payment.save(update_fields=[
                    'status',
                    'metadata',
                    'notes',
                    'verified_by',
                    'verified_at',
                    'updated_at',
                ])

            application.payment_status = payment_status
            if notes:
                application.admin_feedback = notes
                application.admin_feedback_date = now
                application.admin_feedback_by_id = reviewed_by_id
            application.updated_at = now
            application.save(update_fields=[
                'payment_status',
                'admin_feedback',
                'admin_feedback_date',
                'admin_feedback_by',
                'updated_at',
            ])

            try:
                from apps.common.communication_service import CommunicationService
                template = 'payment_verified' if target_payment_status == 'successful' else 'payment_rejected'
                CommunicationService.send(template, application)
            except Exception:
                logger.exception(
                    "Failed to send payment review notification for application %s",
                    application_id,
                )

            return application

    def defer_payment(
        self, application_id: UUID, user_id: UUID
    ) -> PaymentInitiationResult:
        """Create a *deferred* Payment record — student can pay later."""
        from django.db import transaction

        from apps.applications.identifier_resolver import IdentifierResolver
        from apps.applications.models import Application

        with transaction.atomic():
            existing = (
                Payment.objects.select_for_update()
                .filter(application_id=application_id, status='deferred')
                .first()
            )
            if existing:
                return PaymentInitiationResult(
                    payment_id=existing.id,
                    reference=existing.transaction_reference,
                    amount=existing.amount,
                    currency=existing.currency,
                )

            # Transition existing pending payment to deferred instead of creating new
            existing_pending = (
                Payment.objects.select_for_update()
                .filter(application_id=application_id, status='pending')
                .first()
            )
            if existing_pending:
                existing_pending.status = 'deferred'
                existing_pending.updated_at = timezone.now()
                meta = existing_pending.metadata or {}
                meta['deferred'] = True
                existing_pending.metadata = meta
                existing_pending.save(update_fields=['status', 'updated_at', 'metadata'])

                Application.objects.filter(id=application_id).update(
                    payment_status='deferred', updated_at=timezone.now(),
                )

                return PaymentInitiationResult(
                    payment_id=existing_pending.id,
                    reference=existing_pending.transaction_reference,
                    amount=existing_pending.amount,
                    currency=existing_pending.currency,
                )

            application = Application.objects.get(id=application_id)

            if application.payment_status in ('successful', 'verified', 'force_approved'):
                return PaymentInitiationResult(
                    payment_id=None, reference='', amount=Decimal('0'), currency='',
                )

            resolved_program = IdentifierResolver.resolve_program(application.program)
            if resolved_program.source == "not_found":
                raise ValueError(f"Cannot resolve program '{application.program}'.")

            resolved = self._fee_resolver.resolve_fee(
                program_code=resolved_program.code,
                nationality=application.nationality,
                country=getattr(application, 'country', None),
            )

            effective_amount = resolved.amount
            try:
                from apps.documents.fee_waiver_service import FeeWaiverService
                effective_amount = FeeWaiverService.get_effective_fee(
                    str(application_id), resolved.amount,
                )
            except Exception:
                logger.warning(
                    "Fee waiver check failed for deferred payment %s, using full fee",
                    application_id,
                    exc_info=True,
                )

            reference = _generate_reference(application.application_number)

            payment = Payment.objects.create(
                application_id=application_id,
                user_id=user_id,
                amount=effective_amount,
                currency=resolved.currency,
                status='deferred',
                transaction_reference=reference,
                metadata={
                    'residency_category': resolved.residency_category,
                    'fee_source': resolved.source,
                    'deferred': True,
                },
                created_at=timezone.now(),
                updated_at=timezone.now(),
            )

            # Sync application payment_status
            Application.objects.filter(id=application_id).update(
                payment_status='deferred', updated_at=timezone.now(),
            )

            return PaymentInitiationResult(
                payment_id=payment.id,
                reference=reference,
                amount=effective_amount,
                currency=resolved.currency,
            )

    def verify_payment(self, payment_id: UUID) -> PaymentVerificationResult:
        """Call the Lenco API to verify payment status and update records.

        Raises ``Payment.DoesNotExist`` when the payment is not found.

        Threading note (AUDIT-5.2-001, AUDIT-5.6-002 — resolved):
        This method uses a synchronous ``requests.get()`` call.  Both call
        sites are safe from event-loop blocking:

        1. ``PaymentVerifyView.post()`` is a **sync** DRF view.  Uvicorn's
           ASGI adapter automatically runs sync views in a thread-pool
           worker, so the blocking HTTP call never touches the event loop.
        2. ``poll_pending_payments_task`` runs inside a **Celery worker**
           process, which is entirely synchronous — no event loop involved.

        No migration to ``httpx`` or ``asyncio.to_thread`` is required
        unless a call site is converted to an ``async def`` view in the
        future.
        """
        payment = Payment.objects.get(id=payment_id)

        if payment.status != 'pending':
            # Already resolved — return current state without calling Lenco.
            return PaymentVerificationResult(
                status=payment.status,
                amount=payment.amount,
                currency=payment.currency,
                lenco_reference=payment.lenco_reference,
                payment_method=payment.payment_method,
                error=None,
            )

        reference = payment.transaction_reference
        if not reference:
            return PaymentVerificationResult(
                status=payment.status,
                amount=payment.amount,
                currency=payment.currency,
                lenco_reference=None,
                payment_method=None,
                error='Payment has no transaction reference.',
            )

        api_secret = settings.LENCO_API_SECRET_KEY
        base_url = settings.LENCO_API_BASE_URL

        if not api_secret:
            logger.warning("LENCO_API_SECRET_KEY not configured — cannot verify payment %s", payment_id)
            return PaymentVerificationResult(
                status=payment.status,
                amount=payment.amount,
                currency=payment.currency,
                lenco_reference=None,
                payment_method=None,
                error='Payment processing is unavailable.',
            )

        url = f"{base_url.rstrip('/')}/collections/status/{reference}"

        try:
            resp = http_requests.get(
                url,
                headers={'Authorization': f'Bearer {api_secret}', 'User-Agent': 'MIHAS/2.0', 'Accept': 'application/json'},
                timeout=_LENCO_TIMEOUT,
            )
            resp.raise_for_status()
        except http_requests.RequestException:
            logger.exception("Lenco API request failed for payment %s", payment_id)
            return PaymentVerificationResult(
                status=payment.status,
                amount=payment.amount,
                currency=payment.currency,
                lenco_reference=None,
                payment_method=None,
                error='Unable to reach payment provider. Please try again later.',
            )

        try:
            data = resp.json().get('data', {})
        except (ValueError, AttributeError):
            logger.error("Lenco API returned non-JSON response for payment %s", payment_id)
            return PaymentVerificationResult(
                status=payment.status,
                amount=payment.amount,
                currency=payment.currency,
                lenco_reference=None,
                payment_method=None,
                error='Unexpected response from payment provider.',
            )

        lenco_status = data.get('status', '').lower()
        new_status = _LENCO_STATUS_MAP.get(lenco_status)

        if new_status == 'successful':
            # Amount mismatch detection (Req 10.4)
            lenco_amount = _parse_amount(data.get('amount'))
            if lenco_amount is not None and lenco_amount != payment.amount:
                logger.warning(
                    "Amount mismatch for payment %s: expected=%s got=%s",
                    payment_id,
                    payment.amount,
                    lenco_amount,
                )
                return PaymentVerificationResult(
                    status=payment.status,
                    amount=payment.amount,
                    currency=payment.currency,
                    lenco_reference=data.get('lencoReference'),
                    payment_method=data.get('type'),
                    error='Payment amount does not match expected fee.',
                )

        if new_status:
            self._update_payment_status(payment, new_status, data)
            payment.refresh_from_db()

        return PaymentVerificationResult(
            status=payment.status,
            amount=payment.amount,
            currency=payment.currency,
            lenco_reference=payment.lenco_reference,
            payment_method=payment.payment_method,
            error=None,
        )

    def process_webhook_event(
        self, event_type: str, reference: str, payload: dict
    ) -> None:
        """Update a Payment record from webhook data.  Idempotent.

        If the referenced payment does not exist or is already in a terminal
        state, the call is a safe no-op.

        The payment lookup uses ``SELECT FOR UPDATE`` inside
        ``transaction.atomic()`` so that concurrent webhook events for the
        same payment are serialized at the row level.  This prevents two
        webhooks from both reading the payment before either applies a
        status transition.
        """
        from django.db import transaction

        try:
            with transaction.atomic():
                payment = (
                    Payment.objects
                    .select_for_update()
                    .get(transaction_reference=reference)
                )
        except Payment.DoesNotExist:
            logger.warning("Webhook references unknown payment: reference=%s", reference)
            return

        data = payload.get('data', {})

        if event_type == 'collection.successful':
            # Amount mismatch detection (Req 10.4)
            lenco_amount = _parse_amount(data.get('amount'))
            if lenco_amount is not None and lenco_amount != payment.amount:
                logger.warning(
                    "Webhook amount mismatch for payment %s: expected=%s got=%s",
                    payment.id,
                    payment.amount,
                    lenco_amount,
                )
                return

            # Currency validation
            lenco_currency = str(data.get('currency', '')).upper()
            if lenco_currency and hasattr(payment, 'currency') and payment.currency and lenco_currency != payment.currency.upper():
                logger.warning('Currency mismatch: expected %s, got %s', payment.currency, lenco_currency)

            self._update_payment_status(payment, 'successful', data)

        elif event_type == 'collection.failed':
            self._update_payment_status(payment, 'failed', data)

        elif event_type == 'collection.settled':
            # Settlement events update metadata only — no status change.
            meta = payment.metadata or {}
            meta['settlement'] = data.get('settlement', data)
            payment.metadata = meta
            payment.updated_at = timezone.now()
            payment.save(update_fields=['metadata', 'updated_at'])
            logger.info("Settlement metadata updated for payment %s", payment.id)

        else:
            logger.info("Ignoring unrecognised webhook event_type=%s", event_type)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _update_payment_status(
        self, payment: Payment, new_status: str, lenco_data: dict
    ) -> None:
        """Apply a forward-only status transition and persist Lenco fields.

        Uses ``SELECT FOR UPDATE`` to re-read the payment row under a
        row-level lock inside an atomic transaction.  This prevents the
        webhook handler and the verification endpoint from concurrently
        transitioning the same payment.

        If the transition is not allowed (e.g. already ``successful``), the
        call is a no-op — this makes webhook processing idempotent.
        """
        from django.db import transaction

        with transaction.atomic():
            # Re-read the row under an exclusive lock so we check the
            # *latest* status, not the potentially-stale in-memory copy.
            locked = Payment.objects.select_for_update().get(id=payment.id)

            allowed = _ALLOWED_TRANSITIONS.get(locked.status, set())
            if new_status not in allowed:
                logger.info(
                    "Skipping transition %s → %s for payment %s (not allowed)",
                    locked.status,
                    new_status,
                    locked.id,
                )
                return

            # Amount mismatch detection (Req 17.1, 17.2, 17.3)
            # When transitioning to 'successful', verify the Lenco-reported
            # amount matches the expected amount stored on the payment record.
            # Uses Decimal comparison to avoid floating-point precision errors.
            if new_status == 'successful':
                lenco_amount = _parse_amount(lenco_data.get('amount'))
                if lenco_amount is not None and lenco_amount != locked.amount:
                    logger.warning(
                        "Amount mismatch in _update_payment_status for payment %s: "
                        "expected=%s got=%s — skipping transition to successful",
                        locked.id,
                        locked.amount,
                        lenco_amount,
                    )
                    self._record_payment_risk(
                        locked,
                        risk_type="amount_mismatch",
                        details={
                            "expected": str(locked.amount),
                            "received": str(lenco_amount),
                            "source": "lenco_status_update",
                        },
                    )
                    return

                lenco_currency = str(lenco_data.get('currency', '')).upper()
                if lenco_currency and locked.currency and lenco_currency != locked.currency.upper():
                    logger.warning(
                        "Currency mismatch in _update_payment_status for payment %s: "
                        "expected=%s got=%s — skipping transition to successful",
                        locked.id,
                        locked.currency,
                        lenco_currency,
                    )
                    self._record_payment_risk(
                        locked,
                        risk_type="currency_mismatch",
                        details={
                            "expected": locked.currency,
                            "received": lenco_currency,
                            "source": "lenco_status_update",
                        },
                    )
                    return

            locked.status = new_status
            locked.lenco_reference = lenco_data.get('lencoReference') or locked.lenco_reference
            locked.payment_method = lenco_data.get('type') or locked.payment_method

            lenco_fee = _parse_amount(lenco_data.get('fee'))
            if lenco_fee is not None:
                locked.fee = lenco_fee

            locked.bearer = lenco_data.get('bearer') or locked.bearer

            # Store failure reason from Lenco
            reason = lenco_data.get('reasonForFailure')
            if reason and new_status == 'failed':
                locked.notes = str(reason)[:500]

            # Merge any extra Lenco data into metadata.
            meta = locked.metadata or {}
            meta['lenco_response'] = lenco_data
            locked.metadata = meta
            locked.updated_at = timezone.now()

            locked.save(update_fields=[
                'status',
                'lenco_reference',
                'payment_method',
                'fee',
                'bearer',
                'notes',
                'metadata',
                'updated_at',
            ])

            logger.info(
                "Payment %s transitioned to %s (lenco_ref=%s)",
                locked.id,
                new_status,
                locked.lenco_reference,
            )

            # Emit business metric for successful payments (Req 3.1)
            if new_status == "successful":
                logger.info(
                    "business_metric",
                    extra={
                        "type": "business_metric",
                        "metric": "payment_completed",
                        "amount": str(locked.amount),
                        "currency": locked.currency or "ZMW",
                    },
                )

            # Sync application payment_status inside the same atomic block
            # so both updates commit or roll back together (Req 8.7).
            _PAYMENT_TO_APP_STATUS = {
                'successful': 'verified',
                'paid': 'verified',
                'failed': 'failed',
            }
            app_status = _PAYMENT_TO_APP_STATUS.get(new_status)
            if app_status and payment.application_id:
                self._update_application_payment_status(
                    payment.application_id, app_status
                )

    def mark_provider_initiation(
        self,
        payment_id: UUID,
        *,
        status: str,
        provider_data: dict | None = None,
        operator: str | None = None,
        phone_hash: str | None = None,
        phone_last4: str | None = None,
        error: str | None = None,
    ) -> None:
        """Record provider-initiation state without changing payment status.

        This deliberately keeps uncertain mobile-money calls as ``pending`` so
        reconciliation through webhooks and polling can settle the payment.
        """
        from django.db import transaction

        with transaction.atomic():
            payment = Payment.objects.select_for_update().get(id=payment_id)
            meta = payment.metadata or {}
            initiation = dict(meta.get("provider_initiation") or {})
            initiation.update(
                {
                    "status": status,
                    "updated_at": timezone.now().isoformat(),
                }
            )
            if provider_data is not None:
                initiation["provider_data"] = provider_data
            if operator:
                initiation["operator"] = operator
            if phone_hash:
                initiation["phone_hash"] = phone_hash
            if phone_last4:
                initiation["phone_last4"] = phone_last4
            if error:
                initiation["error"] = str(error)[:500]
            meta["provider_initiation"] = initiation
            payment.metadata = meta
            if provider_data:
                payment.lenco_reference = (
                    provider_data.get("lencoReference")
                    or provider_data.get("lenco_reference")
                    or payment.lenco_reference
                )
                payment.payment_method = provider_data.get("type") or payment.payment_method
            payment.updated_at = timezone.now()
            payment.save(
                update_fields=[
                    "metadata",
                    "lenco_reference",
                    "payment_method",
                    "updated_at",
                ]
            )

    # ------------------------------------------------------------------
    # payment-hardening — Task 11.5–11.10 (new public surface)
    # ------------------------------------------------------------------
    #
    # The six methods below (``initiate``, ``initiate_mobile_money``,
    # ``verify``, ``apply_webhook_event``, ``force_approve``,
    # ``expire_stale``) are the hardened public surface described in
    # ``.kiro/specs/payment-hardening/design.md`` → "Interface Signatures".
    # They live alongside the legacy ``initiate_payment`` / ``verify_payment``
    # / ``process_webhook_event`` so existing callers continue to work.
    #
    # When ``settings.PAYMENT_HARDENING_FORWARD_ONLY`` is ``False`` each
    # new method delegates back to its legacy equivalent for full
    # backward compatibility. When ``True`` it takes the hardened path
    # that routes every mutation through ``_transition()``.

    def initiate(
        self, application_id: UUID, user_id: UUID
    ) -> PaymentInitiationResult:
        """Hardened public API for starting a payment.

        Resolves the Application from ``user_id`` + ``application_id``,
        re-checks ownership inside the row lock, enforces the retry limit,
        and creates a ``pending`` Payment with an immutable
        ``metadata.snapshot``. Client-supplied ``amount`` / ``currency`` /
        ``reference`` / ``status`` / ``operator`` are ignored by contract
        (R4.6) — the method takes only ``application_id`` and ``user_id``.

        When ``PAYMENT_HARDENING_FORWARD_ONLY`` is disabled we delegate to
        the legacy ``initiate_payment`` path so behaviour is unchanged.

        Requirements: R3.1–R3.6, R4.1–R4.6, R6.1–R6.3.
        """
        if not _forward_only_enabled():
            # LEGACY: preserve existing behaviour byte-for-byte.
            return self.initiate_payment(application_id, user_id)

        from django.db import transaction

        from apps.applications.identifier_resolver import IdentifierResolver
        from apps.applications.models import Application

        with transaction.atomic():
            # ---- 1. Serialize concurrent initiations on the same app ----
            existing = (
                Payment.objects.select_for_update()
                .filter(
                    application_id=application_id,
                    status__in=("pending", "deferred"),
                )
                .order_by("-created_at")
                .first()
            )
            if existing:
                logger.info(
                    "initiate: reusing active payment %s for application %s",
                    existing.id,
                    application_id,
                )
                return PaymentInitiationResult(
                    payment_id=existing.id,
                    reference=existing.transaction_reference,
                    amount=existing.amount,
                    currency=existing.currency,
                )

            # ---- 2. Retry limit enforcement (R3.5, R3.6) ----
            expired_cutoff = timezone.now() - timedelta(
                days=EXPIRED_EXCLUSION_DAYS
            )
            attempt_count = (
                Payment.objects.filter(application_id=application_id)
                .exclude(status="expired", created_at__lt=expired_cutoff)
                .count()
            )
            if attempt_count >= MAX_PAYMENT_ATTEMPTS:
                logger.warning(
                    "initiate: attempt limit reached for application %s",
                    application_id,
                )
                raise ValueError("MAX_PAYMENT_ATTEMPTS_EXCEEDED|0")

            # ---- 3. Re-check ownership under the lock (R4.1, R4.2) ----
            try:
                application = (
                    Application.objects.select_for_update()
                    .get(id=application_id)
                )
            except Application.DoesNotExist:
                raise
            if str(application.user_id) != str(user_id):
                # Defensive: the view layer enforces ownership too, but we
                # re-check inside the lock so the service is safe to call
                # from trusted contexts.
                raise ValueError("NOT_OWNER")

            if application.payment_status in (
                "successful", "verified", "force_approved",
            ):
                return PaymentInitiationResult(
                    payment_id=None,
                    reference="",
                    amount=Decimal("0"),
                    currency="",
                )

            # ---- 4. Resolve the fee + build the immutable snapshot ----
            resolved_program = IdentifierResolver.resolve_program(
                application.program
            )
            if resolved_program.source == "not_found":
                logger.error(
                    "initiate: program '%s' not found for application %s",
                    application.program,
                    application_id,
                )
                raise ValueError(
                    f"Cannot resolve program '{application.program}'. "
                    "Please verify the program exists and is active."
                )

            resolved = None
            snapshot_dict: dict = {}
            snapshot_builder = getattr(
                self._fee_resolver, "resolve_for_payment_snapshot", None
            )
            if callable(snapshot_builder):
                try:
                    resolved, snapshot_obj = snapshot_builder(application)
                    # ``snapshot_obj`` is a ``PaymentSnapshot`` dataclass.
                    snapshot_dict = {
                        "expected_amount": str(snapshot_obj.expected_amount),
                        "currency": snapshot_obj.currency,
                        "residency_category": snapshot_obj.residency_category,
                        "program_code": snapshot_obj.program_code,
                        "intake_id": snapshot_obj.intake_id,
                        "waiver_applied": snapshot_obj.waiver_applied,
                        "original_amount": str(snapshot_obj.original_amount),
                        "fee_source": snapshot_obj.fee_source,
                    }
                except Exception:
                    logger.warning(
                        "initiate: resolve_for_payment_snapshot failed for "
                        "application %s — falling back to resolve_fee",
                        application_id,
                        exc_info=True,
                    )
                    resolved = None

            if resolved is None:
                resolved = self._fee_resolver.resolve_fee(
                    program_code=resolved_program.code,
                    nationality=application.nationality,
                    country=getattr(application, "country", None),
                )

            effective_amount = resolved.amount
            try:
                from apps.documents.fee_waiver_service import FeeWaiverService

                effective_amount = FeeWaiverService.get_effective_fee(
                    str(application_id), resolved.amount,
                )
            except Exception:
                logger.warning(
                    "initiate: fee waiver check failed for application %s",
                    application_id,
                    exc_info=True,
                )

            if not snapshot_dict:
                snapshot_dict = {
                    "expected_amount": str(effective_amount),
                    "currency": resolved.currency,
                    "residency_category": resolved.residency_category,
                    "program_code": resolved_program.code,
                    "intake_id": str(
                        getattr(application, "intake_id", "") or ""
                    ) or None,
                    "waiver_applied": str(effective_amount)
                    != str(resolved.amount),
                    "original_amount": str(resolved.amount),
                    "fee_source": resolved.source,
                }

            reference = _generate_reference(application.application_number)

            # ---- 5. Create the Payment; handle the active-row race ----
            try:
                payment = Payment.objects.create(
                    application_id=application_id,
                    user_id=user_id,
                    amount=effective_amount,
                    currency=resolved.currency,
                    status="pending",
                    transaction_reference=reference,
                    payment_method=None,
                    metadata={
                        "residency_category": resolved.residency_category,
                        "fee_source": resolved.source,
                        "original_amount": str(resolved.amount),
                        "waiver_applied": str(effective_amount)
                        != str(resolved.amount),
                        "snapshot": snapshot_dict,
                    },
                    created_at=timezone.now(),
                    updated_at=timezone.now(),
                )
            except IntegrityError as exc:
                # Partial unique index ``uq_payments_one_active_per_application``
                # fired — a concurrent initiation won the race. Fall back
                # to the existing row and return the same envelope.
                if "uq_payments_one_active_per_application" in str(exc):
                    logger.info(
                        "initiate: race on active-payment index for "
                        "application %s; returning existing row",
                        application_id,
                    )
                    existing = (
                        Payment.objects.select_for_update()
                        .filter(
                            application_id=application_id,
                            status__in=("pending", "deferred"),
                        )
                        .order_by("-created_at")
                        .first()
                    )
                    if existing is not None:
                        return PaymentInitiationResult(
                            payment_id=existing.id,
                            reference=existing.transaction_reference,
                            amount=existing.amount,
                            currency=existing.currency,
                        )
                raise

            # ---- 6. Audit and return ----
            self._emit_audit(
                "payment.initiated",
                payment,
                user_id,
                {
                    "source": "initiate",
                    "reference": reference,
                    "amount": str(effective_amount),
                    "currency": resolved.currency,
                    "snapshot_source": snapshot_dict.get("fee_source"),
                },
            )

            logger.info(
                "initiate: payment %s created for application %s (amount=%s %s)",
                payment.id,
                application_id,
                effective_amount,
                resolved.currency,
            )

            return PaymentInitiationResult(
                payment_id=payment.id,
                reference=reference,
                amount=effective_amount,
                currency=resolved.currency,
            )

    def initiate_mobile_money(
        self,
        application_id: UUID,
        user_id: UUID,
        phone_raw: str,
    ) -> PaymentInitiationResult:
        """Wrap ``initiate`` with a Lenco mobile-money collection call.

        Normalises ``phone_raw`` to E.164, derives the operator from the
        MSISDN prefix, calls Lenco OUTSIDE any ``atomic()`` block so no DB
        lock is held during HTTP I/O, and routes the outcome through
        ``mark_provider_initiation``. Payment is left in ``pending`` on
        every provider outcome (R11.4) — ``failed`` is never set from a
        provider timeout or 5xx.

        Requirements: R11.1–R11.6.
        """
        import hashlib

        # Normalise + operator derivation happen up front so a bad number
        # fails before we create a Payment row.
        phone = _normalize_phone_e164(phone_raw)
        operator = _operator_for_msisdn(phone)  # raises ValueError on unknown prefix

        # 1. Ensure a pending Payment exists (this opens its own atomic()).
        result = self.initiate(application_id, user_id)
        if not result.payment_id:
            # Application already paid (or similar); propagate unchanged.
            return result

        # 2. Read Lenco credentials. Missing creds must degrade gracefully
        #    — the provider call is skipped and the payment stays pending.
        api_secret = getattr(settings, "LENCO_API_SECRET_KEY", "")
        base_url = getattr(settings, "LENCO_API_BASE_URL", "")

        phone_hash = hashlib.sha256(phone.encode("utf-8")).hexdigest()
        phone_last4 = phone[-4:]

        if not api_secret or not base_url:
            try:
                self.mark_provider_initiation(
                    result.payment_id,
                    status=PROVIDER_STATUS_NOT_STARTED,
                    operator=operator,
                    phone_hash=phone_hash,
                    phone_last4=phone_last4,
                    error="Payment provider credentials are not configured.",
                )
            except Exception:
                logger.exception(
                    "initiate_mobile_money: failed to mark provider not_started "
                    "for payment %s", result.payment_id,
                )
            return result

        # 3. Call Lenco OUTSIDE any atomic() so we don't hold a row lock
        #    across the HTTP round trip (Neon pool hygiene).
        url = f"{base_url.rstrip('/')}/collections/mobile-money"
        try:
            resp = http_requests.post(
                url,
                json={
                    "amount": str(result.amount),
                    "reference": result.reference,
                    "phone": phone,
                    "operator": operator,
                    "country": "zm",
                    "bearer": "customer",
                },
                headers={
                    "Authorization": f"Bearer {api_secret}",
                    "User-Agent": "MIHAS/2.0",
                    "Accept": "application/json",
                },
                timeout=_LENCO_TIMEOUT,
            )
        except http_requests.RequestException as exc:
            # Timeout / connection error / DNS failure → status unknown.
            # Payment MUST stay pending (R11.4); reconciliation will settle it.
            logger.warning(
                "initiate_mobile_money: Lenco HTTP error for payment %s: %s",
                result.payment_id, exc,
            )
            try:
                self.mark_provider_initiation(
                    result.payment_id,
                    status=PROVIDER_STATUS_UNKNOWN,
                    operator=operator,
                    phone_hash=phone_hash,
                    phone_last4=phone_last4,
                    error="Provider request failed before a response was received.",
                )
            except Exception:
                logger.exception(
                    "initiate_mobile_money: failed to mark provider unknown "
                    "for payment %s", result.payment_id,
                )
            return result

        try:
            lenco_data = resp.json() if resp.content else {}
        except ValueError:
            lenco_data = {}

        provider_subset = dict(lenco_data.get("data") or {})
        # Always record ``type`` so the integrity gate / UI can distinguish
        # mobile-money vs card responses consistently.
        provider_subset.setdefault("type", "mobile-money")

        if resp.ok:
            # 2xx → provider accepted the collection request.
            try:
                self.mark_provider_initiation(
                    result.payment_id,
                    status=PROVIDER_STATUS_ACCEPTED,
                    provider_data=provider_subset,
                    operator=operator,
                    phone_hash=phone_hash,
                    phone_last4=phone_last4,
                )
            except Exception:
                logger.exception(
                    "initiate_mobile_money: failed to mark provider accepted "
                    "for payment %s", result.payment_id,
                )
        elif 400 <= resp.status_code < 500:
            lenco_error = (
                lenco_data.get("message")
                or lenco_data.get("error")
                or resp.reason
                or "Provider rejected the request."
            )
            try:
                self.mark_provider_initiation(
                    result.payment_id,
                    status=PROVIDER_STATUS_REJECTED,
                    provider_data=provider_subset,
                    operator=operator,
                    phone_hash=phone_hash,
                    phone_last4=phone_last4,
                    error=str(lenco_error),
                )
            except Exception:
                logger.exception(
                    "initiate_mobile_money: failed to mark provider rejected "
                    "for payment %s", result.payment_id,
                )
            # NOTE: Payment deliberately stays pending even on rejection —
            # the UI surfaces this via ``next_action=retry_with_different_number``
            # and the legacy path that moved the row to ``failed`` on 4xx
            # is preserved in ``MobileMoneyInitiateView`` for back-compat.
        else:
            # 5xx → status unknown; reconciliation / webhook will settle.
            lenco_error = (
                lenco_data.get("message")
                or lenco_data.get("error")
                or resp.reason
                or "Provider service error."
            )
            logger.warning(
                "initiate_mobile_money: Lenco 5xx for payment %s: %s %s",
                result.payment_id, resp.status_code, lenco_error,
            )
            try:
                self.mark_provider_initiation(
                    result.payment_id,
                    status=PROVIDER_STATUS_UNKNOWN,
                    provider_data=provider_subset,
                    operator=operator,
                    phone_hash=phone_hash,
                    phone_last4=phone_last4,
                    error=f"Provider responded {resp.status_code}: {lenco_error}",
                )
            except Exception:
                logger.exception(
                    "initiate_mobile_money: failed to mark provider unknown "
                    "for payment %s", result.payment_id,
                )

        return result

    def verify(
        self, payment_id: UUID, actor_id: Optional[UUID] = None
    ) -> PaymentVerificationResult:
        """Hardened wrapper around ``verify_payment`` with stable-code semantics.

        - Terminal → return cached state without calling Lenco (R10.1).
        - Lenco unreachable on ``pending`` → leave ``pending``, surface
          ``PROVIDER_UNAVAILABLE`` (R10.2).
        - Lenco ``pay-offline`` / ``otp-required`` / ``pending`` → leave
          ``pending`` + ``PAYMENT_PENDING`` (R10.3).
        - Integrity-clean ``successful`` / ``paid`` → ``_transition``
          (R10.4) — the 4-check integrity gate decides.
        - Mismatches → risk flag + leave ``pending`` (R10.5).

        ``actor_id`` is accepted for audit emission even though the legacy
        ``verify_payment`` takes no actor.
        """
        if not _forward_only_enabled():
            # LEGACY: preserve existing behaviour byte-for-byte.
            return self.verify_payment(payment_id)

        payment = Payment.objects.get(id=payment_id)

        # ---- R10.1: terminal → return cached, do not call Lenco ----
        if payment.status != "pending":
            return PaymentVerificationResult(
                status=payment.status,
                amount=payment.amount,
                currency=payment.currency,
                lenco_reference=payment.lenco_reference,
                payment_method=payment.payment_method,
                error=None,
            )

        reference = payment.transaction_reference
        if not reference:
            return PaymentVerificationResult(
                status=payment.status,
                amount=payment.amount,
                currency=payment.currency,
                lenco_reference=None,
                payment_method=None,
                error="MISSING_PROVIDER_REFERENCE",
            )

        api_secret = getattr(settings, "LENCO_API_SECRET_KEY", "")
        base_url = getattr(settings, "LENCO_API_BASE_URL", "")
        if not api_secret or not base_url:
            logger.warning(
                "verify: Lenco credentials missing — payment %s remains pending",
                payment_id,
            )
            return PaymentVerificationResult(
                status=payment.status,
                amount=payment.amount,
                currency=payment.currency,
                lenco_reference=None,
                payment_method=None,
                error="PROVIDER_UNAVAILABLE",
            )

        url = f"{base_url.rstrip('/')}/collections/status/{reference}"
        try:
            resp = http_requests.get(
                url,
                headers={
                    "Authorization": f"Bearer {api_secret}",
                    "User-Agent": "MIHAS/2.0",
                    "Accept": "application/json",
                },
                timeout=_LENCO_TIMEOUT,
            )
            resp.raise_for_status()
        except http_requests.RequestException:
            # R10.2: Lenco unreachable → leave pending.
            logger.info(
                "verify: Lenco unreachable for payment %s — stays pending",
                payment_id,
                exc_info=True,
            )
            return PaymentVerificationResult(
                status=payment.status,
                amount=payment.amount,
                currency=payment.currency,
                lenco_reference=None,
                payment_method=None,
                error="PROVIDER_UNAVAILABLE",
            )

        try:
            data = resp.json().get("data", {}) or {}
        except (ValueError, AttributeError):
            logger.error(
                "verify: Lenco returned non-JSON for payment %s", payment_id
            )
            return PaymentVerificationResult(
                status=payment.status,
                amount=payment.amount,
                currency=payment.currency,
                lenco_reference=None,
                payment_method=None,
                error="PROVIDER_UNAVAILABLE",
            )

        lenco_status = str(data.get("status", "")).lower()
        new_status = _LENCO_STATUS_MAP.get(lenco_status)

        if new_status == "successful":
            # Route through _transition — its 4-check integrity gate is the
            # single source of truth for amount/currency/reference checks.
            tr = self._transition(
                payment,
                "successful",
                source="verify",
                actor=actor_id,
                provider_data=data,
            )
            payment.refresh_from_db()
            if tr.risk_flag is not None:
                # Integrity gate blocked the transition — surface the
                # matching stable code so the UI can branch deterministically.
                error_code = {
                    "amount_mismatch": "AMOUNT_MISMATCH",
                    "currency_mismatch": "CURRENCY_MISMATCH",
                    "missing_provider_reference": "MISSING_PROVIDER_REFERENCE",
                    "invalid_amount": "AMOUNT_MISMATCH",
                }.get(tr.risk_flag, "PAYMENT_PENDING")
                return PaymentVerificationResult(
                    status=payment.status,
                    amount=payment.amount,
                    currency=payment.currency,
                    lenco_reference=payment.lenco_reference,
                    payment_method=payment.payment_method,
                    error=error_code,
                )
            return PaymentVerificationResult(
                status=payment.status,
                amount=payment.amount,
                currency=payment.currency,
                lenco_reference=payment.lenco_reference,
                payment_method=payment.payment_method,
                error=None,
            )

        if new_status == "failed":
            self._transition(
                payment,
                "failed",
                source="verify",
                actor=actor_id,
                provider_data=data,
            )
            payment.refresh_from_db()
            return PaymentVerificationResult(
                status=payment.status,
                amount=payment.amount,
                currency=payment.currency,
                lenco_reference=payment.lenco_reference,
                payment_method=payment.payment_method,
                error=None,
            )

        # R10.3: pay-offline / otp-required / pending → leave pending.
        return PaymentVerificationResult(
            status=payment.status,
            amount=payment.amount,
            currency=payment.currency,
            lenco_reference=payment.lenco_reference,
            payment_method=payment.payment_method,
            error="PAYMENT_PENDING",
        )

    def apply_webhook_event(
        self, event_type: str, reference: str, payload: dict
    ) -> TransitionResult:
        """Route a Lenco webhook outcome through ``_transition``.

        - ``collection.successful`` → ``_transition(pending → successful)``
          (integrity gate enforced). Late events against a ``successful``
          row are absorbed as duplicates by ``_transition``.
        - ``collection.failed`` → ``_transition(pending → failed)``. When
          the row is already ``successful`` ``_transition`` blocks the
          move and emits ``payment.late_failed_webhook_ignored`` (R9.1).
        - ``collection.settled`` → merge ``metadata.settlement`` only
          (R9.2); no ``_transition`` call.
        - Unknown ``event_type`` → log and skip (R8.7).

        When ``PAYMENT_HARDENING_FORWARD_ONLY`` is disabled we delegate to
        the legacy ``process_webhook_event`` and return a best-effort
        ``TransitionResult`` summarising the outcome.
        """
        from django.db import transaction

        if not _forward_only_enabled():
            # LEGACY: preserve existing behaviour. Return a summary result
            # so callers can still inspect ``payment_id`` / ``status``.
            self.process_webhook_event(event_type, reference, payload)
            try:
                payment = Payment.objects.get(transaction_reference=reference)
                return TransitionResult(
                    payment_id=payment.id,
                    status=payment.status,  # type: ignore[arg-type]
                    risk_flag=None,
                )
            except Payment.DoesNotExist:
                return TransitionResult(
                    payment_id=None,  # type: ignore[arg-type]
                    status="pending",
                    risk_flag=None,
                )

        data = (payload or {}).get("data", {}) or {}

        with transaction.atomic():
            try:
                payment = (
                    Payment.objects.select_for_update()
                    .get(transaction_reference=reference)
                )
            except Payment.DoesNotExist:
                logger.warning(
                    "apply_webhook_event: unknown payment reference=%s "
                    "event_type=%s — no-op",
                    reference, event_type,
                )
                return TransitionResult(
                    payment_id=None,  # type: ignore[arg-type]
                    status="pending",
                    risk_flag=None,
                )

            if event_type == "collection.settled":
                # R9.2: settlement events update metadata only.
                meta = payment.metadata or {}
                meta["settlement"] = data.get("settlement", data)
                payment.metadata = meta
                payment.updated_at = timezone.now()
                payment.save(update_fields=["metadata", "updated_at"])
                logger.info(
                    "apply_webhook_event: settlement metadata updated for payment %s",
                    payment.id,
                )
                return TransitionResult(
                    payment_id=payment.id,
                    status=payment.status,  # type: ignore[arg-type]
                    risk_flag=None,
                )

            if event_type == "collection.successful":
                return self._transition(
                    payment,
                    "successful",
                    source="webhook",
                    actor=None,
                    provider_data=data,
                )

            if event_type == "collection.failed":
                # Capture reason in notes (truncated 500 chars) so it can be
                # surfaced to admins. Late failed webhooks arriving after
                # ``successful`` are blocked by ``_transition`` and emit the
                # ``payment.late_failed_webhook_ignored`` audit (R9.1).
                if payment.status == "successful":
                    self._emit_audit(
                        "payment.late_failed_webhook_ignored",
                        payment,
                        None,
                        {
                            "event_type": event_type,
                            "reference": reference,
                            "reason": str(
                                data.get("reasonForFailure") or ""
                            )[:500],
                        },
                    )
                    return TransitionResult(
                        payment_id=payment.id,
                        status=payment.status,  # type: ignore[arg-type]
                        risk_flag=None,
                    )

                reason = data.get("reasonForFailure")
                if reason:
                    payment.notes = str(reason)[:500]
                    payment.updated_at = timezone.now()
                    payment.save(update_fields=["notes", "updated_at"])
                return self._transition(
                    payment,
                    "failed",
                    source="webhook",
                    actor=None,
                    provider_data=data,
                )

            # R8.7: unknown event_type → log and skip.
            logger.info(
                "apply_webhook_event: ignoring unknown event_type=%s for payment %s",
                event_type, payment.id,
            )
            return TransitionResult(
                payment_id=payment.id,
                status=payment.status,  # type: ignore[arg-type]
                risk_flag=None,
            )

    def force_approve(
        self,
        application_id: UUID,
        actor_id: UUID,
        actor_role: str,
        reason: str,
    ) -> TransitionResult:
        """Admin-driven ``force_approved`` transition.

        Rejects if a ``successful`` Payment already exists (R2.1, R2.2).
        Requires ``reason >= 10 chars`` (R2.5). Creates a Payment row when
        none exists, then calls ``_transition(... 'force_approved' ...,
        source='admin_override')``. Writes override metadata (R2.4) and
        emits ``payment.force_approved`` audit (auto-promoted to the
        security retention window by prefix — R2.6). Generates the
        receipt idempotently (R13.1, R13.5, R13.6) inside ``_transition``.
        """
        from django.db import transaction

        from apps.applications.models import Application

        if not reason or len(reason.strip()) < 10:
            raise ValueError("OVERRIDE_REASON_REQUIRED")

        with transaction.atomic():
            try:
                application = (
                    Application.objects.select_for_update()
                    .get(id=application_id)
                )
            except Application.DoesNotExist:
                raise

            # R2.1 / R2.2: never reverse a successful payment via admin override.
            already_successful = (
                Payment.objects.filter(
                    application_id=application_id, status="successful",
                ).exists()
            )
            if already_successful:
                raise ValueError("CANNOT_REVERSE_SUCCESSFUL_PAYMENT")

            payment = (
                Payment.objects.select_for_update()
                .filter(application_id=application_id)
                .order_by("-created_at")
                .first()
            )

            now = timezone.now()
            if payment is None:
                # Create a placeholder pending row so _transition has
                # something to update. We set minimal metadata; the
                # snapshot is not required for admin overrides (no
                # integrity gate runs for ``force_approved``).
                payment = Payment.objects.create(
                    application_id=application_id,
                    user_id=application.user_id,
                    amount=Decimal("0"),
                    currency="ZMW",
                    status="pending",
                    transaction_reference="",
                    payment_method="admin_override",
                    metadata={
                        "admin_override_placeholder": True,
                    },
                    created_at=now,
                    updated_at=now,
                )
            elif payment.status in ("failed", "expired", "force_approved"):
                # Terminal non-successful → cannot progress into
                # force_approved without super_admin_correction. The
                # design permits admin_override only from ``""``, pending,
                # or deferred.
                if payment.status == "force_approved":
                    raise ValueError("CANNOT_REVERSE_SUCCESSFUL_PAYMENT")
                raise ValueError("PAYMENT_ALREADY_TERMINAL")

            # R2.4: write override metadata BEFORE the transition so the
            # audit entry emitted by _transition can reference it.
            meta = payment.metadata or {}
            meta["override"] = True
            meta["reviewed_by"] = str(actor_id)
            meta["reviewed_at"] = now.isoformat()
            meta["reason"] = reason
            meta["actor_role"] = actor_role
            payment.metadata = meta
            payment.updated_at = now
            payment.save(update_fields=["metadata", "updated_at"])

            result = self._transition(
                payment,
                "force_approved",
                source="admin_override",
                actor=actor_id,
                reason=reason,
                provider_data={
                    "override": True,
                    "actor_role": actor_role,
                    "reviewed_at": now.isoformat(),
                },
            )

            # R2.6: emit the explicit ``payment.force_approved`` audit
            # (in addition to the generic ``payment.transitioned`` that
            # ``_transition`` already wrote). The prefix
            # ``payment.force_approved`` is in
            # ``_SECURITY_RETENTION_ACTION_PREFIXES`` so retention is
            # auto-promoted to 365 days.
            payment.refresh_from_db()
            self._emit_audit(
                "payment.force_approved",
                payment,
                actor_id,
                {
                    "actor_role": actor_role,
                    "reason": reason,
                    "application_id": str(application_id),
                },
            )

            return result

    def super_admin_correct(
        self,
        *,
        payment_id: UUID,
        target_status: CanonicalStatus,
        actor_id: UUID,
        reason: str,
    ) -> TransitionResult:
        """Super-admin-only correction that can move a Payment to any canonical status.

        Unlike ``force_approve`` (which is admin-grade and constrained to
        ``force_approved``), ``super_admin_correct`` is the ledger-level
        escape hatch reserved for super-admins: it can transition from any
        state (including terminal) to any other canonical status. The
        ``_transition`` matrix already authorises
        ``source='super_admin_correction'`` as a "terminal → anything"
        fallback (design → State Machine → Super_Admin_Correction_Path).

        Behaviour:

        1. Validate ``reason`` (≥ 10 chars after strip) — raise
           ``ValueError('OVERRIDE_REASON_REQUIRED')`` otherwise (R2.5).
        2. Validate ``target_status`` against the six canonical values —
           raise ``ValueError('INVALID_TARGET_STATUS')`` otherwise.
        3. Locate the Payment — raise ``ValueError('PAYMENT_NOT_FOUND')``
           when missing so the view layer can map to HTTP 404.
        4. Emit the ``payment.super_admin_corrected`` audit row **before**
           the transition persists (R1.5). The action prefix is in
           ``_SECURITY_RETENTION_ACTION_PREFIXES`` so the audit row is
           auto-promoted to the 365-day security retention window (R2.6).
        5. Delegate to ``_transition(... source='super_admin_correction')``
           which opens its own ``atomic()`` block and re-reads the row
           under ``SELECT FOR UPDATE`` for race-safe mutation.

        Requirements: R1.5, R2.5, R2.6, R17.1.
        """
        valid_statuses: tuple[str, ...] = (
            "pending",
            "deferred",
            "successful",
            "failed",
            "expired",
            "force_approved",
        )

        if not reason or len(reason.strip()) < 10:
            raise ValueError("OVERRIDE_REASON_REQUIRED")

        if target_status not in valid_statuses:
            raise ValueError("INVALID_TARGET_STATUS")

        try:
            payment = Payment.objects.get(id=payment_id)
        except Payment.DoesNotExist:
            raise ValueError("PAYMENT_NOT_FOUND")

        # R1.5: emit the security-grade audit row BEFORE the mutation so
        # the governance trail exists even if the transition is blocked
        # or rolled back downstream. ``payment.super_admin_corrected``
        # auto-promotes to 365-day retention via the prefix allow-list.
        self._emit_audit(
            "payment.super_admin_corrected",
            payment,
            actor_id,
            {
                "actor_role": "super_admin",
                "target_status": target_status,
                "from_status": payment.status or "",
                "reason": reason,
                "application_id": (
                    str(payment.application_id)
                    if payment.application_id is not None
                    else None
                ),
            },
        )

        return self._transition(
            payment,
            target_status,
            source="super_admin_correction",
            actor=actor_id,
            reason=reason,
        )

    def expire_stale(
        self, older_than_hours: int = 24, batch_cap: int = 50
    ) -> int:
        """Reconcile stale ``pending`` payments to ``expired``.

        Finds Payments in ``pending`` older than the cutoff (default 24
        hours, R8.3), ordered by ``created_at`` ascending, capped to
        ``batch_cap``. Each row is routed through
        ``_transition(... 'expired', source='reconciliation')``. Returns
        the count of successful expirations. Idempotent by construction —
        re-running finds no new candidates.
        """
        cutoff = timezone.now() - timedelta(hours=older_than_hours)
        candidates = list(
            Payment.objects.filter(
                status="pending", created_at__lt=cutoff,
            ).order_by("created_at")[:batch_cap]
        )

        expired = 0
        for payment in candidates:
            try:
                result = self._transition(
                    payment,
                    "expired",
                    source="reconciliation",
                    actor=None,
                )
                if result.status == "expired":
                    expired += 1
                    # Emit the dedicated expired-by-reconciliation audit
                    # on top of the generic ``payment.transitioned`` one.
                    self._emit_audit(
                        "payment.expired_by_reconciliation",
                        payment,
                        None,
                        {
                            "older_than_hours": older_than_hours,
                            "created_at": payment.created_at.isoformat(),
                        },
                    )
            except Exception:
                logger.exception(
                    "expire_stale: failed to expire payment %s — continuing",
                    payment.id,
                )

        logger.info(
            "expire_stale: processed %d/%d candidates, expired=%d",
            len(candidates), batch_cap, expired,
        )
        return expired

    # ------------------------------------------------------------------
    # payment-hardening — Task 11.2, 11.3, 11.4
    # ------------------------------------------------------------------

    def _transition(
        self,
        payment: Payment,
        target_status: CanonicalStatus,
        *,
        source: TransitionSource,
        actor: Optional[UUID],
        reason: Optional[str] = None,
        provider_data: Optional[dict] = None,
    ) -> TransitionResult:
        """Sole mutation entry point for ``payments.status``.

        Opens a single ``transaction.atomic()`` block that:

        1. Re-reads the Payment under ``SELECT FOR UPDATE``.
        2. Validates ``(from_status, target_status, source)`` against
           ``ALLOWED_TRANSITIONS``. Blocked attempts emit a
           ``payment.transition_blocked`` audit entry and return early.
        3. For ``target_status == 'successful'`` runs the 4-check integrity
           gate (amount at 2dp, currency case-insensitive, non-empty
           provider reference, snapshot preserved). Mismatches append a
           structured risk flag to ``payment.metadata.risk_flags``, emit a
           ``payment.risk_flag`` audit, and return early without a status
           change.
        4. Persists the status change (plus ``updated_at``).
        5. Syncs ``Application.payment_status`` via
           ``PAYMENT_TO_APP_MAP`` inside the same atomic block.
        6. For ``successful``/``force_approved`` allocates a receipt via
           ``_generate_receipt_idempotent``.
        7. Emits the ``payment.transitioned`` (or ``payment.{target}``)
           audit event.

        Forward-only enforcement is gated on
        ``settings.PAYMENT_HARDENING_FORWARD_ONLY``. When ``False``, the
        method is a best-effort no-op shim that delegates back to the
        legacy ``_update_payment_status`` path so existing callers remain
        unchanged.

        Requirements: R1.1, R1.2, R1.3, R1.4, R1.6, R1.7, R7.1–R7.6,
        R9.1, R9.4, R17.1.
        """
        from django.db import transaction

        # LEGACY: when the hardening flag is disabled we preserve the
        # previous behaviour so existing callers do not see a regression.
        # The legacy path uses ``_update_payment_status`` which only covers
        # ``successful``/``failed`` → mutations flowing from webhook/verify.
        # Creation-style sources ("initiate") and admin/super-admin flows
        # are still handled here so the feature flag can be enabled safely.
        if not _forward_only_enabled():
            # LEGACY: delegate to the pre-hardening mutator when it applies.
            if target_status in ("successful", "failed") and source in (
                "verify",
                "webhook",
                "reconciliation",
            ):
                try:
                    self._update_payment_status(
                        payment, target_status, provider_data or {}
                    )
                    payment.refresh_from_db()
                except Payment.DoesNotExist:  # pragma: no cover - defensive
                    pass
                return TransitionResult(
                    payment_id=payment.id,
                    status=payment.status,  # type: ignore[arg-type]
                    risk_flag=None,
                )
            # Fall through to the hardened path for anything the legacy
            # mutator does not understand (force_approved, expired, etc.).

        with transaction.atomic():
            locked = (
                Payment.objects.select_for_update().get(pk=payment.pk)
            )
            from_status = locked.status or ""

            # --- Step 2: transition validation ---
            allowed_sources = ALLOWED_TRANSITIONS.get(
                (from_status, target_status), set()
            )
            is_allowed = source in allowed_sources
            # super_admin_correction can always move a terminal row, with a
            # reason enforced by the caller. This mirrors the design's
            # "terminal → anything" row in the state-machine table.
            if not is_allowed and source == "super_admin_correction":
                is_allowed = True

            if not is_allowed:
                self._emit_audit(
                    "payment.transition_blocked",
                    locked,
                    actor,
                    {
                        "source": source,
                        "from_status": from_status,
                        "target_status": target_status,
                        "reason": reason,
                    },
                )
                logger.info(
                    "Blocked transition %s → %s for payment %s (source=%s)",
                    from_status,
                    target_status,
                    locked.id,
                    source,
                )
                return TransitionResult(
                    payment_id=locked.id,
                    status=from_status,  # type: ignore[arg-type]
                    risk_flag=None,
                )

            # --- Step 3: integrity gate for successful transitions ---
            if target_status == "successful":
                risk_flag = self._run_integrity_gate(
                    locked, provider_data or {}, actor=actor
                )
                if risk_flag is not None:
                    return TransitionResult(
                        payment_id=locked.id,
                        status=locked.status,  # type: ignore[arg-type]
                        risk_flag=risk_flag,
                    )

            # --- Step 4: persist status change ---
            locked.status = target_status
            locked.updated_at = timezone.now()

            # Merge any provider_data into lenco_response metadata
            # (non-destructive to the snapshot).
            if provider_data:
                meta = locked.metadata or {}
                meta["lenco_response"] = provider_data
                if provider_data.get("lencoReference"):
                    locked.lenco_reference = provider_data["lencoReference"]
                if provider_data.get("type"):
                    locked.payment_method = provider_data["type"]
                locked.metadata = meta
                locked.save(
                    update_fields=[
                        "status",
                        "metadata",
                        "lenco_reference",
                        "payment_method",
                        "updated_at",
                    ]
                )
            else:
                locked.save(update_fields=["status", "updated_at"])

            # --- Step 5: sync Application.payment_status (ADR-1) ---
            app_status = PAYMENT_TO_APP_MAP.get(target_status)
            if app_status and locked.application_id:
                self._update_application_payment_status(
                    locked.application_id, app_status
                )

            # --- Step 6: idempotent receipt for terminal success states ---
            if target_status in ("successful", "force_approved"):
                try:
                    self._generate_receipt_idempotent(locked)
                except Exception:  # pragma: no cover - defensive
                    logger.exception(
                        "Receipt generation failed for payment %s — "
                        "status change still committed",
                        locked.id,
                    )

            # --- Step 7: audit the transition ---
            self._emit_audit(
                f"payment.{target_status}"
                if target_status in ("force_approved",)
                else "payment.transitioned",
                locked,
                actor,
                {
                    "source": source,
                    "from_status": from_status,
                    "target_status": target_status,
                    "reason": reason,
                    "lenco_reference": locked.lenco_reference,
                },
            )

            return TransitionResult(
                payment_id=locked.id,
                status=target_status,
                risk_flag=None,
            )

    def _run_integrity_gate(
        self,
        payment: Payment,
        provider_data: dict,
        *,
        actor: Optional[UUID],
    ) -> Optional[str]:
        """Run the 4-check integrity gate for ``successful`` transitions.

        Returns the risk-flag type when a check fails (and records the flag
        + audit entry); returns ``None`` when all checks pass.

        Checks:

        1. Amount equality at 2 decimal places via ``Decimal``.
           Zero/negative/unparseable amounts yield ``invalid_amount``.
        2. Currency case-insensitive equality.
        3. Non-empty provider reference (``lencoReference``).
        4. Snapshot equality — present-and-unchanged. This is advisory;
           since the snapshot is immutable after first write, a missing
           snapshot on a pre-hardening row is tolerated (logged).
        """
        meta = payment.metadata or {}
        snapshot = meta.get("snapshot") or {}

        # --- Check 1: amount ---
        raw_amount = provider_data.get("amount")
        try:
            if raw_amount is None:
                raise InvalidOperation
            provider_amount = Decimal(str(raw_amount)).quantize(Decimal("0.01"))
        except (InvalidOperation, ValueError, TypeError):
            self._append_risk_flag(
                payment,
                risk_type="invalid_amount",
                details={
                    "received": str(raw_amount),
                    "source": "integrity_gate",
                },
                actor=actor,
            )
            return "invalid_amount"

        if provider_amount <= Decimal("0"):
            self._append_risk_flag(
                payment,
                risk_type="invalid_amount",
                details={
                    "received": str(provider_amount),
                    "source": "integrity_gate",
                    "reason": "non_positive_amount",
                },
                actor=actor,
            )
            return "invalid_amount"

        expected_amount = (
            Decimal(str(snapshot["expected_amount"])).quantize(Decimal("0.01"))
            if snapshot.get("expected_amount") is not None
            else (payment.amount or Decimal("0")).quantize(Decimal("0.01"))
        )
        if provider_amount != expected_amount:
            self._append_risk_flag(
                payment,
                risk_type="amount_mismatch",
                details={
                    "expected": str(expected_amount),
                    "received": str(provider_amount),
                    "source": "integrity_gate",
                },
                actor=actor,
            )
            return "amount_mismatch"

        # --- Check 2: currency (case-insensitive) ---
        provider_currency = str(provider_data.get("currency") or "").strip()
        expected_currency = (
            snapshot.get("currency") or payment.currency or ""
        ).strip()
        if provider_currency and expected_currency and (
            provider_currency.upper() != expected_currency.upper()
        ):
            self._append_risk_flag(
                payment,
                risk_type="currency_mismatch",
                details={
                    "expected": expected_currency,
                    "received": provider_currency,
                    "source": "integrity_gate",
                },
                actor=actor,
            )
            return "currency_mismatch"

        # --- Check 3: non-empty provider reference ---
        lenco_reference = str(
            provider_data.get("lencoReference") or ""
        ).strip()
        if not lenco_reference:
            self._append_risk_flag(
                payment,
                risk_type="missing_provider_reference",
                details={
                    "source": "integrity_gate",
                },
                actor=actor,
            )
            return "missing_provider_reference"

        # --- Check 4: snapshot presence (advisory) ---
        if not snapshot:
            logger.info(
                "Integrity gate: payment %s has no metadata.snapshot "
                "(pre-hardening row); proceeding without snapshot check",
                payment.id,
            )

        return None

    def _append_risk_flag(
        self,
        payment: Payment,
        *,
        risk_type: str,
        details: dict,
        actor: Optional[UUID],
    ) -> None:
        """Append a structured risk flag and emit the matching audit event.

        Unlike ``_record_payment_risk`` this helper also emits the
        ``payment.risk_flag`` audit entry for governance-grade querying.
        Safe to call inside ``_transition``'s outer ``atomic()`` block.
        """
        self._record_payment_risk(
            payment,
            risk_type=risk_type,
            details=details,
        )
        self._emit_audit(
            "payment.risk_flag",
            payment,
            actor,
            {
                "risk_flag_type": risk_type,
                "details": details,
            },
        )

    def _emit_audit(
        self,
        event_type: str,
        payment: Payment,
        actor: Optional[UUID],
        metadata: dict,
        retention_category: str = "standard",
    ) -> None:
        """Write a payment audit row to ``audit_logs``.

        Thin delegation shim around
        :class:`apps.documents.payment_audit_service.PaymentAuditService`.
        The heavy lifting (PII redaction, retention promotion, swallowing
        audit-writer errors) lives in ``PaymentAuditService`` so every
        emitter inherits the same redaction rules (R17.4, R22.4).

        This method is kept as a thin wrapper so existing call sites
        (``_transition``, ``_record_payment_risk``, force-approve,
        reconciliation, receipt generation, etc.) and their tests keep
        working with the previous signature.

        Requirements: R17.1, R17.4, R22.4.
        """
        from apps.documents.payment_audit_service import PaymentAuditService

        PaymentAuditService.record_payment_event(
            action=event_type,
            payment_id=getattr(payment, "id", None),
            application_id=getattr(payment, "application_id", None),
            actor_id=actor,
            actor_role=None,
            metadata=metadata,
            retention_category=retention_category,
            request=None,
        )

    def _generate_receipt_idempotent(self, payment: Payment) -> str:
        """Allocate a receipt number for ``payment`` if one is not set.

        Returns the existing ``receipt_number`` when present (R13.2).
        Otherwise generates a 12-character base32 string from
        ``secrets.token_bytes(8)`` (~60 bits entropy), persists it, and
        emits a ``payment.receipt.generated`` audit entry.

        Uniqueness is enforced by ``uq_payments_receipt_number`` (Phase 1
        of the payment-hardening rollout). On ``IntegrityError`` the call
        retries up to 3 times with a fresh random value (R13.3).

        Requirements: R13.1–R13.6.
        """
        if payment.receipt_number:
            return payment.receipt_number

        last_error: Optional[Exception] = None
        for attempt in range(3):
            candidate = _generate_receipt_number()
            payment.receipt_number = candidate
            try:
                payment.save(update_fields=["receipt_number"])
            except IntegrityError as exc:
                last_error = exc
                payment.receipt_number = None
                logger.info(
                    "Receipt number collision for payment %s (attempt %s); retrying",
                    payment.id,
                    attempt + 1,
                )
                continue

            self._emit_audit(
                "payment.receipt.generated",
                payment,
                None,
                {
                    "receipt_number": candidate,
                    "attempts": attempt + 1,
                },
            )
            logger.info(
                "Receipt %s generated for payment %s", candidate, payment.id
            )
            return candidate

        # 3 consecutive collisions → re-raise so the transaction rolls back
        # loudly rather than silently leaving the payment without a
        # receipt. In practice 60 bits of entropy makes this unreachable.
        raise last_error if last_error else RuntimeError(
            "Failed to generate a unique receipt number after 3 attempts"
        )

    # ------------------------------------------------------------------
    # Legacy internal helpers
    # ------------------------------------------------------------------

    def _record_payment_risk(
        self,
        payment: Payment,
        *,
        risk_type: str,
        details: dict,
    ) -> None:
        """Persist a structured risk flag while leaving status unchanged."""
        meta = payment.metadata or {}
        risks = list(meta.get("risk_flags") or [])
        risks.append(
            {
                "type": risk_type,
                "details": details,
                "recorded_at": timezone.now().isoformat(),
            }
        )
        meta["risk_flags"] = risks
        payment.metadata = meta
        payment.updated_at = timezone.now()
        payment.save(update_fields=["metadata", "updated_at"])

    def _update_application_payment_status(
        self, application_id: UUID, status: str
    ) -> None:
        """Sync ``application.payment_status`` when payment succeeds or fails."""
        from apps.applications.models import Application

        updated = Application.objects.filter(id=application_id).update(
            payment_status=status,
            updated_at=timezone.now(),
        )
        if updated:
            logger.info(
                "Application %s payment_status set to %s", application_id, status
            )
        else:
            logger.warning(
                "Application %s not found when updating payment_status", application_id
            )


# ---------------------------------------------------------------------------
# Module-level helpers
# ---------------------------------------------------------------------------


def _generate_reference(application_number: str) -> str:
    """Build a unique payment reference.

    Format: ``MIHAS-{application_number}-{unix_timestamp_ms}``
    Example: ``MIHAS-APP-2025-0001-1719849600000``
    """
    ts_ms = int(time.time() * 1000)
    return f"MIHAS-{application_number}-{ts_ms}"


def _generate_receipt_number() -> str:
    """Allocate a 12-character base32 receipt identifier.

    Uses ``secrets.token_bytes(8)`` (64 bits) as entropy source, then
    base32-encodes and trims to 12 characters (~60 bits). The output
    character set is ``[A-Z2-7]`` (standard base32 alphabet, padding
    stripped) so receipts are safe to print, read aloud, and embed in
    URLs without additional encoding.

    Uniqueness is enforced downstream by ``uq_payments_receipt_number``.
    """
    raw = secrets.token_bytes(8)
    return base64.b32encode(raw).decode("ascii").rstrip("=")[:12]


def _parse_amount(value) -> Decimal | None:
    """Safely coerce a Lenco amount value to ``Decimal``."""
    if value is None:
        return None
    try:
        return Decimal(str(value)).quantize(Decimal('0.01'))
    except Exception:
        return None


# ---------------------------------------------------------------------------
# MSISDN helpers — shared between ``initiate_mobile_money`` and validators
# ---------------------------------------------------------------------------

# Two-digit MSISDN prefixes (after +260) for each operator. Sourced from
# Lenco's country documentation for Zambia. Kept deliberately narrow —
# numbers outside these prefixes must be rejected with ``PROVIDER_UNAVAILABLE``
# rather than guessed.
_AIRTEL_PREFIXES: frozenset[str] = frozenset({"95", "96", "75", "77"})
_MTN_PREFIXES: frozenset[str] = frozenset({"97", "76"})


def _normalize_phone_e164(phone_raw: str) -> str:
    """Normalise a Zambian MSISDN to E.164 (``+260XXXXXXXXX``).

    Accepts these shapes, with whitespace / dashes stripped:

    - ``+260XXXXXXXXX`` — already E.164, passed through.
    - ``0XXXXXXXXX``    — national trunk prefix stripped, ``+260`` added.
    - ``260XXXXXXXXX``  — country code without ``+``, ``+`` prepended.
    - ``XXXXXXXXX``     — 9-digit bare subscriber number, ``+260`` prepended.

    Anything else raises ``ValueError("INVALID_PHONE_FORMAT")``.

    This is a pure module-level function so it can be imported by tests and
    future validators without needing a ``PaymentService`` instance.
    """
    if phone_raw is None:
        raise ValueError("INVALID_PHONE_FORMAT")

    # Strip whitespace and separators commonly present in user input.
    cleaned = phone_raw.strip()
    for ch in (" ", "-", "(", ")", "\t"):
        cleaned = cleaned.replace(ch, "")

    if not cleaned:
        raise ValueError("INVALID_PHONE_FORMAT")

    if cleaned.startswith("+"):
        digits = cleaned[1:]
    else:
        digits = cleaned

    if not digits.isdigit():
        raise ValueError("INVALID_PHONE_FORMAT")

    # +260XXXXXXXXX → 260 + 9 digits
    if digits.startswith("260") and len(digits) == 12:
        return f"+{digits}"

    # 0XXXXXXXXX → strip trunk, add +260
    if digits.startswith("0") and len(digits) == 10:
        return f"+260{digits[1:]}"

    # Bare 9-digit subscriber number
    if len(digits) == 9:
        return f"+260{digits}"

    raise ValueError("INVALID_PHONE_FORMAT")


def _operator_for_msisdn(phone_e164: str) -> str:
    """Derive the operator (``airtel`` / ``mtn``) from an E.164 MSISDN.

    Expects the output shape of ``_normalize_phone_e164`` — i.e.
    ``+260`` followed by 9 digits. The two digits immediately after
    ``+260`` identify the operator.

    Raises ``ValueError("PROVIDER_UNAVAILABLE")`` when the prefix is not
    a recognised Airtel or MTN Zambia range. This preserves the design
    rule that operator classification is a backend responsibility only
    and unknown prefixes are refused rather than guessed.
    """
    if not phone_e164 or not phone_e164.startswith("+260") or len(phone_e164) != 13:
        raise ValueError("PROVIDER_UNAVAILABLE")
    prefix = phone_e164[4:6]
    if prefix in _AIRTEL_PREFIXES:
        return "airtel"
    if prefix in _MTN_PREFIXES:
        return "mtn"
    raise ValueError("PROVIDER_UNAVAILABLE")
