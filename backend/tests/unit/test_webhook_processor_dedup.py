"""Unit tests — ``WebhookProcessor`` dedup provider-event-id preference
and canonical fallback (Task 25.2).

The payment-hardening design pins webhook deduplication on
``WebhookEventIdentity`` — a four-field identity `(provider_event_id,
event_type, reference, payload_hash)` computed by
``WebhookProcessor.compute_identity``.

Identity extraction priority (R8.3, R8.4):

1. ``payload.data.id``  (preferred)
2. ``payload.data.eventId``
3. ``payload.data.event_id``
4. empty string — dedup then falls back to ``(reference, event_type)``
   in :meth:`WebhookProcessor.is_duplicate` (R8.5, R8.6).

When strict dedup is enabled (``PAYMENT_HARDENING_WEBHOOK_DEDUP_STRICT=True``),
a duplicate hit persists a marker ``WebhookEventLog`` row with
``processed=False`` and ``processing_error='Duplicate event already
processed'`` without invoking ``PaymentService`` (R8.5).

Scope of this module
--------------------
* ``compute_identity`` priority: ``data.id`` > ``data.eventId`` >
  ``data.event_id`` > empty string.
* ``is_duplicate`` returns True when a prior processed
  ``WebhookEventLog`` row carries the same ``provider_event_id``.
* ``is_duplicate`` falls back to ``(reference, event_type)`` when
  ``provider_event_id`` is empty.
* On a duplicate hit in the strict path, a duplicate-marker
  ``WebhookEventLog`` row is written with ``processed=False`` and the
  expected ``processing_error``, and no Payment row is mutated.

Validates: Requirements R8.3, R8.4, R8.5, R8.6
"""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
from django.test import override_settings
from django.utils import timezone


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def seed_owner(db):
    """Create a student Profile + draft Application for payment rows."""
    from apps.accounts.models import Profile
    from apps.applications.models import Application

    now = timezone.now()

    profile = Profile.objects.create(
        id=uuid.uuid4(),
        email=f"dedup-{uuid.uuid4().hex[:8]}@example.com",
        first_name="Dedup",
        last_name="Owner",
        role="student",
        is_active=True,
        created_at=now,
        updated_at=now,
    )

    application = Application.objects.create(
        id=uuid.uuid4(),
        application_number=f"APP-{now:%Y%m%d}-{uuid.uuid4().hex[:8].upper()}",
        user=profile,
        full_name="Dedup Test Student",
        date_of_birth=now.date().replace(year=2000),
        sex="Male",
        phone="+260977000000",
        email=profile.email,
        residence_town="Lusaka",
        nationality="Zambian",
        country="Zambia",
        program="Dedup Test Program",
        intake="January 2025",
        institution="MIHAS",
        status="submitted",
        payment_status="pending_review",
        version=1,
        created_at=now,
        updated_at=now,
    )

    return {"profile": profile, "application": application}


def _seed_payment(application, profile, *, reference: str):
    """Create a pending Payment row with the requested reference."""
    from apps.documents.models import Payment

    now = timezone.now()
    return Payment.objects.create(
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


def _seed_processed_webhook(
    *,
    event_type: str,
    reference: str,
    provider_event_id: str,
    payload_hash: str = "x" * 64,
):
    """Persist a processed ``WebhookEventLog`` row with a ``_webhook_identity``
    carrying the supplied provider event id (design-compatible shape)."""
    from apps.documents.models import WebhookEventLog

    return WebhookEventLog.objects.create(
        id=uuid.uuid4(),
        event_type=event_type,
        reference=reference,
        payload={
            "data": {"reference": reference, "id": provider_event_id},
            "_webhook_identity": {
                "provider_event_id": provider_event_id,
                "event_type": event_type,
                "reference": reference,
                "payload_hash": payload_hash,
            },
        },
        signature_valid=True,
        processed=True,
        processing_error=None,
        created_at=timezone.now(),
    )


# ===========================================================================
# compute_identity — provider event id priority
# ===========================================================================


@pytest.mark.django_db
def test_compute_identity_prefers_data_id():
    """``payload.data.id`` is the preferred provider_event_id.

    Validates: Requirements R8.3
    """
    from apps.documents.webhook_processor import WebhookProcessor

    payload = {
        "data": {
            "id": "evt-id-1",
            "eventId": "evt-fallback-A",
            "event_id": "evt-fallback-B",
            "reference": "REF-1",
        }
    }

    identity = WebhookProcessor().compute_identity(
        "collection.successful", payload
    )

    assert identity.provider_event_id == "evt-id-1"
    assert identity.event_type == "collection.successful"
    assert identity.reference == "REF-1"


@pytest.mark.django_db
def test_compute_identity_falls_back_to_eventId():
    """``data.eventId`` wins when ``data.id`` is absent.

    Validates: Requirements R8.3, R8.4
    """
    from apps.documents.webhook_processor import WebhookProcessor

    payload = {
        "data": {
            "eventId": "evt-fallback-A",
            "event_id": "evt-fallback-B",
            "reference": "REF-2",
        }
    }

    identity = WebhookProcessor().compute_identity(
        "collection.successful", payload
    )

    assert identity.provider_event_id == "evt-fallback-A"
    assert identity.reference == "REF-2"


@pytest.mark.django_db
def test_compute_identity_falls_back_to_event_id():
    """``data.event_id`` wins when both ``id`` and ``eventId`` are absent.

    Validates: Requirements R8.3, R8.4
    """
    from apps.documents.webhook_processor import WebhookProcessor

    payload = {
        "data": {
            "event_id": "evt-fallback-B",
            "reference": "REF-3",
        }
    }

    identity = WebhookProcessor().compute_identity(
        "collection.successful", payload
    )

    assert identity.provider_event_id == "evt-fallback-B"
    assert identity.reference == "REF-3"


@pytest.mark.django_db
def test_compute_identity_empty_when_no_provider_event_id():
    """No provider event id anywhere → ``provider_event_id`` is ``""``.

    Validates: Requirements R8.3, R8.4
    """
    from apps.documents.webhook_processor import WebhookProcessor

    payload = {"data": {"reference": "REF-4"}}

    identity = WebhookProcessor().compute_identity(
        "collection.successful", payload
    )

    assert identity.provider_event_id == ""
    assert identity.reference == "REF-4"
    assert identity.event_type == "collection.successful"
    # payload_hash is always populated — it is sha256(canonical_json(payload)).
    assert identity.payload_hash
    assert len(identity.payload_hash) == 64


# ===========================================================================
# is_duplicate — provider_event_id path
# ===========================================================================


@pytest.mark.django_db(transaction=True)
def test_is_duplicate_matches_provider_event_id(seed_owner):
    """A prior processed log with the same ``provider_event_id`` → duplicate.

    Validates: Requirements R8.5
    """
    from apps.documents.webhook_processor import (
        WebhookEventIdentity,
        WebhookProcessor,
    )

    _seed_processed_webhook(
        event_type="collection.successful",
        reference="REF-5",
        provider_event_id="evt-1",
    )

    identity = WebhookEventIdentity(
        provider_event_id="evt-1",
        event_type="collection.successful",
        reference="REF-5",
        payload_hash="y" * 64,
    )

    assert WebhookProcessor().is_duplicate(identity) is True


@pytest.mark.django_db(transaction=True)
def test_is_duplicate_falls_back_to_reference_event_type(seed_owner):
    """Without provider_event_id, dedup queries on ``(reference, event_type)``.

    Seed a processed log row for ``(REF-6, collection.successful)`` and
    assert an identity with empty ``provider_event_id`` matches it.

    Validates: Requirements R8.6
    """
    from apps.documents.models import WebhookEventLog
    from apps.documents.webhook_processor import (
        WebhookEventIdentity,
        WebhookProcessor,
    )

    WebhookEventLog.objects.create(
        id=uuid.uuid4(),
        event_type="collection.successful",
        reference="REF-6",
        payload={"data": {"reference": "REF-6"}},
        signature_valid=True,
        processed=True,
        processing_error=None,
        created_at=timezone.now(),
    )

    identity = WebhookEventIdentity(
        provider_event_id="",
        event_type="collection.successful",
        reference="REF-6",
        payload_hash="z" * 64,
    )

    assert WebhookProcessor().is_duplicate(identity) is True

    # Sanity: a different reference does NOT match.
    other = WebhookEventIdentity(
        provider_event_id="",
        event_type="collection.successful",
        reference="REF-7-different",
        payload_hash="z" * 64,
    )
    assert WebhookProcessor().is_duplicate(other) is False


# ===========================================================================
# Duplicate marker row is written on dedup hit (strict path)
# ===========================================================================


@pytest.mark.django_db(transaction=True)
@override_settings(PAYMENT_HARDENING_WEBHOOK_DEDUP_STRICT=True)
def test_duplicate_marker_row_written_on_dedup(seed_owner):
    """Strict dedup: duplicate hit writes a marker ``WebhookEventLog`` row.

    Marker shape (design + R8.5):
      - ``processed = False``
      - ``processing_error = 'Duplicate event already processed'``
      - No Payment row is mutated.

    Validates: Requirements R8.5
    """
    from apps.documents.models import Payment, WebhookEventLog
    from apps.documents.webhook_processor import WebhookProcessor

    application = seed_owner["application"]
    profile = seed_owner["profile"]
    reference = "REF-DUP-1"
    provider_event_id = "evt-dup-1"

    payment = _seed_payment(application, profile, reference=reference)
    original_status = payment.status

    # Seed a prior processed log row — this is the "first delivery".
    _seed_processed_webhook(
        event_type="collection.successful",
        reference=reference,
        provider_event_id=provider_event_id,
    )

    # Now replay the same event_id — strict dedup should short-circuit.
    payload = {
        "data": {
            "id": provider_event_id,
            "reference": reference,
            "amount": "153.00",
            "lencoReference": "LR-1",
        }
    }

    WebhookProcessor().process(
        "collection.successful", payload, signature_valid=True
    )

    # One duplicate-marker row written — processed=False, matching error.
    markers = list(
        WebhookEventLog.objects.filter(
            reference=reference,
            processed=False,
            processing_error="Duplicate event already processed",
        )
    )
    assert len(markers) == 1, (
        f"Expected 1 duplicate-marker row; got {len(markers)} for "
        f"reference={reference}."
    )

    # Payment was not mutated by the duplicate.
    payment.refresh_from_db()
    assert payment.status == original_status, (
        f"Duplicate webhook should not mutate Payment status; "
        f"expected {original_status!r}, got {payment.status!r}."
    )
