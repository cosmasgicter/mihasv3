"""Regression test — existing Payment rows remain readable (R22.7).

This test seeds 50 anonymised Payment rows that mirror the shapes present
in the production ``payments`` table: the full set of legacy status labels
(``verified``, ``paid``, ``successful``, ``pending``, ``failed``,
``deferred``, ``expired``, ``force_approved``) and the full range of
legacy ``metadata`` shapes (``None``, ``{}``, lenco-response wrapper, note
strings, override blobs). It then asserts that
``Payment.objects.all().order_by('-created_at')[:50]`` materialises
without exceptions, preserves access to every column consumed by the
admissions and review surfaces, and — where a ``PaymentSerializer``
exists — serialises each row to a dict containing at minimum the
``id``/``status``/``amount``/``currency`` quadruple that student and
admin reads rely on.

Lenient by design: this guards against *drift* on read, it does not
enforce that the newer snapshot shape has been backfilled onto every
historical row.

Validates: Requirements R22.7
"""

from __future__ import annotations

import uuid
from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone


# ---------------------------------------------------------------------------
# Row shape catalogue — mirrors production status/metadata variety.
# ---------------------------------------------------------------------------
#
# (count, status, metadata, payment_method, has_receipt, has_txref)
#
# Total: 50 rows, covering every legacy and current shape the production
# ``payments`` table is known to contain.

_ROW_SHAPES = [
    # ~20% successful, newer lenco_response snapshot shape
    (10, "successful", {"lenco_response": {"amount": "153.00"}}, "card", True, True),
    # ~20% paid — legacy status label kept from the pre-Lenco manual flow
    (10, "paid", {"legacy_source": "manual"}, "manual", True, True),
    # ~10% verified — older legacy label used before the ``paid``
    # terminology was introduced
    (5, "verified", {"legacy_source": "manual"}, "manual", True, True),
    # ~10% pending, metadata=None (fresh record, never touched by
    # verify/webhook)
    (5, "pending", None, "mobile_money", False, True),
    # ~10% failed, metadata={} (touched once, then gateway failure with
    # empty response)
    (5, "failed", {}, "card", False, True),
    # ~10% deferred, note-style metadata
    (5, "deferred", {"note": "deferred"}, None, False, False),
    # ~10% force_approved (new canonical status for offline admin overrides)
    (
        5,
        "force_approved",
        {"override": True, "reason": "Paid in person at campus cashier"},
        None,
        True,
        False,
    ),
    # ~10% expired, metadata=None
    (5, "expired", None, "card", False, True),
]


def _assert_row_counts() -> None:
    assert sum(count for count, *_ in _ROW_SHAPES) == 50


_assert_row_counts()


# ---------------------------------------------------------------------------
# Fixture — seeds a single shared Profile + Application, then 50 Payment rows
# ---------------------------------------------------------------------------


@pytest.fixture
def seeded_payments(db):
    """Create 50 Payment rows covering the full legacy shape catalogue.

    Uses a single shared Profile and Application so the test focuses on
    Payment-row variety, not application/user variety. ``db`` is the
    pytest-django fixture equivalent of ``@pytest.mark.django_db``.
    """
    from apps.accounts.models import Profile
    from apps.applications.models import Application
    from apps.documents.models import Payment

    now = timezone.now()

    user = Profile.objects.create(
        id=uuid.uuid4(),
        email=f"bwcompat-{uuid.uuid4().hex[:8]}@example.com",
        first_name="Backward",
        last_name="Compat",
        role="student",
        is_active=True,
        created_at=now,
        updated_at=now,
    )

    application = Application.objects.create(
        id=uuid.uuid4(),
        application_number=f"APP-{now:%Y%m%d}-{uuid.uuid4().hex[:8].upper()}",
        user=user,
        full_name="Backward Compat Student",
        date_of_birth=now.date().replace(year=2000),
        sex="Male",
        phone="+260977000000",
        email=user.email,
        residence_town="Lusaka",
        nationality="Zambian",
        country="Zambia",
        program="CLM",
        intake="January 2025",
        institution="MIHAS",
        status="submitted",
        version=1,
        created_at=now,
        updated_at=now,
    )

    payments: list[Payment] = []
    seq = 0
    for count, status, metadata, method, has_receipt, has_txref in _ROW_SHAPES:
        for _ in range(count):
            seq += 1
            # Stagger created_at so the ``order_by('-created_at')`` slice
            # is deterministic and hits every row.
            created_at = now - timedelta(minutes=seq)
            payments.append(
                Payment.objects.create(
                    id=uuid.uuid4(),
                    application=application,
                    user=user,
                    amount=Decimal("153.00"),
                    currency="ZMW",
                    payment_method=method,
                    transaction_reference=(
                        f"MIHAS-BWCOMPAT-{seq:04d}" if has_txref else None
                    ),
                    status=status,
                    receipt_number=(
                        f"RCPT-{now:%Y%m%d}-{seq:04d}" if has_receipt else None
                    ),
                    # metadata may be None, {}, or a dict — matching
                    # production shape variety.
                    metadata=metadata,
                    created_at=created_at,
                    updated_at=created_at,
                )
            )

    assert len(payments) == 50, (
        f"fixture must seed exactly 50 rows; got {len(payments)}"
    )
    return {"user": user, "application": application, "payments": payments}


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_payment_rows_readable_across_all_legacy_shapes(seeded_payments):
    """Every legacy Payment row shape survives ``.all().order_by(...)[:50]``.

    Validates: Requirements R22.7
    """
    from apps.documents.models import Payment

    # Materialise the queryset exactly as production read paths do.
    rows = list(Payment.objects.all().order_by("-created_at")[:50])

    assert len(rows) == 50, (
        f"expected 50 Payment rows, got {len(rows)} — "
        "order_by/slice must preserve the full legacy set"
    )

    # The fields enumerated in the task — every column admissions and
    # review read paths touch. Accessing them must not raise for any row
    # shape (``None`` / ``{}`` / legacy status labels included).
    required_fields = (
        "id",
        "status",
        "amount",
        "currency",
        "metadata",
        "receipt_number",
        "transaction_reference",
        "created_at",
        "updated_at",
        "application_id",
        "user_id",
    )

    observed_statuses: set[str] = set()

    for payment in rows:
        for field in required_fields:
            # getattr must not raise; value can legitimately be None.
            getattr(payment, field)

        # Cross-check a few invariants that every production read assumes.
        assert isinstance(payment.id, uuid.UUID)
        assert payment.amount == Decimal("153.00")
        assert payment.currency == "ZMW"
        assert payment.status  # never empty string
        # metadata is either None or a dict (never a string / list in this
        # table's production shape).
        assert payment.metadata is None or isinstance(payment.metadata, dict)

        observed_statuses.add(payment.status)

    # Guard against the fixture silently collapsing a status bucket.
    expected_statuses = {
        "successful",
        "paid",
        "verified",
        "pending",
        "failed",
        "deferred",
        "force_approved",
        "expired",
    }
    assert expected_statuses.issubset(observed_statuses), (
        "backward-compat slice must include every legacy status label; "
        f"missing: {expected_statuses - observed_statuses!r}"
    )


@pytest.mark.django_db
def test_payment_serializer_handles_every_legacy_row(seeded_payments):
    """``PaymentSerializer(payment).data`` works for every legacy shape.

    Lenient — only asserts the minimal student/admin read contract
    (``id``, ``status``, ``amount``, ``currency``). Does not require the
    newer ``metadata.snapshot`` key to be present; historical rows
    predate the snapshot backfill.

    Validates: Requirements R22.7
    """
    try:
        from apps.documents.serializers import PaymentSerializer
    except ImportError:
        pytest.skip("PaymentSerializer not available in this checkout")

    from apps.documents.models import Payment

    minimal_contract = {"id", "status", "amount", "currency"}

    rows = list(Payment.objects.all().order_by("-created_at")[:50])
    assert len(rows) == 50

    for payment in rows:
        data = PaymentSerializer(payment).data
        # DRF returns a ReturnDict; dict coercion keeps the assertion
        # framework-agnostic.
        serialised = dict(data)
        missing = minimal_contract - serialised.keys()
        assert not missing, (
            f"Payment {payment.id} (status={payment.status!r}, "
            f"metadata={payment.metadata!r}) serialised without required "
            f"keys: missing={missing!r}"
        )
