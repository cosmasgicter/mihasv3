"""Regression test for the mobile-money retry reference refresh.

Production bug (seen in deploy logs 2026-05-29): a student who retried mobile
money got "initiate: reusing active payment ..." immediately followed by
"Lenco rejected ..." and a 400. Lenco rejects a repeat collection that reuses
a reference it has already seen. The fix mints a fresh transaction_reference
on a retry against an already-sent pending payment, and persists it so the
webhook/verify join key (Payment.transaction_reference) stays consistent.

These tests pin ``PaymentService._refresh_reference_for_retry`` directly so
the behaviour cannot silently regress.
"""

import uuid
from decimal import Decimal

import pytest
from django.utils import timezone


@pytest.fixture
def seed_payment(db):
    from apps.accounts.models import Profile
    from apps.applications.models import Application
    from apps.documents.models import Payment

    now = timezone.now()
    profile = Profile.objects.create(
        id=uuid.uuid4(),
        email=f"retry-{uuid.uuid4().hex[:8]}@example.com",
        first_name="Retry",
        last_name="Student",
        role="student",
        is_active=True,
        created_at=now,
        updated_at=now,
    )
    application = Application.objects.create(
        id=uuid.uuid4(),
        application_number=f"APP-{now:%Y%m%d}-{uuid.uuid4().hex[:8].upper()}",
        user=profile,
        full_name="Retry Student",
        date_of_birth=now.date().replace(year=2000),
        sex="Male",
        phone="+260977000000",
        email=profile.email,
        residence_town="Lusaka",
        nationality="Zambian",
        country="Zambia",
        program="Retry Test Program",
        intake="January 2025",
        institution="MIHAS",
        status="submitted",
        payment_status="pending",
        version=1,
        created_at=now,
        updated_at=now,
    )
    original_reference = f"MIHAS-{application.application_number}-{int(now.timestamp() * 1000)}"
    payment = Payment.objects.create(
        id=uuid.uuid4(),
        application=application,
        user=profile,
        amount=Decimal("153.00"),
        currency="ZMW",
        status="pending",
        transaction_reference=original_reference,
        metadata={},
        created_at=now,
        updated_at=now,
    )
    return {
        "application": application,
        "payment": payment,
        "original_reference": original_reference,
    }


@pytest.mark.django_db
def test_refresh_reference_skips_first_attempt(seed_payment):
    """No provider_initiation yet -> reference must NOT change (first attempt)."""
    from apps.documents.models import Payment
    from apps.documents.payment_service import PaymentService

    payment = seed_payment["payment"]
    application = seed_payment["application"]

    result = PaymentService()._refresh_reference_for_retry(payment.id, application.id)

    assert result is None
    payment.refresh_from_db()
    assert payment.transaction_reference == seed_payment["original_reference"]


@pytest.mark.django_db
def test_refresh_reference_mints_new_on_retry(seed_payment):
    """provider_initiation present -> a fresh reference is minted and persisted."""
    from apps.documents.models import Payment
    from apps.documents.payment_service import PaymentService

    payment = seed_payment["payment"]
    application = seed_payment["application"]

    # Simulate a prior provider attempt on this row (what "reuse" implies).
    payment.metadata = {"provider_initiation": {"status": "rejected"}}
    payment.save(update_fields=["metadata"])

    result = PaymentService()._refresh_reference_for_retry(payment.id, application.id)

    assert result is not None
    assert result != seed_payment["original_reference"]
    assert result.startswith(f"MIHAS-{application.application_number}-")

    payment.refresh_from_db()
    assert payment.transaction_reference == result
