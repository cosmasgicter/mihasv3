"""Unit tests — canonical serialization failure (Task 25.4).

The design's R21.5 rule: when ``canonical_json`` cannot serialise the
payload, the strict ``WebhookProcessor.process`` path MUST write a
``WebhookEventLog`` row with ``processing_error='Canonical serialization
failed'`` and MUST NOT mutate any Payment row.

To force ``canonical_json`` to raise, we embed a value that
``json.dumps(..., default=str)`` still cannot serialise. ``default=str``
falls back to ``str(obj)`` for arbitrary values, which succeeds for most
types — we therefore use a custom class whose ``__str__`` / ``__repr__``
both raise, ensuring ``json.dumps`` surfaces a ``TypeError`` /
``ValueError``.

Scope
-----
* Strict path under ``PAYMENT_HARDENING_WEBHOOK_DEDUP_STRICT=True``
  with a valid signature.
* Payload contains an un-serialisable object deep inside ``data``.
* Assert: a ``WebhookEventLog`` row with the expected
  ``processing_error`` is persisted.
* Assert: the seeded Payment row is left unchanged.

Validates: Requirements R21.5
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


class _Unserialisable:
    """A value that defeats ``json.dumps(..., default=str)``.

    Both ``__str__`` and ``__repr__`` raise, so the ``default=str`` hook
    inside ``canonical_json`` cannot silently coerce it to a string.
    """

    def __str__(self) -> str:  # pragma: no cover - exercised indirectly
        raise TypeError("refusing to stringify")

    def __repr__(self) -> str:  # pragma: no cover - exercised indirectly
        raise TypeError("refusing to repr")


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def seed_pending_payment(db):
    """Seed a pending Payment row to prove it is NOT mutated."""
    from apps.accounts.models import Profile
    from apps.applications.models import Application
    from apps.documents.models import Payment

    now = timezone.now()

    profile = Profile.objects.create(
        id=uuid.uuid4(),
        email=f"canon-{uuid.uuid4().hex[:8]}@example.com",
        first_name="Canon",
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
        full_name="Canonical Tester",
        date_of_birth=now.date().replace(year=2000),
        sex="Male",
        phone="+260977000000",
        email=profile.email,
        residence_town="Lusaka",
        nationality="Zambian",
        country="Zambia",
        program="Canonical Program",
        intake="January 2025",
        institution="MIHAS",
        status="submitted",
        payment_status="pending_review",
        version=1,
        created_at=now,
        updated_at=now,
    )

    reference = f"MIHAS-{application.application_number}-{uuid.uuid4().hex[:12]}"
    payment = Payment.objects.create(
        id=uuid.uuid4(),
        application=application,
        user=profile,
        amount=Decimal("153.00"),
        currency="ZMW",
        status="pending",
        transaction_reference=reference,
        metadata={},
        created_at=now,
        updated_at=now,
    )
    return {
        "profile": profile,
        "application": application,
        "payment": payment,
        "reference": reference,
    }


# ===========================================================================
# Test — un-serialisable payload triggers the R21.5 short-circuit
# ===========================================================================


@pytest.mark.django_db(transaction=True)
@override_settings(PAYMENT_HARDENING_WEBHOOK_DEDUP_STRICT=True)
def test_canonical_serialization_failure_logs_and_skips_mutation(
    seed_pending_payment,
):
    """Un-serialisable payload → ``processing_error`` row, no Payment mutation.

    Validates: Requirements R21.5
    """
    from apps.documents.models import Payment, WebhookEventLog
    from apps.documents.webhook_processor import WebhookProcessor

    payment = seed_pending_payment["payment"]
    reference = seed_pending_payment["reference"]
    original_status = payment.status
    original_metadata = dict(payment.metadata or {})

    payload = {
        "data": {
            "reference": reference,
            # This value defeats ``default=str`` — canonical_json raises.
            "foo": _Unserialisable(),
        }
    }

    WebhookProcessor().process(
        "collection.successful", payload, signature_valid=True
    )

    # 1. One WebhookEventLog row with the expected processing_error.
    logs = list(
        WebhookEventLog.objects.filter(
            processing_error="Canonical serialization failed",
        )
    )
    assert len(logs) == 1, (
        "Expected exactly one ``WebhookEventLog`` row with "
        f"``processing_error='Canonical serialization failed'``; got {len(logs)}."
    )
    assert logs[0].processed is False

    # 2. Payment row is untouched — status and metadata unchanged.
    fresh = Payment.objects.get(pk=payment.pk)
    assert fresh.status == original_status, (
        "Canonical-serialization failure must not mutate Payment status; "
        f"expected {original_status!r}, got {fresh.status!r}."
    )
    assert (fresh.metadata or {}) == original_metadata, (
        "Canonical-serialization failure must not mutate Payment metadata."
    )
