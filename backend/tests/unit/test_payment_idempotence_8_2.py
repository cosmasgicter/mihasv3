"""Replay convergence for all four payment paths — admissions-v2 task 8.2.

R12.5 requires initialization, provider callbacks, reconciliation, and
application-state propagation to be idempotent. "Idempotent" is not a property of
one function here; it is the claim that **replaying any of the four converges on
the same state** without double-charging, double-crediting, or flapping the
derived ``applications.payment_status``.

Each test below replays one path and compares full row snapshots — including the
projection — so a second run that changed anything fails.

The webhook path also has a property-based replay proof over arbitrary delivery
counts in ``tests/property/test_webhook_idempotency.py``.

Validates: Requirements R12.5, R15.9
"""

from __future__ import annotations

import uuid
from decimal import Decimal
from unittest.mock import patch

import pytest
from django.test import override_settings
from django.utils import timezone

_VER = "apps.documents.payment_service_mixins._verification"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _seed(*, status: str = "pending", app_payment_status: str = "pending_review"):
    from apps.accounts.models import Profile
    from apps.applications.models import Application
    from apps.documents.models import Payment

    now = timezone.now()
    token = uuid.uuid4().hex[:8]

    profile = Profile.objects.create(
        id=uuid.uuid4(),
        email=f"idem-{token}@example.com",
        first_name="Idem",
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
        full_name="Idem Probe",
        date_of_birth=now.date().replace(year=2000),
        sex="Male",
        phone="+260977000000",
        email=profile.email,
        residence_town="Lusaka",
        nationality="Zambian",
        country="Zambia",
        program="Idem Program",
        intake="January 2025",
        institution="MIHAS",
        status="submitted",
        payment_status=app_payment_status,
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
        status=status,
        transaction_reference=reference,
        metadata={
            "snapshot": {
                "expected_amount": "153.00",
                "currency": "ZMW",
                "residency_category": "local",
                "program_code": "IDM",
                "intake_id": None,
                "waiver_applied": False,
                "original_amount": "153.00",
                "fee_source": "program_fee",
            },
        },
        created_at=now,
        updated_at=now,
    )
    return profile, application, payment, reference


def _snapshot(application_id):
    """Every material fact about an application's payment position."""
    from apps.applications.models import Application
    from apps.documents.models import Payment

    rows = list(
        Payment.objects.filter(application_id=application_id)
        .order_by("created_at", "id")
        .values(
            "id",
            "status",
            "amount",
            "currency",
            "receipt_number",
            "lenco_reference",
            "payment_method",
            "fee",
            "bearer",
            "notes",
        )
    )
    app_status = (
        Application.objects.filter(id=application_id)
        .values_list("payment_status", flat=True)
        .first()
    )
    return rows, app_status


def _provider_success(reference: str) -> dict:
    return {
        "status": "successful",
        "reference": reference,
        "amount": "153.00",
        "currency": "ZMW",
        "lencoReference": "LR-IDEM",
        "type": "mobile-money",
        "fee": "1.53",
        "bearer": "customer",
    }


# ===========================================================================
# 1. Initialization
# ===========================================================================


@pytest.mark.django_db(transaction=True)
def test_initialization_replay_converges_on_one_payment():
    """Calling initiate repeatedly never creates a second charge.

    Validates: Requirements R12.5
    """
    from apps.documents.payment_service import PaymentService

    profile, application, payment, _ = _seed()
    service = PaymentService()

    first = service.initiate(application.id, profile.id)
    before = _snapshot(application.id)

    for _ in range(4):
        again = service.initiate(application.id, profile.id)
        assert again.payment_id == first.payment_id, (
            "Re-initialisation must return the same payment; "
            f"{first.payment_id} became {again.payment_id}."
        )

    assert _snapshot(application.id) == before, (
        "Re-initialisation changed the ledger or the projection."
    )


# ===========================================================================
# 2. Provider callback
# ===========================================================================


@pytest.mark.django_db(transaction=True)
def test_callback_replay_converges_and_does_not_double_credit():
    """A replayed success callback leaves one paid row and one receipt.

    Validates: Requirements R12.5
    """
    from apps.documents.payment_service import PaymentService

    _, application, payment, reference = _seed()
    service = PaymentService()
    payload = {"data": _provider_success(reference)}

    service.apply_webhook_event("collection.successful", reference, payload)
    after_first = _snapshot(application.id)
    assert after_first[1] == "verified"

    for _ in range(3):
        service.apply_webhook_event("collection.successful", reference, payload)

    assert _snapshot(application.id) == after_first, (
        "A replayed callback changed the ledger or the projection."
    )


@pytest.mark.django_db(transaction=True)
def test_callback_replay_through_the_http_ingress_converges():
    """Replaying at the ingress boundary is also convergent, and dedup-logged.

    The service-level replay above proves ``_transition`` is a no-op on repeat.
    This proves the layer the provider actually talks to refuses the second
    delivery outright, so the payment mutation is not even attempted twice.

    Validates: Requirements R12.5
    """
    from apps.documents.models import WebhookEventLog
    from apps.documents.webhook_processor import WebhookProcessor

    _, application, payment, reference = _seed()
    payload = {"data": _provider_success(reference)}
    processor = WebhookProcessor()

    processor.process("collection.successful", payload, signature_valid=True)
    after_first = _snapshot(application.id)

    for _ in range(3):
        processor.process("collection.successful", payload, signature_valid=True)

    assert _snapshot(application.id) == after_first
    logs = list(
        WebhookEventLog.objects.filter(
            reference=reference, event_type="collection.successful"
        ).order_by("created_at", "id")
    )
    assert len(logs) == 4, "Every delivery must be logged for audit."
    assert [log.processed for log in logs] == [True, False, False, False]
    assert all(
        log.processing_error == "Duplicate event already processed"
        for log in logs[1:]
    )


# ===========================================================================
# 3. Reconciliation
# ===========================================================================


@pytest.mark.django_db(transaction=True)
def test_reconciliation_verify_replay_converges():
    """Re-running verification against the same provider answer is a no-op.

    Validates: Requirements R12.5
    """
    from apps.documents.payment_service import PaymentService

    _, application, payment, reference = _seed()
    service = PaymentService()

    with override_settings(
        LENCO_API_SECRET_KEY="sk_idem",
        LENCO_API_BASE_URL="https://api.lenco.test",
    ):
        with patch(f"{_VER}._call_lenco_collection_status") as mock_lenco:
            mock_lenco.return_value = (_provider_success(reference), None)
            service.verify(payment.id, actor_id=None)
            after_first = _snapshot(application.id)

            for _ in range(3):
                service.verify(payment.id, actor_id=None)

    assert _snapshot(application.id) == after_first, (
        "A re-run verification changed the ledger or the projection."
    )
    # After the first success the row is terminal, so the sweep stops calling
    # the provider at all — the cheapest possible convergence.
    assert mock_lenco.call_count == 1, (
        "Verification of a settled payment must not call the provider again; "
        f"called {mock_lenco.call_count} times."
    )


@pytest.mark.django_db(transaction=True)
def test_reconciliation_expiry_sweep_replay_converges():
    """Re-running the expiry sweep expires each payment exactly once.

    Validates: Requirements R12.5
    """
    from apps.documents.models import Payment
    from apps.documents.payment_service import PaymentService

    from datetime import timedelta

    _, application, payment, _ = _seed()
    Payment.objects.filter(id=payment.id).update(
        created_at=timezone.now() - timedelta(hours=48)
    )

    service = PaymentService()
    first = service.expire_stale(older_than_hours=24, batch_cap=50)
    after_first = _snapshot(application.id)

    assert first == 1
    assert after_first[1] == "not_paid", (
        "An expired-only ledger must project ``not_paid`` — the student still "
        f"owes the fee; got {after_first[1]!r}."
    )

    for _ in range(3):
        assert service.expire_stale(older_than_hours=24, batch_cap=50) == 0, (
            "A re-run sweep must not expire an already-expired payment again."
        )

    assert _snapshot(application.id) == after_first


# ===========================================================================
# 4. Application projection
# ===========================================================================


@pytest.mark.django_db(transaction=True)
def test_projection_is_derived_from_the_whole_ledger_not_the_last_row():
    """A stale row moving cannot demote an application that has been paid.

    The projection is derived from every payment the application holds, with a
    fixed precedence, so an out-of-order or late transition on an older attempt
    recomputes the same ``verified`` rather than flapping the student's status to
    ``failed``.

    Validates: Requirements R12.5, R15.9
    """
    from apps.documents.models import Payment
    from apps.documents.payment_service import PaymentService

    profile, application, first_attempt, first_reference = _seed()
    service = PaymentService()

    # The first attempt fails.
    service.apply_webhook_event(
        "collection.failed",
        first_reference,
        {"data": {"reference": first_reference, "reasonForFailure": "Declined"}},
    )
    application.refresh_from_db()
    assert application.payment_status == "failed"

    # The student retries and succeeds on a second row.
    now = timezone.now()
    second_reference = f"BNL-{application.application_number}-{uuid.uuid4().hex[:12]}"
    second_attempt = Payment.objects.create(
        id=uuid.uuid4(),
        application=application,
        user=profile,
        amount=Decimal("153.00"),
        currency="ZMW",
        status="pending",
        transaction_reference=second_reference,
        metadata={
            "snapshot": {
                "expected_amount": "153.00",
                "currency": "ZMW",
                "residency_category": "local",
                "program_code": "IDM",
                "intake_id": None,
                "waiver_applied": False,
                "original_amount": "153.00",
                "fee_source": "program_fee",
            },
        },
        created_at=now,
        updated_at=now,
    )
    service.apply_webhook_event(
        "collection.successful",
        second_reference,
        {"data": _provider_success(second_reference)},
    )
    application.refresh_from_db()
    assert application.payment_status == "verified"

    # A late duplicate of the *first* attempt's failure now arrives. Under a
    # last-row-wins projection this demoted a paid application to ``failed``.
    service.apply_webhook_event(
        "collection.failed",
        first_reference,
        {"data": {"reference": first_reference, "reasonForFailure": "Declined (replay)"}},
    )
    application.refresh_from_db()
    assert application.payment_status == "verified", (
        "A late failure on a superseded attempt must not demote a paid "
        f"application; got {application.payment_status!r}."
    )

    # And the successful row is untouched.
    second_attempt.refresh_from_db()
    assert second_attempt.status == "successful"


@pytest.mark.django_db(transaction=True)
@pytest.mark.parametrize(
    "ledger,expected",
    [
        (["successful"], "verified"),
        (["force_approved"], "verified"),
        (["verified"], "verified"),  # legacy DB value
        (["paid"], "verified"),  # legacy DB value
        (["failed", "successful"], "verified"),
        (["expired", "pending"], "pending_review"),
        (["expired", "deferred"], "deferred"),
        (["pending", "deferred"], "deferred"),
        (["failed", "expired"], "failed"),
        (["expired"], "not_paid"),
        (["failed"], "failed"),
    ],
    ids=lambda value: "-".join(value) if isinstance(value, list) else str(value),
)
def test_projection_precedence_table(ledger, expected):
    """The precedence is explicit and total over the statuses that occur.

    Validates: Requirements R12.5, R15.9
    """
    from apps.documents.payment_constants import derive_application_payment_status

    assert derive_application_payment_status(ledger) == expected


def test_projection_of_an_empty_ledger_is_undefined_not_invented():
    """With no payment rows there is nothing to derive, so nothing is claimed.

    Validates: Requirements R15.9
    """
    from apps.documents.payment_constants import derive_application_payment_status

    assert derive_application_payment_status([]) is None
    assert derive_application_payment_status(["", None]) is None
    assert derive_application_payment_status(["something_unknown"]) is None
