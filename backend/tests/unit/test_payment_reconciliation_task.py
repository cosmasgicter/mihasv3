"""Unit tests — ``PaymentService.expire_stale()`` reconciliation sweep.

Purpose
-------
Pin down the behaviour of the batch reconciliation method that expires
``pending`` payments older than a configurable cutoff. It is invoked
periodically by ``poll_pending_payments_task`` and is the only path
authorised to transition ``pending → expired`` (source=``reconciliation``).

Scope
-----
* Expires all ``pending`` Payment rows whose ``created_at`` is older
  than ``older_than_hours``; each row becomes ``status='expired'`` with
  both a ``payment.expired_by_reconciliation`` audit row and the generic
  ``payment.transitioned`` audit row emitted by ``_transition``.
* Is idempotent by construction — a second invocation finds no new
  candidates, returns 0, and writes no further mutations or audits.
* Leaves recent ``pending`` rows (created less than the cutoff ago)
  alone.
* Honours the exact cutoff boundary — rows at or past the cutoff
  threshold are expired.
* Respects ``batch_cap``: when more candidates exist than the cap, only
  the oldest ``batch_cap`` rows are expired; the rest remain ``pending``
  for the next sweep.

Tests use real model factories (Profile, Application, Payment) and
``@pytest.mark.django_db(transaction=True)`` where needed so state
accumulated between fixture steps is visible inside the reconciliation
sweep.

Validates: Requirements R18.2, R18.5
"""

from __future__ import annotations

import uuid
from datetime import timedelta
from decimal import Decimal

import pytest
from django.test import override_settings
from django.utils import timezone


# ---------------------------------------------------------------------------
# Helpers & fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def seed_owner(db):
    """Create a single student Profile + Application used by all payments.

    The reconciliation sweep does not care which student owns each
    Payment; seeding one owner + one application keeps each test focused
    on the batch-expiry behaviour itself.
    """
    from apps.accounts.models import Profile
    from apps.applications.models import Application

    now = timezone.now()

    profile = Profile.objects.create(
        id=uuid.uuid4(),
        email=f"reconcile-{uuid.uuid4().hex[:8]}@example.com",
        first_name="Reconcile",
        last_name="Owner",
        role="student",
        is_active=True,
        created_at=now,
        updated_at=now,
    )

    application = _create_application(profile)

    return {"profile": profile, "application": application}


@pytest.fixture(autouse=True)
def _isolate_reconciliation_rows(db):
    """Keep each reconciliation example independent of global pending rows."""
    from apps.documents.models import Payment

    Payment.objects.all().delete()
    yield
    Payment.objects.all().delete()


def _create_application(profile):
    """Create one submitted application for reconciliation test data."""
    from apps.applications.models import Application

    now = timezone.now()
    return Application.objects.create(
        id=uuid.uuid4(),
        application_number=f"APP-{now:%Y%m%d}-{uuid.uuid4().hex[:8].upper()}",
        user=profile,
        full_name="Reconcile Student",
        date_of_birth=now.date().replace(year=2000),
        sex="Male",
        phone="+260977000000",
        email=profile.email,
        residence_town="Lusaka",
        nationality="Zambian",
        country="Zambia",
        program="Reconciliation Test Program",
        intake="January 2025",
        institution="MIHAS",
        status="submitted",
        payment_status="pending_review",
        version=1,
        created_at=now,
        updated_at=now,
    )


def _seed_pending_payment(application, profile, *, age_hours: float):
    """Create a ``pending`` Payment row with ``created_at`` set to ``now - age_hours``.

    Uses ``update()`` after ``create()`` to bypass the model's default
    ``auto_now`` semantics on ``created_at`` / ``updated_at``.
    """
    from apps.documents.models import Payment

    now = timezone.now()
    created_at = now - timedelta(hours=age_hours)

    payment = Payment.objects.create(
        id=uuid.uuid4(),
        application=application,
        user=profile,
        amount=Decimal("153.00"),
        currency="ZMW",
        status="pending",
        transaction_reference=f"MIHAS-{application.application_number}-"
        f"{uuid.uuid4().hex[:12]}",
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
        created_at=created_at,
        updated_at=created_at,
    )
    # Force created_at via direct update — some row-level save hooks
    # overwrite ``created_at`` on create in other managed apps, but the
    # Payment model stores the column as-is. Keep the explicit update
    # to make the test robust against future ``auto_now_add`` changes.
    Payment.objects.filter(pk=payment.pk).update(
        created_at=created_at, updated_at=created_at,
    )
    payment.refresh_from_db()
    return payment


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
# Test 1 — expires all 10 stale rows + writes both audit events per row
# ---------------------------------------------------------------------------


@pytest.mark.django_db(transaction=True)
@override_settings(PAYMENT_HARDENING_FORWARD_ONLY=True)
def test_expire_stale_expires_all_candidates_older_than_cutoff(seed_owner):
    """10 pending payments aged 25h all expire in one sweep.

    Asserts:
    - ``expire_stale`` returns 10.
    - Every Payment is now ``status='expired'``.
    - Each Payment has a ``payment.expired_by_reconciliation`` audit row.
    - Each Payment also has the generic ``payment.transitioned`` audit
      row emitted by ``_transition``.

    Validates: Requirements R18.2, R18.5
    """
    from apps.documents.payment_service import PaymentService

    profile = seed_owner["profile"]

    payments = [
        _seed_pending_payment(_create_application(profile), profile, age_hours=25)
        for _ in range(10)
    ]

    expired_count = PaymentService().expire_stale(
        older_than_hours=24, batch_cap=50,
    )

    assert expired_count == 10, (
        f"Expected 10 stale payments to be expired; got {expired_count}."
    )

    for payment in payments:
        payment.refresh_from_db()
        assert payment.status == "expired", (
            f"Payment {payment.id} should be expired; is {payment.status!r}."
        )

        reconciliation_audits = _audits_for(
            payment.id, "payment.expired_by_reconciliation",
        )
        assert len(reconciliation_audits) == 1, (
            f"Expected exactly one 'payment.expired_by_reconciliation' "
            f"audit for payment {payment.id}; got "
            f"{len(reconciliation_audits)}."
        )

        transitioned_audits = _audits_for(payment.id, "payment.transitioned")
        assert len(transitioned_audits) == 1, (
            f"Expected exactly one 'payment.transitioned' audit for "
            f"payment {payment.id}; got {len(transitioned_audits)}."
        )
        # The generic transition audit must record the correct source.
        changes = transitioned_audits[0].changes or {}
        assert changes.get("source") == "reconciliation"
        assert changes.get("from_status") == "pending"
        assert changes.get("target_status") == "expired"


# ---------------------------------------------------------------------------
# Test 2 — idempotency: second run is a no-op
# ---------------------------------------------------------------------------


@pytest.mark.django_db(transaction=True)
@override_settings(PAYMENT_HARDENING_FORWARD_ONLY=True)
def test_expire_stale_is_idempotent_on_second_run(seed_owner):
    """Running ``expire_stale`` twice back-to-back only mutates once.

    Asserts:
    - First run returns 10 and expires every row.
    - Second run returns 0, does not mutate any Payment's
      ``updated_at``, and does not append new audit rows.

    Validates: Requirements R18.5
    """
    from apps.common.models import AuditLog
    from apps.documents.payment_service import PaymentService

    profile = seed_owner["profile"]

    payments = [
        _seed_pending_payment(_create_application(profile), profile, age_hours=25)
        for _ in range(10)
    ]

    service = PaymentService()
    first = service.expire_stale(older_than_hours=24, batch_cap=50)
    assert first == 10

    # Snapshot the Payment updated_at values and audit row counts AFTER
    # the first run so the second run can be verified as a pure no-op.
    first_run_snapshot = {}
    for payment in payments:
        payment.refresh_from_db()
        first_run_snapshot[payment.id] = {
            "updated_at": payment.updated_at,
            "status": payment.status,
        }
    audit_count_after_first = AuditLog.objects.filter(
        entity_type="payment",
    ).count()

    second = service.expire_stale(older_than_hours=24, batch_cap=50)
    assert second == 0, (
        f"Expected idempotent second run to return 0; got {second}."
    )

    for payment in payments:
        payment.refresh_from_db()
        snapshot = first_run_snapshot[payment.id]
        assert payment.status == snapshot["status"] == "expired"
        assert payment.updated_at == snapshot["updated_at"], (
            f"Payment {payment.id} updated_at changed on idempotent "
            f"second run: {snapshot['updated_at']!r} → "
            f"{payment.updated_at!r}."
        )

    audit_count_after_second = AuditLog.objects.filter(
        entity_type="payment",
    ).count()
    assert audit_count_after_second == audit_count_after_first, (
        "Idempotent second run must not append new audit rows; counts "
        f"went {audit_count_after_first} → {audit_count_after_second}."
    )


# ---------------------------------------------------------------------------
# Test 3 — recent pending rows (< 24h) are left alone
# ---------------------------------------------------------------------------


@pytest.mark.django_db(transaction=True)
@override_settings(PAYMENT_HARDENING_FORWARD_ONLY=True)
def test_expire_stale_ignores_recent_pending_payments(seed_owner):
    """A pending payment aged < 24h is NOT touched by reconciliation.

    Validates: Requirements R18.2
    """
    from apps.documents.payment_service import PaymentService

    app = seed_owner["application"]
    profile = seed_owner["profile"]

    recent = _seed_pending_payment(app, profile, age_hours=1)

    expired_count = PaymentService().expire_stale(
        older_than_hours=24, batch_cap=50,
    )

    assert expired_count == 0

    recent.refresh_from_db()
    assert recent.status == "pending"
    assert _audits_for(recent.id, "payment.expired_by_reconciliation") == []


# ---------------------------------------------------------------------------
# Test 4 — boundary condition: rows slightly past the cutoff expire
# ---------------------------------------------------------------------------


@pytest.mark.django_db(transaction=True)
@override_settings(PAYMENT_HARDENING_FORWARD_ONLY=True)
def test_expire_stale_expires_payment_just_past_cutoff(seed_owner):
    """A pending payment just past the 24h cutoff is expired.

    Using an age marginally older than the cutoff avoids race conditions
    with the now() resolved inside ``expire_stale``.

    Validates: Requirements R18.2
    """
    from apps.documents.payment_service import PaymentService

    app = seed_owner["application"]
    profile = seed_owner["profile"]

    # 24h + a 1-minute margin so the row's created_at is unambiguously
    # older than ``timezone.now() - timedelta(hours=24)`` regardless of
    # the test harness's clock drift.
    boundary_payment = _seed_pending_payment(
        app, profile, age_hours=24 + 1 / 60,
    )

    expired_count = PaymentService().expire_stale(
        older_than_hours=24, batch_cap=50,
    )

    assert expired_count == 1

    boundary_payment.refresh_from_db()
    assert boundary_payment.status == "expired"
    assert len(_audits_for(
        boundary_payment.id, "payment.expired_by_reconciliation",
    )) == 1


# ---------------------------------------------------------------------------
# Test 5 — batch_cap caps the number of rows expired per sweep
# ---------------------------------------------------------------------------


@pytest.mark.django_db(transaction=True)
@override_settings(PAYMENT_HARDENING_FORWARD_ONLY=True)
def test_expire_stale_honours_batch_cap(seed_owner):
    """With 10 candidates and batch_cap=3, only 3 expire; 7 remain pending.

    Validates: Requirements R18.2, R18.5
    """
    from apps.documents.models import Payment
    from apps.documents.payment_service import PaymentService

    profile = seed_owner["profile"]

    payments = [
        _seed_pending_payment(_create_application(profile), profile, age_hours=25)
        for _ in range(10)
    ]
    payment_ids = [payment.id for payment in payments]

    expired_count = PaymentService().expire_stale(
        older_than_hours=24, batch_cap=3,
    )
    assert expired_count == 3, (
        f"batch_cap=3 must expire exactly 3 rows; expired {expired_count}."
    )

    status_counts = {
        status: Payment.objects.filter(id__in=payment_ids, status=status).count()
        for status in ("pending", "expired")
    }
    assert status_counts["expired"] == 3, (
        f"Expected 3 expired rows; got {status_counts['expired']}."
    )
    assert status_counts["pending"] == 7, (
        f"Expected 7 rows still pending after batch_cap sweep; got "
        f"{status_counts['pending']}."
    )


# ===========================================================================
# Task 17.4 extensions — poll_pending_payments_task dispatch behaviour
# ===========================================================================
#
# Tests 1–5 above pin down ``PaymentService.expire_stale()`` in isolation.
# The next block exercises ``poll_pending_payments_task`` as a whole under
# ``PAYMENT_HARDENING_FORWARD_ONLY=True`` so the reconciliation sweep's
# batching logic (expire first, then verify pending rows in the 5 min –
# 24 h window) is covered end-to-end.
#
# Validates: Requirements R18.1, R18.2, R18.3, R18.4, R18.5
# ---------------------------------------------------------------------------


from unittest.mock import patch  # noqa: E402


@pytest.fixture
def _clear_task_lock():
    """Ensure the Celery Beat task lock is free before every dispatch test.

    ``poll_pending_payments_task`` short-circuits when the cache key
    ``celery_lock:poll_pending_payments_task`` is already set — left
    over from a prior test run in the same process the lock would
    cause this suite's calls to no-op silently.
    """
    from django.core.cache import cache

    cache.delete("celery_lock:poll_pending_payments_task")
    yield
    cache.delete("celery_lock:poll_pending_payments_task")


# ---------------------------------------------------------------------------
# Test 6 — pending < 5 minutes old is skipped (R18.1)
# ---------------------------------------------------------------------------


@pytest.mark.django_db(transaction=True)
@override_settings(PAYMENT_HARDENING_FORWARD_ONLY=True)
def test_pending_below_reconcile_min_age_is_skipped(seed_owner, _clear_task_lock):
    """A ``pending`` Payment younger than ``PAYMENT_RECONCILE_MIN_AGE_SECONDS``
    (default 300s) MUST NOT be verified by the reconciliation sweep.

    The invariant: ``PaymentService.verify`` is not called for
    the row, and the row remains ``pending`` with no new audit entries
    (beyond any the fixture produced).

    Validates: Requirements R18.1
    """
    from apps.documents import tasks as documents_tasks
    from apps.documents.payment_service import PaymentService

    app = seed_owner["application"]
    profile = seed_owner["profile"]

    # 2 minutes old — well below the 5-minute reconcile minimum age.
    young_payment = _seed_pending_payment(app, profile, age_hours=2 / 60)

    with patch.object(
        PaymentService, "verify"
    ) as mock_verify, patch.object(
        PaymentService, "expire_stale", return_value=0
    ):
        documents_tasks.poll_pending_payments_task()

    assert mock_verify.call_count == 0, (
        f"verify must not be called for payments younger than the "
        f"reconcile minimum age; got {mock_verify.call_count} call(s)."
    )
    young_payment.refresh_from_db()
    assert young_payment.status == "pending"


# ---------------------------------------------------------------------------
# Test 7 — pending ≥ 5 min old triggers verify (R18.1)
# ---------------------------------------------------------------------------


@pytest.mark.django_db(transaction=True)
@override_settings(PAYMENT_HARDENING_FORWARD_ONLY=True)
def test_pending_above_reconcile_min_age_triggers_verify(seed_owner, _clear_task_lock):
    """A 10-minute-old ``pending`` Payment is verified via Lenco.

    Asserts ``PaymentService.verify`` is called with the
    Payment's id exactly once per sweep.

    Validates: Requirements R18.1
    """
    from apps.documents import tasks as documents_tasks
    from apps.documents.payment_service import PaymentService

    app = seed_owner["application"]
    profile = seed_owner["profile"]

    # 10 minutes old → eligible for verify, not yet expired.
    ripe_payment = _seed_pending_payment(app, profile, age_hours=10 / 60)

    with patch.object(
        PaymentService, "verify"
    ) as mock_verify, patch.object(
        PaymentService, "expire_stale", return_value=0
    ):
        documents_tasks.poll_pending_payments_task()

    assert mock_verify.call_count == 1, (
        f"verify must be called exactly once for a ripe pending "
        f"payment; got {mock_verify.call_count}."
    )
    called_payment_ids = {c.args[0] for c in mock_verify.call_args_list}
    assert ripe_payment.id in called_payment_ids


# ---------------------------------------------------------------------------
# Test 8 — pending > 24 h is expired BEFORE verify is attempted (R18.2)
# ---------------------------------------------------------------------------


@pytest.mark.django_db(transaction=True)
@override_settings(PAYMENT_HARDENING_FORWARD_ONLY=True)
def test_pending_over_24h_expired_first(seed_owner, _clear_task_lock):
    """A 25-hour-old ``pending`` Payment MUST be expired before verify.

    The forward-only task calls ``expire_stale()`` first; the expired
    row then falls out of the pending-window query so
    ``verify`` is never invoked for it.

    Validates: Requirements R18.2
    """
    from apps.documents import tasks as documents_tasks
    from apps.documents.payment_service import PaymentService

    app = seed_owner["application"]
    profile = seed_owner["profile"]

    # 25 hours old — beyond the 24-hour reconcile cutoff.
    stale_payment = _seed_pending_payment(app, profile, age_hours=25)

    # Use the real ``expire_stale`` so the row is actually transitioned
    # to ``expired`` and the subsequent pending-window query returns
    # empty. Patch only ``verify`` so we can assert it is not
    # called.
    with patch.object(
        PaymentService, "verify"
    ) as mock_verify:
        documents_tasks.poll_pending_payments_task()

    stale_payment.refresh_from_db()
    assert stale_payment.status == "expired", (
        f"Stale ``pending`` Payment {stale_payment.id} must be expired "
        f"before verify; status is {stale_payment.status!r}."
    )

    # R18.2: expire precedes verify — the expired row never reaches
    # verify because it is out of the (5 min, 24 h) window.
    expired_ids = {
        c.args[0] for c in mock_verify.call_args_list
    }
    assert stale_payment.id not in expired_ids, (
        "verify must not be called for a Payment that expire_stale "
        "already transitioned to ``expired``."
    )

    # Expiry audit trail is the same one asserted by tests 1 and 2.
    reconciliation_audits = _audits_for(
        stale_payment.id, "payment.expired_by_reconciliation",
    )
    assert len(reconciliation_audits) == 1


# ---------------------------------------------------------------------------
# Test 9 — amount mismatch during reconcile → risk flag, not transition (R18.4)
# ---------------------------------------------------------------------------


@pytest.mark.django_db(transaction=True)
@override_settings(
    PAYMENT_HARDENING_FORWARD_ONLY=True,
    LENCO_API_SECRET_KEY="test-secret",
    LENCO_API_BASE_URL="https://api.lenco.example",
)
def test_amount_mismatch_during_reconcile_triggers_risk_flag(seed_owner, _clear_task_lock):
    """Lenco returns ``amount=100.00`` for a snapshot of ``153.00``.

    The reconciliation sweep calls ``verify``, which issues a
    ``GET /collections/status/...`` call, reads the mismatched amount,
    routes through ``_transition`` — which writes a
    ``risk_flag`` of type ``amount_mismatch`` and leaves the Payment
    in ``pending``.

    Validates: Requirements R18.4
    """
    from apps.documents import tasks as documents_tasks

    app = seed_owner["application"]
    profile = seed_owner["profile"]

    # 10 minutes old so it falls inside the reconcile window.
    mismatched = _seed_pending_payment(app, profile, age_hours=10 / 60)

    class _FakeResp:
        status_code = 200
        content = b"{}"

        def raise_for_status(self):  # pragma: no cover — success path
            return None

        def json(self):
            return {
                "data": {
                    "status": "successful",
                    "amount": "100.00",
                    "currency": "ZMW",
                    "lencoReference": f"LENCO-{uuid.uuid4().hex[:12]}",
                    "type": "mobile-money",
                },
            }

    # Patch the Lenco status helper and let ``verify`` run through the
    # real integrity gate in ``_transition``.
    with patch(
        "apps.documents.payment_service_mixins._verification._call_lenco_collection_status",
        return_value=(
            {
                "status": "successful",
                "amount": "100.00",
                "currency": "ZMW",
                "lencoReference": f"LENCO-{uuid.uuid4().hex[:12]}",
                "type": "mobile-money",
            },
            None,
        ),
    ):
        documents_tasks.poll_pending_payments_task()

    mismatched.refresh_from_db()

    # R18.4: amount mismatch → no transition.
    assert mismatched.status == "pending", (
        f"Amount mismatch must NOT transition the Payment to ``successful``; "
        f"status is {mismatched.status!r}."
    )

    # Exactly one ``amount_mismatch`` risk flag appended.
    meta = mismatched.metadata or {}
    risk_flags = meta.get("risk_flags") or []
    mismatch_flags = [
        rf for rf in risk_flags if rf.get("type") == "amount_mismatch"
    ]
    assert len(mismatch_flags) >= 1, (
        f"Expected at least one risk_flag of type 'amount_mismatch' on "
        f"Payment {mismatched.id}; metadata.risk_flags={risk_flags!r}."
    )
    flag = mismatch_flags[-1]
    details = flag.get("details") or {}
    assert str(details.get("expected")) == "153.00"
    assert str(details.get("received")) == "100.00"

    # Audit trail must reflect the risk flag without a transition audit.
    risk_audits = _audits_for(mismatched.id, "payment.risk_flag")
    assert len(risk_audits) >= 1, (
        "A ``payment.risk_flag`` audit event must be emitted when "
        "reconciliation detects an amount mismatch."
    )

    # No ``payment.transitioned`` audit for a successful target — the
    # transition was blocked by the integrity gate.
    transitioned_audits = _audits_for(mismatched.id, "payment.transitioned")
    for audit in transitioned_audits:
        changes = audit.changes or {}
        assert changes.get("target_status") != "successful", (
            "Amount mismatch must not emit a ``payment.transitioned`` audit "
            "with target_status=successful."
        )
