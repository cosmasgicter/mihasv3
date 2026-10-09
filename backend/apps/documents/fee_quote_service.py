"""Expiring, signed, server-authored fee quotes.

The backend is the sole authority on money. ``FeeQuoteService`` mints a durable
quote from the canonical fee configuration, signs it, gives it an expiry, and
redeems it exactly once when a Payment is created. The frontend displays the
stored numbers and performs **no** arithmetic, no default, and no provider
guessing.

Spec:     ``.kiro/specs/admissions-v2-canonical-rebuild/`` task 8.1
Requirements:
    * **R12.1** — before payment, the backend creates an expiring fee quote using
      canonical offering, intake, residency, fee type, currency, provider fee
      policy, and configuration version; the frontend performs no amount
      arithmetic.
    * **R12.2** — when no unique active fee exists the quote command returns
      ``FEE_NOT_CONFIGURED`` and never substitutes a hardcoded amount.
    * **R12.6** — the UI displays server amounts, quote expiry, provider state,
      recovery action, and receipt status without hardcoded fees.
Findings:
    * **STU-08** — the payment UI hardcoded a 1% transaction fee and an empty-state
      K150/USD20 fee.
    * **DATA-05** — fee lookup used display names and an invented default.
Design:   §10.1 Fee Quote (``quote_id, application_id, configuration_version,
          base_amount, provider_fee, total_amount, currency, residency,
          expires_at, signature/status``); §10.2 ("provider phone/network routing
          is server-authored").

Relationship to task 5.4
------------------------
5.4 made *resolution* canonical: one active ``program_fees`` row per
(offering, fee_type, residency), fail closed with ``FEE_NOT_CONFIGURED`` /
``FEE_AMBIGUOUS``, no display-name lookup, no default amount. This service does
not fork that — every quote is produced by
:meth:`apps.documents.fee_resolver.FeeResolver.resolve_for_offering` and inherits
its fail-closed behaviour. 8.1 adds the two things 5.4 deliberately left out: a
**durable** record of what the student was quoted, and **single-use expiry** so a
stale or tampered quote cannot fund a payment.

Framework-neutral by design (design §3). Errors carry a stable ``code`` /
``status_code`` / ``retryable`` so views translate them to the canonical envelope
without this module importing DRF.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
from dataclasses import dataclass
from datetime import timedelta
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Any

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.documents.fee_resolver import FeeResolver
from apps.documents.models import FeeQuote, ProgramFee

logger = logging.getLogger(__name__)

_MONEY = Decimal("0.01")

#: Quote lifecycle (design §10.1 ``status``). Expiry is decided by ``expires_at``,
#: never by the presence of the materialised ``expired`` status — a sweeper that
#: has not run yet must not make a stale quote redeemable.
QUOTE_ACTIVE = "active"
QUOTE_REDEEMED = "redeemed"
QUOTE_EXPIRED = "expired"
QUOTE_SUPERSEDED = "superseded"
QUOTE_CANCELLED = "cancelled"

BEARER_CUSTOMER = "customer"
BEARER_MERCHANT = "merchant"

# Stable, registered error codes. Mirrored in
# ``apps.documents.payment_error_codes.PAYMENT_ERROR_CODES`` and its frontend
# mirror ``apps/admissions/src/lib/paymentErrorCodes.ts`` (drift-guarded).
QUOTE_NOT_FOUND_CODE = "QUOTE_NOT_FOUND"
QUOTE_EXPIRED_CODE = "QUOTE_EXPIRED"
QUOTE_ALREADY_REDEEMED_CODE = "QUOTE_ALREADY_REDEEMED"
QUOTE_INVALID_CODE = "QUOTE_INVALID"
QUOTE_CONFIGURATION_CHANGED_CODE = "QUOTE_CONFIGURATION_CHANGED"


class FeeQuoteError(Exception):
    """A quote could not be minted or redeemed (fail closed).

    Never degrades into an invented amount: the caller must surface the stable
    code and refuse to charge (R12.1, R12.2).
    """

    code = QUOTE_INVALID_CODE
    status_code = 409
    retryable = False

    def __init__(self, message: str | None = None):
        super().__init__(message or "This fee quote cannot be used.")
        self.message = str(self)


class QuoteNotFoundError(FeeQuoteError):
    """No quote matches the identifier for this application."""

    code = QUOTE_NOT_FOUND_CODE
    status_code = 404


class QuoteExpiredError(FeeQuoteError):
    """The quote's ``expires_at`` has passed. Recoverable: request a new quote."""

    code = QUOTE_EXPIRED_CODE
    status_code = 409
    retryable = True


class QuoteAlreadyRedeemedError(FeeQuoteError):
    """The quote already funded a payment. Single-use is the point."""

    code = QUOTE_ALREADY_REDEEMED_CODE
    status_code = 409


class QuoteSignatureError(FeeQuoteError):
    """The stored signature does not match the stored payload (tampered/forged)."""

    code = QUOTE_INVALID_CODE
    status_code = 409


class QuoteConfigurationChangedError(FeeQuoteError):
    """The fee configuration moved since the quote was minted.

    Recoverable: the student requests a fresh quote and sees the new price before
    paying it. What must never happen is silently charging the new amount against
    the old consent, or the old amount against new configuration.
    """

    code = QUOTE_CONFIGURATION_CHANGED_CODE
    status_code = 409
    retryable = True


@dataclass(frozen=True)
class ProviderFeePolicy:
    """Server-side provider-fee policy (R12.1 "provider fee policy").

    This is the authority that replaced the client's hardcoded
    ``TRANSACTION_FEE_RATE = 0.01`` (STU-08). ``percent`` is a percentage of the
    canonical fee, ``fixed`` a flat surcharge, ``cap`` an upper bound (0 = no cap),
    and ``bearer`` decides whether the customer or the institution pays it.
    """

    percent: Decimal
    fixed: Decimal
    cap: Decimal
    bearer: str

    def compute(self, base_amount: Decimal) -> Decimal:
        """Return the customer-borne provider fee for *base_amount*.

        A merchant-borne policy contributes **zero** to the customer's total — the
        institution absorbs it — which is also enforced by the DB CHECK
        ``chk_payment_fee_quotes_merchant_bearer_zero_fee``.
        """
        if self.bearer != BEARER_CUSTOMER:
            return Decimal("0.00")
        computed = (base_amount * self.percent / Decimal("100")) + self.fixed
        if self.cap > 0:
            computed = min(computed, self.cap)
        return computed.quantize(_MONEY, rounding=ROUND_HALF_UP)

    def as_snapshot(self) -> dict[str, Any]:
        return {
            "percent": str(self.percent),
            "fixed": str(self.fixed),
            "cap": str(self.cap),
            "bearer": self.bearer,
        }


def _decimal_setting(name: str, default: str) -> Decimal:
    """Read a Decimal-valued setting, falling back safely on a bad value."""
    raw = getattr(settings, name, default)
    try:
        return Decimal(str(raw))
    except (InvalidOperation, TypeError, ValueError):
        logger.warning(
            "Invalid %s=%r — falling back to %s", name, raw, default,
        )
        return Decimal(default)


def provider_fee_policy() -> ProviderFeePolicy:
    """Build the active provider-fee policy from settings.

    Defaults reproduce the rate the client used to apply (1%, customer-borne), so
    moving the authority to the server does not silently change what a student is
    charged; the difference is that it is now configurable, stored on the quote,
    and auditable.
    """
    bearer = str(
        getattr(settings, "PAYMENT_PROVIDER_FEE_BEARER", BEARER_CUSTOMER) or ""
    ).strip().lower()
    if bearer not in (BEARER_CUSTOMER, BEARER_MERCHANT):
        logger.warning(
            "Invalid PAYMENT_PROVIDER_FEE_BEARER=%r — defaulting to %s",
            bearer,
            BEARER_CUSTOMER,
        )
        bearer = BEARER_CUSTOMER
    percent = max(_decimal_setting("PAYMENT_PROVIDER_FEE_PERCENT", "1.0"), Decimal("0"))
    fixed = max(_decimal_setting("PAYMENT_PROVIDER_FEE_FIXED", "0"), Decimal("0"))
    cap = max(_decimal_setting("PAYMENT_PROVIDER_FEE_CAP", "0"), Decimal("0"))
    return ProviderFeePolicy(percent=percent, fixed=fixed, cap=cap, bearer=bearer)


def quote_ttl() -> timedelta:
    """How long a minted quote stays honourable (R12.1 "expiring")."""
    try:
        seconds = int(getattr(settings, "FEE_QUOTE_TTL_SECONDS", 1800))
    except (TypeError, ValueError):
        seconds = 1800
    return timedelta(seconds=max(seconds, 60))


def _signing_key() -> bytes:
    key = getattr(settings, "FEE_QUOTE_SIGNING_KEY", "") or settings.SECRET_KEY
    return str(key).encode("utf-8")


def _money(value: Any) -> Decimal:
    return Decimal(str(value)).quantize(_MONEY, rounding=ROUND_HALF_UP)


class FeeQuoteService:
    """Mint, read, and redeem server-authored fee quotes."""

    def __init__(self, fee_resolver: FeeResolver | None = None):
        self._fee_resolver = fee_resolver or FeeResolver()

    # -- signing ----------------------------------------------------------

    @staticmethod
    def signature_payload(
        *,
        quote_id: Any,
        application_id: Any,
        fee_configuration_version: str,
        base_amount: Any,
        provider_fee: Any,
        total_amount: Any,
        currency: str,
        bearer: str,
        residency_category: str,
        fee_type: str,
        expires_at: Any,
    ) -> str:
        """Canonical, order-fixed payload the signature covers.

        Every field a student could be harmed by is inside: identity, money,
        currency, who bears the provider fee, residency, fee type, expiry, and the
        fee-configuration fingerprint. Serialised positionally with a separator
        that cannot appear in any component, so no two distinct quotes can share a
        payload.
        """
        expires = expires_at.isoformat() if hasattr(expires_at, "isoformat") else str(expires_at)
        return "|".join(
            [
                str(quote_id),
                str(application_id),
                str(fee_configuration_version),
                str(_money(base_amount)),
                str(_money(provider_fee)),
                str(_money(total_amount)),
                str(currency or ""),
                str(bearer or ""),
                str(residency_category or ""),
                str(fee_type or ""),
                expires,
            ]
        )

    @classmethod
    def sign(cls, payload: str) -> str:
        return hmac.new(_signing_key(), payload.encode("utf-8"), hashlib.sha256).hexdigest()

    @classmethod
    def signature_for(cls, quote: FeeQuote) -> str:
        return cls.sign(
            cls.signature_payload(
                quote_id=quote.id,
                application_id=quote.application_id,
                fee_configuration_version=quote.fee_configuration_version,
                base_amount=quote.base_amount,
                provider_fee=quote.provider_fee,
                total_amount=quote.total_amount,
                currency=quote.currency,
                bearer=quote.bearer,
                residency_category=quote.residency_category,
                fee_type=quote.fee_type,
                expires_at=quote.expires_at,
            )
        )

    @classmethod
    def verify_signature(cls, quote: FeeQuote) -> bool:
        """Constant-time comparison of the stored signature to the stored payload."""
        expected = cls.signature_for(quote)
        return hmac.compare_digest(expected, quote.signature or "")

    # -- fee-configuration fingerprint ------------------------------------

    @staticmethod
    def fee_configuration_fingerprint(
        *,
        offering_id: Any,
        fee_schedule_id: Any,
        fee_type: str,
        residency_category: str,
        base_amount: Any,
        currency: str,
        waiver_applied: bool,
        policy: ProviderFeePolicy,
        configuration_version: str | None,
    ) -> str:
        """Deterministic fingerprint of every input that decided the money.

        This is what "the quote is bound to the fee configuration version" means
        executably (R12.1): redemption recomputes it from live configuration and
        refuses the quote when it differs. It deliberately includes the resolved
        amount and the provider-fee policy, not just the version string, so a
        same-version edit to the fee row or a policy change is still caught.
        """
        material = "|".join(
            [
                str(offering_id or ""),
                str(fee_schedule_id or ""),
                str(fee_type or ""),
                str(residency_category or ""),
                str(_money(base_amount)),
                str(currency or ""),
                "waiver" if waiver_applied else "no_waiver",
                policy.percent.normalize().to_eng_string(),
                policy.fixed.normalize().to_eng_string(),
                policy.cap.normalize().to_eng_string(),
                policy.bearer,
                str(configuration_version or ""),
            ]
        )
        return hashlib.sha256(material.encode("utf-8")).hexdigest()[:32]

    # -- resolution -------------------------------------------------------

    def resolve_quote_inputs(self, application, fee_type: str = "application") -> dict[str, Any]:
        """Resolve every server-authored input for a quote on *application*.

        Delegates offering + amount resolution to the canonical 5.4 resolver, so a
        missing or ambiguous fee raises :class:`FeeConfigurationError` /
        :class:`AmbiguousFeeError` (``FEE_NOT_CONFIGURED`` / ``FEE_AMBIGUOUS``)
        instead of producing a quote with a made-up number (R12.2, DATA-05).

        The post-waiver amount comes from
        :meth:`~apps.documents.fee_resolver.FeeResolver.resolve_for_payment_snapshot`
        — the same call payment initiation uses to compute what it charges — so the
        quoted base and the Payment amount cannot disagree, and waiver handling is
        not forked into a second implementation.
        """
        offering, resolved = self._fee_resolver.resolve_for_application(
            application, fee_type=fee_type
        )
        _, snapshot = self._fee_resolver.resolve_for_payment_snapshot(
            application, fee_type=fee_type
        )

        base_amount = _money(snapshot.expected_amount)
        waiver_applied = bool(snapshot.waiver_applied)

        policy = provider_fee_policy()
        provider_fee = policy.compute(base_amount)
        total_amount = _money(base_amount + provider_fee)

        fee_schedule_id = (
            ProgramFee.objects.filter(
                program=offering,
                fee_type=fee_type,
                residency_category=resolved.residency_category,
                is_active=True,
            )
            .values_list("id", flat=True)
            .first()
        )

        configuration_version = snapshot.configuration_version
        fingerprint = self.fee_configuration_fingerprint(
            offering_id=getattr(offering, "id", None),
            fee_schedule_id=fee_schedule_id,
            fee_type=fee_type,
            residency_category=resolved.residency_category,
            base_amount=base_amount,
            currency=resolved.currency,
            waiver_applied=waiver_applied,
            policy=policy,
            configuration_version=configuration_version,
        )

        return {
            "offering": offering,
            "fee_schedule_id": fee_schedule_id,
            "fee_type": fee_type,
            "residency_category": resolved.residency_category,
            "base_amount": base_amount,
            "provider_fee": provider_fee,
            "total_amount": total_amount,
            "currency": resolved.currency,
            "bearer": policy.bearer,
            "policy": {**policy.as_snapshot(), "fee_source": resolved.source},
            "waiver_applied": waiver_applied,
            "configuration_version": configuration_version,
            "fee_configuration_version": fingerprint,
        }

    # -- minting ----------------------------------------------------------

    def create_quote(
        self,
        application,
        *,
        actor_id: Any = None,
        fee_type: str = "application",
        reuse_active: bool = True,
    ) -> FeeQuote:
        """Mint (or reuse) the live quote for *application*.

        ``reuse_active`` returns the existing live quote when it is still valid,
        still matches current configuration, and has not expired — so repeatedly
        opening the payment step does not churn the price the student is looking
        at. Any drift (expiry, configuration change, tampering) supersedes the old
        row and mints a fresh one inside the same transaction, so the one-active
        quote invariant (``uq_payment_fee_quotes_one_active``) always holds.
        """
        inputs = self.resolve_quote_inputs(application, fee_type=fee_type)

        with transaction.atomic():
            existing = (
                FeeQuote.objects.select_for_update()
                .filter(
                    application_id=application.id,
                    fee_type=fee_type,
                    status=QUOTE_ACTIVE,
                )
                .order_by("-created_at")
                .first()
            )

            now = timezone.now()

            if existing is not None:
                if (
                    reuse_active
                    and existing.expires_at
                    and existing.expires_at > now
                    and existing.fee_configuration_version
                    == inputs["fee_configuration_version"]
                    and self.verify_signature(existing)
                ):
                    return existing

                reason = (
                    QUOTE_EXPIRED
                    if existing.expires_at and existing.expires_at <= now
                    else QUOTE_SUPERSEDED
                )
                existing.status = reason
                existing.updated_at = now
                existing.save(update_fields=["status", "updated_at"])
                logger.info(
                    "fee quote %s marked %s before minting a replacement",
                    existing.id,
                    reason,
                )

            quote = FeeQuote(
                application_id=application.id,
                program_offering=inputs["offering"],
                fee_schedule_id=inputs["fee_schedule_id"],
                fee_type=inputs["fee_type"],
                residency_category=inputs["residency_category"],
                configuration_version=inputs["configuration_version"],
                fee_configuration_version=inputs["fee_configuration_version"],
                base_amount=inputs["base_amount"],
                provider_fee=inputs["provider_fee"],
                total_amount=inputs["total_amount"],
                currency=inputs["currency"],
                bearer=inputs["bearer"],
                policy=inputs["policy"],
                waiver_applied=inputs["waiver_applied"],
                status=QUOTE_ACTIVE,
                expires_at=now + quote_ttl(),
                signature_version=int(
                    getattr(settings, "FEE_QUOTE_SIGNATURE_VERSION", 1) or 1
                ),
                issued_to=actor_id,
                created_at=now,
                updated_at=now,
            )
            quote.signature = self.signature_for(quote)
            quote.save(force_insert=True)

            logger.info(
                "fee quote %s issued for application %s: %s + %s = %s %s "
                "(bearer=%s, expires=%s)",
                quote.id,
                application.id,
                quote.base_amount,
                quote.provider_fee,
                quote.total_amount,
                quote.currency,
                quote.bearer,
                quote.expires_at.isoformat(),
            )
            return quote

    # -- reading ----------------------------------------------------------

    def active_quote(self, application_id, fee_type: str = "application") -> FeeQuote | None:
        """Return the live, unexpired, untampered quote, or ``None``."""
        quote = (
            FeeQuote.objects.filter(
                application_id=application_id,
                fee_type=fee_type,
                status=QUOTE_ACTIVE,
            )
            .order_by("-created_at")
            .first()
        )
        if quote is None:
            return None
        if quote.expires_at and quote.expires_at <= timezone.now():
            return None
        if not self.verify_signature(quote):
            logger.error(
                "fee quote %s failed signature verification on read", quote.id
            )
            return None
        return quote

    def load_for_application(self, quote_id, application_id, fee_type: str = "application") -> FeeQuote:
        """Load a quote by id, scoped to its application.

        Scoping by ``application_id`` before the fetch means a quote id belonging
        to another application (another student, another tenant) is not confirmed
        to exist — it is simply not found.
        """
        quote = (
            FeeQuote.objects.filter(
                id=quote_id, application_id=application_id, fee_type=fee_type
            )
            .first()
        )
        if quote is None:
            raise QuoteNotFoundError("This fee quote was not found.")
        return quote

    # -- redemption -------------------------------------------------------

    def redeem(
        self,
        *,
        quote_id,
        application,
        payment_id,
        fee_type: str = "application",
        expected_base_amount: Any = None,
    ) -> FeeQuote:
        """Consume a quote to fund exactly one payment.

        Called inside the same transaction that creates the Payment, so a Payment
        can never exist against a quote that was not consumed and a quote can never
        be consumed twice. Refuses, in this order:

        1. unknown / other-application quote -> ``QUOTE_NOT_FOUND``;
        2. already redeemed -> ``QUOTE_ALREADY_REDEEMED``;
        3. superseded / cancelled / materialised-expired -> ``QUOTE_EXPIRED``;
        4. ``expires_at`` in the past -> ``QUOTE_EXPIRED``;
        5. signature mismatch -> ``QUOTE_INVALID``;
        6. fee configuration drifted -> ``QUOTE_CONFIGURATION_CHANGED``;
        7. *expected_base_amount* (what the caller is about to charge) differs from
           the quoted base -> ``QUOTE_CONFIGURATION_CHANGED``.

        Step 7 is the caller-side guard: a Payment may only be funded by a quote
        that names the same money, so no code path can charge one number while
        recording consent for another.

        Refusals are raised *after* the locking transaction closes, so the terminal
        status the refusal implies (``expired`` / ``superseded``) is written in its
        own transaction instead of being rolled back by the raise. The refusal
        itself never depends on that write: expiry is decided by ``expires_at``.
        """
        refusal: FeeQuoteError | None = None
        materialise_status: str | None = None

        with transaction.atomic():
            quote = (
                FeeQuote.objects.select_for_update()
                .filter(id=quote_id, application_id=application.id, fee_type=fee_type)
                .first()
            )
            if quote is None:
                raise QuoteNotFoundError("This fee quote was not found.")

            now = timezone.now()

            if quote.status == QUOTE_REDEEMED:
                refusal = QuoteAlreadyRedeemedError(
                    "This fee quote has already been used for a payment."
                )
            elif quote.status != QUOTE_ACTIVE:
                refusal = QuoteExpiredError(
                    "This fee quote is no longer valid. Please refresh the fee."
                )
            elif quote.expires_at and quote.expires_at <= now:
                refusal = QuoteExpiredError(
                    "This fee quote has expired. Please refresh the fee."
                )
                materialise_status = QUOTE_EXPIRED
            elif not self.verify_signature(quote):
                logger.error(
                    "fee quote %s failed signature verification at redemption",
                    quote.id,
                )
                refusal = QuoteSignatureError("This fee quote could not be verified.")
                # Deliberately NOT materialised: a row whose signature does not
                # match its contents is evidence, and rewriting its status would
                # both destroy that evidence and re-break the signature.
            else:
                # Re-resolve live configuration and compare the fingerprint. A
                # changed fee row, residency, currency, waiver, or provider-fee
                # policy lands here.
                inputs = self.resolve_quote_inputs(application, fee_type=fee_type)
                drifted = (
                    inputs["fee_configuration_version"]
                    != quote.fee_configuration_version
                )
                if not drifted and expected_base_amount is not None:
                    drifted = _money(expected_base_amount) != _money(quote.base_amount)
                if drifted:
                    refusal = QuoteConfigurationChangedError(
                        "The application fee changed. Please review the new amount."
                    )
                    materialise_status = QUOTE_SUPERSEDED

            if refusal is None:
                quote.status = QUOTE_REDEEMED
                quote.payment_id = payment_id
                quote.redeemed_at = now
                quote.updated_at = now
                quote.save(
                    update_fields=[
                        "status",
                        "payment_id",
                        "redeemed_at",
                        "updated_at",
                    ]
                )
                logger.info(
                    "fee quote %s redeemed by payment %s (%s %s)",
                    quote.id,
                    payment_id,
                    quote.total_amount,
                    quote.currency,
                )
                return quote

        if materialise_status is not None:
            # Written after the locking block closes so the raise below does not
            # roll it back, and scoped to ``active`` so it is a no-op if another
            # request already moved the row on. When ``redeem`` is nested inside a
            # caller transaction that aborts (payment initiation), this write aborts
            # with it — which is harmless: the refusal is decided by ``expires_at``
            # and the fingerprint, never by the materialised label.
            with transaction.atomic():
                FeeQuote.objects.filter(id=quote_id, status=QUOTE_ACTIVE).update(
                    status=materialise_status, updated_at=timezone.now()
                )
            logger.info(
                "fee quote %s marked %s at redemption (%s)",
                quote_id,
                materialise_status,
                refusal.code,
            )

        raise refusal

    def create_and_redeem(
        self,
        *,
        application,
        payment_id,
        actor_id: Any = None,
        quote_id: Any = None,
        fee_type: str = "application",
        expected_base_amount: Any = None,
    ) -> FeeQuote:
        """Redeem *quote_id*, or mint a fresh quote and redeem it.

        Payment initiation calls this so **every** Payment row is backed by a
        server-authored quote, whether or not the client supplied one. A client
        that supplies a quote id gets it validated; a client that supplies nothing
        still cannot influence the amount.

        When no quote id is supplied the live quote for the application is reused
        if it is still valid and still matches configuration — so the student pays
        exactly the price the payment step showed them — and a fresh quote is
        minted otherwise.
        """
        with transaction.atomic():
            if not quote_id:
                quote = self.create_quote(
                    application, actor_id=actor_id, fee_type=fee_type
                )
                quote_id = quote.id
            return self.redeem(
                quote_id=quote_id,
                application=application,
                payment_id=payment_id,
                fee_type=fee_type,
                expected_base_amount=expected_base_amount,
            )

    # -- serialisation ----------------------------------------------------

    @staticmethod
    def as_dict(quote: FeeQuote) -> dict[str, Any]:
        """The wire shape of a quote (design §10.1).

        Amounts are strings so no client can lose precision re-parsing them, and
        the client has every number it needs to render the price breakdown without
        computing anything.
        """
        return {
            "quote_id": str(quote.id),
            "application_id": str(quote.application_id),
            "configuration_version": quote.configuration_version,
            "fee_configuration_version": quote.fee_configuration_version,
            "fee_type": quote.fee_type,
            "base_amount": str(_money(quote.base_amount)),
            "provider_fee": str(_money(quote.provider_fee)),
            "total_amount": str(_money(quote.total_amount)),
            "currency": quote.currency,
            "bearer": quote.bearer,
            "residency_category": quote.residency_category,
            "waiver_applied": bool(quote.waiver_applied),
            "status": quote.status,
            "expires_at": quote.expires_at.isoformat() if quote.expires_at else None,
            "signature": quote.signature,
            "signature_version": quote.signature_version,
        }


__all__ = [
    "BEARER_CUSTOMER",
    "BEARER_MERCHANT",
    "FeeQuoteError",
    "FeeQuoteService",
    "ProviderFeePolicy",
    "QUOTE_ACTIVE",
    "QUOTE_CANCELLED",
    "QUOTE_EXPIRED",
    "QUOTE_REDEEMED",
    "QUOTE_SUPERSEDED",
    "QuoteAlreadyRedeemedError",
    "QuoteConfigurationChangedError",
    "QuoteExpiredError",
    "QuoteNotFoundError",
    "QuoteSignatureError",
    "provider_fee_policy",
    "quote_ttl",
]
