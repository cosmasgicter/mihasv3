"""Property-based tests for payment initiation creating a complete record.

# Feature: lenco-payment-integration, Property 2: Payment initiation creates a complete record

For any valid application and fee configuration, initiating a payment creates a
Payment row with status ``pending``, the server-resolved amount and currency, a
non-empty transaction reference, the application foreign key set, and the fee
context in metadata.

admissions-v2 task 8.2 rewrote this module. It previously drove the deleted
``PaymentService.initiate_payment`` through five near-identical mock fortresses;
the mocks asserted the arguments passed to ``Payment.objects.create`` rather than
what ended up in the database. It now exercises the one surviving initiation path
(``PaymentService.initiate``) against a real database, so the assertions cover
the row that was actually written — including the task 8.1 fee-quote binding that
funds it.

**Validates: Requirements 2.1, 2.2**
"""

import uuid
from decimal import Decimal

import pytest
from django.utils import timezone
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from apps.documents.models import Payment, ProgramFee
from apps.documents.payment_service import PaymentService
from tests.tenant_fixtures import build_tenant_world

# ---------------------------------------------------------------------------
# Strategies — constrained to the real input space
# ---------------------------------------------------------------------------

# Fee amounts a school can actually configure: positive, 2 decimal places, and
# within the ``numeric(10,2)`` column.
fee_amounts = st.decimals(
    min_value=Decimal("1.00"),
    max_value=Decimal("99999.99"),
    places=2,
    allow_nan=False,
    allow_infinity=False,
)

residency_categories = st.sampled_from(["local", "international"])


def _configure_fee(offering, *, amount: Decimal, residency: str) -> ProgramFee:
    now = timezone.now()
    return ProgramFee.objects.create(
        id=uuid.uuid4(),
        program=offering,
        fee_type="application",
        residency_category=residency,
        amount=amount,
        currency="ZMW",
        is_active=True,
        created_at=now,
        updated_at=now,
    )


# ---------------------------------------------------------------------------
# Property 2 — initiation creates a complete record
# ---------------------------------------------------------------------------


@pytest.mark.django_db(transaction=True)
@given(fee_amount=fee_amounts, residency=residency_categories)
@settings(
    max_examples=5,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture],
)
def test_initiation_writes_a_complete_pending_payment(fee_amount, residency):
    """Whatever the configured fee, the persisted row is complete and pending.

    Completeness here means every field a later stage depends on: the status the
    state machine starts from, the amount and currency the provider will be
    asked for, the reference reconciliation joins on, the application the money
    belongs to, and the fee context that explains the number.

    **Validates: Requirements 2.1, 2.2**
    """
    world = build_tenant_world(application_status="submitted")
    if residency == "international":
        # The fixture's applicant is Zambian; residency is derived from the
        # application, so change the application rather than assume the resolver
        # can be told what to think.
        world.application.nationality = "Kenyan"
        world.application.country = "Kenya"
        world.application.save(update_fields=["nationality", "country"])
    _configure_fee(world.offering, amount=fee_amount, residency=residency)

    result = PaymentService().initiate(world.application.id, world.student.id)

    assert result.payment_id is not None, "Initiation must return the new payment id."
    payment = Payment.objects.get(id=result.payment_id)

    assert payment.status == "pending"
    assert payment.amount == fee_amount
    assert payment.currency == "ZMW"
    assert payment.transaction_reference, "The reference must be non-empty."
    assert payment.application_id == world.application.id
    assert payment.user_id == world.student.id

    metadata = payment.metadata or {}
    assert metadata.get("residency_category") == residency
    assert metadata.get("fee_source"), "The fee's provenance must be recorded."
    assert metadata.get("snapshot"), (
        "The immutable amount snapshot must be written at creation — the "
        "integrity gate compares provider answers against it."
    )
    assert metadata.get("fee_quote"), (
        "A payment must be funded by a server-authored quote (task 8.1, R12.1)."
    )

    # The returned result and the row agree — a caller cannot be shown one
    # amount while another is persisted.
    assert result.amount == payment.amount
    assert result.currency == payment.currency
    assert result.reference == payment.transaction_reference
