"""Property 7 — Payment summary equivalence (system-performance-hardening, task 3.2).

# Feature: system-performance-hardening, Property 7

R3 replaces the seven correlated per-row payment ``Subquery`` annotations in
``_with_payment_summary`` with a single window-function-bounded
``Prefetch("payment_set", ...)`` and computes the ``Payment_Summary`` in
``ApplicationPaymentSummaryMixin._get_payment_summary`` from the prefetched
rows. Property 7 proves that, across arbitrary per-application payment
histories, the new prefetch/window path produces the **same**
``Payment_Summary`` field values an independent oracle derives directly from
the raw payment rows (latest payment of any status + latest verified payment):

* the canonical verified states (``verified``, ``paid``, ``successful``,
  ``force_approved``) collapse to the same verified value (R3.3);
* ``deferred`` (and ``pending`` / ``failed`` / ``expired``) stay distinct,
  contributing only the latest-payment fields, never the paid fields (R3.3);
* an application with no payment rows yields the no-payment summary (R3.5).

**Validates: Requirements 3.3, 3.5**

Backend note (SQLite vs Postgres): the run command exercises this against the
SQLite ``config.settings.test`` database, where Django compiles the
``ROW_NUMBER() OVER (PARTITION BY ...)`` prefetch into a wrapping subquery that
SQLite (>= 3.25) executes successfully — the golden-snapshot harness
(``tests/integration/test_perf_golden_snapshots.py``) already proves the path
runs on the test backend. The serializer recomputes the latest / latest-verified
row in Python over whatever rows the prefetch returns, so the asserted summary is
correct whether the window bounds the prefetch (Postgres / recent SQLite) or
returns every row (the result is identical either way). The one Postgres-only
schema fact this test respects is the ``uq_payments_one_active_per_application``
partial unique index: the generator emits **at most one** active
(``pending`` / ``deferred``) payment per application so the property is equally
valid under the CI Postgres backend, with no DB-specific skips required.
"""

from __future__ import annotations

import uuid
from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from apps.documents.payment_constants import COMPLETED_PAYMENT_STATUSES

pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# Status space
# ---------------------------------------------------------------------------
#
# Terminal statuses may appear any number of times in a history. Active
# statuses (pending / deferred) are constrained to at most one row per
# application so the generated history is valid under the Postgres
# ``uq_payments_one_active_per_application`` partial unique index.

_VERIFIED_STATES = ("successful", "force_approved", "verified", "paid")
_TERMINAL_STATUSES = (*_VERIFIED_STATES, "failed", "expired")
_ACTIVE_STATUSES = ("pending", "deferred")

# Every verified state must be recognised by the canonical COMPLETED set so the
# oracle and the serializer agree on which rows are "paid" (R3.3).
assert set(_VERIFIED_STATES) == set(COMPLETED_PAYMENT_STATUSES)


@st.composite
def _payment_histories(draw):
    """Generate an arbitrary, valid payment history for one application.

    Returns a list of ``spec`` dicts (possibly empty — the no-payment case,
    R3.5). Each spec carries its status, amount, currency, payment method, and
    a unique recency ``rank`` (a permutation index, so the "latest" row can be
    any position, not just the last appended). At most one active
    (pending/deferred) row is emitted (single-active DB invariant).
    """
    terminals = draw(st.lists(st.sampled_from(_TERMINAL_STATUSES), max_size=4))
    active = draw(st.sampled_from((None, *_ACTIVE_STATUSES)))
    statuses = list(terminals)
    if active is not None:
        statuses.append(active)

    n = len(statuses)
    ranks = draw(st.permutations(range(n))) if n else []

    amounts = st.decimals(
        min_value=Decimal("0"),
        max_value=Decimal("9999.99"),
        places=2,
        allow_nan=False,
        allow_infinity=False,
    )
    currencies = st.sampled_from((None, "ZMW", "USD"))
    methods = st.sampled_from((None, "mobile_money", "card"))

    specs = []
    for index, status in enumerate(statuses):
        specs.append(
            {
                "status": status,
                "amount": draw(amounts),
                "currency": draw(currencies),
                "method": draw(methods),
                "rank": ranks[index],  # higher rank == more recent
            }
        )
    return specs


# ---------------------------------------------------------------------------
# Independent reference oracle
# ---------------------------------------------------------------------------


def _expected_summary(specs):
    """Derive the expected Payment_Summary directly from the raw specs.

    This mirrors the documented semantics (latest payment by recency for the
    method/reference/latest-amount fields; latest *verified* payment for the
    paid_amount / paid_at / receipt / currency fields) without touching the ORM
    prefetch path under test, so it is a genuinely independent oracle.
    """
    if not specs:
        return {
            "payment_method": None,
            "paid_amount": None,
            "paid_at": None,
            "receipt_number": None,
            "payment_reference": None,
            "last_payment_reference": None,
            "payment_currency": "ZMW",
            "application_fee": None,
        }

    latest = max(specs, key=lambda s: s["rank"])
    completed = [s for s in specs if s["status"] in COMPLETED_PAYMENT_STATUSES]
    latest_verified = max(completed, key=lambda s: s["rank"]) if completed else None

    if latest_verified is not None:
        paid_amount = latest_verified["amount"]
        paid_at = latest_verified["dt"]
        receipt = latest_verified["receipt"]
        currency_raw = latest_verified["currency"] or latest["currency"]
    else:
        paid_amount = None
        paid_at = None
        receipt = None
        currency_raw = latest["currency"]

    return {
        "payment_method": latest["method"],
        "paid_amount": paid_amount,
        "paid_at": paid_at,
        "receipt_number": receipt,
        "payment_reference": latest["txref"],
        "last_payment_reference": latest["txref"],
        "payment_currency": currency_raw or "ZMW",
        # application_fee derives from the latest payment of any status
        # (preserves the pre-feature payment_summary_amount value, R3.3).
        "application_fee": latest["amount"],
    }


def _build_application_with_payments(specs):
    """Persist a fresh application + the generated payment rows.

    Each call builds an independent tenant world so histories from successive
    Hypothesis examples never collide on unique columns (receipt_number,
    transaction_reference) — the test DB is not rolled back between examples.
    """
    from tests.tenant_fixtures import build_application, build_payment, build_tenant_world

    world = build_tenant_world(with_application=False)
    application = build_application(
        student=world.student,
        institution=world.institution,
        canonical_program=world.canonical_program,
        offering=world.offering,
        intake=world.intake,
        suffix=f"p7-{uuid.uuid4().hex[:8]}",
        status="submitted",
    )

    base = timezone.now().replace(microsecond=0) - timedelta(hours=len(specs) + 2)
    for spec in specs:
        dt = base + timedelta(minutes=spec["rank"] + 1)
        is_verified = spec["status"] in COMPLETED_PAYMENT_STATUSES
        # Stash the concrete values the oracle needs back onto the spec.
        spec["dt"] = dt
        spec["txref"] = f"TXN-{uuid.uuid4().hex[:18].upper()}"
        spec["receipt"] = f"RCPT-{uuid.uuid4().hex[:10].upper()}" if is_verified else None
        build_payment(
            application=application,
            amount=spec["amount"],
            currency=spec["currency"],
            status=spec["status"],
            payment_method=spec["method"],
            transaction_reference=spec["txref"],
            receipt_number=spec["receipt"],
            verified_at=dt if is_verified else None,
            created_at=dt,
            updated_at=dt,
        )
    return application


def _serialized_summary(application):
    """Read the observable Payment_Summary through the optimized list path."""
    from apps.applications._view_helpers import _with_payment_summary
    from apps.applications.models import Application
    from apps.applications.serializers import ApplicationListSerializer

    obj = _with_payment_summary(Application.objects.filter(id=application.id)).first()
    ser = ApplicationListSerializer()
    return {
        "payment_method": ser.get_payment_method(obj),
        "paid_amount": ser.get_paid_amount(obj),
        "paid_at": ser.get_paid_at(obj),
        "receipt_number": ser.get_receipt_number(obj),
        "payment_reference": ser.get_payment_reference(obj),
        "last_payment_reference": ser.get_last_payment_reference(obj),
        "payment_currency": ser.get_payment_currency(obj),
        "application_fee": ser.get_application_fee(obj),
    }


def _assert_summaries_equal(actual, expected):
    """Compare value-by-value, with Decimal/None-aware equality."""
    assert set(actual) == set(expected)
    for field, expected_value in expected.items():
        actual_value = actual[field]
        if isinstance(expected_value, Decimal) or isinstance(actual_value, Decimal):
            assert actual_value is not None and expected_value is not None, (
                f"{field}: one side is None (actual={actual_value!r}, "
                f"expected={expected_value!r})"
            )
            assert Decimal(actual_value) == Decimal(expected_value), (
                f"{field}: {actual_value!r} != {expected_value!r}"
            )
        else:
            assert actual_value == expected_value, (
                f"{field}: {actual_value!r} != {expected_value!r}"
            )


# ---------------------------------------------------------------------------
# Property 7 — Payment summary equivalence
# ---------------------------------------------------------------------------


@given(specs=_payment_histories())
@settings(
    max_examples=100,
    deadline=None,
    suppress_health_check=[
        HealthCheck.function_scoped_fixture,
        HealthCheck.too_slow,
        HealthCheck.data_too_large,
    ],
)
def test_property_7_payment_summary_equivalence(specs):
    """The prefetch/window summary equals the independent latest-row oracle.

    For any payment history — paid, pending, failed, deferred, expired,
    no-payment, or multiple payments — the serializer's Payment_Summary fields
    match the oracle derived straight from the latest and latest-verified rows.

    **Validates: Requirements 3.3, 3.5**
    """
    application = _build_application_with_payments(specs)
    expected = _expected_summary(specs)
    actual = _serialized_summary(application)
    _assert_summaries_equal(actual, expected)


# ---------------------------------------------------------------------------
# Deterministic anchors for the five enumerated cases (R3.3, R3.5)
# ---------------------------------------------------------------------------
#
# These exercise the same equivalence oracle with fixed inputs so the paid /
# pending / failed / no-payment / multiple cases named in R3.3/R3.6 are pinned
# explicitly. They are concrete instances of Property 7, not new properties.


def _spec(status, amount, *, rank, currency="ZMW", method="mobile_money"):
    return {
        "status": status,
        "amount": Decimal(amount),
        "currency": currency,
        "method": method,
        "rank": rank,
    }


def test_property_7_paid_case():
    specs = [_spec("successful", "750.00", rank=0)]
    application = _build_application_with_payments(specs)
    _assert_summaries_equal(_serialized_summary(application), _expected_summary(specs))


def test_property_7_pending_case():
    specs = [_spec("pending", "750.00", rank=0)]
    application = _build_application_with_payments(specs)
    actual = _serialized_summary(application)
    _assert_summaries_equal(actual, _expected_summary(specs))
    # A pending-only application is never reported as paid.
    assert actual["paid_amount"] is None
    assert actual["paid_at"] is None
    assert actual["receipt_number"] is None


def test_property_7_failed_case():
    specs = [_spec("failed", "750.00", rank=0, method="card")]
    application = _build_application_with_payments(specs)
    actual = _serialized_summary(application)
    _assert_summaries_equal(actual, _expected_summary(specs))
    assert actual["paid_amount"] is None


def test_property_7_no_payment_case():
    """R3.5: no payment row yields the no-payment summary."""
    application = _build_application_with_payments([])
    actual = _serialized_summary(application)
    _assert_summaries_equal(actual, _expected_summary([]))
    assert actual["payment_method"] is None
    assert actual["paid_amount"] is None
    assert actual["payment_reference"] is None
    assert actual["payment_currency"] == "ZMW"


def test_property_7_multiple_payments_case():
    """A failed attempt then a later successful one — latest verified wins."""
    specs = [
        _spec("failed", "750.00", rank=0, method="card"),
        _spec("successful", "750.00", rank=1, method="mobile_money"),
    ]
    application = _build_application_with_payments(specs)
    actual = _serialized_summary(application)
    _assert_summaries_equal(actual, _expected_summary(specs))
    assert actual["paid_amount"] == Decimal("750.00")
    assert actual["receipt_number"] is not None


def test_property_7_deferred_stays_distinct():
    """R3.3: deferred is not a verified state — contributes no paid fields."""
    specs = [_spec("deferred", "750.00", rank=0)]
    application = _build_application_with_payments(specs)
    actual = _serialized_summary(application)
    _assert_summaries_equal(actual, _expected_summary(specs))
    assert actual["paid_amount"] is None
    assert actual["paid_at"] is None


@pytest.mark.parametrize("verified_status", _VERIFIED_STATES)
def test_property_7_verified_states_collapse(verified_status):
    """R3.3: verified / paid / successful / force_approved collapse identically."""
    specs = [_spec(verified_status, "500.00", rank=0)]
    application = _build_application_with_payments(specs)
    actual = _serialized_summary(application)
    _assert_summaries_equal(actual, _expected_summary(specs))
    # Every verified state reports the paid amount, regardless of label.
    assert actual["paid_amount"] == Decimal("500.00")
    assert actual["paid_at"] is not None
