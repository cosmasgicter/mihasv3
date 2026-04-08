"""Payment lifecycle service for Lenco integration.

Central service for creating payment records, verifying payment status with
the Lenco API, and processing webhook events.  All payment-status mutations
flow through this module so that forward-only transition rules and amount-
mismatch detection are enforced in a single place.

Requirements: 2.1, 2.2, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.3, 4.4, 4.9,
              9.1, 9.2, 9.5, 9.6, 10.3, 10.4, 10.5, 10.7
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from decimal import Decimal
from uuid import UUID

import requests as http_requests
from django.conf import settings
from django.utils import timezone

from apps.applications.models import Application
from apps.documents.fee_resolver import FeeResolver
from apps.documents.models import Payment

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Result dataclasses
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class PaymentInitiationResult:
    """Returned by ``initiate_payment``."""

    payment_id: UUID
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


# ---------------------------------------------------------------------------
# Allowed forward-only transitions
# ---------------------------------------------------------------------------

_ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    'pending': {'successful', 'failed'},
}

# Lenco API status → internal status mapping
_LENCO_STATUS_MAP: dict[str, str] = {
    'successful': 'successful',
    'failed': 'failed',
}

# Lenco API timeout in seconds
_LENCO_TIMEOUT = 15


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

        Raises ``Application.DoesNotExist`` when the application is not found.
        """
        # Double-payment prevention: return existing pending payment if one exists.
        existing = Payment.objects.filter(
            application_id=application_id, status='pending'
        ).first()
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

        application = Application.objects.get(id=application_id)

        resolved = self._fee_resolver.resolve_fee(
            program_code=application.program,
            nationality=application.nationality,
            country=getattr(application, 'country', None),
        )

        reference = _generate_reference(application.application_number)

        payment = Payment.objects.create(
            application_id=application_id,
            user_id=user_id,
            amount=resolved.amount,
            currency=resolved.currency,
            status='pending',
            transaction_reference=reference,
            payment_method=None,
            metadata={
                'residency_category': resolved.residency_category,
                'fee_source': resolved.source,
            },
            created_at=timezone.now(),
            updated_at=timezone.now(),
        )

        logger.info(
            "Payment initiated: payment=%s reference=%s amount=%s %s",
            payment.id,
            reference,
            resolved.amount,
            resolved.currency,
        )

        return PaymentInitiationResult(
            payment_id=payment.id,
            reference=reference,
            amount=resolved.amount,
            currency=resolved.currency,
        )

    def verify_payment(self, payment_id: UUID) -> PaymentVerificationResult:
        """Call the Lenco API to verify payment status and update records.

        Raises ``Payment.DoesNotExist`` when the payment is not found.
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
                headers={'Authorization': f'Bearer {api_secret}'},
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
                    return

            locked.status = new_status
            locked.lenco_reference = lenco_data.get('lencoReference') or locked.lenco_reference
            locked.payment_method = lenco_data.get('type') or locked.payment_method

            lenco_fee = _parse_amount(lenco_data.get('fee'))
            if lenco_fee is not None:
                locked.fee = lenco_fee

            locked.bearer = lenco_data.get('bearer') or locked.bearer

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
                'metadata',
                'updated_at',
            ])

            logger.info(
                "Payment %s transitioned to %s (lenco_ref=%s)",
                locked.id,
                new_status,
                locked.lenco_reference,
            )

        # Sync application payment_status (outside the FOR UPDATE lock —
        # the payment row is already committed at this point).
        if payment.application_id:
            if new_status == 'successful':
                self._update_application_payment_status(payment.application_id, 'paid')
            elif new_status == 'failed':
                self._update_application_payment_status(payment.application_id, 'failed')

    def _update_application_payment_status(
        self, application_id: UUID, status: str
    ) -> None:
        """Sync ``application.payment_status`` when payment succeeds or fails."""
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


def _parse_amount(value) -> Decimal | None:
    """Safely coerce a Lenco amount value to ``Decimal``."""
    if value is None:
        return None
    try:
        return Decimal(str(value))
    except Exception:
        return None
