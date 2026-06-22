"""Integration: payment-poll run-time bound and per-call limits (task 9.4).

# Feature: system-performance-hardening
Requirements: 6.1, 6.2, 6.5

Task 9.1 bounded ``poll_pending_payments_task`` so one slow/flaky Lenco
provider can never block the single Celery worker. This integration test
asserts the three externally observable guarantees of that bounding, with the
external Lenco boundary (``_call_lenco_collection_status``) fully mocked so no
network call is made and the test stays fast:

* **Batch bound (R6.1).** The implementation enforces a *batch-of-10* (the
  ``ThreadPoolExecutor`` alternative was not taken — see
  ``_POLL_MAX_PAYMENTS_PER_RUN``). With more than 10 in-window pending payments
  seeded, a single run invokes the external verification boundary **at most 10
  times**.

* **Per-call limits (R6.2).** Every external verification call is invoked with
  a timeout of **<=10s** and **<=2 retries** (the values the task passes down to
  ``_call_lenco_collection_status``).

* **Run-time bound (R6.5).** The task's configured ``soft_time_limit`` /
  ``time_limit`` are **<=90s** (the hard wall-clock ceiling that guarantees the
  run completes within 90s regardless of external latency — the worst-case
  external budget of ``batch x (timeout x attempts)`` is intentionally larger,
  which is exactly why the soft cap exists and ends the run early). A run with
  tiny simulated per-call latency also completes well under that ceiling.

The poll runs on the hardened path (``PAYMENT_HARDENING_FORWARD_ONLY=True``),
matching the sibling property test ``tests/property/test_perf_payment_poll.py``
(task 9.3), so every verify outcome routes through ``PaymentService.verify`` →
``_call_lenco_collection_status``.
"""

from __future__ import annotations

import time
import uuid
from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

import pytest
from django.core.cache import cache
from django.test import override_settings
from django.utils import timezone

pytestmark = pytest.mark.django_db

_TASK_LOCK_KEY = "celery_lock:poll_pending_payments_task"
_LENCO_PATCH_TARGET = (
    "apps.documents.payment_service_mixins._verification."
    "_call_lenco_collection_status"
)

# Requirement ceilings (R6.1, R6.2, R6.5). These mirror the module constants in
# ``apps.documents.tasks`` and the task decorator; the assertions below pin the
# *observable* behaviour, not just the constants.
_MAX_BATCH = 10        # R6.1: at most 10 payments verified per run
_MAX_TIMEOUT = 10      # R6.2: per-call timeout <= 10s
_MAX_RETRIES = 2       # R6.2: per-call retries <= 2
_MAX_RUN_SECONDS = 90  # R6.5: a single run completes within 90s wall-clock

_PAYMENT_AMOUNT = Decimal("153.00")
_PAYMENT_CURRENCY = "ZMW"

_LENCO_SETTINGS = dict(
    PAYMENT_HARDENING_FORWARD_ONLY=True,
    LENCO_API_SECRET_KEY="test-secret",
    LENCO_API_BASE_URL="https://api.lenco.example",
)


# ---------------------------------------------------------------------------
# Test-world construction
# ---------------------------------------------------------------------------


def _seed_pending_payments(count, *, created_minutes_ago=10):
    """Persist ``count`` pending payments inside the reconcile window.

    Each payment is ~10 minutes old (older than the 5-minute minimum, younger
    than the 24-hour expiry cutoff) so the poll task picks it up, and carries a
    unique transaction reference. Returns the list of created Payment rows.
    """
    from tests.tenant_fixtures import (
        build_application,
        build_payment,
        build_tenant_world,
    )
    from apps.documents.models import Payment

    world = build_tenant_world(with_application=False)
    created_at = timezone.now() - timedelta(minutes=created_minutes_ago)

    payments = []
    for _ in range(count):
        sfx = f"r94-{uuid.uuid4().hex[:8]}"
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
                    "program_code": "R94",
                    "intake_id": None,
                    "waiver_applied": False,
                    "original_amount": str(_PAYMENT_AMOUNT),
                    "fee_source": "program_fee",
                },
            },
            created_at=created_at,
            updated_at=created_at,
        )
        # Force created_at/updated_at past auto_now semantics so the row falls
        # squarely inside the reconcile window.
        Payment.objects.filter(pk=payment.pk).update(
            created_at=created_at, updated_at=created_at,
        )
        payments.append(payment)
    return payments


def _provider_pending(reference, *args, **kwargs):
    """Deterministic Lenco stand-in: every call reports still-pending.

    Keeps every seeded payment ``pending`` (no forward-only transition), so the
    run processes the whole batch and the call-count / per-call-arg assertions
    are unambiguous. Signature matches the real
    ``_call_lenco_collection_status(reference, api_secret, base_url, timeout,
    max_retries=...)`` and returns its ``(data, error)`` tuple shape.
    """
    return ({"status": "pending"}, None)


def _run_poll(side_effect):
    """Run ``poll_pending_payments_task`` with the external boundary mocked.

    Clears the per-task Celery lock first (it persists in the shared cache) and
    returns the patched Lenco mock so callers can inspect call count + args.
    """
    from apps.documents import tasks as documents_tasks

    cache.delete(_TASK_LOCK_KEY)
    with patch(_LENCO_PATCH_TARGET, side_effect=side_effect) as mock_lenco:
        documents_tasks.poll_pending_payments_task()
    cache.delete(_TASK_LOCK_KEY)
    return mock_lenco


# ---------------------------------------------------------------------------
# R6.5 — run-time bound (configured ceiling)
# ---------------------------------------------------------------------------


def test_task_time_limits_bound_run_within_90s():
    """The task's soft/hard time limits guarantee a run completes within 90s.

    R6.5: the hard ``time_limit`` is the wall-clock ceiling, and the
    ``soft_time_limit`` ends the run early (catching ``SoftTimeLimitExceeded``)
    before the hard kill, so remaining payments simply retry next run.

    Requirements: 6.5
    """
    from apps.documents.tasks import poll_pending_payments_task

    soft_limit = poll_pending_payments_task.soft_time_limit
    hard_limit = poll_pending_payments_task.time_limit

    assert soft_limit is not None and hard_limit is not None, (
        "poll_pending_payments_task must configure soft_time_limit/time_limit"
    )
    # Hard ceiling <= 90s (R6.5) and a strictly-earlier soft cap so the run ends
    # gracefully before the hard kill.
    assert hard_limit <= _MAX_RUN_SECONDS, (
        f"time_limit must be <= {_MAX_RUN_SECONDS}s (R6.5); got {hard_limit}"
    )
    assert soft_limit <= _MAX_RUN_SECONDS, (
        f"soft_time_limit must be <= {_MAX_RUN_SECONDS}s (R6.5); got {soft_limit}"
    )
    assert soft_limit < hard_limit, (
        f"soft_time_limit ({soft_limit}) must be strictly < time_limit "
        f"({hard_limit}) so the run ends gracefully before the hard kill"
    )


@override_settings(**_LENCO_SETTINGS)
def test_single_run_wall_clock_well_under_90s():
    """A bounded run with tiny simulated latency finishes far under the ceiling.

    Each mocked Lenco call sleeps a tiny amount to simulate provider latency;
    with the batch capped at 10 the whole run stays well under the 90s ceiling
    (and nowhere near it), so the test is fast and never literally sleeps 90s.

    Requirements: 6.5
    """
    def _slow_pending(reference, *args, **kwargs):
        time.sleep(0.01)  # tiny simulated provider latency
        return ({"status": "pending"}, None)

    _seed_pending_payments(_MAX_BATCH)

    start = time.monotonic()
    _run_poll(_slow_pending)
    elapsed = time.monotonic() - start

    # Generous bound: the bounded run must finish well under the 90s ceiling.
    assert elapsed < 30, (
        f"bounded poll run took {elapsed:.2f}s; expected well under "
        f"{_MAX_RUN_SECONDS}s (R6.5)"
    )


# ---------------------------------------------------------------------------
# R6.1 — batch bound (implementation enforces batch-of-10, not a thread pool)
# ---------------------------------------------------------------------------


@override_settings(**_LENCO_SETTINGS)
def test_single_run_verifies_at_most_ten_payments():
    """With >10 in-window pending payments, one run verifies at most 10 (R6.1).

    The implementation enforces the *batch-of-10* bound (not the
    ``ThreadPoolExecutor`` alternative), so the external boundary is invoked at
    most 10 times in a single run even when 13 payments are eligible.

    Requirements: 6.1
    """
    seeded = 13
    assert seeded > _MAX_BATCH  # the run must leave some payments for next time
    _seed_pending_payments(seeded)

    mock_lenco = _run_poll(_provider_pending)

    assert mock_lenco.call_count <= _MAX_BATCH, (
        f"a single run must verify at most {_MAX_BATCH} payments (R6.1); the "
        f"external boundary was invoked {mock_lenco.call_count} times"
    )
    assert mock_lenco.call_count == _MAX_BATCH, (
        f"with {seeded} eligible payments the batch-of-{_MAX_BATCH} bound "
        f"should fill the run; got {mock_lenco.call_count} calls"
    )


# ---------------------------------------------------------------------------
# R6.2 — per-call timeout and retry limits
# ---------------------------------------------------------------------------


@override_settings(**_LENCO_SETTINGS)
def test_each_external_call_uses_bounded_timeout_and_retries():
    """Every external verification call uses timeout <=10s and <=2 retries (R6.2).

    ``poll_pending_payments_task`` passes the bounded timeout positionally (4th
    arg) and ``max_retries`` as a keyword to ``_call_lenco_collection_status``.

    Requirements: 6.2
    """
    _seed_pending_payments(5)

    mock_lenco = _run_poll(_provider_pending)

    assert mock_lenco.call_count == 5, (
        f"expected one external call per seeded payment; got "
        f"{mock_lenco.call_count}"
    )
    for call in mock_lenco.call_args_list:
        # Signature: (reference, api_secret, base_url, timeout, max_retries=...)
        timeout = call.args[3]
        max_retries = call.kwargs.get("max_retries")
        assert max_retries is not None, (
            "max_retries must be passed as a keyword to the bounded Lenco call"
        )
        assert 0 < timeout <= _MAX_TIMEOUT, (
            f"each external call timeout must be <= {_MAX_TIMEOUT}s (R6.2); "
            f"got {timeout}"
        )
        assert 0 <= max_retries <= _MAX_RETRIES, (
            f"each external call must use <= {_MAX_RETRIES} retries (R6.2); "
            f"got {max_retries}"
        )


@override_settings(**_LENCO_SETTINGS)
def test_misconfigured_overrides_are_clamped_to_ceilings():
    """Settings overrides above the ceilings are clamped, never exceeded (R6.1/6.2).

    A misconfiguration can only make the task *more* conservative — batch size,
    timeout, and retries are clamped to the requirement-mandated maxima.

    Requirements: 6.1, 6.2
    """
    _seed_pending_payments(13)

    with override_settings(
        PAYMENT_POLL_BATCH_SIZE=999,
        PAYMENT_POLL_LENCO_TIMEOUT=999,
        PAYMENT_POLL_LENCO_MAX_RETRIES=999,
    ):
        mock_lenco = _run_poll(_provider_pending)

    assert mock_lenco.call_count <= _MAX_BATCH, (
        f"oversized PAYMENT_POLL_BATCH_SIZE must be clamped to {_MAX_BATCH} "
        f"(R6.1); got {mock_lenco.call_count} calls"
    )
    for call in mock_lenco.call_args_list:
        assert call.args[3] <= _MAX_TIMEOUT, (
            f"oversized timeout override must be clamped to {_MAX_TIMEOUT}s "
            f"(R6.2); got {call.args[3]}"
        )
        assert call.kwargs.get("max_retries") <= _MAX_RETRIES, (
            f"oversized retry override must be clamped to {_MAX_RETRIES} "
            f"(R6.2); got {call.kwargs.get('max_retries')}"
        )
