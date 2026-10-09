"""Fee-quote contract — amount authority, expiry, signature, and config binding.

Spec:     ``.kiro/specs/admissions-v2-canonical-rebuild/`` task 8.1
Requirements:
    * **R12.1** — before payment the backend creates an *expiring* fee quote from
      the canonical offering, intake, residency, fee type, currency, provider-fee
      policy, and configuration version; the frontend performs no arithmetic.
    * **R12.2** — no unique active fee -> ``FEE_NOT_CONFIGURED``, never a
      hardcoded substitute.
    * **R12.6** — the UI is given server amounts, quote expiry, and a recovery
      action.
Findings: **STU-08** (client hardcoded a 1% fee and a K150/USD 20 empty state),
          **DATA-05** (fee lookup used display names and an invented default).
Design:   §10.1 Fee Quote.

These run against real ``Program`` / ``ProgramFee`` / ``Application`` /
``FeeQuote`` rows — nothing about the money is mocked, because the whole point of
the task is that the amount is a database fact rather than a client opinion.
"""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
from django.db import connection
from django.test import override_settings
from django.utils import timezone

from apps.documents.fee_quote_service import (
    QUOTE_ACTIVE,
    QUOTE_REDEEMED,
    QUOTE_SUPERSEDED,
    FeeQuoteService,
    QuoteAlreadyRedeemedError,
    QuoteConfigurationChangedError,
    QuoteExpiredError,
    QuoteNotFoundError,
    QuoteSignatureError,
    provider_fee_policy,
)
from apps.documents.fee_resolver import FeeConfigurationError
from apps.documents.models import FeeQuote, Payment, ProgramFee
from tests.tenant_fixtures import build_tenant_world


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _fee(offering, *, amount: str, residency: str = "local", currency: str = "ZMW") -> ProgramFee:
    now = timezone.now()
    return ProgramFee.objects.create(
        id=uuid.uuid4(),
        program=offering,
        fee_type="application",
        residency_category=residency,
        amount=Decimal(amount),
        currency=currency,
        is_active=True,
        created_at=now,
        updated_at=now,
    )


def _world_with_fee(amount: str = "300.00", **kwargs):
    """A tenant world whose offering has exactly one active local application fee."""
    world = build_tenant_world(**kwargs)
    _fee(world.offering, amount=amount)
    return world


def _payment_for(application, amount: Decimal, *, status: str = "pending") -> Payment:
    """Persist a Payment row.

    ``status`` is a parameter because ``uq_payments_one_active_per_application``
    (task 3.3) allows only one ``pending``/``deferred`` row per application — the
    second attempt in a retry scenario is therefore a settled row.
    """
    now = timezone.now()
    return Payment.objects.create(
        id=uuid.uuid4(),
        application_id=application.id,
        user_id=application.user_id,
        amount=amount,
        currency="ZMW",
        status=status,
        transaction_reference=f"BNL-TEST-{uuid.uuid4().hex[:10]}",
        created_at=now,
        updated_at=now,
    )


# ---------------------------------------------------------------------------
# 1. Amount authority — the server decides every number on the quote
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_quote_amounts_come_from_canonical_fee_and_server_policy():
    """base = canonical FeeSchedule, provider fee = server policy, total = their sum."""
    world = _world_with_fee("300.00")

    quote = FeeQuoteService().create_quote(world.application)

    policy = provider_fee_policy()
    assert quote.base_amount == Decimal("300.00")
    assert quote.provider_fee == policy.compute(Decimal("300.00"))
    assert quote.total_amount == quote.base_amount + quote.provider_fee
    assert quote.currency == "ZMW"
    assert quote.bearer == policy.bearer
    assert quote.residency_category == "local"
    assert quote.status == QUOTE_ACTIVE
    # Design §10.1 requires every one of these on the stored quote.
    assert quote.expires_at is not None and quote.expires_at > timezone.now()
    assert quote.fee_configuration_version
    assert len(quote.signature) >= 32
    assert quote.signature_version >= 1


@pytest.mark.django_db
@override_settings(
    PAYMENT_PROVIDER_FEE_PERCENT="2.5",
    PAYMENT_PROVIDER_FEE_FIXED="1.00",
    PAYMENT_PROVIDER_FEE_CAP="0",
    PAYMENT_PROVIDER_FEE_BEARER="customer",
)
def test_provider_fee_follows_server_policy_not_a_client_constant():
    """The provider fee is a server setting — the retired client 1% is not involved."""
    world = _world_with_fee("200.00")

    quote = FeeQuoteService().create_quote(world.application)

    # 2.5% of 200.00 plus a 1.00 flat charge.
    assert quote.provider_fee == Decimal("6.00")
    assert quote.total_amount == Decimal("206.00")


@pytest.mark.django_db
@override_settings(PAYMENT_PROVIDER_FEE_BEARER="merchant", PAYMENT_PROVIDER_FEE_PERCENT="1.0")
def test_merchant_borne_provider_fee_is_not_charged_to_the_student():
    world = _world_with_fee("300.00")

    quote = FeeQuoteService().create_quote(world.application)

    assert quote.bearer == "merchant"
    assert quote.provider_fee == Decimal("0.00")
    assert quote.total_amount == Decimal("300.00")


@pytest.mark.django_db
def test_missing_fee_configuration_fails_closed_with_no_amount():
    """R12.2: no unique active fee -> FEE_NOT_CONFIGURED, and no quote row exists."""
    world = build_tenant_world()  # deliberately no ProgramFee

    with pytest.raises(FeeConfigurationError) as excinfo:
        FeeQuoteService().create_quote(world.application)

    assert excinfo.value.code == "FEE_NOT_CONFIGURED"
    assert excinfo.value.status_code == 422
    assert FeeQuote.objects.filter(application_id=world.application.id).count() == 0


@pytest.mark.django_db
def test_quote_is_isolated_to_its_own_tenant_offering():
    """Two tenants offering the same canonical program get their own amounts (R7.7)."""
    from tests.tenant_fixtures import build_tenant_worlds

    first, second = build_tenant_worlds(2)
    _fee(first.offering, amount="300.00")
    _fee(second.offering, amount="450.00")

    service = FeeQuoteService()
    assert service.create_quote(first.application).base_amount == Decimal("300.00")
    assert service.create_quote(second.application).base_amount == Decimal("450.00")


# ---------------------------------------------------------------------------
# 2. Expiry
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_expired_quote_is_not_returned_as_the_live_quote():
    world = _world_with_fee()
    service = FeeQuoteService()
    quote = service.create_quote(world.application)

    assert service.active_quote(world.application.id) is not None

    FeeQuote.objects.filter(id=quote.id).update(
        expires_at=timezone.now() - timezone.timedelta(seconds=1)
    )

    # Still ``active`` in the column, but the clock decides — not the label.
    assert FeeQuote.objects.get(id=quote.id).status == QUOTE_ACTIVE
    assert service.active_quote(world.application.id) is None


@pytest.mark.django_db
def test_expired_quote_cannot_fund_a_payment():
    world = _world_with_fee()
    service = FeeQuoteService()
    quote = service.create_quote(world.application)
    FeeQuote.objects.filter(id=quote.id).update(
        expires_at=timezone.now() - timezone.timedelta(minutes=1)
    )
    payment = _payment_for(world.application, Decimal("300.00"))

    with pytest.raises(QuoteExpiredError) as excinfo:
        service.redeem(
            quote_id=quote.id, application=world.application, payment_id=payment.id
        )

    assert excinfo.value.code == "QUOTE_EXPIRED"
    assert excinfo.value.retryable is True
    refreshed = FeeQuote.objects.get(id=quote.id)
    assert refreshed.status == "expired"
    assert refreshed.payment_id is None


@pytest.mark.django_db
@override_settings(FEE_QUOTE_TTL_SECONDS=60)
def test_quote_expiry_comes_from_the_configured_ttl():
    world = _world_with_fee()
    before = timezone.now()

    quote = FeeQuoteService().create_quote(world.application)

    assert quote.expires_at <= before + timezone.timedelta(seconds=61)
    assert quote.expires_at > before


# ---------------------------------------------------------------------------
# 3. Signature and status validation
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_tampered_amount_fails_signature_verification():
    world = _world_with_fee("300.00")
    service = FeeQuoteService()
    quote = service.create_quote(world.application)

    # Somebody edits the money out of band and leaves the signature behind. The
    # tamper is kept *internally self-consistent* (total = base + provider fee) on
    # purpose: an inconsistent one is already impossible on Postgres
    # (chk_payment_fee_quotes_total_is_sum), so the only tamper worth asserting
    # against is the one the CHECK constraints cannot see. The signature must
    # still catch it.
    FeeQuote.objects.filter(id=quote.id).update(
        base_amount=Decimal("1.00"),
        provider_fee=Decimal("0.01"),
        total_amount=Decimal("1.01"),
    )
    tampered = FeeQuote.objects.get(id=quote.id)

    assert FeeQuoteService.verify_signature(tampered) is False
    assert service.active_quote(world.application.id) is None

    payment = _payment_for(world.application, Decimal("1.00"))
    with pytest.raises(QuoteSignatureError) as excinfo:
        service.redeem(
            quote_id=quote.id, application=world.application, payment_id=payment.id
        )
    assert excinfo.value.code == "QUOTE_INVALID"
    assert FeeQuote.objects.get(id=quote.id).payment_id is None


@pytest.mark.django_db
def test_signature_covers_expiry_so_extending_a_quote_invalidates_it():
    world = _world_with_fee()
    quote = FeeQuoteService().create_quote(world.application)

    FeeQuote.objects.filter(id=quote.id).update(
        expires_at=timezone.now() + timezone.timedelta(days=30)
    )

    assert FeeQuoteService.verify_signature(FeeQuote.objects.get(id=quote.id)) is False


@pytest.mark.django_db
def test_redeemed_quote_cannot_fund_a_second_payment():
    world = _world_with_fee()
    service = FeeQuoteService()
    quote = service.create_quote(world.application)
    first_payment = _payment_for(world.application, Decimal("300.00"))

    redeemed = service.redeem(
        quote_id=quote.id, application=world.application, payment_id=first_payment.id
    )
    assert redeemed.status == QUOTE_REDEEMED
    assert str(redeemed.payment_id) == str(first_payment.id)
    assert redeemed.redeemed_at is not None

    second_payment = _payment_for(world.application, Decimal("300.00"), status="failed")
    with pytest.raises(QuoteAlreadyRedeemedError) as excinfo:
        service.redeem(
            quote_id=quote.id,
            application=world.application,
            payment_id=second_payment.id,
        )

    assert excinfo.value.code == "QUOTE_ALREADY_REDEEMED"
    # The binding still names the first payment only.
    assert str(FeeQuote.objects.get(id=quote.id).payment_id) == str(first_payment.id)


@pytest.mark.django_db
def test_superseded_quote_cannot_fund_a_payment():
    world = _world_with_fee()
    service = FeeQuoteService()
    quote = service.create_quote(world.application)
    FeeQuote.objects.filter(id=quote.id).update(status=QUOTE_SUPERSEDED)
    payment = _payment_for(world.application, Decimal("300.00"))

    with pytest.raises(QuoteExpiredError):
        service.redeem(
            quote_id=quote.id, application=world.application, payment_id=payment.id
        )


@pytest.mark.django_db
def test_another_applications_quote_is_not_found():
    """Scoping by application before the fetch: a foreign quote id is not confirmed."""
    from tests.tenant_fixtures import build_tenant_worlds

    first, second = build_tenant_worlds(2)
    _fee(first.offering, amount="300.00")
    _fee(second.offering, amount="450.00")
    service = FeeQuoteService()
    foreign_quote = service.create_quote(second.application)
    payment = _payment_for(first.application, Decimal("300.00"))

    with pytest.raises(QuoteNotFoundError) as excinfo:
        service.redeem(
            quote_id=foreign_quote.id,
            application=first.application,
            payment_id=payment.id,
        )

    assert excinfo.value.code == "QUOTE_NOT_FOUND"
    assert FeeQuote.objects.get(id=foreign_quote.id).status == QUOTE_ACTIVE


# ---------------------------------------------------------------------------
# 4. Fee-configuration binding
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_quote_is_bound_to_the_fee_configuration_it_was_minted_from():
    world = _world_with_fee("300.00")
    service = FeeQuoteService()
    quote = service.create_quote(world.application)

    # The school edits the fee after the student was quoted.
    ProgramFee.objects.filter(program=world.offering).update(amount=Decimal("500.00"))

    payment = _payment_for(world.application, Decimal("300.00"))
    with pytest.raises(QuoteConfigurationChangedError) as excinfo:
        service.redeem(
            quote_id=quote.id, application=world.application, payment_id=payment.id
        )

    assert excinfo.value.code == "QUOTE_CONFIGURATION_CHANGED"
    assert excinfo.value.retryable is True
    assert FeeQuote.objects.get(id=quote.id).payment_id is None


@pytest.mark.django_db
@override_settings(PAYMENT_PROVIDER_FEE_PERCENT="1.0")
def test_provider_fee_policy_change_also_breaks_the_binding():
    world = _world_with_fee("300.00")
    service = FeeQuoteService()
    quote = service.create_quote(world.application)
    payment = _payment_for(world.application, Decimal("300.00"))

    with override_settings(PAYMENT_PROVIDER_FEE_PERCENT="5.0"):
        with pytest.raises(QuoteConfigurationChangedError):
            service.redeem(
                quote_id=quote.id, application=world.application, payment_id=payment.id
            )


@pytest.mark.django_db
def test_charging_a_different_amount_than_the_quote_is_refused():
    """The caller cannot record consent for one number and charge another."""
    world = _world_with_fee("300.00")
    service = FeeQuoteService()
    quote = service.create_quote(world.application)
    payment = _payment_for(world.application, Decimal("300.00"))

    with pytest.raises(QuoteConfigurationChangedError):
        service.redeem(
            quote_id=quote.id,
            application=world.application,
            payment_id=payment.id,
            expected_base_amount=Decimal("10.00"),
        )


@pytest.mark.django_db
def test_reissuing_supersedes_the_previous_quote_so_only_one_is_live():
    world = _world_with_fee("300.00")
    service = FeeQuoteService()
    first = service.create_quote(world.application)

    # Same configuration -> the live quote is reused, so the price the student is
    # looking at does not churn.
    assert service.create_quote(world.application).id == first.id

    ProgramFee.objects.filter(program=world.offering).update(amount=Decimal("400.00"))
    second = service.create_quote(world.application)

    assert second.id != first.id
    assert second.base_amount == Decimal("400.00")
    assert FeeQuote.objects.get(id=first.id).status == QUOTE_SUPERSEDED
    live = FeeQuote.objects.filter(
        application_id=world.application.id, status=QUOTE_ACTIVE
    )
    assert live.count() == 1
    assert live.first().id == second.id


@pytest.mark.django_db
def test_waiver_is_reflected_in_the_quoted_base_amount():
    from apps.documents.models import FeeWaiver

    world = _world_with_fee("300.00")
    FeeWaiver.objects.create(
        id=uuid.uuid4(),
        application_id=world.application.id,
        waiver_type="partial",
        reason_code="financial_hardship",
        discount_percentage=50,
        approved_by_id=world.staff.id,
    )

    quote = FeeQuoteService().create_quote(world.application)

    assert quote.waiver_applied is True
    assert quote.base_amount == Decimal("150.00")
    assert quote.total_amount == quote.base_amount + quote.provider_fee


# ---------------------------------------------------------------------------
# 5. Wire shape (what the client is allowed to render)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_wire_shape_carries_every_number_the_ui_needs():
    world = _world_with_fee("300.00")
    quote = FeeQuoteService().create_quote(world.application)

    payload = FeeQuoteService.as_dict(quote)

    for key in (
        "quote_id",
        "application_id",
        "configuration_version",
        "fee_configuration_version",
        "base_amount",
        "provider_fee",
        "total_amount",
        "currency",
        "bearer",
        "residency_category",
        "waiver_applied",
        "status",
        "expires_at",
        "signature",
        "signature_version",
    ):
        assert key in payload, f"missing {key} on the quote wire shape"

    # Amounts are strings so no client loses precision, and the total is present
    # so no client has to add anything up.
    assert payload["base_amount"] == "300.00"
    assert payload["total_amount"] == str(quote.total_amount)
    assert isinstance(payload["provider_fee"], str)


# ---------------------------------------------------------------------------
# 6. The database enforces the money invariants, not just the service
# ---------------------------------------------------------------------------
#
# Two kinds of invariant live in
# ``backend/scripts/2026_07_30_01_payment_fee_quotes.sql``:
#
#   * partial UNIQUE indexes (one live quote per application/fee type, one quote
#     per payment) — vendor-neutral, mirrored onto the ephemeral test DB by
#     ``tests/conftest.py::unmanaged_schema`` on both SQLite and Postgres, so the
#     tests below run everywhere;
#   * money CHECK constraints (total = base + provider fee, merchant-borne fee is
#     never charged, redeemed implies a bound payment) — SQLite cannot add a CHECK
#     to an existing table, so these are asserted against real Postgres only,
#     matching the existing convention in
#     ``tests/unit/test_integrity_constraints_3_3.py``. They are proven on
#     Postgres in ``docs/v2-evidence/8.1/``.


pg_only = pytest.mark.skipif(
    connection.vendor != "postgresql",
    reason=(
        "payment_fee_quotes money CHECK constraints are Postgres DDL; active "
        f"backend is {connection.vendor!r}."
    ),
)


def _raw_quote_kwargs(application, **overrides):
    now = timezone.now()
    values = {
        "id": uuid.uuid4(),
        "application_id": application.id,
        "residency_category": "local",
        "fee_configuration_version": "fp-test",
        "base_amount": Decimal("300.00"),
        "provider_fee": Decimal("3.00"),
        "total_amount": Decimal("303.00"),
        "currency": "ZMW",
        "bearer": "customer",
        "status": QUOTE_ACTIVE,
        "expires_at": now + timezone.timedelta(minutes=30),
        "signature": "a" * 64,
        "signature_version": 1,
        "created_at": now,
        "updated_at": now,
    }
    values.update(overrides)
    return values


@pg_only
@pytest.mark.django_db
def test_database_refuses_a_total_that_does_not_add_up():
    """chk_payment_fee_quotes_total_is_sum — no caller can persist bad arithmetic."""
    from django.db import IntegrityError, transaction

    world = _world_with_fee()

    with pytest.raises(IntegrityError):
        with transaction.atomic():
            FeeQuote.objects.create(
                **_raw_quote_kwargs(world.application, total_amount=Decimal("999.00"))
            )


@pg_only
@pytest.mark.django_db
def test_database_refuses_a_merchant_borne_fee_charged_to_the_customer():
    from django.db import IntegrityError, transaction

    world = _world_with_fee()

    with pytest.raises(IntegrityError):
        with transaction.atomic():
            FeeQuote.objects.create(
                **_raw_quote_kwargs(world.application, bearer="merchant")
            )


@pg_only
@pytest.mark.django_db
def test_database_refuses_an_untimestamped_redeemed_quote():
    """chk_payment_fee_quotes_redeemed_binding — 'redeemed' is never a bare label."""
    from django.db import IntegrityError, transaction

    world = _world_with_fee()

    with pytest.raises(IntegrityError):
        with transaction.atomic():
            FeeQuote.objects.create(
                **_raw_quote_kwargs(world.application, status=QUOTE_REDEEMED)
            )


@pg_only
@pytest.mark.django_db
def test_database_refuses_an_unredeemed_quote_that_claims_a_payment():
    """The other half of the binding: only a redeemed quote may name a payment."""
    from django.db import IntegrityError, transaction

    world = _world_with_fee()
    payment = _payment_for(world.application, Decimal("300.00"))

    with pytest.raises(IntegrityError):
        with transaction.atomic():
            FeeQuote.objects.create(
                **_raw_quote_kwargs(
                    world.application, status=QUOTE_ACTIVE, payment_id=payment.id
                )
            )


@pytest.mark.django_db
def test_deleting_the_funded_payment_leaves_the_quote_as_spent_evidence():
    """``payment_id`` is ON DELETE SET NULL — the quote survives, still spent.

    Removing a Payment row must not be impossible (nothing about a quote should
    block the payment lifecycle) and must not resurrect the quote: single-use is
    carried by ``status``/``redeemed_at``, not by the payment binding. The quote
    row remains as the record of what the student was asked to pay.
    """
    world = _world_with_fee()
    service = FeeQuoteService()
    quote = service.create_quote(world.application)
    payment = _payment_for(world.application, Decimal("300.00"))
    service.redeem(
        quote_id=quote.id, application=world.application, payment_id=payment.id
    )

    Payment.objects.filter(id=payment.id).delete()

    orphaned = FeeQuote.objects.get(id=quote.id)
    assert orphaned.payment_id is None
    assert orphaned.status == QUOTE_REDEEMED
    assert orphaned.redeemed_at is not None
    # Still unusable: a spent quote cannot fund a replacement payment.
    replacement = _payment_for(world.application, Decimal("300.00"))
    with pytest.raises(QuoteAlreadyRedeemedError):
        service.redeem(
            quote_id=quote.id,
            application=world.application,
            payment_id=replacement.id,
        )


@pytest.mark.django_db
def test_database_allows_only_one_live_quote_per_application_and_fee_type():
    """uq_payment_fee_quotes_one_active — two contradictory live prices cannot exist."""
    from django.db import IntegrityError, transaction

    world = _world_with_fee()
    FeeQuoteService().create_quote(world.application)

    with pytest.raises(IntegrityError):
        with transaction.atomic():
            FeeQuote.objects.create(**_raw_quote_kwargs(world.application))


@pytest.mark.django_db
def test_database_allows_only_one_quote_per_payment():
    """uq_payment_fee_quotes_payment — a payment cannot be funded twice over."""
    from django.db import IntegrityError, transaction

    world = _world_with_fee()
    service = FeeQuoteService()
    quote = service.create_quote(world.application)
    payment = _payment_for(world.application, Decimal("300.00"))
    service.redeem(
        quote_id=quote.id, application=world.application, payment_id=payment.id
    )

    with pytest.raises(IntegrityError):
        with transaction.atomic():
            FeeQuote.objects.create(
                **_raw_quote_kwargs(
                    world.application,
                    status=QUOTE_REDEEMED,
                    payment_id=payment.id,
                    redeemed_at=timezone.now(),
                    fee_type="application",
                    # A different fee_type keeps the one-active index out of the
                    # way, so the failure can only come from the payment index.
                )
            )
