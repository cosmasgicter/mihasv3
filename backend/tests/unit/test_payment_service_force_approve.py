"""Unit tests — ``PaymentService.force_approve()`` admin override path.

Purpose
-------
Pin down the happy paths and guards of the admin-driven
``force_approved`` transition introduced by the payment-hardening spec.
The method is the only sanctioned route for creating a
``force_approved`` Payment row — it enforces a minimum override reason,
refuses to reverse successful payments, writes the audit trail required
for longer-retention review, and allocates a unique receipt number.

Scope
-----
* Rejects ``reason`` shorter than 10 characters with
  ``OVERRIDE_REASON_REQUIRED``; no Payment row is mutated or created.
* Rejects the override when a successful Payment already exists for the
  application with ``CANNOT_REVERSE_SUCCESSFUL_PAYMENT``; no mutation.
* Happy path (no prior Payment): creates a new Payment row in
  ``force_approved`` with override metadata
  (``override=True``, ``reviewed_by``, ``reason``, ``actor_role``), emits
  the ``payment.force_approved`` audit row at the ``security`` retention
  category, and allocates a 12-character base32 receipt.
* Happy path (existing pending Payment): transitions the row to
  ``force_approved``, keeps override metadata intact, allocates a
  receipt, and emits the audit event.

Tests use real model factories (Profile, Application, Payment) — not
MagicMocks — because the assertions target persisted rows and audit
events.

Validates: Requirements R2.1, R2.2, R2.3, R2.4, R2.5, R2.6, R13.1,
R13.5, R13.6
"""

from __future__ import annotations

import re
import uuid
from decimal import Decimal

import pytest
from django.test import override_settings
from django.utils import timezone


# ---------------------------------------------------------------------------
# Helpers & fixtures
# ---------------------------------------------------------------------------


# Base32 alphabet (standard, no padding) — used to verify receipt shape.
_BASE32_RE = re.compile(r"^[A-Z2-7]{12}$")


@pytest.fixture
def seed_applicant(db):
    """Create a student Profile + submitted Application — no Payment yet.

    Returns a dict ``{profile, application, admin}``. The per-test code
    creates the Payment row it needs (or none at all) to exercise each
    branch of ``force_approve``.
    """
    from apps.accounts.models import Profile
    from apps.applications.models import Application

    now = timezone.now()

    profile = Profile.objects.create(
        id=uuid.uuid4(),
        email=f"force-approve-student-{uuid.uuid4().hex[:8]}@example.com",
        first_name="ForceApprove",
        last_name="Student",
        role="student",
        is_active=True,
        created_at=now,
        updated_at=now,
    )

    admin = Profile.objects.create(
        id=uuid.uuid4(),
        email=f"force-approve-admin-{uuid.uuid4().hex[:8]}@example.com",
        first_name="ForceApprove",
        last_name="Admin",
        role="admin",
        is_active=True,
        created_at=now,
        updated_at=now,
    )

    application = Application.objects.create(
        id=uuid.uuid4(),
        application_number=f"APP-{now:%Y%m%d}-{uuid.uuid4().hex[:8].upper()}",
        user=profile,
        full_name="ForceApprove Student",
        date_of_birth=now.date().replace(year=2000),
        sex="Female",
        phone="+260977000000",
        email=profile.email,
        residence_town="Lusaka",
        nationality="Zambian",
        country="Zambia",
        program="Force-Approve Test Program",
        intake="January 2025",
        institution="MIHAS",
        status="submitted",
        payment_status="pending_review",
        version=1,
        created_at=now,
        updated_at=now,
    )

    return {"profile": profile, "application": application, "admin": admin}


def _make_pending_payment(application, profile):
    """Helper: create a minimal pending Payment row for an application."""
    from apps.documents.models import Payment

    now = timezone.now()
    return Payment.objects.create(
        id=uuid.uuid4(),
        application=application,
        user=profile,
        amount=Decimal("153.00"),
        currency="ZMW",
        status="pending",
        transaction_reference=f"MIHAS-{application.application_number}-"
        f"{int(now.timestamp() * 1000)}",
        metadata={
            "snapshot": {
                "expected_amount": "153.00",
                "currency": "ZMW",
                "residency_category": "local",
                "program_code": "FAT",
                "intake_id": None,
                "waiver_applied": False,
                "original_amount": "153.00",
                "fee_source": "program_fee",
            },
        },
        created_at=now,
        updated_at=now,
    )


def _audits_for(entity_id, action):
    """Return all AuditLog rows for a given entity id filtered by action."""
    from apps.common.models import AuditLog

    return list(
        AuditLog.objects.filter(
            entity_type="payment",
            entity_id=entity_id,
            action=action,
        ).order_by("created_at")
    )


# ---------------------------------------------------------------------------
# Guards: reason length + successful-payment protection
# ---------------------------------------------------------------------------


@pytest.mark.django_db
@override_settings(PAYMENT_HARDENING_FORWARD_ONLY=True)
def test_force_approve_rejects_short_reason_without_mutating_payment(
    seed_applicant,
):
    """A reason shorter than 10 chars raises OVERRIDE_REASON_REQUIRED.

    No Payment row may be created or modified as a side effect of the
    rejected attempt.

    Validates: Requirements R2.3, R2.5
    """
    from apps.documents.models import Payment
    from apps.documents.payment_service import PaymentService

    app = seed_applicant["application"]
    admin = seed_applicant["admin"]

    # Baseline: no Payment rows exist yet for this application.
    assert Payment.objects.filter(application_id=app.id).count() == 0

    service = PaymentService()
    with pytest.raises(ValueError) as excinfo:
        service.force_approve(
            application_id=app.id,
            actor_id=admin.id,
            actor_role="admin",
            reason="too short",  # 9 chars including space → under the 10-char floor
        )

    assert "OVERRIDE_REASON_REQUIRED" in str(excinfo.value)
    # The rejection must not have created a placeholder Payment row.
    assert Payment.objects.filter(application_id=app.id).count() == 0


@pytest.mark.django_db
@override_settings(PAYMENT_HARDENING_FORWARD_ONLY=True)
def test_force_approve_rejects_when_successful_payment_exists(seed_applicant):
    """Existing ``successful`` Payment blocks override; nothing mutates.

    Validates: Requirements R2.1, R2.2
    """
    from apps.documents.models import Payment
    from apps.documents.payment_service import PaymentService

    app = seed_applicant["application"]
    profile = seed_applicant["profile"]
    admin = seed_applicant["admin"]

    payment = _make_pending_payment(app, profile)
    payment.status = "successful"
    payment.save(update_fields=["status"])

    pre_metadata = dict(payment.metadata or {})
    pre_updated_at = payment.updated_at

    service = PaymentService()
    with pytest.raises(ValueError) as excinfo:
        service.force_approve(
            application_id=app.id,
            actor_id=admin.id,
            actor_role="admin",
            reason="legitimate override reason with sufficient length",
        )

    assert "CANNOT_REVERSE_SUCCESSFUL_PAYMENT" in str(excinfo.value)

    # No mutation on the successful row.
    payment.refresh_from_db()
    assert payment.status == "successful"
    assert payment.metadata == pre_metadata
    assert payment.updated_at == pre_updated_at
    # And no second Payment row was created as a side effect.
    assert Payment.objects.filter(application_id=app.id).count() == 1


# ---------------------------------------------------------------------------
# Happy path: no prior Payment row
# ---------------------------------------------------------------------------


@pytest.mark.django_db
@override_settings(PAYMENT_HARDENING_FORWARD_ONLY=True)
def test_force_approve_happy_path_creates_new_payment_with_metadata_and_receipt(
    seed_applicant,
):
    """Override with no prior Payment creates a new ``force_approved`` row.

    Asserts:
    - Exactly one Payment row exists after the call.
    - Row status is ``force_approved``.
    - Metadata carries ``override=True``, ``reviewed_by=<admin>``,
      ``reason=<reason>``, ``actor_role=<role>``.
    - A ``payment.force_approved`` audit row was emitted at the
      ``security`` retention category.
    - A 12-char base32 ``receipt_number`` was allocated.

    Validates: Requirements R2.3, R2.4, R2.6, R13.1, R13.5, R13.6
    """
    from apps.documents.models import Payment
    from apps.documents.payment_service import PaymentService

    app = seed_applicant["application"]
    admin = seed_applicant["admin"]

    reason = "student paid in person at the bursar office"
    service = PaymentService()
    result = service.force_approve(
        application_id=app.id,
        actor_id=admin.id,
        actor_role="admin",
        reason=reason,
    )

    assert result.status == "force_approved", (
        f"Expected force_approve to return status='force_approved'; "
        f"got {result.status!r}."
    )

    # Exactly one Payment row was created.
    payments = list(Payment.objects.filter(application_id=app.id))
    assert len(payments) == 1, (
        f"Expected exactly one Payment row after force_approve; "
        f"found {len(payments)}."
    )
    payment = payments[0]
    assert payment.status == "force_approved"

    # Override metadata is present.
    meta = payment.metadata or {}
    assert meta.get("override") is True
    assert meta.get("reviewed_by") == str(admin.id)
    assert meta.get("reason") == reason
    assert meta.get("actor_role") == "admin"

    # Receipt allocated — 12-char base32 (R13.1, R13.5).
    assert payment.receipt_number, "Expected a non-null receipt_number."
    assert _BASE32_RE.match(payment.receipt_number), (
        f"receipt_number {payment.receipt_number!r} is not a 12-character "
        f"base32 [A-Z2-7] string."
    )

    # Audit row emitted with security retention (R2.6, R13.6).
    audits = _audits_for(payment.id, "payment.force_approved")
    assert len(audits) == 1, (
        f"Expected exactly one 'payment.force_approved' audit row; "
        f"got {len(audits)}."
    )
    audit = audits[0]
    assert audit.retention_category == "security", (
        "payment.force_approved audits must be promoted to the "
        "security retention window (365 days)."
    )
    assert audit.actor_id == admin.id
    changes = audit.changes or {}
    assert changes.get("actor_role") == "admin"
    assert changes.get("reason") == reason
    assert changes.get("application_id") == str(app.id)


# ---------------------------------------------------------------------------
# Happy path: existing pending Payment row
# ---------------------------------------------------------------------------


@pytest.mark.django_db
@override_settings(PAYMENT_HARDENING_FORWARD_ONLY=True)
def test_force_approve_transitions_existing_pending_payment(seed_applicant):
    """Override with an existing pending row transitions it in place.

    Asserts:
    - No second Payment row was created (the pending row is reused).
    - Status flips from ``pending`` to ``force_approved``.
    - Override metadata is written onto the existing row.
    - ``receipt_number`` is allocated (12-char base32).
    - A ``payment.force_approved`` audit row is emitted.

    Validates: Requirements R2.3, R2.4, R2.6, R13.1, R13.5, R13.6
    """
    from apps.documents.models import Payment
    from apps.documents.payment_service import PaymentService

    app = seed_applicant["application"]
    profile = seed_applicant["profile"]
    admin = seed_applicant["admin"]

    existing = _make_pending_payment(app, profile)
    original_id = existing.id
    assert existing.status == "pending"
    assert existing.receipt_number in (None, "")

    reason = "offline bank deposit confirmed via receipt 12345"
    service = PaymentService()
    service.force_approve(
        application_id=app.id,
        actor_id=admin.id,
        actor_role="super_admin",
        reason=reason,
    )

    # The existing Payment row was reused — no extra row created.
    payments = list(Payment.objects.filter(application_id=app.id))
    assert len(payments) == 1
    payment = payments[0]
    assert payment.id == original_id, (
        "force_approve must transition the existing pending Payment row "
        "rather than creating a duplicate."
    )

    assert payment.status == "force_approved"

    meta = payment.metadata or {}
    assert meta.get("override") is True
    assert meta.get("reviewed_by") == str(admin.id)
    assert meta.get("reason") == reason
    assert meta.get("actor_role") == "super_admin"

    # Snapshot captured at initiation must still be present — override
    # must never clobber the original fee snapshot.
    assert meta.get("snapshot", {}).get("expected_amount") == "153.00"

    assert payment.receipt_number, "Expected a non-null receipt_number."
    assert _BASE32_RE.match(payment.receipt_number), (
        f"receipt_number {payment.receipt_number!r} is not a 12-character "
        f"base32 [A-Z2-7] string."
    )

    audits = _audits_for(payment.id, "payment.force_approved")
    assert len(audits) == 1
    audit = audits[0]
    assert audit.retention_category == "security"
    assert audit.actor_id == admin.id
    changes = audit.changes or {}
    assert changes.get("actor_role") == "super_admin"
    assert changes.get("reason") == reason
