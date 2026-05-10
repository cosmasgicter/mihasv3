"""Unit tests — out-of-order webhook safety (Task 25.3).

End-to-end replay of the three ``collection.*`` webhook variants for a
single Payment, in a deliberately out-of-order sequence:

    collection.settled → collection.successful → collection.failed

Invariants (R9.1, R9.2, R9.3, R9.4):

* ``collection.settled`` updates ``metadata.settlement`` only — it does
  NOT change Payment status (R9.2).
* ``collection.successful`` runs the integrity gate and transitions
  ``pending → successful`` (R9.3 via ``_transition``).
* A late ``collection.failed`` arriving after the row is already
  ``successful`` MUST be ignored, leaving the row ``successful`` and
  emitting a ``payment.late_failed_webhook_ignored`` audit event (R9.1).

Settings applied:
* ``PAYMENT_HARDENING_FORWARD_ONLY=True`` — route every mutation through
  ``PaymentService._transition``.
* ``PAYMENT_HARDENING_WEBHOOK_DEDUP_STRICT=True`` — use the strict dedup
  path when a webhook is replayed through the HTTP surface (harmless
  here because we call ``apply_webhook_event`` directly).

Validates: Requirements R9.1, R9.2, R9.3, R9.4
"""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
from django.test import override_settings
from django.utils import timezone


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def seed_pending_payment(db):
    """Seed a student Profile + Application + pending Payment with snapshot."""
    from apps.accounts.models import Profile
    from apps.applications.models import Application
    from apps.documents.models import Payment

    now = timezone.now()

    profile = Profile.objects.create(
        id=uuid.uuid4(),
        email=f"ooo-{uuid.uuid4().hex[:8]}@example.com",
        first_name="OutOf",
        last_name="Order",
        role="student",
        is_active=True,
        created_at=now,
        updated_at=now,
    )

    application = Application.objects.create(
        id=uuid.uuid4(),
        application_number=f"APP-{now:%Y%m%d}-{uuid.uuid4().hex[:8].upper()}",
        user=profile,
        full_name="OutOfOrder Student",
        date_of_birth=now.date().replace(year=2000),
        sex="Male",
        phone="+260977000000",
        email=profile.email,
        residence_town="Lusaka",
        nationality="Zambian",
        country="Zambia",
        program="OOO Program",
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
        metadata={
            "snapshot": {
                "expected_amount": "153.00",
                "currency": "ZMW",
                "residency_category": "local",
                "program_code": "OOO",
                "intake_id": None,
                "waiver_applied": False,
                "original_amount": "153.00",
                "fee_source": "program_fee",
            },
        },
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
# End-to-end out-of-order replay
# ===========================================================================


@pytest.mark.django_db(transaction=True)
@override_settings(
    PAYMENT_HARDENING_FORWARD_ONLY=True,
    PAYMENT_HARDENING_WEBHOOK_DEDUP_STRICT=True,
)
def test_out_of_order_webhook_sequence_keeps_successful(seed_pending_payment):
    """settled → successful → failed replay ends with ``successful``.

    Also asserts:
      - settled leaves status ``pending`` and merges ``metadata.settlement``.
      - failed (late) writes a ``payment.late_failed_webhook_ignored`` audit.

    Validates: Requirements R9.1, R9.2, R9.3, R9.4
    """
    from apps.common.models import AuditLog
    from apps.documents.payment_service import PaymentService

    payment = seed_pending_payment["payment"]
    reference = seed_pending_payment["reference"]
    svc = PaymentService()

    # --- Event 1: collection.settled (out of order — arrives first) ---
    settled_payload = {
        "data": {
            "reference": reference,
            "amount": "153.00",
            "currency": "ZMW",
            "lencoReference": "LR-SETTLED",
            "settlement": {"batchId": "BATCH-1", "settledAt": "2025-01-10"},
        }
    }
    svc.apply_webhook_event(
        "collection.settled", reference, settled_payload
    )

    payment.refresh_from_db()
    assert payment.status == "pending", (
        "collection.settled must NOT change Payment status (R9.2); "
        f"got {payment.status!r}."
    )
    assert (payment.metadata or {}).get("settlement") is not None, (
        "collection.settled must merge ``metadata.settlement`` (R9.2)."
    )

    # --- Event 2: collection.successful — now it transitions ---
    success_payload = {
        "data": {
            "reference": reference,
            "amount": "153.00",
            "currency": "ZMW",
            "lencoReference": "LR-SUCCESS",
            "type": "mobile_money",
        }
    }
    svc.apply_webhook_event(
        "collection.successful", reference, success_payload
    )

    payment.refresh_from_db()
    assert payment.status == "successful", (
        "collection.successful with matching amount/currency/reference must "
        f"transition pending → successful (R9.3); got {payment.status!r}."
    )

    # --- Event 3: collection.failed (late, should be ignored) ---
    failed_payload = {
        "data": {
            "reference": reference,
            "reasonForFailure": "Late failed after successful",
        }
    }
    svc.apply_webhook_event(
        "collection.failed", reference, failed_payload
    )

    payment.refresh_from_db()
    assert payment.status == "successful", (
        "Late collection.failed webhook must NOT reverse a successful "
        f"payment (R9.1); got {payment.status!r}."
    )

    # --- Audit: payment.late_failed_webhook_ignored row exists ---
    late_ignored = list(
        AuditLog.objects.filter(
            entity_type="payment",
            entity_id=payment.id,
            action="payment.late_failed_webhook_ignored",
        )
    )
    assert len(late_ignored) == 1, (
        "Expected exactly one ``payment.late_failed_webhook_ignored`` audit "
        f"row; got {len(late_ignored)} for payment {payment.id}."
    )
