"""Unit tests — ``SuperAdminPaymentCorrectionView`` (Tasks 46.2 + 46.3).

Scope
-----
Pin down two layers of guarantees for
``POST /api/v1/payments/<uuid:payment_id>/correct/``:

1. **Task 46.2 — super-admin-only access (R2.5).** Actors with role
   ``student``, ``reviewer``, or ``admin`` must be rejected with HTTP
   403 and the ``INSUFFICIENT_PERMISSIONS`` envelope emitted by
   ``apps/common/exceptions.py``. Only ``super_admin`` actors reach
   ``PaymentService.super_admin_correct`` and see the transition
   applied.

2. **Task 46.3 — reason guard + audit ordering (R2.5, R2.6).** A
   ``reason`` shorter than 10 characters must return HTTP 400 with the
   stable ``OVERRIDE_REASON_REQUIRED`` code and leave the ledger and
   audit trail untouched. A valid reason (≥ 10 chars) must persist the
   ``payment.super_admin_corrected`` audit row **before** the status
   mutation — the generic ``payment.transitioned`` audit row written by
   ``_transition`` orders strictly after it (R1.5).

These tests use real model factories (Profile, Application, Payment,
AuditLog) mounted on the real ``SuperAdminPaymentCorrectionView`` via
``APIRequestFactory`` + ``force_authenticate``. The authentication
shape (``JWTUser``) mirrors ``test_application_review_force_approved``
so both modules exercise the same permission wiring.

Validates: Requirements R2.5, R2.6
"""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.accounts.authentication import JWTUser
from apps.documents.views import SuperAdminPaymentCorrectionView


# ---------------------------------------------------------------------------
# Shared fixture + helpers
# ---------------------------------------------------------------------------


@pytest.fixture
def seed_payment_and_super_admin(db):
    """Seed a student + Application + pending Payment + 4 actor Profiles.

    Returns a dict with:

    * ``payment``: pending Payment row the view will mutate.
    * ``application``: the Application the Payment belongs to.
    * ``student_profile`` / ``reviewer_profile`` / ``admin_profile`` /
      ``super_admin_profile``: database rows for each role.
    * ``student_user`` / ``reviewer_user`` / ``admin_user`` /
      ``super_admin_user``: ``JWTUser`` instances carrying each role
      claim; used with ``force_authenticate``.
    """
    from apps.accounts.models import Profile
    from apps.applications.models import Application
    from apps.documents.models import Payment

    now = timezone.now()

    def _make_profile(role: str) -> Profile:
        return Profile.objects.create(
            id=uuid.uuid4(),
            email=f"{role}-{uuid.uuid4().hex[:8]}@example.com",
            first_name=role.title(),
            last_name="Tester",
            role=role,
            is_active=True,
            created_at=now,
            updated_at=now,
        )

    student = _make_profile("student")
    reviewer = _make_profile("reviewer")
    admin = _make_profile("admin")
    super_admin = _make_profile("super_admin")

    application = Application.objects.create(
        id=uuid.uuid4(),
        application_number=(
            f"APP-{now:%Y%m%d}-{uuid.uuid4().hex[:8].upper()}"
        ),
        user=student,
        full_name="Correction Student",
        date_of_birth=now.date().replace(year=2000),
        sex="Female",
        phone="+260977000000",
        email=student.email,
        residence_town="Lusaka",
        nationality="Zambian",
        country="Zambia",
        program="Super Admin Correction Program",
        intake="January 2025",
        institution="MIHAS",
        status="submitted",
        payment_status="pending",
        version=1,
        created_at=now,
        updated_at=now,
    )

    payment = Payment.objects.create(
        id=uuid.uuid4(),
        application=application,
        user=student,
        amount=Decimal("153.00"),
        currency="ZMW",
        status="pending",
        transaction_reference=(
            f"MIHAS-{application.application_number}-"
            f"{int(now.timestamp() * 1000)}"
        ),
        metadata={
            "snapshot": {
                "expected_amount": "153.00",
                "currency": "ZMW",
                "residency_category": "local",
                "program_code": "SAC",
                "intake_id": None,
                "waiver_applied": False,
                "original_amount": "153.00",
                "fee_source": "program_fee",
            },
        },
        created_at=now,
        updated_at=now,
    )

    def _jwt(profile: Profile, role: str) -> JWTUser:
        return JWTUser({
            "user_id": str(profile.id),
            "email": profile.email,
            "role": role,
            "first_name": profile.first_name,
            "last_name": profile.last_name,
        })

    return {
        "payment": payment,
        "application": application,
        "student_profile": student,
        "reviewer_profile": reviewer,
        "admin_profile": admin,
        "super_admin_profile": super_admin,
        "student_user": _jwt(student, "student"),
        "reviewer_user": _jwt(reviewer, "reviewer"),
        "admin_user": _jwt(admin, "admin"),
        "super_admin_user": _jwt(super_admin, "super_admin"),
    }


def _post_correct(payment_id, jwt_user, body):
    """Build + dispatch a POST to /api/v1/payments/<uuid>/correct/."""
    factory = APIRequestFactory()
    request = factory.post(
        f"/api/v1/payments/{payment_id}/correct/",
        data=body,
        format="json",
    )
    force_authenticate(request, user=jwt_user)
    view = SuperAdminPaymentCorrectionView.as_view()
    return view(request, payment_id=payment_id)


def _audits_for(entity_id, action=None):
    """Return audit rows for a payment, optionally filtered by action."""
    from apps.common.models import AuditLog

    qs = AuditLog.objects.filter(entity_type="payment", entity_id=entity_id)
    if action is not None:
        qs = qs.filter(action=action)
    return list(qs.order_by("created_at"))


# ---------------------------------------------------------------------------
# Task 46.2 — super-admin-only access (R2.5)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
@override_settings(PAYMENT_HARDENING_FORWARD_ONLY=True)
def test_student_cannot_access_correct_endpoint(seed_payment_and_super_admin):
    """A ``student`` actor is rejected with 403 + INSUFFICIENT_PERMISSIONS.

    The view's ``IsSuperAdmin`` permission class blocks the request
    before it reaches ``PaymentService``; the Payment row must remain
    ``pending`` and no ``payment.super_admin_corrected`` audit row is
    emitted.

    Validates: Requirements R2.5
    """
    seed = seed_payment_and_super_admin
    payment = seed["payment"]

    response = _post_correct(
        payment.id,
        seed["student_user"],
        {
            "target_status": "successful",
            "reason": "legitimate correction reason",
        },
    )

    assert response.status_code == 403, (
        f"student role must be rejected with 403; got "
        f"{response.status_code}."
    )
    body = response.data
    assert body.get("success") is False
    assert body.get("code") == "INSUFFICIENT_PERMISSIONS"

    # Ledger untouched.
    payment.refresh_from_db()
    assert payment.status == "pending"
    # No super-admin audit emitted.
    assert _audits_for(payment.id, "payment.super_admin_corrected") == []


@pytest.mark.django_db
@override_settings(PAYMENT_HARDENING_FORWARD_ONLY=True)
def test_reviewer_cannot_access_correct_endpoint(seed_payment_and_super_admin):
    """A ``reviewer`` actor is rejected with 403 + INSUFFICIENT_PERMISSIONS.

    Validates: Requirements R2.5
    """
    seed = seed_payment_and_super_admin
    payment = seed["payment"]

    response = _post_correct(
        payment.id,
        seed["reviewer_user"],
        {
            "target_status": "successful",
            "reason": "legitimate correction reason",
        },
    )

    assert response.status_code == 403
    assert response.data.get("success") is False
    assert response.data.get("code") == "INSUFFICIENT_PERMISSIONS"

    payment.refresh_from_db()
    assert payment.status == "pending"
    assert _audits_for(payment.id, "payment.super_admin_corrected") == []


@pytest.mark.django_db
@override_settings(PAYMENT_HARDENING_FORWARD_ONLY=True)
def test_admin_cannot_access_correct_endpoint(seed_payment_and_super_admin):
    """An ``admin`` actor is rejected with 403 + INSUFFICIENT_PERMISSIONS.

    Admins get their own override path (``force_approve``); the
    super-admin correction endpoint is reserved for ``super_admin``
    only (R17.5 analogue).

    Validates: Requirements R2.5
    """
    seed = seed_payment_and_super_admin
    payment = seed["payment"]

    response = _post_correct(
        payment.id,
        seed["admin_user"],
        {
            "target_status": "successful",
            "reason": "legitimate correction reason",
        },
    )

    assert response.status_code == 403
    assert response.data.get("success") is False
    assert response.data.get("code") == "INSUFFICIENT_PERMISSIONS"

    payment.refresh_from_db()
    assert payment.status == "pending"
    assert _audits_for(payment.id, "payment.super_admin_corrected") == []


@pytest.mark.django_db
@override_settings(PAYMENT_HARDENING_FORWARD_ONLY=True)
def test_super_admin_can_transition_payment(seed_payment_and_super_admin):
    """A ``super_admin`` actor receives HTTP 200 and the transition applies.

    The view's happy path must:

    * Return ``{"success": True, "data": {...}}`` with ``payment_id``
      and the target status echoed.
    * Mutate the Payment row so ``status == 'force_approved'`` (Phase 2
      forward-only is enabled so the full transition runs through
      ``_transition(source='super_admin_correction')``).

    ``force_approved`` is used as the happy-path target because it
    bypasses the 4-check integrity gate (which only fires on
    ``successful``) while still exercising the full sole-authority
    ``_transition`` path — including audit emission, receipt
    allocation, and ``Application.payment_status`` sync.

    Validates: Requirements R2.5
    """
    seed = seed_payment_and_super_admin
    payment = seed["payment"]

    response = _post_correct(
        payment.id,
        seed["super_admin_user"],
        {
            "target_status": "force_approved",
            "reason": "legitimate correction reason",
        },
    )

    assert response.status_code == 200, (
        f"super_admin must be allowed through; got {response.status_code} "
        f"with body {getattr(response, 'data', None)!r}."
    )
    body = response.data
    assert body.get("success") is True
    data = body.get("data") or {}
    assert str(data.get("payment_id")) == str(payment.id)
    assert data.get("status") == "force_approved"
    assert data.get("target_status") == "force_approved"

    # Ledger updated — Payment now terminal force_approved.
    payment.refresh_from_db()
    assert payment.status == "force_approved", (
        f"Expected Payment.status='force_approved' after super-admin "
        f"correction; got {payment.status!r}."
    )


# ---------------------------------------------------------------------------
# Task 46.3 — reason guard and audit ordering (R2.5, R2.6)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
@override_settings(PAYMENT_HARDENING_FORWARD_ONLY=True)
def test_short_reason_returns_400_and_no_audit(seed_payment_and_super_admin):
    """Reason < 10 chars → 400 + OVERRIDE_REASON_REQUIRED; ledger untouched.

    The serializer-layer guard must reject before ``PaymentService`` is
    reached so no audit row is written and the Payment remains
    ``pending``.

    Validates: Requirements R2.5
    """
    seed = seed_payment_and_super_admin
    payment = seed["payment"]

    response = _post_correct(
        payment.id,
        seed["super_admin_user"],
        {
            "target_status": "successful",
            "reason": "ok",  # 2 chars — well under the 10-char floor
        },
    )

    assert response.status_code == 400
    body = response.data
    assert body.get("success") is False
    # The view maps short-reason validation errors to the stable
    # ``OVERRIDE_REASON_REQUIRED`` code (R2.5).
    error = body.get("error") or {}
    code = (
        error.get("code")
        if isinstance(error, dict)
        else body.get("code")
    )
    assert code == "OVERRIDE_REASON_REQUIRED", (
        f"Short-reason 400 must carry code 'OVERRIDE_REASON_REQUIRED'; "
        f"got {code!r}. Full body: {body!r}"
    )

    # No audit entries for super-admin correction.
    assert _audits_for(payment.id, "payment.super_admin_corrected") == []
    # No transition audit either — the mutation never ran. We check both
    # the generic ``payment.transitioned`` and the target-specific
    # ``payment.force_approved`` action names since either would
    # indicate a mutation path was reached.
    assert _audits_for(payment.id, "payment.transitioned") == []
    assert _audits_for(payment.id, "payment.force_approved") == []

    # Payment status unchanged.
    payment.refresh_from_db()
    assert payment.status == "pending"


@pytest.mark.django_db
@override_settings(PAYMENT_HARDENING_FORWARD_ONLY=True)
def test_audit_emitted_before_transition_persists(
    seed_payment_and_super_admin,
):
    """A valid correction writes the super-admin audit BEFORE the transition.

    ``PaymentService.super_admin_correct`` emits the
    ``payment.super_admin_corrected`` audit row **before** delegating
    to ``_transition`` so the governance trail survives a rollback
    (R1.5). The transition-level audit row written inside
    ``_transition`` therefore orders strictly after the super-admin
    audit in ``created_at`` ordering.

    The super-admin audit row must also carry
    ``retention_category='security'`` (R2.6) because the action prefix
    is in ``SECURITY_RETENTION_ACTION_PREFIXES``.

    We use ``target_status='force_approved'`` here because:

    * It bypasses the 4-check integrity gate (only ``successful``
      triggers that gate, which would reject an actor-initiated
      transition carrying no ``provider_data``).
    * It still exercises the full ``_transition`` path — sole-authority
      audit emission, receipt allocation,
      ``Application.payment_status`` sync, and a ``payment.force_approved``
      audit row emitted strictly after the super-admin-corrected row.

    Validates: Requirements R2.5, R2.6
    """
    seed = seed_payment_and_super_admin
    payment = seed["payment"]

    response = _post_correct(
        payment.id,
        seed["super_admin_user"],
        {
            "target_status": "force_approved",
            "reason": "legitimate correction reason",
        },
    )
    assert response.status_code == 200, (
        f"Pre-condition failed: expected 200 from the super-admin "
        f"correction; got {response.status_code} / body "
        f"{getattr(response, 'data', None)!r}."
    )

    # Final ledger state confirms the transition ran.
    payment.refresh_from_db()
    assert payment.status == "force_approved"

    # --- Audit ordering (R1.5) --------------------------------------
    # The full audit trail for this Payment, ordered by created_at, must
    # begin with ``payment.super_admin_corrected``. The transition-level
    # ``payment.force_approved`` row (emitted inside ``_transition``)
    # must appear strictly later.
    all_audits = _audits_for(payment.id)
    actions = [a.action for a in all_audits]
    assert "payment.super_admin_corrected" in actions, (
        f"Expected a 'payment.super_admin_corrected' audit row; got "
        f"{actions!r}."
    )
    assert "payment.force_approved" in actions, (
        f"Expected a 'payment.force_approved' audit row after a "
        f"successful super-admin correction to force_approved; got "
        f"{actions!r}."
    )

    # The super-admin audit must be the FIRST entry (created before the
    # transition audit).
    first = all_audits[0]
    assert first.action == "payment.super_admin_corrected", (
        f"The first payment audit row must be "
        f"'payment.super_admin_corrected' (written before the "
        f"transition); got {first.action!r} with full ordered list "
        f"{actions!r}."
    )

    super_audit = next(
        a for a in all_audits if a.action == "payment.super_admin_corrected"
    )
    transition_audit = next(
        a for a in all_audits if a.action == "payment.force_approved"
    )
    assert super_audit.created_at <= transition_audit.created_at, (
        f"'payment.super_admin_corrected' must be written no later than "
        f"'payment.force_approved'; got super={super_audit.created_at} "
        f"vs transition={transition_audit.created_at}."
    )

    # --- Retention promotion (R2.6) ----------------------------------
    assert super_audit.retention_category == "security", (
        f"payment.super_admin_corrected must be promoted to "
        f"retention_category='security' (365-day window); got "
        f"{super_audit.retention_category!r}."
    )

    # --- Audit metadata sanity --------------------------------------
    changes = super_audit.changes or {}
    assert changes.get("target_status") == "force_approved"
    assert changes.get("from_status") == "pending"
    assert changes.get("reason") == "legitimate correction reason"
    assert changes.get("actor_role") == "super_admin"
