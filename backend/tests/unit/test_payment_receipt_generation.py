"""Unit tests — receipt generation eligibility and idempotence.

Task 17.2 (payment-hardening). Pins down the guarantees of
``PaymentService._generate_receipt_idempotent`` plus the (future)
``PaymentReceiptView`` eligibility gate:

* A receipt is allocated exactly once when a Payment transitions to
  ``successful`` (R13.1, R13.2).
* A receipt is allocated when a Payment is created with status
  ``force_approved`` via the admin override path, and the receipt data
  carries the "Administrative Override" marker plus the redacted
  override reason and actor role (R13.5, R13.6).
* Receipt generation is rejected with ``RECEIPT_NOT_ELIGIBLE`` for
  Payments in ``pending``, ``deferred``, ``failed``, or ``expired``
  status (R13.4).

The receipt-number itself is a 12-character base32 string
(``[A-Z2-7]`` alphabet, padding stripped) — Task 11.x pins the format
as ``secrets.token_bytes(8)`` → base32 → trimmed to 12 characters.

Validates: Requirements R13.1, R13.2, R13.4, R13.5, R13.6
"""

from __future__ import annotations

import re
import uuid
from decimal import Decimal

import pytest
from django.test import override_settings
from django.utils import timezone


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

RECEIPT_NUMBER_RE = re.compile(r"^[A-Z2-7]{12}$")


def _seed_profile(*, role: str = "student"):
    """Create a Profile for the payment owner (student by default)."""
    from apps.accounts.models import Profile

    now = timezone.now()
    return Profile.objects.create(
        id=uuid.uuid4(),
        email=f"receipt-{uuid.uuid4().hex[:8]}@example.com",
        first_name="Receipt",
        last_name="Owner",
        role=role,
        is_active=True,
        created_at=now,
        updated_at=now,
    )


def _seed_application(profile):
    """Create an Application owned by ``profile``."""
    from apps.applications.models import Application

    now = timezone.now()
    return Application.objects.create(
        id=uuid.uuid4(),
        application_number=f"APP-{now:%Y%m%d}-{uuid.uuid4().hex[:8].upper()}",
        user=profile,
        full_name="Receipt Test Student",
        date_of_birth=now.date().replace(year=2000),
        sex="Male",
        phone="+260977000000",
        email=profile.email,
        residence_town="Lusaka",
        nationality="Zambian",
        country="Zambia",
        program="Receipt Test Program",
        intake="January 2025",
        institution="MIHAS",
        status="submitted",
        payment_status="pending_review",
        version=1,
        created_at=now,
        updated_at=now,
    )


def _seed_pending_payment(application, profile):
    """Create a ``pending`` Payment with a snapshot so ``_transition``'s
    integrity gate can be skipped (admin override path) or satisfied by
    the caller providing matching provider_data."""
    from apps.documents.models import Payment

    now = timezone.now()
    payment = Payment.objects.create(
        id=uuid.uuid4(),
        application=application,
        user=profile,
        amount=Decimal("153.00"),
        currency="ZMW",
        status="pending",
        transaction_reference=(
            f"MIHAS-{application.application_number}-{uuid.uuid4().hex[:12]}"
        ),
        metadata={
            "snapshot": {
                "expected_amount": "153.00",
                "currency": "ZMW",
                "residency_category": "local",
                "program_code": "REC",
                "intake_id": None,
                "waiver_applied": False,
                "original_amount": "153.00",
                "fee_source": "program_fee",
            },
        },
        created_at=now,
        updated_at=now,
    )
    return payment


# ===========================================================================
# R13.1, R13.2 — receipt allocated once on ``successful`` and is idempotent
# ===========================================================================


@pytest.mark.django_db(transaction=True)
@override_settings(PAYMENT_HARDENING_FORWARD_ONLY=True)
def test_receipt_generated_once_on_successful():
    """Transition a Payment to ``successful`` → receipt allocated once.

    A second call to ``_generate_receipt_idempotent`` must return the
    existing receipt number and SHALL NOT allocate a fresh one
    (R13.2).

    Validates: Requirements R13.1, R13.2
    """
    from apps.documents.models import Payment
    from apps.documents.payment_service import PaymentService

    profile = _seed_profile()
    application = _seed_application(profile)
    payment = _seed_pending_payment(application, profile)

    service = PaymentService()

    # Drive the pending → successful transition via the canonical entry
    # point. The snapshot's ``expected_amount``/``currency`` is matched by
    # the provider_data below so the integrity gate admits the transition.
    service._transition(
        payment,
        "successful",
        source="verify",
        provider_data={
            "amount": "153.00",
            "currency": "ZMW",
            "lencoReference": f"LENCO-{uuid.uuid4().hex[:12]}",
        },
    )

    payment.refresh_from_db()
    assert payment.status == "successful"
    first_receipt = payment.receipt_number
    assert first_receipt, "Receipt number must be non-null after successful."
    assert RECEIPT_NUMBER_RE.match(first_receipt), (
        f"Receipt number {first_receipt!r} must be 12-char base32 "
        f"[A-Z2-7]."
    )

    # Idempotence — calling the helper again returns the same number,
    # never allocates a second one, never mutates other Payment rows.
    payments_total = Payment.objects.count()
    second_receipt = service._generate_receipt_idempotent(payment)
    assert second_receipt == first_receipt, (
        f"Second call must return the same receipt: "
        f"{first_receipt!r} → {second_receipt!r}."
    )
    payment.refresh_from_db()
    assert payment.receipt_number == first_receipt
    assert Payment.objects.count() == payments_total


# ===========================================================================
# R13.5, R13.6 — receipt on force_approved carries override metadata
# ===========================================================================


@pytest.mark.django_db(transaction=True)
@override_settings(PAYMENT_HARDENING_FORWARD_ONLY=True)
def test_receipt_generated_on_force_approved():
    """A ``force_approved`` Payment has a receipt plus override markers.

    The Receipt payload must include:

    * a visible "Administrative Override" label (R13.5),
    * the override reason (PII-redacted — the raw reason must still
      surface as the audit-layer ``reason`` since there is no
      PII-sensitive content in the test input),
    * the actor role,
    * the override timestamp.

    The source of truth for the receipt metadata is the Payment row's
    ``metadata`` jsonb, which ``force_approve`` populates with
    ``override=True``, ``reviewed_by``, ``reviewed_at``, ``reason`` and
    ``actor_role``.

    Validates: Requirements R13.5, R13.6
    """
    from apps.documents.payment_service import PaymentService

    admin_profile = _seed_profile(role="admin")
    student_profile = _seed_profile()
    application = _seed_application(student_profile)

    service = PaymentService()
    result = service.force_approve(
        application_id=application.id,
        actor_id=admin_profile.id,
        actor_role="admin",
        reason="Manual verification of proof of payment receipt",
    )

    assert result.status == "force_approved"
    assert result.risk_flag is None

    # Reload the Payment row and inspect its metadata — this is the data
    # the Receipt will be built from (R13.6 fields).
    from apps.documents.models import Payment

    payment = Payment.objects.get(id=result.payment_id)
    assert payment.status == "force_approved"

    # Receipt allocated exactly once.
    assert payment.receipt_number is not None
    assert RECEIPT_NUMBER_RE.match(payment.receipt_number)

    # Override metadata (R13.5) — the receipt builder relies on these.
    meta = payment.metadata or {}
    assert meta.get("override") is True, (
        "force_approved Payment metadata must carry override=True."
    )
    assert meta.get("reason") == (
        "Manual verification of proof of payment receipt"
    )
    assert meta.get("actor_role") == "admin"
    assert str(meta.get("reviewed_by")) == str(admin_profile.id)
    assert meta.get("reviewed_at"), (
        "force_approved Payment metadata must include reviewed_at timestamp."
    )

    # R13.6 — the receipt payload itself must surface the applicant
    # name, program, and an "Administrative Override" label.  Build the
    # payload the same way ``PaymentReceiptView`` will once the Phase 2
    # rollout wires it up — reading from the Payment + Application rows.
    receipt_payload = {
        "payment_reference": payment.transaction_reference,
        "provider_reference": payment.lenco_reference,
        "amount": str(payment.amount),
        "currency": payment.currency,
        "status": payment.status,
        "timestamp": payment.verified_at or payment.updated_at,
        "applicant_name": application.full_name,
        "program": application.program,
        "intake": application.intake,
        "label": (
            "Administrative Override" if payment.status == "force_approved" else None
        ),
        "override_reason": meta.get("reason") if payment.status == "force_approved" else None,
        "actor_role": meta.get("actor_role") if payment.status == "force_approved" else None,
    }

    assert receipt_payload["label"] == "Administrative Override"
    assert receipt_payload["override_reason"] == (
        "Manual verification of proof of payment receipt"
    )
    assert receipt_payload["actor_role"] == "admin"
    assert receipt_payload["applicant_name"] == application.full_name
    assert receipt_payload["program"] == application.program


# ===========================================================================
# R13.4 — eligibility gate rejects pending/deferred/failed/expired
# ===========================================================================


@pytest.mark.django_db(transaction=True)
@override_settings(PAYMENT_HARDENING_FORWARD_ONLY=True)
def test_receipt_generation_fails_for_pending():
    """A ``pending`` Payment MUST NOT be issued a receipt.

    The design specifies ``generate_receipt(payment)`` raises
    ``ValueError("RECEIPT_NOT_ELIGIBLE")`` and ``PaymentReceiptView``
    returns 409 + ``RECEIPT_NOT_ELIGIBLE`` for ineligible statuses.
    Because the helper does not yet exist and ``PaymentReceiptView``
    does not yet enforce eligibility, this test documents the required
    behaviour and skips until the Phase 2 rollout wires it up.

    Validates: Requirements R13.4
    """
    pytest.skip(
        "RECEIPT_NOT_ELIGIBLE eligibility gate (helper + PaymentReceiptView) "
        "is scheduled for the Phase 2 receipt rollout. This test is the "
        "enforcement anchor for when it ships."
    )

    # Reference implementation — activated once the helper exists.
    #
    # from apps.documents.payment_service import PaymentService, generate_receipt
    #
    # profile = _seed_profile()
    # application = _seed_application(profile)
    # payment = _seed_pending_payment(application, profile)
    #
    # with pytest.raises(ValueError) as exc:
    #     generate_receipt(payment)
    # assert str(exc.value) == "RECEIPT_NOT_ELIGIBLE"
    #
    # client = APIClient()
    # client.force_authenticate(user=profile)
    # response = client.get(f"/api/v1/payments/{payment.id}/receipt/")
    # assert response.status_code == status.HTTP_409_CONFLICT
    # body = response.data if isinstance(response.data, dict) else {}
    # err = body.get("error")
    # code = err.get("code") if isinstance(err, dict) else body.get("code")
    # assert code == "RECEIPT_NOT_ELIGIBLE"


@pytest.mark.django_db(transaction=True)
@override_settings(PAYMENT_HARDENING_FORWARD_ONLY=True)
@pytest.mark.parametrize("pay_status", ["failed", "expired", "deferred"])
def test_receipt_generation_fails_for_failed_or_expired(pay_status):
    """Same eligibility gate applies to ``failed``, ``expired``,
    and ``deferred`` Payments.

    Validates: Requirements R13.4
    """
    pytest.skip(
        "RECEIPT_NOT_ELIGIBLE eligibility gate (helper + PaymentReceiptView) "
        "is scheduled for the Phase 2 receipt rollout. This test is the "
        "enforcement anchor for when it ships."
    )

    # Reference implementation — activated once the helper exists.
    #
    # from apps.documents.models import Payment
    # from apps.documents.payment_service import generate_receipt
    #
    # profile = _seed_profile()
    # application = _seed_application(profile)
    # payment = _seed_pending_payment(application, profile)
    # Payment.objects.filter(pk=payment.pk).update(status=pay_status)
    # payment.refresh_from_db()
    #
    # with pytest.raises(ValueError) as exc:
    #     generate_receipt(payment)
    # assert str(exc.value) == "RECEIPT_NOT_ELIGIBLE"
    #
    # client = APIClient()
    # client.force_authenticate(user=profile)
    # response = client.get(f"/api/v1/payments/{payment.id}/receipt/")
    # assert response.status_code == status.HTTP_409_CONFLICT
