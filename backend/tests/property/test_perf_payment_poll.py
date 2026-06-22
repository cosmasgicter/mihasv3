"""Property 13 — Celery skip-on-exhaustion preserves forward-only status
(system-performance-hardening, task 9.3).

# Feature: system-performance-hardening, Property 13

R6.3 requires that when an external Lenco verification call exhausts its
timeout/retry limit inside ``poll_pending_payments_task``, the affected payment
is **skipped with no status transition** (honoring ``PaymentService._transition``
forward-only rules), the failure is recorded (metric + log), and the run
**continues** processing the remaining payments.

This property exercises the hardened poll path
(``PAYMENT_HARDENING_FORWARD_ONLY=True``) — the one that routes every verify
outcome through ``PaymentService._transition`` — over arbitrary sets of pending
payments whose external verification calls each resolve to one of:

* ``exhausted``         — the bounded Lenco call returned ``(None, error)``
                          (timeout / retry exhaustion / provider unreachable);
                          ``verify`` surfaces ``PROVIDER_UNAVAILABLE``;
* ``success``           — provider says ``successful`` with a clean amount /
                          currency / reference (integrity gate passes);
* ``failed``            — provider says ``failed``;
* ``provider_pending``  — provider still reports ``pending``.

Across any mix of those outcomes, the property asserts:

(a) every payment whose external call **exhausted** retries retains its prior
    ``pending`` status (no forward-only transition occurs);
(b) the run does **not** abort — every other payment is still processed and
    reaches the status its provider outcome dictates (a ``success`` ordered
    after an ``exhausted`` row still becomes ``successful``), and the external
    boundary is invoked once per in-window payment;
(c) each exhausted payment records exactly one ``payment.reconcile.processed``
    failure metric, and every processed-without-transport-failure payment
    records exactly one ``success`` metric.

The external Lenco boundary (``_call_lenco_collection_status``) is mocked so
timeouts/exhaustion are simulated deterministically and no network call is made;
Hypothesis varies which calls fail and how many payments are in the run.

**Validates: Requirements 6.3**
"""

from __future__ import annotations

import uuid
from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

import pytest
from django.core.cache import cache
from django.test import override_settings
from django.utils import timezone
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

pytestmark = pytest.mark.django_db

_TASK_LOCK_KEY = "celery_lock:poll_pending_payments_task"
_LENCO_PATCH_TARGET = (
    "apps.documents.payment_service_mixins._verification."
    "_call_lenco_collection_status"
)
_METRIC_PATCH_TARGET = "apps.documents.payment_metrics.increment"
_RECONCILE_COUNTER = "payment.reconcile.processed"

# The hardened poll path verifies at most 10 payments per run (R6.1); keep the
# generated batch under that ceiling so every payment is processed in a single
# run and the "run continues" assertion is unambiguous.
_OUTCOMES = ("exhausted", "success", "failed", "provider_pending")

# The status each provider outcome must leave the payment in. ``exhausted`` and
# ``provider_pending`` both leave the row untouched at ``pending`` — but only
# ``exhausted`` is a transport failure that must be recorded as a failure (c).
_EXPECTED_STATUS = {
    "exhausted": "pending",
    "success": "successful",
    "failed": "failed",
    "provider_pending": "pending",
}

_PAYMENT_AMOUNT = Decimal("153.00")
_PAYMENT_CURRENCY = "ZMW"


# ---------------------------------------------------------------------------
# Fake external Lenco boundary
# ---------------------------------------------------------------------------


def _make_fake_lenco(outcomes_by_ref):
    """Return a deterministic ``_call_lenco_collection_status`` stand-in.

    The real signature is ``(reference, api_secret, base_url, timeout,
    max_retries=...)`` and returns a ``(data, error)`` tuple. We key the
    response off the payment's transaction reference (first positional arg).
    """

    def _fake_lenco(reference, *args, **kwargs):
        outcome = outcomes_by_ref[reference]
        if outcome == "exhausted":
            # Timeout / retry exhaustion: no data, an error string. ``verify``
            # maps this to the stable ``PROVIDER_UNAVAILABLE`` code.
            return (None, "verification timed out after retries")
        if outcome == "success":
            return (
                {
                    "status": "successful",
                    "amount": str(_PAYMENT_AMOUNT),
                    "currency": _PAYMENT_CURRENCY,
                    "lencoReference": f"LENCO-{uuid.uuid4().hex[:12]}",
                    "type": "mobile-money",
                },
                None,
            )
        if outcome == "failed":
            return (
                {
                    "status": "failed",
                    "reasonForFailure": "insufficient funds",
                    "lencoReference": f"LENCO-{uuid.uuid4().hex[:12]}",
                    "type": "mobile-money",
                },
                None,
            )
        # provider_pending — still pending, no verdict yet.
        return ({"status": "pending"}, None)

    return _fake_lenco


# ---------------------------------------------------------------------------
# Test-world construction
# ---------------------------------------------------------------------------


def _seed_pending_payments(outcomes):
    """Build one tenant world + one pending payment per outcome.

    Each payment is ~10 minutes old (inside the reconcile window: older than the
    5-minute minimum, younger than the 24-hour expiry cutoff) and carries a
    unique transaction reference so the fake Lenco boundary can resolve its
    outcome. Returns ``(payments, outcomes_by_ref)``.
    """
    from tests.tenant_fixtures import (
        build_application,
        build_payment,
        build_tenant_world,
    )
    from apps.documents.models import Payment

    world = build_tenant_world(with_application=False)
    created_at = timezone.now() - timedelta(minutes=10)

    payments = []
    outcomes_by_ref = {}
    for index, outcome in enumerate(outcomes):
        sfx = f"p13-{uuid.uuid4().hex[:8]}"
        application = build_application(
            student=world.student,
            institution=world.institution,
            canonical_program=world.canonical_program,
            offering=world.offering,
            intake=world.intake,
            suffix=sfx,
            status="submitted",
            payment_status="pending_review",
        )
        reference = f"BNL-{application.application_number}-{uuid.uuid4().hex[:12]}"
        payment = build_payment(
            application=application,
            amount=_PAYMENT_AMOUNT,
            currency=_PAYMENT_CURRENCY,
            status="pending",
            transaction_reference=reference,
            metadata={
                "snapshot": {
                    "expected_amount": str(_PAYMENT_AMOUNT),
                    "currency": _PAYMENT_CURRENCY,
                    "residency_category": "local",
                    "program_code": "P13",
                    "intake_id": None,
                    "waiver_applied": False,
                    "original_amount": str(_PAYMENT_AMOUNT),
                    "fee_source": "program_fee",
                },
            },
            created_at=created_at,
            updated_at=created_at,
        )
        # Force created_at/updated_at past any auto_now semantics so the row
        # falls squarely inside the reconcile window.
        Payment.objects.filter(pk=payment.pk).update(
            created_at=created_at, updated_at=created_at,
        )
        payment.refresh_from_db()

        payments.append((payment, outcome))
        outcomes_by_ref[reference] = outcome

    return payments, outcomes_by_ref


def _run_poll(outcomes_by_ref):
    """Run ``poll_pending_payments_task`` with the external boundary mocked.

    Returns the patched metric mock + the patched Lenco mock so callers can
    inspect failure recording and per-payment processing.
    """
    from apps.documents import tasks as documents_tasks

    # Clear the per-task Celery lock so the task body actually runs for this
    # example (the lock persists in the shared cache across Hypothesis cases).
    cache.delete(_TASK_LOCK_KEY)

    fake_lenco = _make_fake_lenco(outcomes_by_ref)
    with patch(_LENCO_PATCH_TARGET, side_effect=fake_lenco) as mock_lenco, patch(
        _METRIC_PATCH_TARGET
    ) as mock_metric:
        documents_tasks.poll_pending_payments_task()
    cache.delete(_TASK_LOCK_KEY)
    return mock_metric, mock_lenco


def _reconcile_outcomes(mock_metric):
    """Count ``payment.reconcile.processed`` metric calls by outcome tag."""
    failures = 0
    successes = 0
    for call in mock_metric.call_args_list:
        if not call.args or call.args[0] != _RECONCILE_COUNTER:
            continue
        tags = call.kwargs.get("tags") or {}
        if tags.get("outcome") == "failure":
            failures += 1
        elif tags.get("outcome") == "success":
            successes += 1
    return failures, successes


def _assert_skip_on_exhaustion(outcomes):
    """Core assertion body shared by the property and the deterministic anchors."""
    from apps.documents.models import Payment

    # Isolate this example from payments left by prior Hypothesis cases — the
    # poll task processes *every* in-window pending payment globally.
    Payment.objects.all().delete()

    payments, outcomes_by_ref = _seed_pending_payments(outcomes)
    mock_metric, mock_lenco = _run_poll(outcomes_by_ref)

    exhausted_count = sum(1 for o in outcomes if o == "exhausted")
    processed_count = len(outcomes)

    # (b) The run did not abort: the external boundary was invoked exactly once
    # per in-window payment, regardless of how many calls exhausted.
    assert mock_lenco.call_count == processed_count, (
        f"expected the bounded Lenco call once per payment "
        f"({processed_count}); got {mock_lenco.call_count}"
    )

    for payment, outcome in payments:
        payment.refresh_from_db()
        expected_status = _EXPECTED_STATUS[outcome]
        # (a) Exhausted payments retain their prior ``pending`` status — no
        #     forward-only transition occurred.
        # (b) Every other payment still reached its provider-dictated status,
        #     proving the run continued past any exhausted call.
        assert payment.status == expected_status, (
            f"payment with outcome {outcome!r} should be {expected_status!r}; "
            f"is {payment.status!r}"
        )

    # (c) Failures recorded: one failure metric per exhausted payment, and one
    #     success metric per payment processed without a transport failure.
    failures, successes = _reconcile_outcomes(mock_metric)
    assert failures == exhausted_count, (
        f"expected {exhausted_count} recorded failures; got {failures}"
    )
    assert successes == processed_count - exhausted_count, (
        f"expected {processed_count - exhausted_count} recorded successes; "
        f"got {successes}"
    )


# ---------------------------------------------------------------------------
# Property 13
# ---------------------------------------------------------------------------


@given(outcomes=st.lists(st.sampled_from(_OUTCOMES), min_size=1, max_size=8))
@override_settings(
    PAYMENT_HARDENING_FORWARD_ONLY=True,
    LENCO_API_SECRET_KEY="test-secret",
    LENCO_API_BASE_URL="https://api.lenco.example",
)
@settings(
    max_examples=100,
    deadline=None,
    suppress_health_check=[
        HealthCheck.function_scoped_fixture,
        HealthCheck.too_slow,
        HealthCheck.data_too_large,
    ],
)
def test_property_13_skip_on_exhaustion_preserves_forward_only(outcomes):
    """Exhausted verification calls skip without transition; the run continues.

    **Validates: Requirements 6.3**
    """
    _assert_skip_on_exhaustion(outcomes)


# ---------------------------------------------------------------------------
# Deterministic anchors (concrete instances of Property 13)
# ---------------------------------------------------------------------------


@override_settings(
    PAYMENT_HARDENING_FORWARD_ONLY=True,
    LENCO_API_SECRET_KEY="test-secret",
    LENCO_API_BASE_URL="https://api.lenco.example",
)
def test_all_exhausted_leaves_every_payment_pending():
    """When every call exhausts, all payments stay pending and all are recorded."""
    _assert_skip_on_exhaustion(["exhausted", "exhausted", "exhausted"])


@override_settings(
    PAYMENT_HARDENING_FORWARD_ONLY=True,
    LENCO_API_SECRET_KEY="test-secret",
    LENCO_API_BASE_URL="https://api.lenco.example",
)
def test_exhaustion_between_successes_does_not_abort_run():
    """A success ordered after an exhausted call still transitions (continuation)."""
    _assert_skip_on_exhaustion(["success", "exhausted", "success", "failed"])


@override_settings(
    PAYMENT_HARDENING_FORWARD_ONLY=True,
    LENCO_API_SECRET_KEY="test-secret",
    LENCO_API_BASE_URL="https://api.lenco.example",
)
def test_no_exhaustion_records_only_successes():
    """With no transport failures, every payment is processed and recorded success."""
    _assert_skip_on_exhaustion(["success", "failed", "provider_pending"])
