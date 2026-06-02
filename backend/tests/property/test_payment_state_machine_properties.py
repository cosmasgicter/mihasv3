"""Property-based tests — Phase 2 state machine invariants.

Enforcement PBTs for Task 16 of the payment-hardening spec. Each test runs
under @override_settings(PAYMENT_HARDENING_FORWARD_ONLY=True) so the
hardened code paths are exercised.

Validates: Requirements R1.1, R1.2, R1.3, R1.4, R1.6, R1.7, R2.1, R3.1, R3.2,
R3.3, R3.5, R3.6, R6.2, R6.3, R9.1, R10.1, R20.1, R20.2.
"""

from __future__ import annotations

import copy
import threading
import uuid
from datetime import timedelta
from decimal import Decimal
from itertools import product
from typing import Any

import pytest
from django.db import connection
from django.test import override_settings
from django.utils import timezone
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st


# ---------------------------------------------------------------------------
# Shared canonical state-machine tables (mirror payment_service.py)
# ---------------------------------------------------------------------------


_CANONICAL_STATUSES: tuple[str, ...] = (
    "pending",
    "deferred",
    "successful",
    "failed",
    "expired",
    "force_approved",
)

_TERMINAL_STATUSES: frozenset[str] = frozenset(
    {"successful", "failed", "expired", "force_approved"}
)

_NON_SUPER_ADMIN_SOURCES: tuple[str, ...] = (
    "verify",
    "webhook",
    "reconciliation",
    "admin_override",
)

# ADR-1 mapping — Payment canonical status → Application summary status.
_PAYMENT_TO_APP_MAP: dict[str, str] = {
    "successful": "verified",
    "force_approved": "verified",
    "failed": "failed",
    "expired": "not_paid",
    "deferred": "deferred",
    "pending": "pending_review",
}


def _allowed_transition_map() -> dict[tuple[str, str], set[str]]:
    """Load the forward-only transition matrix from the service module.

    Imported lazily so module collection does not touch Django apps before
    ``django.setup()`` runs via ``backend/tests/conftest.py``.
    """
    from apps.documents.payment_service import ALLOWED_TRANSITIONS

    # Drop creation-style entries (from_status == "") — the P14 closure
    # property only covers transitions between real canonical statuses.
    return {
        (f, t): sources
        for (f, t), sources in ALLOWED_TRANSITIONS.items()
        if f in _CANONICAL_STATUSES
    }


def _build_sequence_elements() -> list[tuple[str, str, str]]:
    """Flatten ALLOWED_TRANSITIONS into a list of (from, target, source) tuples.

    Used by the P13 Application-summary property to draw random allowed
    transitions without re-implementing the matrix.
    """
    elements: list[tuple[str, str, str]] = []
    for (from_status, target_status), sources in _allowed_transition_map().items():
        for source in sources:
            if source == "super_admin_correction":
                # Reserved for the "terminal → anything" escape hatch.
                continue
            elements.append((from_status, target_status, source))
    return elements


_ALLOWED_SEQUENCE_ELEMENTS: list[tuple[str, str, str]] = _build_sequence_elements()


def _build_closure_grid() -> list[tuple[str, str, str]]:
    """Return the full 6 × 6 × 4 = 144 (from, target, source) cross product.

    Excludes ``super_admin_correction`` because the service intentionally
    lets that source bypass the matrix with a ≥10-char reason; the
    forward-only closure property only governs the non-super-admin paths.
    """
    return [
        (f, t, s)
        for f, t, s in product(
            _CANONICAL_STATUSES, _CANONICAL_STATUSES, _NON_SUPER_ADMIN_SOURCES
        )
    ]


_CLOSURE_GRID: list[tuple[str, str, str]] = _build_closure_grid()
assert len(_CLOSURE_GRID) == 6 * 6 * 4 == 144


# ---------------------------------------------------------------------------
# Test fixtures — real model rows, not MagicMocks
# ---------------------------------------------------------------------------


@pytest.fixture
def seed_applicant(db):
    """Create a resolvable Program + ProgramFee + Profile + submitted Application.

    Tests that invoke ``PaymentService().initiate()`` need the catalog side
    populated so ``IdentifierResolver.resolve_program`` and
    ``FeeResolver.resolve_fee`` resolve successfully. Tests that only
    exercise ``_transition()`` can ignore the program/fee rows — they only
    care about the Application and Payment rows.
    """
    from apps.accounts.models import Profile
    from apps.applications.models import Application
    from apps.catalog.models import Institution, Program
    from apps.documents.models import Payment, ProgramFee

    now = timezone.now()
    suffix = uuid.uuid4().hex[:8]

    institution = Institution.objects.create(
        id=uuid.uuid4(),
        name=f"MIHAS Phase 2 Institute {suffix}",
        code=f"INST-{suffix.upper()}",
        is_active=True,
        created_at=now,
        updated_at=now,
    )

    program = Program.objects.create(
        id=uuid.uuid4(),
        name=f"Phase 2 Test Program {suffix}",
        code=f"PHASE2-{suffix.upper()}",
        institution=institution,
        duration_months=36,
        application_fee=Decimal("153.00"),
        is_active=True,
        created_at=now,
        updated_at=now,
    )

    ProgramFee.objects.create(
        id=uuid.uuid4(),
        program=program,
        fee_type="application",
        residency_category="local",
        amount=Decimal("153.00"),
        currency="ZMW",
        is_active=True,
        created_at=now,
        updated_at=now,
    )

    profile = Profile.objects.create(
        id=uuid.uuid4(),
        email=f"phase2-{suffix}@example.com",
        first_name="Phase2",
        last_name="Tester",
        role="student",
        is_active=True,
        created_at=now,
        updated_at=now,
    )

    application = Application.objects.create(
        id=uuid.uuid4(),
        application_number=f"APP-{now:%Y%m%d}-{suffix.upper()}",
        user=profile,
        full_name="Phase2 Student",
        date_of_birth=now.date().replace(year=2000),
        sex="Male",
        phone="+260977000000",
        email=profile.email,
        residence_town="Lusaka",
        nationality="Zambian",
        country="Zambia",
        program=program.code,
        intake="January 2025",
        institution=institution.name,
        status="submitted",
        payment_status="pending",
        version=1,
        created_at=now,
        updated_at=now,
    )

    return {
        "profile": profile,
        "application": application,
        "program": program,
        "institution": institution,
    }


def _make_payment(application, profile, *, status: str, created_at=None):
    """Create a minimal Payment row in the requested status.

    Used by fixtures to prep a row for _transition() without routing the
    initial creation through the hardened path.
    """
    from apps.documents.models import Payment

    now = created_at or timezone.now()
    return Payment.objects.create(
        id=uuid.uuid4(),
        application=application,
        user=profile,
        amount=Decimal("153.00"),
        currency="ZMW",
        status=status,
        transaction_reference=(
            f"MIHAS-{application.application_number}-"
            f"{uuid.uuid4().hex[:12]}"
        ),
        metadata={
            "snapshot": {
                "expected_amount": "153.00",
                "currency": "ZMW",
                "residency_category": "local",
                "program_code": "PHASE2",
                "intake_id": None,
                "waiver_applied": False,
                "original_amount": "153.00",
                "fee_source": "program_fee",
            },
        },
        created_at=now,
        updated_at=now,
    )


def _set_payment_status(payment, status: str) -> None:
    """Force-set payment.status directly (test-only helper)."""
    payment.status = status
    payment.updated_at = timezone.now()
    payment.save(update_fields=["status", "updated_at"])


def _latest_transition_blocked_audits(entity_id):
    """Return all payment.transition_blocked audits for an entity id."""
    from apps.common.models import AuditLog

    return list(
        AuditLog.objects.filter(
            entity_type="payment",
            entity_id=entity_id,
            action="payment.transition_blocked",
        )
    )


# ---------------------------------------------------------------------------
# P1 — Race-Safe Concurrent Initiation (Task 16.1)
# ---------------------------------------------------------------------------


@pytest.mark.django_db(transaction=True)
@override_settings(PAYMENT_HARDENING_FORWARD_ONLY=True)
@given(n=st.integers(min_value=2, max_value=8))
@settings(
    max_examples=25,
    deadline=None,
    suppress_health_check=[
        HealthCheck.function_scoped_fixture,
        HealthCheck.too_slow,
    ],
)
def test_property_1_race_safety(seed_applicant, n):
    """P1: N concurrent initiations produce exactly one active Payment row.

    Validates: Requirements R3.1, R3.2, R3.3, R20.1
    """
    from apps.documents.models import Payment
    from apps.documents.payment_service import PaymentService

    if connection.vendor == "sqlite":
        pytest.skip("SQLite locks the whole table during concurrent write race tests")

    # Reset database state between Hypothesis examples so each example
    # starts from a clean slate. The ``seed_applicant`` fixture only runs
    # once per test function, not per example.
    Payment.objects.filter(application_id=seed_applicant["application"].id).delete()

    app_id = seed_applicant["application"].id
    user_id = seed_applicant["profile"].id

    results: list[Any] = []
    errors: list[BaseException] = []

    def _worker() -> None:
        # Each thread owns its own DB connection — sharing the main
        # thread's connection across workers corrupts the transaction
        # state. Closing on entry forces Django to open a fresh one for
        # this thread on first query.
        connection.close()
        try:
            result = PaymentService().initiate(app_id, user_id)
            results.append(result)
        except BaseException as exc:  # pragma: no cover - defensive
            errors.append(exc)
        finally:
            connection.close()

    threads = [threading.Thread(target=_worker) for _ in range(n)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=30)

    assert not errors, f"Worker threads raised unexpected errors: {errors!r}"
    assert len(results) == n, f"Expected {n} results; got {len(results)}"

    # Exactly one active payment row must exist.
    active_count = Payment.objects.filter(
        application_id=app_id,
        status__in=("pending", "deferred"),
    ).count()
    assert active_count == 1, (
        f"Expected exactly 1 active (pending/deferred) payment after {n} "
        f"concurrent initiations; got {active_count}."
    )

    # All callers must see the same payment_id.
    payment_ids = {r.payment_id for r in results}
    assert len(payment_ids) == 1, (
        f"Concurrent initiations returned divergent payment_ids: {payment_ids!r}"
    )
    returned_id = payment_ids.pop()
    assert returned_id is not None, "Initiation returned payment_id=None"

    # And that single id must match the single active row on disk.
    on_disk = Payment.objects.get(
        application_id=app_id,
        status__in=("pending", "deferred"),
    )
    assert on_disk.id == returned_id


# ---------------------------------------------------------------------------
# P2 — Terminal Stability (Task 16.2)
# ---------------------------------------------------------------------------


_TERMINAL_INPUT_STRATEGY = st.fixed_dictionaries(
    {
        "amount": st.sampled_from(["153.00", "200.00", "-1.00", "abc"]),
        "currency": st.sampled_from(["ZMW", "USD", "zmw"]),
        "lencoReference": st.one_of(
            st.just(""),
            st.text(
                alphabet=st.characters(
                    whitelist_categories=("Lu", "Nd"),
                ),
                min_size=4,
                max_size=20,
            ),
        ),
        "status": st.sampled_from(
            ["successful", "failed", "pending", "paid"]
        ),
    }
)


@pytest.mark.django_db
@override_settings(PAYMENT_HARDENING_FORWARD_ONLY=True)
@given(
    terminal=st.sampled_from(
        ["successful", "failed", "expired", "force_approved"]
    ),
    payload=_TERMINAL_INPUT_STRATEGY,
    channel=st.sampled_from(["verify", "webhook", "admin"]),
)
@settings(
    max_examples=100,
    deadline=None,
    suppress_health_check=[
        HealthCheck.function_scoped_fixture,
        HealthCheck.too_slow,
    ],
)
def test_property_2_terminal_stability(
    seed_applicant, terminal, payload, channel
):
    """P2: Terminal rows are stable except provider-confirmed late success.

    Captures a snapshot of ``(status, metadata.snapshot, receipt_number,
    application.payment_status)`` before the input arrives, applies the
    input via the relevant service method, and asserts every captured
    field is byte-for-byte unchanged.

    Validates: Requirements R1.3, R1.4, R2.1, R9.1, R10.1, R20.2
    """
    from apps.applications.models import Application
    from apps.documents.models import Payment
    from apps.documents.payment_service import PaymentService

    application = seed_applicant["application"]
    profile = seed_applicant["profile"]

    # Clear any residual rows from prior examples, then place the row in
    # the requested terminal state.
    Payment.objects.filter(application_id=application.id).delete()
    payment = _make_payment(application, profile, status="pending")
    payment.receipt_number = f"RCPT{uuid.uuid4().hex[:8].upper()}"
    payment.save(update_fields=["receipt_number"])
    _set_payment_status(payment, terminal)

    # Sync the application summary to match the terminal state so the
    # "unchanged" assertion is meaningful.
    application.payment_status = _PAYMENT_TO_APP_MAP[terminal]
    application.save(update_fields=["payment_status"])

    # --- Snapshot baseline state ---
    payment.refresh_from_db()
    baseline_status = payment.status
    baseline_snapshot = copy.deepcopy((payment.metadata or {}).get("snapshot"))
    baseline_receipt = payment.receipt_number
    application.refresh_from_db()
    baseline_app_payment_status = application.payment_status

    service = PaymentService()

    # --- Apply the non-super_admin_correction input ---
    if channel == "verify":
        # verify() early-returns for non-pending rows without calling Lenco.
        service.verify(payment.id, actor_id=None)
    elif channel == "webhook":
        event_type = (
            "collection.successful"
            if payload["status"] in ("successful", "paid")
            else "collection.failed"
        )
        service.apply_webhook_event(
            event_type,
            payment.transaction_reference,
            {"data": payload},
        )
    else:  # channel == "admin"
        # review_application_payment maps 'verified' → successful, etc.
        mapped_status = {
            "successful": "verified",
            "failed": "rejected",
            "pending": "pending_review",
            "paid": "verified",
        }[payload["status"]]
        try:
            service.review_application_payment(
                application_id=application.id,
                payment_status=mapped_status,
                reviewed_by_id=str(uuid.uuid4()),
                notes="attempted admin override on terminal row",
            )
        except ValueError:
            # The service rejects some forbidden transitions (e.g.
            # successful → pending) with a ValueError; that's a valid
            # form of "terminal is stable" and does not mutate state.
            pass

    # A valid provider success is authoritative over an earlier provisional
    # failure webhook, so that one convergence path is intentionally allowed.
    if (
        terminal == "failed"
        and channel == "webhook"
        and payload["status"] in ("successful", "paid")
        and payload.get("lencoReference")
        and payload["amount"] == "153.00"
        and payload["currency"].upper() == "ZMW"
    ):
        payment.refresh_from_db()
        application.refresh_from_db()
        assert payment.status == "successful"
        assert application.payment_status == "verified"
        return

    # Admin "Reopen Review" is an intentional, money-safe exception: a
    # failed/expired payment (no funds collected) may be reopened to
    # ``pending`` so it can be re-reviewed. See the production regression in
    # tests/unit/test_payment_review_reopen.py. Every OTHER admin target on a
    # terminal row is still refused by _review_application_payment_impl.
    if (
        terminal in ("failed", "expired")
        and channel == "admin"
        and payload["status"] == "pending"
    ):
        payment.refresh_from_db()
        assert payment.status == "pending"
        return

    # --- Assert all four fields unchanged ---
    payment.refresh_from_db()
    application.refresh_from_db()

    assert payment.status == baseline_status, (
        f"Terminal {terminal!r} status mutated to {payment.status!r} "
        f"via {channel!r} (payload={payload!r})."
    )
    current_snapshot = (payment.metadata or {}).get("snapshot")
    assert current_snapshot == baseline_snapshot, (
        f"metadata.snapshot mutated on terminal Payment (channel={channel!r}, "
        f"payload={payload!r}). Before={baseline_snapshot!r} "
        f"After={current_snapshot!r}."
    )
    assert payment.receipt_number == baseline_receipt, (
        f"receipt_number mutated on terminal Payment "
        f"(before={baseline_receipt!r} after={payment.receipt_number!r})."
    )
    assert application.payment_status == baseline_app_payment_status, (
        f"Application.payment_status mutated on terminal Payment "
        f"(before={baseline_app_payment_status!r} "
        f"after={application.payment_status!r})."
    )


# ---------------------------------------------------------------------------
# P13 — Application Summary Consistency (Task 16.4)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
@override_settings(PAYMENT_HARDENING_FORWARD_ONLY=True)
@given(
    transition_sequence=st.lists(
        st.sampled_from(_ALLOWED_SEQUENCE_ELEMENTS),
        min_size=1,
        max_size=8,
    )
)
@settings(
    max_examples=100,
    deadline=None,
    suppress_health_check=[
        HealthCheck.function_scoped_fixture,
        HealthCheck.too_slow,
    ],
)
def test_property_13_application_summary_consistency(
    seed_applicant, transition_sequence
):
    """P13: After every committed transition, Application.payment_status
    matches ``PAYMENT_TO_APP_MAP[payment.status]``.

    Validates: Requirements R1.1, R1.6
    """
    from apps.applications.models import Application
    from apps.documents.models import Payment
    from apps.documents.payment_service import PaymentService

    application = seed_applicant["application"]
    profile = seed_applicant["profile"]

    # Fresh Payment per example — tests can only start from 'pending' /
    # 'deferred' because _transition() refuses terminal → anything via
    # the non-super-admin sources listed in _ALLOWED_SEQUENCE_ELEMENTS.
    Payment.objects.filter(application_id=application.id).delete()
    payment = _make_payment(application, profile, status="pending")

    # Reset the summary so the starting invariant holds.
    application.payment_status = _PAYMENT_TO_APP_MAP[payment.status]
    application.save(update_fields=["payment_status"])

    service = PaymentService()

    for from_status, target_status, source in transition_sequence:
        payment.refresh_from_db()
        if payment.status != from_status:
            # The sequence does not line up with the current row — simulate
            # a realistic caller that checks state first by skipping.
            continue

        provider_data = None
        if target_status == "successful":
            provider_data = {
                "amount": "153.00",
                "currency": "ZMW",
                "lencoReference": f"LENCO-{uuid.uuid4().hex[:12].upper()}",
            }

        result = service._transition(
            payment,
            target_status,
            source=source,
            actor=None,
            provider_data=provider_data,
        )

        payment.refresh_from_db()
        application.refresh_from_db()

        if result.risk_flag is not None:
            # Integrity gate blocked the move — the payment must still be
            # in ``from_status`` and the summary must still match.
            assert payment.status == from_status
            expected_summary = _PAYMENT_TO_APP_MAP[from_status]
        else:
            assert payment.status == target_status, (
                f"Expected {from_status}->{target_status} via {source} to "
                f"persist; got {payment.status}."
            )
            expected_summary = _PAYMENT_TO_APP_MAP[target_status]

        assert application.payment_status == expected_summary, (
            f"Application.payment_status drifted from payment.status: "
            f"payment={payment.status!r} "
            f"application.payment_status={application.payment_status!r} "
            f"expected={expected_summary!r}."
        )


# ---------------------------------------------------------------------------
# P14 — Forward-Only Transition Closure (Task 16.5)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
@override_settings(PAYMENT_HARDENING_FORWARD_ONLY=True)
@pytest.mark.parametrize(
    ("from_status", "target_status", "source"),
    _CLOSURE_GRID,
    ids=[f"{f}->{t}-via-{s}" for f, t, s in _CLOSURE_GRID],
)
def test_property_14_forward_only_closure(
    seed_applicant, from_status, target_status, source
):
    """P14: _transition applies the mutation iff the tuple is allowed.

    For the full 6 × 6 × 4 = 144 grid of ``(from, target, source)``:

    * Allowed tuples → payment.status becomes ``target_status``.
    * Blocked tuples → payment.status stays ``from_status`` AND exactly
      one ``payment.transition_blocked`` audit row is written.

    Validates: Requirements R1.2, R1.7
    """
    from apps.documents.models import Payment
    from apps.documents.payment_service import (
        ALLOWED_TRANSITIONS,
        PaymentService,
    )

    application = seed_applicant["application"]
    profile = seed_applicant["profile"]

    # Fresh Payment per parametrised case.
    Payment.objects.filter(application_id=application.id).delete()
    payment = _make_payment(application, profile, status="pending")
    _set_payment_status(payment, from_status)

    allowed_sources = ALLOWED_TRANSITIONS.get((from_status, target_status), set())
    is_allowed = source in allowed_sources

    is_same_status_replay = from_status == target_status and source in {
        "webhook",
        "verify",
        "reconciliation",
    }

    baseline_blocked = len(_latest_transition_blocked_audits(payment.id))

    provider_data = None
    if target_status == "successful":
        provider_data = {
            "amount": "153.00",
            "currency": "ZMW",
            "lencoReference": f"LENCO-{uuid.uuid4().hex[:12].upper()}",
        }

    PaymentService()._transition(
        payment,
        target_status,
        source=source,
        actor=None,
        provider_data=provider_data,
    )

    payment.refresh_from_db()
    blocked_audits_after = _latest_transition_blocked_audits(payment.id)
    new_blocked_audits = len(blocked_audits_after) - baseline_blocked

    if is_same_status_replay:
        assert payment.status == from_status
        assert new_blocked_audits == 0
    elif is_allowed:
        assert payment.status == target_status, (
            f"Allowed tuple ({from_status}, {target_status}, {source}) "
            f"failed to persist; got {payment.status!r}."
        )
        assert new_blocked_audits == 0, (
            f"Allowed tuple ({from_status}, {target_status}, {source}) "
            f"still wrote {new_blocked_audits} transition_blocked audit(s)."
        )
    else:
        assert payment.status == from_status, (
            f"Blocked tuple ({from_status}, {target_status}, {source}) "
            f"leaked a mutation; status became {payment.status!r}."
        )
        assert new_blocked_audits == 1, (
            f"Blocked tuple ({from_status}, {target_status}, {source}) "
            f"wrote {new_blocked_audits} transition_blocked audit rows; "
            f"expected exactly 1."
        )


# ---------------------------------------------------------------------------
# P19 — Retry Limit Threshold (Task 16.6)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
@override_settings(PAYMENT_HARDENING_FORWARD_ONLY=True)
@given(
    prior_attempts=st.integers(min_value=0, max_value=10),
    expired_old_count=st.integers(min_value=0, max_value=10),
)
@settings(
    max_examples=100,
    deadline=None,
    suppress_health_check=[
        HealthCheck.function_scoped_fixture,
        HealthCheck.too_slow,
    ],
)
def test_property_19_retry_limit_threshold(
    seed_applicant, prior_attempts, expired_old_count
):
    """P19: initiate() raises MAX_PAYMENT_ATTEMPTS_EXCEEDED iff non-excluded
    attempt count (= prior_attempts) is ≥ 5.

    Old (>7 days) expired Payments are excluded from the attempt count
    (Req 3.6), so increasing ``expired_old_count`` alone must never flip
    the outcome.

    Validates: Requirements R3.5, R3.6
    """
    from apps.documents.models import Payment
    from apps.documents.payment_service import (
        EXPIRED_EXCLUSION_DAYS,
        MAX_PAYMENT_ATTEMPTS,
        PaymentService,
    )

    application = seed_applicant["application"]
    profile = seed_applicant["profile"]

    # Wipe any rows from prior examples.
    Payment.objects.filter(application_id=application.id).delete()

    now = timezone.now()
    old_cutoff = now - timedelta(days=EXPIRED_EXCLUSION_DAYS + 1)

    # Non-expired payments count toward the limit. Keep them all ``failed``
    # (a terminal, non-excluded status) so they're counted but not active.
    for _ in range(prior_attempts):
        p = _make_payment(application, profile, status="pending")
        _set_payment_status(p, "failed")

    # Old expired payments must be excluded (Req 3.6).
    for _ in range(expired_old_count):
        _make_payment(application, profile, status="expired", created_at=old_cutoff)

    non_excluded_count = prior_attempts  # expired>7d rows are excluded
    should_raise = non_excluded_count >= MAX_PAYMENT_ATTEMPTS

    service = PaymentService()

    if should_raise:
        with pytest.raises(ValueError) as excinfo:
            service.initiate(application.id, profile.id)
        assert str(excinfo.value).startswith("MAX_PAYMENT_ATTEMPTS_EXCEEDED"), (
            f"Expected MAX_PAYMENT_ATTEMPTS_EXCEEDED; got {excinfo.value!r}."
        )
    else:
        # Below the threshold: initiate must succeed without raising. The
        # call may either create a new payment or return an existing
        # active row — both are acceptable.
        result = service.initiate(application.id, profile.id)
        assert result is not None


# ---------------------------------------------------------------------------
# P23 — Snapshot Immutability (Task 16.7)
# ---------------------------------------------------------------------------


def _operation_strategy() -> st.SearchStrategy[dict]:
    """Draw one of three post-creation operations: transition, provider_init, merge."""
    transition_op = st.fixed_dictionaries(
        {
            "kind": st.just("transition"),
            "target": st.sampled_from(["successful", "failed", "expired"]),
            "source": st.sampled_from(
                ["verify", "webhook", "reconciliation"]
            ),
        }
    )
    provider_init_op = st.fixed_dictionaries(
        {
            "kind": st.just("mark_provider_initiation"),
            "status": st.sampled_from(
                ["sent", "accepted", "rejected", "unknown"]
            ),
        }
    )
    metadata_merge_op = st.fixed_dictionaries(
        {
            "kind": st.just("metadata_merge"),
            "key": st.text(
                alphabet=st.characters(whitelist_categories=("Ll", "Lu", "Nd")),
                min_size=1,
                max_size=12,
            ),
            "value": st.one_of(
                st.integers(-1000, 1000),
                st.text(
                    alphabet=st.characters(blacklist_categories=("Cs",), blacklist_characters="\x00"),
                    max_size=20,
                ),
                st.booleans(),
                st.none(),
            ),
        }
    )
    return st.one_of(transition_op, provider_init_op, metadata_merge_op)


@pytest.mark.django_db
@override_settings(PAYMENT_HARDENING_FORWARD_ONLY=True)
@given(operations=st.lists(_operation_strategy(), min_size=1, max_size=5))
@settings(
    max_examples=100,
    deadline=None,
    suppress_health_check=[
        HealthCheck.function_scoped_fixture,
        HealthCheck.too_slow,
    ],
)
def test_property_23_snapshot_immutability(seed_applicant, operations):
    """P23: metadata.snapshot captured at t0 equals the value observed at
    any t1 > t0, regardless of which transitions, provider initiation
    marks, or metadata merges happen in between.

    Validates: Requirements R6.2, R6.3
    """
    from apps.documents.models import Payment
    from apps.documents.payment_service import PaymentService

    application = seed_applicant["application"]
    profile = seed_applicant["profile"]

    Payment.objects.filter(application_id=application.id).delete()
    payment = _make_payment(application, profile, status="pending")

    # --- t0 snapshot ---
    payment.refresh_from_db()
    t0_snapshot = copy.deepcopy((payment.metadata or {}).get("snapshot"))
    assert t0_snapshot is not None, "Seed payment must have a snapshot at t0"

    service = PaymentService()

    for op in operations:
        payment.refresh_from_db()
        kind = op["kind"]
        if kind == "transition":
            # Only attempt transitions when the current status is still
            # eligible to leave — otherwise _transition blocks and emits
            # a harmless transition_blocked audit.
            if payment.status in _TERMINAL_STATUSES:
                continue
            provider_data = None
            if op["target"] == "successful":
                provider_data = {
                    "amount": "153.00",
                    "currency": "ZMW",
                    "lencoReference": f"LENCO-{uuid.uuid4().hex[:12].upper()}",
                }
            service._transition(
                payment,
                op["target"],
                source=op["source"],
                actor=None,
                provider_data=provider_data,
            )
        elif kind == "mark_provider_initiation":
            service.mark_provider_initiation(
                payment.id,
                status=op["status"],
                provider_data={"lencoReference": f"LENCO-{uuid.uuid4().hex[:8]}"},
            )
        elif kind == "metadata_merge":
            # Merge a non-snapshot key directly — this is what a generic
            # service-layer metadata mutation looks like from the outside.
            payment.refresh_from_db()
            meta = payment.metadata or {}
            meta[op["key"]] = op["value"]
            payment.metadata = meta
            payment.updated_at = timezone.now()
            payment.save(update_fields=["metadata", "updated_at"])

        # --- t1 check — snapshot must still match t0 byte-for-byte ---
        payment.refresh_from_db()
        t1_snapshot = (payment.metadata or {}).get("snapshot")
        assert t1_snapshot == t0_snapshot, (
            f"metadata.snapshot mutated after op={op!r}. "
            f"t0={t0_snapshot!r} t1={t1_snapshot!r}."
        )
