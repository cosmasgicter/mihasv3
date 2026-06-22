"""Regression: payment-summary output is identical to the pre-feature baseline (task 3.3).

R3 rewrites ``_with_payment_summary`` to derive each application's
``Payment_Summary`` from a window-bounded ``Prefetch`` of the latest payment
per application instead of seven correlated subqueries. R3.6 requires
regression coverage proving the **Payment_Summary field values** are identical
to the pre-feature output for the five canonical cases: paid, pending, failed,
no-payment, and multiple-payment.

This test reuses the task-2.1 golden-snapshot baseline
(``tests/perf_baseline/fixtures/application_list.json``) and the reusable
divergence comparator (``tests.perf_baseline``) rather than inventing a new
baseline. For each of the five cases it builds the application + payment rows,
serializes through the **optimized list path** (``_with_payment_summary`` +
``ApplicationListSerializer``), and asserts the payment-summary subset equals
the committed pre-feature golden output. Each case also pins the documented
pre-feature semantics directly (latest payment for method/currency/fee, latest
verified for paid_amount/paid_at/receipt, verified-state collapse, no-payment
summary) so the regression is meaningful even independent of the fixture.

# Feature: system-performance-hardening
Requirements: 3.6
"""

from __future__ import annotations

import uuid
from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from tests.perf_baseline import assert_equivalent, default_store
from tests.perf_baseline.capture import ENDPOINTS_BY_KEY

pytestmark = pytest.mark.django_db


#: The five canonical payment-summary cases R3.6 names.
_CASES = ("paid", "pending", "failed", "no_payment", "multiple")

#: The Payment_Summary fields R3 optimizes and must preserve byte-for-byte
#: (the payment subset of the task-2.1 ``application_list`` golden snapshot).
_PAYMENT_SUMMARY_FIELDS = (
    "payment_status",
    "payment_method",
    "paid_amount",
    "paid_at",
    "receipt_number",
    "payment_reference",
    "last_payment_reference",
    "payment_currency",
    "application_fee",
)

#: Volatile keys to collapse before comparison — reuse the exact set the task
#: 2.1 baseline was captured with so ids/timestamps/references never register
#: as a behavioural divergence.
_VOLATILE_KEYS = ENDPOINTS_BY_KEY["application_list"].volatile_keys()


def _serialize_payment_summary(application) -> dict:
    """Serialize one application through the optimized list path and return its
    Payment_Summary subset (mirrors how ``ApplicationListView`` builds rows)."""
    from apps.applications._view_helpers import _with_payment_summary
    from apps.applications.models import Application
    from apps.applications.serializers import ApplicationListSerializer

    qs = _with_payment_summary(
        Application.objects.filter(id=application.id).prefetch_related("applicationgrade_set")
    )
    row = ApplicationListSerializer(qs.first()).data
    return {field: row[field] for field in _PAYMENT_SUMMARY_FIELDS}


def _build_five_payment_cases():
    """Build one application per canonical payment case with its payment rows.

    Returns a dict keyed by the five case names. The amounts/currencies/methods
    mirror the task-2.1 golden capture so the committed baseline applies."""
    from tests.tenant_fixtures import build_application, build_payment, build_tenant_world

    world = build_tenant_world(with_application=False)
    now = timezone.now()

    def _new_app(label: str):
        return build_application(
            student=world.student,
            institution=world.institution,
            canonical_program=world.canonical_program,
            offering=world.offering,
            intake=world.intake,
            suffix=f"{label}-{uuid.uuid4().hex[:6]}",
            status="submitted",
        )

    apps: dict = {}

    # paid: a single verified (successful) payment.
    apps["paid"] = _new_app("paid")
    build_payment(
        application=apps["paid"], amount=Decimal("750.00"), currency="ZMW",
        status="successful", payment_method="mobile_money", verified_at=now,
        transaction_reference="REF-PAID", receipt_number=f"RCPT-{uuid.uuid4().hex[:8]}",
    )

    # pending: a single pending payment (not verified).
    apps["pending"] = _new_app("pending")
    build_payment(
        application=apps["pending"], amount=Decimal("750.00"), currency="ZMW",
        status="pending", payment_method="mobile_money",
    )

    # failed: a single failed payment.
    apps["failed"] = _new_app("failed")
    build_payment(
        application=apps["failed"], amount=Decimal("750.00"), currency="ZMW",
        status="failed", payment_method="card",
    )

    # no_payment: no payment rows at all -> no-payment summary.
    apps["no_payment"] = _new_app("nopay")

    # multiple: an earlier failed attempt then a later successful one; the
    # latest payment drives method/currency, the latest verified drives
    # paid_amount/paid_at/receipt.
    apps["multiple"] = _new_app("multi")
    build_payment(
        application=apps["multiple"], amount=Decimal("750.00"), currency="ZMW",
        status="failed", payment_method="card",
        created_at=now - timedelta(hours=2), updated_at=now - timedelta(hours=2),
    )
    build_payment(
        application=apps["multiple"], amount=Decimal("750.00"), currency="ZMW",
        status="successful", payment_method="mobile_money", verified_at=now,
        transaction_reference="REF-MULTI", receipt_number=f"RCPT-{uuid.uuid4().hex[:8]}",
        created_at=now, updated_at=now,
    )

    return apps


def test_payment_summary_matches_pre_feature_golden():
    """All five Payment_Summary cases equal the committed pre-feature baseline (R3.6)."""
    assert default_store.exists("application_list"), (
        "missing task-2.1 golden baseline 'application_list'; run the golden "
        "capture (tests/integration/test_perf_golden_snapshots.py) first"
    )
    baseline = default_store.load("application_list")

    apps = _build_five_payment_cases()

    for case in _CASES:
        expected = {field: baseline[case][field] for field in _PAYMENT_SUMMARY_FIELDS}
        actual = _serialize_payment_summary(apps[case])
        assert_equivalent(
            expected,
            actual,
            label=f"payment summary [{case}] vs pre-feature golden",
            volatile_keys=_VOLATILE_KEYS,
        )


def test_payment_summary_documented_semantics():
    """Pin the documented pre-feature semantics per case (R3.3, R3.5).

    Independent of the fixture, this asserts the latest-payment / latest-verified
    derivation the optimized path must preserve."""
    apps = _build_five_payment_cases()
    summaries = {case: _serialize_payment_summary(app) for case, app in apps.items()}

    # paid: latest verified payment drives paid_amount; method/currency from latest.
    assert summaries["paid"]["payment_method"] == "mobile_money"
    assert summaries["paid"]["payment_currency"] == "ZMW"
    assert str(summaries["paid"]["paid_amount"]) == "750.00"
    assert str(summaries["paid"]["application_fee"]) == "750.00"
    assert summaries["paid"]["receipt_number"] is not None

    # pending: a pending payment is not verified -> no paid_amount/receipt.
    assert summaries["pending"]["payment_method"] == "mobile_money"
    assert summaries["pending"]["paid_amount"] is None
    assert summaries["pending"]["receipt_number"] is None

    # failed: latest payment (card) drives method; not verified -> no paid_amount.
    assert summaries["failed"]["payment_method"] == "card"
    assert summaries["failed"]["paid_amount"] is None

    # no_payment: the no-payment summary -> every derived payment field empty.
    assert summaries["no_payment"]["payment_method"] is None
    assert summaries["no_payment"]["paid_amount"] is None
    assert summaries["no_payment"]["application_fee"] is None
    assert summaries["no_payment"]["receipt_number"] is None

    # multiple: latest payment (mobile_money) drives method; latest verified
    # drives paid_amount -> the successful row wins over the earlier failed one.
    assert summaries["multiple"]["payment_method"] == "mobile_money"
    assert str(summaries["multiple"]["paid_amount"]) == "750.00"
    assert summaries["multiple"]["receipt_number"] is not None
