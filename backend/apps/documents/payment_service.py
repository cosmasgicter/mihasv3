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
from django.conf import settings
from django.db import IntegrityError
from django.utils import timezone

from apps.documents.fee_resolver import FeeResolver
from apps.documents.models import Payment

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

logger = logging.getLogger(__name__)


def _generate_reference(application_number: str) -> str:  # noqa: F811
    """Build a unique payment reference - uses module-level ``time`` for testability."""
    ts_ms = int(time.time() * 1000)
    return f"MIHAS-{application_number}-{ts_ms}"


class PaymentService:
    """Manages the full payment lifecycle: initiation, verification, webhooks."""

    def __init__(self) -> None:
        self._fee_resolver = FeeResolver()

    def initiate_payment(
        self, application_id: UUID, user_id: UUID
    ) -> PaymentInitiationResult:
        """Create a *pending* Payment record with the resolved fee.

        Returns existing pending payment if one exists. Enforces
        MAX_PAYMENT_ATTEMPTS per application.
        """
        from django.db import transaction

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
            _check_retry_limit(application_id, MAX_PAYMENT_ATTEMPTS, EXPIRED_EXCLUSION_DAYS)

            application = Application.objects.get(id=application_id)

            if application.payment_status in COMPLETED_PAYMENT_STATUSES:
                return PaymentInitiationResult(
                    payment_id=None,
                    reference='',
                    amount=Decimal('0'),
                    currency='',
                )

            resolved_program, resolved, effective_amount = _resolve_fee_for_application(
                self._fee_resolver, application, application_id,
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

        Creates a synthetic payment record if none exists and admin is
        force-approving. Keeps application summary state aligned with the
        payment ledger.
        """
        return _review_application_payment_impl(
            self,
            application_id=application_id,
            payment_status=payment_status,
            reviewed_by_id=reviewed_by_id,
            notes=notes,
        )

    def defer_payment(
        self, application_id: UUID, user_id: UUID
    ) -> PaymentInitiationResult:
        """Create a *deferred* Payment record - student can pay later."""
        from django.db import transaction

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

            existing_pending = (
                Payment.objects.select_for_update()
                .filter(application_id=application_id, status='pending')
                .first()
            )
            if existing_pending:
                self._transition(
                    existing_pending,
                    "deferred",
                    source="initiate",
                    actor=user_id,
                    reason="student deferred payment",
                )
                existing_pending.refresh_from_db()
                meta = existing_pending.metadata or {}
                meta['deferred'] = True
                existing_pending.metadata = meta
                existing_pending.save(update_fields=['metadata'])

                return PaymentInitiationResult(
                    payment_id=existing_pending.id,
                    reference=existing_pending.transaction_reference,
                    amount=existing_pending.amount,
                    currency=existing_pending.currency,
                )

            application = Application.objects.get(id=application_id)

            if application.payment_status in COMPLETED_PAYMENT_STATUSES:
                return PaymentInitiationResult(
                    payment_id=None, reference='', amount=Decimal('0'), currency='',
                )

            resolved_program, resolved, effective_amount = _resolve_fee_for_application(
                self._fee_resolver, application, application_id,
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

        data, error = _call_lenco_collection_status(reference, api_secret, base_url, _LENCO_TIMEOUT)
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

    def initiate(
        self, application_id: UUID, user_id: UUID
    ) -> PaymentInitiationResult:
        """Hardened initiate: resolve fee, enforce retry limit, create pending Payment."""
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
            _check_retry_limit(application_id, MAX_PAYMENT_ATTEMPTS, EXPIRED_EXCLUSION_DAYS)

            # ---- 3. Re-check ownership under the lock (R4.1, R4.2) ----
            try:
                application = (
                    Application.objects.select_for_update()
                    .get(id=application_id)
                )
            except Application.DoesNotExist:
                raise
            if str(application.user_id) != str(user_id):
                raise ValueError("NOT_OWNER")

            if application.payment_status in COMPLETED_PAYMENT_STATUSES:
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

            resolved, effective_amount, snapshot_dict = _build_snapshot_dict(
                self._fee_resolver, application, application_id, resolved_program,
            )

            reference = _generate_reference(application.application_number)

            # ---- 5. Create the Payment; handle the active-row race ----
            try:
                with transaction.atomic():
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
        """Wrap ``initiate`` with a Lenco mobile-money collection call."""
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
        #    - the provider call is skipped and the payment stays pending.
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
        #    across the HTTP round trip.
        resp, lenco_data, http_error = _call_lenco_mobile_money(
            base_url=base_url,
            api_secret=api_secret,
            amount=str(result.amount),
            reference=result.reference,
            phone=phone,
            operator=operator,
            timeout=_LENCO_TIMEOUT,
        )
        if http_error is not None:
            try:
                self.mark_provider_initiation(
                    result.payment_id,
                    status=PROVIDER_STATUS_UNKNOWN,
                    operator=operator,
                    phone_hash=phone_hash,
                    phone_last4=phone_last4,
                    error=http_error,
                )
            except Exception:
                logger.exception(
                    "initiate_mobile_money: failed to mark provider unknown "
                    "for payment %s", result.payment_id,
                )
            return result

        provider_status, provider_subset, provider_error = _classify_mobile_money_response(resp, lenco_data)

        if provider_status == "rejected":
            logger.info(
                "initiate_mobile_money: Lenco rejected for payment %s", result.payment_id,
            )
        elif provider_status == "unknown":
            logger.warning(
                "initiate_mobile_money: Lenco 5xx for payment %s: %s",
                result.payment_id, provider_error,
            )

        status_map = {
            "accepted": PROVIDER_STATUS_ACCEPTED,
            "rejected": PROVIDER_STATUS_REJECTED,
            "unknown": PROVIDER_STATUS_UNKNOWN,
        }
        try:
            self.mark_provider_initiation(
                result.payment_id,
                status=status_map[provider_status],
                provider_data=provider_subset if provider_status != "unknown" or provider_subset else provider_subset,
                operator=operator,
                phone_hash=phone_hash,
                phone_last4=phone_last4,
                error=provider_error,
            )
        except Exception:
            logger.exception(
                "initiate_mobile_money: failed to mark provider %s "
                "for payment %s", provider_status, result.payment_id,
            )

        return result

    def verify(
        self, payment_id: UUID, actor_id: Optional[UUID] = None
    ) -> PaymentVerificationResult:
        """Hardened verify: routes through ``_transition`` for successful outcomes."""
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

        data, error = _call_lenco_collection_status(
            reference, api_secret, base_url, _LENCO_TIMEOUT,
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

            # Unknown event_type → log and skip.
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
        """Admin-driven ``force_approved`` transition (reason >= 10 chars required)."""
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
                # Create a placeholder pending row for _transition.
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
                if payment.status == "force_approved":
                    raise ValueError("CANNOT_REVERSE_SUCCESSFUL_PAYMENT")
                raise ValueError("PAYMENT_ALREADY_TERMINAL")

            # Write override metadata BEFORE the transition.
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

            # ``_transition`` emits the canonical audit for this target state.

            return result

    def super_admin_correct(
        self,
        *,
        payment_id: UUID,
        target_status: CanonicalStatus,
        actor_id: UUID,
        reason: str,
    ) -> TransitionResult:
        """Super-admin correction: move a Payment to any canonical status."""
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

        # Emit security-grade audit row BEFORE the mutation.
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
        """Reconcile stale ``pending`` payments to ``expired`` via ``_transition``."""
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
        """Sole mutation entry point for ``payments.status`` (ADR-007)."""
        from django.db import transaction

        # LEGACY: when the hardening flag is disabled, delegate to the
        # pre-hardening mutator for verify/webhook/reconciliation sources.
        if not _forward_only_enabled():
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

            # Idempotent replay: same status from provider sources is a no-op.
            if from_status == target_status and source in {"webhook", "verify", "reconciliation"}:
                return TransitionResult(
                    payment_id=locked.id,
                    status=from_status,  # type: ignore[arg-type]
                    risk_flag=None,
                )

            # --- Step 2: transition validation ---
            allowed_sources = ALLOWED_TRANSITIONS.get(
                (from_status, target_status), set()
            )
            is_allowed = source in allowed_sources
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

            if provider_data:
                meta = locked.metadata or {}
                meta["lenco_response"] = _sanitize_lenco_response(provider_data)
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
                    **(
                        {"actor_role": provider_data["actor_role"]}
                        if target_status == "force_approved"
                        and provider_data
                        and provider_data.get("actor_role")
                        else {}
                    ),
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
        """
        from apps.documents.payment_state_machine import check_integrity_gate

        meta = payment.metadata or {}
        snapshot = meta.get("snapshot") or {}

        result = check_integrity_gate(
            provider_data=provider_data,
            payment_amount=payment.amount,
            payment_currency=payment.currency,
            payment_id=payment.id,
            snapshot=snapshot,
        )
        if result is not None:
            risk_type, details = result
            self._append_risk_flag(
                payment,
                risk_type=risk_type,
                details=details,
                actor=actor,
            )
            return risk_type
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
        Safe to call inside the outer ``atomic()`` block of ``_transition``.
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
        """Write a payment audit row via ``PaymentAuditService``."""
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

        Returns existing ``receipt_number`` when present. Otherwise generates
        a 12-char base32 string, retries up to 3 times on collision.
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
