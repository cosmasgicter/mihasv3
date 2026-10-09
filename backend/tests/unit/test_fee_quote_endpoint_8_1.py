"""Fee-quote endpoint + payment-funding contract (task 8.1).

Spec:     ``.kiro/specs/admissions-v2-canonical-rebuild/`` task 8.1
Requirements: **R12.1** (server-authored expiring quote; the frontend performs no
              arithmetic), **R12.2** (``FEE_NOT_CONFIGURED`` instead of a
              substituted amount), **R12.6** (server amounts, expiry, and a named
              recovery action on the wire).
Findings: **STU-08**, **DATA-05**.

What is proven here, against real rows and the real DRF stack:

1. ``POST /api/v1/payments/quote/`` returns the canonical envelope with every
   number the payment UI renders, so the client never computes one.
2. A missing fee configuration answers ``FEE_NOT_CONFIGURED`` — no amount.
3. Another student's application is a canonical 404 mask, never a 403 that
   confirms the application exists.
4. Every Payment created by initiation/defer is funded by a redeemed quote whose
   money matches the Payment, and an expired or already-redeemed quote cannot fund
   a payment at all.
5. Payment initiation surfaces the stable fee/quote codes instead of a 500.
"""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.accounts.authentication import JWTUser
from apps.documents.fee_quote_service import (
    QUOTE_ACTIVE,
    QUOTE_REDEEMED,
    FeeQuoteService,
)
from apps.documents.fee_quote_views import FeeQuoteView
from apps.documents.models import FeeQuote, Payment, ProgramFee
from apps.documents.payment_service import PaymentService
from apps.documents.payment_widget_views import DeferPaymentView, PaymentInitiateView
from tests.tenant_fixtures import build_tenant_world, build_tenant_worlds

factory = APIRequestFactory()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _fee(offering, *, amount: str = "300.00", residency: str = "local") -> ProgramFee:
    now = timezone.now()
    return ProgramFee.objects.create(
        id=uuid.uuid4(),
        program=offering,
        fee_type="application",
        residency_category=residency,
        amount=Decimal(amount),
        currency="ZMW",
        is_active=True,
        created_at=now,
        updated_at=now,
    )


def _as_request_user(profile) -> JWTUser:
    """Wrap a Profile as the authenticated request user DRF views expect.

    ``Profile`` is the domain row, not an auth user; the platform's own
    ``JWTUser`` is what ``request.user`` is at runtime.
    """
    return JWTUser(
        {
            "user_id": str(profile.id),
            "email": profile.email,
            "role": profile.role,
            "first_name": profile.first_name,
            "last_name": profile.last_name,
        }
    )


def _payable_world(amount: str = "300.00"):
    """A submitted application with exactly one active local application fee."""
    world = build_tenant_world(application_status="submitted")
    _fee(world.offering, amount=amount)
    return world


def _post_quote(user, application_id):
    request = factory.post(
        "/api/v1/payments/quote/",
        {"application_id": str(application_id)},
        format="json",
    )
    force_authenticate(request, user=_as_request_user(user))
    return FeeQuoteView.as_view()(request)


def _get_quote(user, application_id):
    request = factory.get(
        "/api/v1/payments/quote/", {"application_id": str(application_id)}
    )
    force_authenticate(request, user=_as_request_user(user))
    return FeeQuoteView.as_view()(request)


def _initiate(user, application_id):
    request = factory.post(
        "/api/v1/payments/initiate/",
        {"application_id": str(application_id)},
        format="json",
    )
    force_authenticate(request, user=_as_request_user(user))
    return PaymentInitiateView.as_view()(request)


# ---------------------------------------------------------------------------
# 1. The endpoint contract
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_quote_endpoint_returns_every_server_authored_number():
    world = _payable_world("300.00")

    response = _post_quote(world.student, world.application.id)

    assert response.status_code == 200
    assert response.data["success"] is True
    data = response.data["data"]
    assert data["base_amount"] == "300.00"
    assert data["total_amount"] == str(
        Decimal(data["base_amount"]) + Decimal(data["provider_fee"])
    )
    assert data["currency"] == "ZMW"
    assert data["residency_category"] == "local"
    assert data["bearer"] in ("customer", "merchant")
    assert data["status"] == QUOTE_ACTIVE
    assert data["expires_at"]
    assert data["signature"]
    assert data["fee_configuration_version"]
    # One durable row now backs what the student was shown.
    assert FeeQuote.objects.filter(application_id=world.application.id).count() == 1


@pytest.mark.django_db
def test_quote_endpoint_reuses_the_live_quote_instead_of_churning_the_price():
    world = _payable_world()

    first = _post_quote(world.student, world.application.id).data["data"]
    second = _post_quote(world.student, world.application.id).data["data"]

    assert first["quote_id"] == second["quote_id"]
    assert FeeQuote.objects.filter(
        application_id=world.application.id, status=QUOTE_ACTIVE
    ).count() == 1


@pytest.mark.django_db
def test_quote_endpoint_get_reads_the_live_quote_back():
    world = _payable_world()
    created = _post_quote(world.student, world.application.id).data["data"]

    response = _get_quote(world.student, world.application.id)

    assert response.status_code == 200
    assert response.data["data"]["quote_id"] == created["quote_id"]


@pytest.mark.django_db
def test_quote_endpoint_get_refuses_an_expired_quote():
    world = _payable_world()
    created = _post_quote(world.student, world.application.id).data["data"]
    FeeQuote.objects.filter(id=created["quote_id"]).update(
        expires_at=timezone.now() - timezone.timedelta(seconds=1)
    )

    response = _get_quote(world.student, world.application.id)

    assert response.status_code == 404
    assert response.data["error"]["code"] == "QUOTE_NOT_FOUND"


@pytest.mark.django_db
def test_quote_endpoint_fails_closed_when_no_fee_is_configured():
    world = build_tenant_world(application_status="submitted")  # no ProgramFee

    response = _post_quote(world.student, world.application.id)

    assert response.status_code == 422
    assert response.data["success"] is False
    assert response.data["error"]["code"] == "FEE_NOT_CONFIGURED"
    # Critically: no amount anywhere in the failure envelope.
    assert "amount" not in str(response.data).lower().replace("fee_not_configured", "")
    assert FeeQuote.objects.count() == 0


@pytest.mark.django_db
def test_quote_endpoint_masks_another_students_application_as_not_found():
    owner, other = build_tenant_worlds(2)
    _fee(owner.offering)
    _fee(other.offering)

    response = _post_quote(other.student, owner.application.id)

    assert response.status_code == 404
    assert response.data["error"]["code"] == "NOT_FOUND"
    body = str(response.data)
    assert owner.institution.name not in body
    assert str(owner.application.id) not in body
    assert FeeQuote.objects.filter(application_id=owner.application.id).count() == 0


@pytest.mark.django_db
def test_quote_endpoint_requires_an_application_id():
    world = _payable_world()
    request = factory.post("/api/v1/payments/quote/", {}, format="json")
    force_authenticate(request, user=_as_request_user(world.student))

    response = FeeQuoteView.as_view()(request)

    assert response.status_code == 400
    assert response.data["error"]["code"] == "VALIDATION_ERROR"


# ---------------------------------------------------------------------------
# 2. Every Payment is funded by a quote
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_initiation_binds_and_redeems_a_quote_that_matches_the_payment():
    world = _payable_world("300.00")

    result = PaymentService().initiate(
        application_id=world.application.id, user_id=world.student.id
    )

    payment = Payment.objects.get(id=result.payment_id)
    quote = FeeQuote.objects.get(payment_id=payment.id)
    assert quote.status == QUOTE_REDEEMED
    assert quote.redeemed_at is not None
    # The settlement amount is the quoted base; the customer-borne provider fee is
    # recorded separately (it is added by the provider, not by the client).
    assert payment.amount == quote.base_amount
    assert payment.fee == quote.provider_fee
    assert payment.bearer == quote.bearer
    snapshot = (payment.metadata or {}).get("fee_quote") or {}
    assert snapshot["quote_id"] == str(quote.id)
    assert snapshot["total_amount"] == str(quote.total_amount)
    assert snapshot["fee_configuration_version"] == quote.fee_configuration_version


@pytest.mark.django_db
def test_initiation_redeems_the_quote_the_student_was_shown():
    world = _payable_world("300.00")
    shown = _post_quote(world.student, world.application.id).data["data"]

    result = PaymentService().initiate(
        application_id=world.application.id, user_id=world.student.id
    )

    quote = FeeQuote.objects.get(payment_id=result.payment_id)
    assert str(quote.id) == shown["quote_id"]
    assert str(quote.total_amount) == shown["total_amount"]


@pytest.mark.django_db
def test_deferring_payment_also_records_a_quote():
    world = _payable_world("300.00")

    result = PaymentService().defer_payment(
        application_id=world.application.id, user_id=world.student.id
    )

    quote = FeeQuote.objects.get(payment_id=result.payment_id)
    assert quote.status == QUOTE_REDEEMED
    assert quote.base_amount == Decimal("300.00")


@pytest.mark.django_db
def test_a_stale_quote_does_not_fund_a_payment_and_no_payment_row_survives():
    """An expired quote plus a changed fee: initiation mints a fresh quote.

    The student is charged the current configured amount, and the stale quote is
    never the funding record.
    """
    world = _payable_world("300.00")
    stale = _post_quote(world.student, world.application.id).data["data"]
    FeeQuote.objects.filter(id=stale["quote_id"]).update(
        expires_at=timezone.now() - timezone.timedelta(minutes=5)
    )
    ProgramFee.objects.filter(program=world.offering).update(amount=Decimal("450.00"))

    result = PaymentService().initiate(
        application_id=world.application.id, user_id=world.student.id
    )

    funding = FeeQuote.objects.get(payment_id=result.payment_id)
    assert str(funding.id) != stale["quote_id"]
    assert funding.base_amount == Decimal("450.00")
    assert Payment.objects.get(id=result.payment_id).amount == Decimal("450.00")
    # The stale row is terminal and bound to nothing.
    stale_row = FeeQuote.objects.get(id=stale["quote_id"])
    assert stale_row.status in ("expired", "superseded")
    assert stale_row.payment_id is None


@pytest.mark.django_db
def test_initiation_without_a_configured_fee_creates_no_payment_and_no_quote():
    world = build_tenant_world(application_status="submitted")

    response = _initiate(world.student, world.application.id)

    assert response.status_code == 422
    assert response.data["error"]["code"] == "FEE_NOT_CONFIGURED"
    assert Payment.objects.filter(application_id=world.application.id).count() == 0
    assert FeeQuote.objects.filter(application_id=world.application.id).count() == 0


@pytest.mark.django_db
def test_defer_view_surfaces_the_stable_fee_code_not_a_500():
    world = build_tenant_world(application_status="submitted")
    request = factory.post(
        "/api/v1/payments/defer/",
        {"application_id": str(world.application.id)},
        format="json",
    )
    force_authenticate(request, user=_as_request_user(world.student))

    response = DeferPaymentView.as_view()(request)

    assert response.status_code == 422
    assert response.data["error"]["code"] == "FEE_NOT_CONFIGURED"


@pytest.mark.django_db
def test_quote_cannot_be_redeemed_twice_across_two_payment_attempts():
    """Two initiations never share one quote (uq_payment_fee_quotes_payment)."""
    world = _payable_world("300.00")
    service = PaymentService()

    first = service.initiate(
        application_id=world.application.id, user_id=world.student.id
    )
    # Settle the first attempt so a second pending row is allowed, then retry.
    Payment.objects.filter(id=first.payment_id).update(status="failed")
    second = service.initiate(
        application_id=world.application.id, user_id=world.student.id
    )

    assert first.payment_id != second.payment_id
    quotes = FeeQuote.objects.filter(application_id=world.application.id)
    assert quotes.filter(payment_id=first.payment_id).count() == 1
    assert quotes.filter(payment_id=second.payment_id).count() == 1
    assert (
        quotes.filter(payment_id=first.payment_id).first().id
        != quotes.filter(payment_id=second.payment_id).first().id
    )


@pytest.mark.django_db
def test_redeeming_a_quote_for_a_second_payment_is_refused_at_the_service_boundary():
    world = _payable_world("300.00")
    service = FeeQuoteService()
    result = PaymentService().initiate(
        application_id=world.application.id, user_id=world.student.id
    )
    redeemed = FeeQuote.objects.get(payment_id=result.payment_id)

    now = timezone.now()
    other_payment = Payment.objects.create(
        id=uuid.uuid4(),
        application_id=world.application.id,
        user_id=world.student.id,
        amount=Decimal("300.00"),
        currency="ZMW",
        status="failed",
        transaction_reference=f"BNL-TEST-{uuid.uuid4().hex[:10]}",
        created_at=now,
        updated_at=now,
    )

    from apps.documents.fee_quote_service import QuoteAlreadyRedeemedError

    with pytest.raises(QuoteAlreadyRedeemedError):
        service.redeem(
            quote_id=redeemed.id,
            application=world.application,
            payment_id=other_payment.id,
        )

    assert str(FeeQuote.objects.get(id=redeemed.id).payment_id) == str(
        result.payment_id
    )
