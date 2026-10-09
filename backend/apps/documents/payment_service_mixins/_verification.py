"""Payment verification mixin: verify + apply_webhook_event.

One verification path and one callback path (admissions-v2 task 8.2). The
pre-hardening ``verify_payment`` / ``process_webhook_event`` /
``_update_payment_status`` trio and the ``PAYMENT_HARDENING_FORWARD_ONLY``
fallback that selected them were deleted after the parity matrix in
``tests/unit/test_payment_path_parity_8_2.py`` proved both paths produced the
same ledger.
"""

from __future__ import annotations

import logging
from typing import Optional
from uuid import UUID

from django.conf import settings
from django.utils import timezone

from apps.documents.models import Payment
from apps.documents.payment_constants import (
    _LENCO_STATUS_MAP,
    _LENCO_TIMEOUT,
)
from apps.documents.payment_helpers import (
    _call_lenco_collection_status,
)
from apps.documents.payment_types import (
    PaymentVerificationResult,
    TransitionResult,
)

logger = logging.getLogger(__name__)


class PaymentVerificationMixin:
    """Mixin for payment verification and webhook methods."""

    def verify(
        self,
        payment_id: UUID,
        actor_id: Optional[UUID] = None,
        *,
        lenco_timeout: Optional[int] = None,
        lenco_max_retries: int = 0,
    ) -> PaymentVerificationResult:
        """Verify a payment against the provider and route through ``_transition``.

        The only verification path (task 8.2). Every outcome — success, failure,
        still-pending — is decided by ``_transition`` and its integrity gate, so
        a provider answer cannot mutate the ledger any other way.

        ``lenco_timeout`` / ``lenco_max_retries`` bound the external provider
        call. Defaults preserve the interactive single-attempt behaviour; the
        payment poll task passes a <=10s timeout and <=2 retries (R6.2).
        """
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
        """Route a Lenco webhook outcome through ``_transition``.

        The only callback path (task 8.2). Replay-safe: an event that would not
        change the status is a no-op inside ``_transition``, and settlement
        events touch metadata only.
        """
        from django.db import transaction

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

                # ``reasonForFailure`` is persisted by ``_transition`` itself
                # (the sole writer) from ``provider_data``, so there is no
                # out-of-band notes write here.
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
