"""Payment verification mixin: verify_payment, verify, process_webhook_event, apply_webhook_event, _update_payment_status."""

from __future__ import annotations

import logging
from typing import Optional
from uuid import UUID

from django.conf import settings
from django.utils import timezone

from apps.documents.models import Payment
from apps.documents.payment_constants import (
    _ALLOWED_TRANSITIONS,
    _LENCO_STATUS_MAP,
    _LENCO_TIMEOUT,
)
from apps.documents.payment_helpers import (
    _LEGACY_PAYMENT_TO_APP_STATUS,
    _call_lenco_collection_status,
    _forward_only_enabled,
    _parse_amount,
    _process_webhook_event_impl,
    _sanitize_lenco_response,
)
from apps.documents.payment_types import (
    PaymentVerificationResult,
    TransitionResult,
)

logger = logging.getLogger(__name__)


class PaymentVerificationMixin:
    """Mixin for payment verification and webhook methods."""

    def verify_payment(
        self,
        payment_id: UUID,
        *,
        lenco_timeout: Optional[int] = None,
        lenco_max_retries: int = 0,
    ) -> PaymentVerificationResult:
        """Call the Lenco API to verify payment status and update records.

        Raises ``Payment.DoesNotExist`` when the payment is not found.

        ``lenco_timeout`` / ``lenco_max_retries`` bound the external provider
        call. Defaults (``_LENCO_TIMEOUT`` / no retries) preserve the historical
        interactive behaviour; the payment poll task passes a <=10s timeout and
        <=2 retries (R6.2).
        """
        payment = Payment.objects.get(id=payment_id)

        if payment.status != 'pending':
            return PaymentVerificationResult(
                status=payment.status, amount=payment.amount,
                currency=payment.currency, lenco_reference=payment.lenco_reference,
                payment_method=payment.payment_method, error=None,
            )

        reference = payment.transaction_reference
        if not reference:
            return PaymentVerificationResult(
                status=payment.status, amount=payment.amount,
                currency=payment.currency, lenco_reference=None,
                payment_method=None, error='Payment has no transaction reference.',
            )

        api_secret = settings.LENCO_API_SECRET_KEY
        base_url = settings.LENCO_API_BASE_URL

        if not api_secret:
            logger.warning("LENCO_API_SECRET_KEY not configured -- cannot verify payment %s", payment_id)
            return PaymentVerificationResult(
                status=payment.status, amount=payment.amount,
                currency=payment.currency, lenco_reference=None,
                payment_method=None, error='Payment processing is unavailable.',
            )

        data, error = _call_lenco_collection_status(
            reference,
            api_secret,
            base_url,
            lenco_timeout if lenco_timeout is not None else _LENCO_TIMEOUT,
            max_retries=lenco_max_retries,
        )
        if error is not None:
            return PaymentVerificationResult(
                status=payment.status, amount=payment.amount,
                currency=payment.currency, lenco_reference=None,
                payment_method=None, error=error,
            )

        lenco_status = data.get('status', '').lower()
        new_status = _LENCO_STATUS_MAP.get(lenco_status)

        if new_status == 'successful':
            from apps.documents.payment_state_machine import check_legacy_mismatch
            mismatch = check_legacy_mismatch(data, payment.amount, payment.currency)
            if mismatch is not None:
                logger.warning("Amount/currency mismatch for payment %s", payment_id)
                return PaymentVerificationResult(
                    status=payment.status, amount=payment.amount,
                    currency=payment.currency,
                    lenco_reference=data.get('lencoReference'),
                    payment_method=data.get('type'),
                    error='Payment amount does not match expected fee.',
                )

        if new_status:
            self._update_payment_status(payment, new_status, data)
            payment.refresh_from_db()

        return PaymentVerificationResult(
            status=payment.status, amount=payment.amount,
            currency=payment.currency, lenco_reference=payment.lenco_reference,
            payment_method=payment.payment_method, error=None,
        )

    def process_webhook_event(
        self, event_type: str, reference: str, payload: dict
    ) -> None:
        """Update a Payment record from webhook data. Idempotent.

        Uses ``SELECT FOR UPDATE`` to serialize concurrent webhook events.
        """
        _process_webhook_event_impl(self, event_type, reference, payload)

    def _update_payment_status(
        self, payment: Payment, new_status: str, lenco_data: dict
    ) -> None:
        """Apply a forward-only status transition and persist Lenco fields.

        Uses ``SELECT FOR UPDATE`` inside ``atomic()`` for row-level locking.
        If the transition is not allowed, the call is a no-op (idempotent).
        """
        from django.db import transaction

        with transaction.atomic():
            locked = Payment.objects.select_for_update().get(id=payment.id)

            allowed = _ALLOWED_TRANSITIONS.get(locked.status, set())
            if new_status not in allowed:
                logger.info(
                    "Skipping transition %s → %s for payment %s (not allowed)",
                    locked.status, new_status, locked.id,
                )
                return

            if new_status == 'successful':
                from apps.documents.payment_state_machine import check_legacy_mismatch
                mismatch = check_legacy_mismatch(lenco_data, locked.amount, locked.currency)
                if mismatch is not None:
                    risk_type, details = mismatch
                    logger.warning(
                        "%s in _update_payment_status for payment %s — skipping transition",
                        risk_type, locked.id,
                    )
                    self._record_payment_risk(locked, risk_type=risk_type, details=details)
                    return

            locked.status = new_status
            locked.lenco_reference = lenco_data.get('lencoReference') or locked.lenco_reference
            locked.payment_method = lenco_data.get('type') or locked.payment_method
            lenco_fee = _parse_amount(lenco_data.get('fee'))
            if lenco_fee is not None:
                locked.fee = lenco_fee
            locked.bearer = lenco_data.get('bearer') or locked.bearer
            reason = lenco_data.get('reasonForFailure')
            if reason and new_status == 'failed':
                locked.notes = str(reason)[:500]
            meta = locked.metadata or {}
            meta['lenco_response'] = _sanitize_lenco_response(lenco_data)
            locked.metadata = meta
            locked.updated_at = timezone.now()
            locked.save(update_fields=[
                'status', 'lenco_reference', 'payment_method',
                'fee', 'bearer', 'notes', 'metadata', 'updated_at',
            ])

            logger.info(
                "Payment %s transitioned to %s (lenco_ref=%s)",
                locked.id, new_status, locked.lenco_reference,
            )

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

            app_status = _LEGACY_PAYMENT_TO_APP_STATUS.get(new_status)
            if app_status and payment.application_id:
                self._update_application_payment_status(
                    payment.application_id, app_status
                )

    def verify(
        self,
        payment_id: UUID,
        actor_id: Optional[UUID] = None,
        *,
        lenco_timeout: Optional[int] = None,
        lenco_max_retries: int = 0,
    ) -> PaymentVerificationResult:
        """Hardened verify: routes through ``_transition`` for successful outcomes.

        ``lenco_timeout`` / ``lenco_max_retries`` bound the external provider
        call. Defaults preserve the interactive single-attempt behaviour; the
        payment poll task passes a <=10s timeout and <=2 retries (R6.2).
        """
        if not _forward_only_enabled():
            # LEGACY: preserve existing behaviour byte-for-byte.
            return self.verify_payment(
                payment_id,
                lenco_timeout=lenco_timeout,
                lenco_max_retries=lenco_max_retries,
            )

        payment = Payment.objects.get(id=payment_id)

        # ---- R10.1: terminal -> return cached, do not call Lenco ----
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

        data, error = _call_lenco_collection_status(
            reference,
            api_secret,
            base_url,
            lenco_timeout if lenco_timeout is not None else _LENCO_TIMEOUT,
            max_retries=lenco_max_retries,
        )
        if error is not None:
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
            # Route through _transition - its 4-check integrity gate is the
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
                # Integrity gate blocked the transition - surface the
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

        # R10.3: pay-offline / otp-required / pending -> leave pending.
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
        """Route a Lenco webhook outcome through ``_transition``."""
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

            # Unknown event_type -> log and skip.
            logger.info(
                "apply_webhook_event: ignoring unknown event_type=%s for payment %s",
                event_type, payment.id,
            )
            return TransitionResult(
                payment_id=payment.id,
                status=payment.status,  # type: ignore[arg-type]
                risk_flag=None,
            )
