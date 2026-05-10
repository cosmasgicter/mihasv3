"""Unit tests — webhook unknown event type is logged, not mutating
(Task 25.5).

R8.7: when ``event_type`` is outside the known set
(``collection.successful``, ``collection.failed``, ``collection.settled``),
``WebhookProcessor`` writes a ``WebhookEventLog`` row with
``processed=True`` and ``processing_error='Unrecognised event type'``,
and does NOT mutate any Payment row.

This test exercises the strict processing path
(``PAYMENT_HARDENING_WEBHOOK_DEDUP_STRICT=True``) because that is where
the exact ``processing_error`` string is standardised. The legacy path
uses a different message (``'Unrecognised event type: ...'``) and is
preserved for backward compatibility, but new behaviour is pinned to
the strict path.

Validates: Requirements R8.7
"""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
from django.test import override_settings
from django.utils import timezone


# ---------------------------------------------------------------------------
# Fixture — a pending Payment we can observe to prove no mutation occurs.
# ---------------------------------------------------------------------------


@pytest.fixture
def seed_pending_payment(db):
    from apps.accounts.models import Profile
    from apps.applications.models import Application
    from apps.documents.models import Payment

    now = timezone.now()

    profile = Profile.objects.create(
        id=uuid.uuid4(),
        email=f"unknown-{uuid.uuid4().hex[:8]}@example.com",
        first_name="Unknown",
        last_name="Event",
        role="student",
        is_active=True,
        created_at=now,
        updated_at=now,
    )

    application = Application.objects.create(
        id=uuid.uuid4(),
        application_number=f"APP-{now:%Y%m%d}-{uuid.uuid4().hex[:8].upper()}",
        user=profile,
        full_name="Unknown Event Student",
        date_of_birth=now.date().replace(year=2000),
        sex="Male",
        phone="+260977000000",
        email=profile.email,
        residence_town="Lusaka",
        nationality="Zambian",
        country="Zambia",
        program="Unknown Program",
        intake="January 2025",
        institution="MIHAS",
        status="submitted",
        payment_status="pending_review",
        version=1,
        created_at=now,
        updated_at=now,
    )

    reference = f"MIHAS-{application.application_number}-{uuid.uuid4().hex[:12]}"
    payment = Payment.objects.create(
        id=uuid.uuid4(),
        application=application,
        user=profile,
        amount=Decimal("153.00"),
        currency="ZMW",
        status="pending",
        transaction_reference=reference,
        metadata={},
        created_at=now,
        updated_at=now,
    )
    return {
        "profile": profile,
        "application": application,
        "payment": payment,
        "reference": reference,
    }


# ===========================================================================
# Unknown event type: logged (processed=True), no Payment mutation
# ===========================================================================


@pytest.mark.django_db(transaction=True)
@override_settings(PAYMENT_HARDENING_WEBHOOK_DEDUP_STRICT=True)
def test_unknown_event_type_logged_but_not_mutating(seed_pending_payment):
    """``collection.cancelled`` (unknown) → log + skip, no Payment mutation.

    Validates: Requirements R8.7
    """
    from apps.documents.models import Payment, WebhookEventLog
    from apps.documents.webhook_processor import WebhookProcessor

    payment = seed_pending_payment["payment"]
    reference = seed_pending_payment["reference"]
    original_status = payment.status

    payload = {"data": {"reference": reference}}

    WebhookProcessor().process(
        "collection.cancelled", payload, signature_valid=True
    )

    # 1. WebhookEventLog row for the unknown event type.
    logs = list(
        WebhookEventLog.objects.filter(event_type="collection.cancelled")
    )
    assert len(logs) == 1, (
        "Expected exactly one ``WebhookEventLog`` row for "
        f"``collection.cancelled``; got {len(logs)}."
    )
    log = logs[0]
    assert log.processed is True, (
        "Unknown event types must be marked ``processed=True`` (R8.7); "
        f"got processed={log.processed}."
    )
    assert log.processing_error == "Unrecognised event type", (
        "Expected ``processing_error='Unrecognised event type'``; "
        f"got {log.processing_error!r}."
    )

    # 2. Payment was not mutated.
    fresh = Payment.objects.get(pk=payment.pk)
    assert fresh.status == original_status, (
        "Unknown webhook event types must not mutate Payment status; "
        f"expected {original_status!r}, got {fresh.status!r}."
    )
