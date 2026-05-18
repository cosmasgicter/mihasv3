"""Unit tests — ``PaymentService._transition()`` state-machine enforcement.

Phase 2 TDD coverage for the payment-hardening spec: these tests
pin down the behaviour of the single mutation entry point described
in the design's "State Machine (Formal)" table before the Task 11
refactor lands. Each test in this module expresses one row of that
table or one rule from Requirement R1, R2, R7, or R9.

TDD note — expected to FAIL until Task 11 ships
------------------------------------------------
The service method under test — ``PaymentService._transition()`` —
does NOT yet exist in ``backend/apps/documents/payment_service.py``.
Task 11 introduces it and routes every payment-status mutation
through it. Running this file today produces AttributeError failures
on every parametrised case; that is the intended TDD flow. Once Task
11 lands, all tests here should go green without further edits.

Scope of this module
--------------------
* 10.1 — explicit allowed/blocked transitions per ``source``.
* 10.2 — application-summary sync inside the same atomic block.
* 10.5 — integrity gate for ``pending → successful`` mismatches.

All persistence assertions use real model factories (not MagicMocks)
because the tests assert that a row is actually written, not that a
method was called.

Validates: Requirements R1.2, R1.3, R1.4, R1.6, R1.7, R2.1, R2.2,
R7.1, R7.2, R7.3, R7.5, R7.6, R9.1, R9.4
"""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
from django.test import override_settings
from django.utils import timezone


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


@pytest.fixture
def seed_applicant(db):
    """Create a student Profile + draft Application + empty Payment row.

    Returns a namedtuple-like dict ``{profile, application, payment}``. The
    Payment starts life in ``pending`` so each parametrised case can mutate
    ``payment.status`` in-place before calling ``_transition()``.
    """
    from apps.accounts.models import Profile
    from apps.applications.models import Application
    from apps.documents.models import Payment

    now = timezone.now()

    profile = Profile.objects.create(
        id=uuid.uuid4(),
        email=f"transitions-{uuid.uuid4().hex[:8]}@example.com",
        first_name="Transitions",
        last_name="Tester",
        role="student",
        is_active=True,
        created_at=now,
        updated_at=now,
    )

    application = Application.objects.create(
        id=uuid.uuid4(),
        application_number=f"APP-{now:%Y%m%d}-{uuid.uuid4().hex[:8].upper()}",
        user=profile,
        full_name="Transitions Student",
        date_of_birth=now.date().replace(year=2000),
        sex="Male",
        phone="+260977000000",
        email=profile.email,
        residence_town="Lusaka",
        nationality="Zambian",
        country="Zambia",
        program="Backfill Test Program",
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
                "program_code": "BFT",
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
    }


def _reset_payment_status(payment, status: str) -> None:
    """Force-set a payment's status directly, bypassing _transition().

    Used only inside fixtures to place the payment in the pre-transition
    state required by a given test case. The grep guard in
    ``test_payment_service_sole_authority.py`` excludes the tests/ tree,
    so this helper is safe.
    """
    payment.status = status
    payment.updated_at = timezone.now()
    payment.save(update_fields=["status", "updated_at"])


def _latest_audit_for(entity_id):
    """Return the most recent AuditLog row for a given entity id."""
    from apps.common.models import AuditLog

    return (
        AuditLog.objects.filter(entity_type="payment", entity_id=entity_id)
        .order_by("-created_at")
        .first()
    )


def _all_audits_for(entity_id):
    """Return all AuditLog rows for a given entity id, oldest first."""
    from apps.common.models import AuditLog

    return list(
        AuditLog.objects.filter(entity_type="payment", entity_id=entity_id)
        .order_by("created_at")
    )


# ---------------------------------------------------------------------------
# Allowed-transition matrix — derived from design.md "State Machine (Formal)"
# ---------------------------------------------------------------------------
#
# Each row is (from_status, target_status, source, expected_result).
# The design allows the following transitions per source. Anything outside
# this set is blocked. ``super_admin_correction`` is phase 5 / optional and
# is not exercised here; ``initiate`` is the creation path and is
# covered by separate initiate tests in the existing suite.

_ALLOWED_CASES = [
    # pending → terminal, via verify / webhook / reconciliation
    ("pending", "successful", "verify"),
    ("pending", "successful", "webhook"),
    ("pending", "successful", "reconciliation"),
    ("pending", "failed", "verify"),
    ("pending", "failed", "webhook"),
    ("pending", "expired", "reconciliation"),
    # deferred → {pending, terminal}
    ("deferred", "pending", "admin_override"),
    ("deferred", "successful", "verify"),
    ("deferred", "successful", "webhook"),
    ("deferred", "successful", "reconciliation"),
    ("deferred", "failed", "verify"),
    ("deferred", "failed", "webhook"),
    ("deferred", "expired", "reconciliation"),
    # Provider webhooks can arrive out of order; a later integrity-clean
    # success is authoritative over an earlier provisional failure.
    ("failed", "successful", "webhook"),
]


_BLOCKED_CASES = [
    # Terminal → anything via normal paths is blocked (R1.3, R1.4).
    ("successful", "pending", "verify"),
    ("successful", "failed", "webhook"),
    ("successful", "expired", "reconciliation"),
    ("successful", "pending", "admin_override"),
    ("failed", "pending", "verify"),
    ("expired", "pending", "verify"),
    ("expired", "successful", "webhook"),
    ("force_approved", "pending", "verify"),
    ("force_approved", "failed", "webhook"),
    # pending → terminal via the WRONG source is blocked.
    ("pending", "expired", "verify"),  # only reconciliation may expire
    ("pending", "expired", "webhook"),
    # deferred → expired via verify is blocked (only reconciliation).
    ("deferred", "expired", "verify"),
]


# ---------------------------------------------------------------------------
# 10.1 — Allowed transitions persist + audit row is written
# ---------------------------------------------------------------------------


@pytest.mark.django_db
@override_settings(PAYMENT_HARDENING_FORWARD_ONLY=True)
@pytest.mark.parametrize(
    ("from_status", "target_status", "source"),
    _ALLOWED_CASES,
    ids=[f"{f}->{t}-via-{s}" for f, t, s in _ALLOWED_CASES],
)
def test_allowed_transition_persists_status_and_writes_audit(
    seed_applicant, from_status, target_status, source,
):
    """Allowed (from, target, source) tuples persist and emit an audit row.

    Validates: Requirements R1.2, R1.7, R9.1, R9.4
    """
    from apps.documents.payment_service import PaymentService

    payment = seed_applicant["payment"]
    _reset_payment_status(payment, from_status)

    # For 'successful' transitions the integrity gate requires a matching
    # provider_data payload (amount, currency, lencoReference). 10.5 covers
    # the mismatch paths; here we provide matching data for the happy path.
    provider_data = {
        "amount": "153.00",
        "currency": "ZMW",
        "lencoReference": f"LENCO-{uuid.uuid4().hex[:12].upper()}",
    } if target_status == "successful" else None

    actor = uuid.uuid4()
    service = PaymentService()
    service._transition(
        payment,
        target_status,
        source=source,
        actor=actor,
        provider_data=provider_data,
    )

    payment.refresh_from_db()
    assert payment.status == target_status, (
        f"Expected {from_status!r} -> {target_status!r} via {source!r} "
        f"to persist; got {payment.status!r} instead."
    )

    audit = _latest_audit_for(payment.id)
    assert audit is not None, (
        f"Expected an AuditLog row for payment {payment.id} after "
        f"_transition({from_status!r} -> {target_status!r}, source={source!r})."
    )
    assert audit.entity_type == "payment"
    assert audit.entity_id == payment.id
    # Action is either 'payment.transitioned' (generic) or a target-scoped
    # action like 'payment.successful' / 'payment.expired'. Accept both
    # forms so the refactor has latitude.
    assert audit.action in (
        "payment.transitioned",
        f"payment.{target_status}",
        "payment.force_approved" if target_status == "force_approved" else "",
    ), f"Unexpected audit action {audit.action!r}"


# ---------------------------------------------------------------------------
# 10.1 — Blocked transitions are no-ops with a transition_blocked audit row
# ---------------------------------------------------------------------------


@pytest.mark.django_db
@override_settings(PAYMENT_HARDENING_FORWARD_ONLY=True)
@pytest.mark.parametrize(
    ("from_status", "target_status", "source"),
    _BLOCKED_CASES,
    ids=[f"{f}->{t}-via-{s}" for f, t, s in _BLOCKED_CASES],
)
def test_blocked_transition_is_noop_and_writes_block_audit(
    seed_applicant, from_status, target_status, source,
):
    """Disallowed (from, target, source) tuples leave the Payment unchanged.

    Also verifies that a ``payment.transition_blocked`` audit row is written
    so operators can see the attempt.

    Validates: Requirements R1.3, R1.4, R1.7, R2.1, R9.1
    """
    from apps.documents.payment_service import PaymentService

    payment = seed_applicant["payment"]
    _reset_payment_status(payment, from_status)
    # Capture the updated_at that existed before the call so we can confirm
    # the row wasn't silently re-saved.
    pre_updated_at = payment.updated_at

    service = PaymentService()
    service._transition(
        payment,
        target_status,
        source=source,
        actor=uuid.uuid4(),
        provider_data={
            "amount": "153.00",
            "currency": "ZMW",
            "lencoReference": "LENCO-IGNORED",
        } if target_status == "successful" else None,
    )

    payment.refresh_from_db()
    assert payment.status == from_status, (
        f"Expected blocked transition {from_status!r} -> {target_status!r} "
        f"via {source!r} to leave status unchanged; got {payment.status!r}."
    )
    # Blocked transitions must not nudge updated_at either (besides the
    # audit write, which lives on a different row).
    assert payment.updated_at == pre_updated_at, (
        "Blocked transition must not re-save the Payment row."
    )

    audit = _latest_audit_for(payment.id)
    assert audit is not None, (
        "Blocked transitions must still emit an audit entry."
    )
    assert audit.action == "payment.transition_blocked", (
        f"Expected 'payment.transition_blocked', got {audit.action!r}"
    )
    # The audit changes payload must carry enough context to reconstruct
    # the attempted transition.
    changes = audit.changes or {}
    assert changes.get("source") == source
    assert changes.get("from_status") == from_status
    assert changes.get("target_status") == target_status


# ---------------------------------------------------------------------------
# 10.2 — Application.payment_status syncs inside the same atomic block
# ---------------------------------------------------------------------------


# Canonical payment-status → application-summary-status map, per the
# design's PAYMENT_TO_APP_MAP. The test compares whatever value landed
# on ``Application.payment_status`` against this table.
_PAYMENT_TO_APP_MAP = {
    "successful": "verified",
    "force_approved": "verified",
    "failed": "failed",
    "expired": "not_paid",
    "deferred": "deferred",
    "pending": "pending_review",
}


@pytest.mark.django_db
@override_settings(PAYMENT_HARDENING_FORWARD_ONLY=True)
@pytest.mark.parametrize(
    ("from_status", "target_status", "source"),
    [
        ("pending", "successful", "webhook"),
        ("pending", "failed", "verify"),
        ("pending", "expired", "reconciliation"),
        ("deferred", "successful", "webhook"),
        ("deferred", "failed", "verify"),
    ],
    ids=[
        "pending->successful",
        "pending->failed",
        "pending->expired",
        "deferred->successful",
        "deferred->failed",
    ],
)
def test_successful_transition_syncs_application_payment_status_atomically(
    seed_applicant, from_status, target_status, source,
):
    """After ``_transition()`` commits, Application.payment_status matches.

    Additionally verifies that the Payment update and the Application
    update are visible together — either both committed or neither — by
    wrapping the service call in a ``transaction.atomic()`` sentinel and
    ``refresh_from_db``-ing both rows inside the inner block.

    Validates: Requirements R1.1, R1.6
    """
    from django.db import transaction
    from apps.applications.models import Application
    from apps.documents.payment_service import PaymentService

    payment = seed_applicant["payment"]
    application = seed_applicant["application"]
    _reset_payment_status(payment, from_status)

    provider_data = {
        "amount": "153.00",
        "currency": "ZMW",
        "lencoReference": f"LENCO-{uuid.uuid4().hex[:12].upper()}",
    } if target_status == "successful" else None

    # Sentinel atomic block: _transition() is expected to open and commit
    # its OWN atomic, nested inside this outer one, so both the payment and
    # application updates become visible together on return.
    with transaction.atomic():
        PaymentService()._transition(
            payment,
            target_status,
            source=source,
            actor=uuid.uuid4(),
            provider_data=provider_data,
        )

        payment.refresh_from_db()
        application.refresh_from_db()

        assert payment.status == target_status
        expected_app_status = _PAYMENT_TO_APP_MAP[target_status]
        assert application.payment_status == expected_app_status, (
            f"Expected Application.payment_status={expected_app_status!r} "
            f"after Payment transitions to {target_status!r}; got "
            f"{application.payment_status!r}."
        )

    # And after the outer commit the values are still consistent. This
    # catches the case where the service updates land in separate
    # transactions and one leaks visibility before the other.
    payment.refresh_from_db()
    application.refresh_from_db()
    assert payment.status == target_status
    assert application.payment_status == _PAYMENT_TO_APP_MAP[target_status]


# ---------------------------------------------------------------------------
# 10.5 — Integrity gate blocks mismatched successful transitions
# ---------------------------------------------------------------------------


# Four integrity-failure scenarios, each expected to:
#   1. Leave payment.status == 'pending'
#   2. Append exactly one risk_flag of the matching type
#   3. Emit a 'payment.risk_flag' audit row with risk_flag_type in changes
_INTEGRITY_CASES = [
    (
        "amount_mismatch",
        {
            "amount": "150.00",           # snapshot expects 153.00
            "currency": "ZMW",
            "lencoReference": "LENCO-AMISMATCH",
        },
    ),
    (
        "currency_mismatch",
        {
            "amount": "153.00",
            "currency": "USD",            # snapshot expects ZMW
            "lencoReference": "LENCO-CMISMATCH",
        },
    ),
    (
        "invalid_amount",
        {
            "amount": "-1.00",            # zero/negative/unparseable
            "currency": "ZMW",
            "lencoReference": "LENCO-BADAMT",
        },
    ),
    (
        "missing_provider_reference",
        {
            "amount": "153.00",
            "currency": "ZMW",
            "lencoReference": "",         # empty provider reference
        },
    ),
]


@pytest.mark.django_db
@override_settings(PAYMENT_HARDENING_FORWARD_ONLY=True)
@pytest.mark.parametrize(
    ("risk_type", "provider_data"),
    _INTEGRITY_CASES,
    ids=[case[0] for case in _INTEGRITY_CASES],
)
@pytest.mark.parametrize(
    "source",
    ["webhook", "verify"],
    ids=["via-webhook", "via-verify"],
)
def test_integrity_gate_blocks_mismatched_successful_transition(
    seed_applicant, risk_type, provider_data, source,
):
    """Mismatch on amount, currency, or provider reference blocks ``successful``.

    The payment must stay ``pending``, a single ``risk_flags`` entry of the
    correct type must be appended to metadata, and a ``payment.risk_flag``
    audit row must carry the risk type in its ``changes`` payload.

    Validates: Requirements R7.1, R7.2, R7.3, R7.5, R7.6
    """
    from apps.documents.payment_service import PaymentService

    payment = seed_applicant["payment"]
    _reset_payment_status(payment, "pending")

    # Record the baseline risk_flags count so we can assert "exactly one
    # more" was appended rather than "at least one exists".
    baseline_flags = list((payment.metadata or {}).get("risk_flags") or [])
    baseline_audits = _all_audits_for(payment.id)

    PaymentService()._transition(
        payment,
        "successful",
        source=source,
        actor=uuid.uuid4(),
        provider_data=provider_data,
    )

    payment.refresh_from_db()
    # (a) status unchanged
    assert payment.status == "pending", (
        f"Integrity gate must block {risk_type!r} via {source!r}; "
        f"status became {payment.status!r}."
    )

    # (b) exactly one matching risk_flag appended
    flags_after = list((payment.metadata or {}).get("risk_flags") or [])
    assert len(flags_after) == len(baseline_flags) + 1, (
        f"Expected exactly one new risk_flag; got "
        f"{len(flags_after) - len(baseline_flags)} new entries."
    )
    new_flag = flags_after[-1]
    assert new_flag.get("type") == risk_type, (
        f"Expected risk_flag type {risk_type!r}; got {new_flag.get('type')!r}."
    )

    # (c) a payment.risk_flag audit row was written carrying the risk type
    audits_after = _all_audits_for(payment.id)
    new_audits = audits_after[len(baseline_audits):]
    risk_audits = [a for a in new_audits if a.action == "payment.risk_flag"]
    assert len(risk_audits) == 1, (
        f"Expected exactly one 'payment.risk_flag' audit; got "
        f"{len(risk_audits)}. All new audit actions: "
        f"{[a.action for a in new_audits]}."
    )
    audit_changes = risk_audits[0].changes or {}
    # The risk type may be carried under 'risk_flag_type' (preferred),
    # 'type', or nested under 'details'. Accept all three shapes so the
    # refactor has latitude in how it serialises the audit payload.
    risk_type_field = (
        audit_changes.get("risk_flag_type")
        or audit_changes.get("type")
        or (audit_changes.get("details") or {}).get("type")
    )
    assert risk_type_field == risk_type, (
        f"Expected audit row to carry risk_type={risk_type!r}; "
        f"got changes={audit_changes!r}."
    )
