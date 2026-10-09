"""Property-based tests for webhook processing idempotency.

# Feature: lenco-payment-integration, Property 5: Webhook processing idempotency

For any valid webhook event, delivering it N times (N >= 1) produces the same
Payment state as delivering it exactly once — no double-credit, no extra
receipt, no status flapping, and no drift in the derived application summary.

admissions-v2 task 8.2 rewrote this module. It previously drove the deleted
``process_webhook_event`` through mocked querysets, which meant "idempotent" was
asserted about a MagicMock's attributes rather than about the database. It now
replays the real callback path (``PaymentService.apply_webhook_event``) against a
real database and compares full row snapshots, so a second delivery that changed
*anything* — status, amount, receipt, or the application projection — fails.

**Validates: Requirements 4.8, R12.5**
"""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
from django.utils import timezone
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

# ---------------------------------------------------------------------------
# Strategies — the delivery counts and event types that actually occur
# ---------------------------------------------------------------------------

# Lenco retries a callback it believes was not acknowledged. Two to four
# deliveries is the realistic range; the property must hold for any of them.
delivery_counts = st.integers(min_value=2, max_value=4)

status_changing_events = st.sampled_from(
    ["collection.successful", "collection.failed"]
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _seed_pending_payment():
    """A submitted application with one pending, snapshot-bearing payment."""
    from apps.accounts.models import Profile
    from apps.applications.models import Application
    from apps.documents.models import Payment

    now = timezone.now()
    token = uuid.uuid4().hex[:8]

    profile = Profile.objects.create(
        id=uuid.uuid4(),
        email=f"replay-{token}@example.com",
        first_name="Replay",
        last_name="Probe",
        role="student",
        is_active=True,
        created_at=now,
        updated_at=now,
    )
    application = Application.objects.create(
        id=uuid.uuid4(),
        application_number=f"APP-{now:%Y%m%d}-{token.upper()}",
        user=profile,
        full_name="Replay Probe",
        date_of_birth=now.date().replace(year=2000),
        sex="Male",
        phone="+260977000000",
        email=profile.email,
        residence_town="Lusaka",
        nationality="Zambian",
        country="Zambia",
        program="Replay Program",
        intake="January 2025",
        institution="MIHAS",
        status="submitted",
        payment_status="pending_review",
        version=1,
        created_at=now,
        updated_at=now,
    )
    reference = f"BNL-{application.application_number}-{uuid.uuid4().hex[:12]}"
    payment = Payment.objects.create(
        id=uuid.uuid4(),
        application=application,
        user=profile,
        amount=Decimal("153.00"),
        currency="ZMW",
        status="pending",
        transaction_reference=reference,
        metadata={
            "snapshot": {
                "expected_amount": "153.00",
                "currency": "ZMW",
                "residency_category": "local",
                "program_code": "RPL",
                "intake_id": None,
                "waiver_applied": False,
                "original_amount": "153.00",
                "fee_source": "program_fee",
            },
        },
        created_at=now,
        updated_at=now,
    )
    return application, payment, reference


def _payload(event_type: str, reference: str) -> dict:
    data = {
        "id": f"evt-{uuid.uuid4().hex[:10]}",
        "reference": reference,
        "amount": "153.00",
        "currency": "ZMW",
        "lencoReference": "LR-REPLAY",
        "type": "mobile-money",
    }
    if event_type == "collection.failed":
        data["reasonForFailure"] = "Insufficient balance"
    if event_type == "collection.settled":
        data["settlement"] = {"batchId": "BATCH-REPLAY", "settledAt": "2025-01-10"}
    return {"data": data}


def _material_state(payment_id, application_id) -> tuple:
    """Everything a replay must not change."""
    from apps.applications.models import Application
    from apps.documents.models import Payment

    row = Payment.objects.filter(id=payment_id).values(
        "status",
        "amount",
        "currency",
        "lenco_reference",
        "payment_method",
        "fee",
        "bearer",
        "notes",
        "receipt_number",
    ).first()
    app_status = (
        Application.objects.filter(id=application_id)
        .values_list("payment_status", flat=True)
        .first()
    )
    return (row, app_status)


# ===========================================================================
# Property 5 — N deliveries produce the state of exactly one delivery
# ===========================================================================


@pytest.mark.django_db(transaction=True)
@given(event_type=status_changing_events, deliveries=delivery_counts)
@settings(
    max_examples=6,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture],
)
def test_processing_n_times_equals_processing_once(event_type, deliveries):
    """The state after N deliveries equals the state after the first.

    **Validates: Requirements 4.8, R12.5**
    """
    from apps.documents.payment_service import PaymentService

    application, payment, reference = _seed_pending_payment()
    payload = _payload(event_type, reference)
    service = PaymentService()

    service.apply_webhook_event(event_type, reference, payload)
    after_first = _material_state(payment.id, application.id)

    for _ in range(deliveries - 1):
        service.apply_webhook_event(event_type, reference, payload)

    after_n = _material_state(payment.id, application.id)
    assert after_n == after_first, (
        f"{deliveries} deliveries of {event_type} diverged from one delivery.\n"
        f"  after 1 = {after_first}\n  after {deliveries} = {after_n}"
    )


@pytest.mark.django_db(transaction=True)
@given(deliveries=delivery_counts)
@settings(
    max_examples=4,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture],
)
def test_settled_event_idempotent_metadata(deliveries):
    """A replayed settlement event converges on the same metadata and status.

    **Validates: Requirements 4.8, R12.5**
    """
    from apps.documents.models import Payment
    from apps.documents.payment_service import PaymentService

    application, payment, reference = _seed_pending_payment()
    payload = _payload("collection.settled", reference)
    service = PaymentService()

    service.apply_webhook_event("collection.settled", reference, payload)
    first_settlement = (
        Payment.objects.filter(id=payment.id)
        .values_list("metadata", flat=True)
        .first()
        or {}
    ).get("settlement")
    after_first = _material_state(payment.id, application.id)

    for _ in range(deliveries - 1):
        service.apply_webhook_event("collection.settled", reference, payload)

    latest_settlement = (
        Payment.objects.filter(id=payment.id)
        .values_list("metadata", flat=True)
        .first()
        or {}
    ).get("settlement")

    assert latest_settlement == first_settlement, (
        "A replayed settlement event must not accumulate or mutate "
        f"``metadata.settlement``; {first_settlement!r} became {latest_settlement!r}."
    )
    assert _material_state(payment.id, application.id) == after_first, (
        "A settlement event must never change payment status or the derived "
        "application summary (R9.2)."
    )


@pytest.mark.django_db(transaction=True)
def test_receipt_is_allocated_once_across_replays():
    """A replayed success does not mint a second receipt number.

    **Validates: Requirements 4.8, R12.5**
    """
    from apps.documents.models import Payment
    from apps.documents.payment_service import PaymentService

    application, payment, reference = _seed_pending_payment()
    payload = _payload("collection.successful", reference)
    service = PaymentService()

    service.apply_webhook_event("collection.successful", reference, payload)
    first_receipt = (
        Payment.objects.filter(id=payment.id)
        .values_list("receipt_number", flat=True)
        .first()
    )
    assert first_receipt, "A successful payment must be given a receipt number."

    for _ in range(3):
        service.apply_webhook_event("collection.successful", reference, payload)

    assert (
        Payment.objects.filter(id=payment.id)
        .values_list("receipt_number", flat=True)
        .first()
        == first_receipt
    )
    assert Payment.objects.filter(application_id=application.id).count() == 1, (
        "A replayed callback must never create an additional payment row."
    )
