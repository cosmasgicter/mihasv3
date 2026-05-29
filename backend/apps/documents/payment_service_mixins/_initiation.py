"""Payment initiation mixin: initiate_payment, initiate, initiate_mobile_money, mark_provider_initiation, defer_payment."""

from __future__ import annotations

import logging
from decimal import Decimal
from typing import Optional
from uuid import UUID

from django.conf import settings
from django.db import IntegrityError
from django.utils import timezone

from apps.documents.models import Payment
from apps.documents.payment_constants import (
    COMPLETED_PAYMENT_STATUSES,
    EXPIRED_EXCLUSION_DAYS,
    MAX_PAYMENT_ATTEMPTS,
    PROVIDER_STATUS_ACCEPTED,
    PROVIDER_STATUS_NOT_STARTED,
    PROVIDER_STATUS_REJECTED,
    PROVIDER_STATUS_UNKNOWN,
    _LENCO_TIMEOUT,
)
from apps.documents.payment_helpers import (
    _build_snapshot_dict,
    _call_lenco_mobile_money,
    _check_retry_limit,
    _classify_mobile_money_response,
    _forward_only_enabled,
    _normalize_phone_e164,
    _operator_for_msisdn,
    _resolve_fee_for_application,
)
from apps.documents.payment_types import (
    PaymentInitiationResult,
)

logger = logging.getLogger(__name__)


def _generate_reference(application_number: str) -> str:
    """Build a unique payment reference - uses module-level ``time`` for testability."""
    import time
    ts_ms = int(time.time() * 1000)
    return f"MIHAS-{application_number}-{ts_ms}"


class PaymentInitiationMixin:
    """Mixin for payment initiation methods."""

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

            # Use the module-level _generate_reference from payment_service.py
            # (which is the patchable one tests target).
            from apps.documents.payment_service import _generate_reference as _gen_ref
            reference = _gen_ref(application.application_number)

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

            from apps.documents.payment_service import _generate_reference as _gen_ref
            reference = _gen_ref(application.application_number)

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

            from apps.documents.payment_service import _generate_reference as _gen_ref
            reference = _gen_ref(application.application_number)

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

    def _refresh_reference_for_retry(self, payment_id, application_id):
        """Mint a fresh transaction_reference when retrying an already-sent payment.

        Lenco rejects a repeat mobile-money collection that reuses a
        reference it has already seen. When a pending Payment row is reused
        for a new attempt and it already carries a ``provider_initiation``
        record, we generate a new reference and persist it so the next Lenco
        call is treated as a fresh collection. Returns the new reference, or
        ``None`` when no refresh is needed (first attempt on this row).
        """
        from django.db import transaction

        from apps.applications.models import Application
        from apps.documents.payment_service import _generate_reference as _gen_ref

        with transaction.atomic():
            try:
                payment = Payment.objects.select_for_update().get(id=payment_id)
            except Payment.DoesNotExist:  # pragma: no cover - defensive
                return None

            already_sent = bool((payment.metadata or {}).get("provider_initiation"))
            if not already_sent:
                return None

            application_number = (
                Application.objects.filter(id=application_id)
                .values_list("application_number", flat=True)
                .first()
                or str(application_id)
            )
            new_reference = _gen_ref(application_number)
            payment.transaction_reference = new_reference
            payment.updated_at = timezone.now()
            payment.save(update_fields=["transaction_reference", "updated_at"])
            logger.info(
                "initiate_mobile_money: minted fresh reference for retry on payment %s",
                payment_id,
            )
            return new_reference

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

        # 1b. If we reused a pending payment that Lenco has already seen on
        #     this reference, mint a fresh reference. Lenco rejects a repeat
        #     collection on a duplicate reference, so a retry on the same row
        #     must carry a new reference. The webhook/verify join key
        #     (transaction_reference) is updated in lockstep so reconciliation
        #     still resolves. Only refresh when a prior provider initiation
        #     exists, to avoid churning references on the first attempt.
        refreshed_reference = self._refresh_reference_for_retry(
            result.payment_id, application_id
        )
        if refreshed_reference is not None:
            result = PaymentInitiationResult(
                payment_id=result.payment_id,
                reference=refreshed_reference,
                amount=result.amount,
                currency=result.currency,
            )

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
                "initiate_mobile_money: Lenco rejected for payment %s: %s",
                result.payment_id, provider_error,
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
