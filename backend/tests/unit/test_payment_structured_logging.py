"""Unit tests — structured logging + GlitchTip tagging (Task 25.6).

R22.5: ``PaymentService`` and ``WebhookProcessor`` SHALL log structured
events suitable for GlitchTip and downstream SIEM consumption, with an
``extra={}`` dict carrying:

* ``type``                 — event class (e.g. ``"payment_event"``)
* ``request_id``           — optional, request-scoped correlation id
* ``user_id``              — optional, acting profile
* ``application_id``       — optional, target application
* ``payment_id``           — optional, target payment
* ``event_type``           — optional, webhook or lifecycle tag

Absent fields MUST be omitted from the ``extra`` dict entirely — not
included with a ``None`` value — so SIEM queries can distinguish
"unknown" from "present and null".

Status of this requirement
--------------------------
The existing service and webhook code paths only emit printf-style
``logger.info(...)`` messages, with a single ``extra={}`` call in
``payment_service._update_payment_status`` for the ``business_metric``
event. The full structured-tagging rollout is scheduled as a Phase 3
follow-up — see the note on Task 25.6 in ``tasks.md``.

Rather than delete the coverage, this module pins the requirement with
an ``xfail`` marker so the test documents what "done" looks like and
flips to a passing test the moment the structured logging lands.

Validates: Requirements R22.5
"""

from __future__ import annotations

import logging
import uuid
from decimal import Decimal
from unittest.mock import patch

import pytest
from django.test import override_settings
from django.utils import timezone


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


_ALLOWED_EXTRA_KEYS: frozenset[str] = frozenset(
    {
        "type",
        "request_id",
        "user_id",
        "application_id",
        "payment_id",
        "event_type",
    }
)


def _captured_extras(mock_logger) -> list[dict]:
    """Return the ``extra=`` dict from every logger.info / logger.warning call."""
    extras: list[dict] = []
    for call in list(mock_logger.info.call_args_list) + list(
        mock_logger.warning.call_args_list
    ):
        kwargs = call.kwargs if hasattr(call, "kwargs") else (call[1] or {})
        extra = kwargs.get("extra")
        if isinstance(extra, dict):
            extras.append(extra)
    return extras


def _assert_structured_extra(extra: dict) -> None:
    """Assert a single ``extra`` dict conforms to R22.5."""
    assert "type" in extra, (
        f"Every structured payment log record MUST carry a ``type`` key; "
        f"got extra={extra!r}."
    )
    for key, value in extra.items():
        assert key in _ALLOWED_EXTRA_KEYS, (
            f"Unexpected structured-log key {key!r} — allowed keys are "
            f"{sorted(_ALLOWED_EXTRA_KEYS)}."
        )
        assert value is not None, (
            f"Absent structured-log fields MUST be omitted (not None); "
            f"got {key}={value!r} in extra={extra!r}."
        )


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def seed_owner(db):
    """Seed a student Profile + submitted Application for the payment path."""
    from apps.accounts.models import Profile
    from apps.applications.models import Application

    now = timezone.now()

    profile = Profile.objects.create(
        id=uuid.uuid4(),
        email=f"logging-{uuid.uuid4().hex[:8]}@example.com",
        first_name="Log",
        last_name="Subject",
        role="student",
        is_active=True,
        created_at=now,
        updated_at=now,
    )

    application = Application.objects.create(
        id=uuid.uuid4(),
        application_number=f"APP-{now:%Y%m%d}-{uuid.uuid4().hex[:8].upper()}",
        user=profile,
        full_name="Log Subject",
        date_of_birth=now.date().replace(year=2000),
        sex="Male",
        phone="+260977000000",
        email=profile.email,
        residence_town="Lusaka",
        nationality="Zambian",
        country="Zambia",
        program="Logging Test Program",
        intake="January 2025",
        institution="MIHAS",
        status="submitted",
        payment_status="pending_review",
        version=1,
        created_at=now,
        updated_at=now,
    )

    return {"profile": profile, "application": application}


@pytest.fixture
def seed_pending_payment(seed_owner):
    """Seed a pending Payment used by the webhook-path test."""
    from apps.documents.models import Payment

    application = seed_owner["application"]
    profile = seed_owner["profile"]
    now = timezone.now()

    reference = f"MIHAS-{application.application_number}-{uuid.uuid4().hex[:12]}"
    payment = Payment.objects.create(
        id=uuid.uuid4(),
        application=application,
        user=profile,
        amount=Decimal("153.00"),
        currency="ZMW",
        status="pending",
        transaction_reference=reference,
        metadata={
            "snapshot": {
                "expected_amount": "153.00",
                "currency": "ZMW",
                "residency_category": "local",
                "program_code": "LOG",
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
        **seed_owner,
        "payment": payment,
        "reference": reference,
    }


# ===========================================================================
# Test — payment-service structured logging on initiation
# ===========================================================================


@pytest.mark.xfail(
    reason=(
        "Structured logging tags not yet added in service/webhook paths — "
        "Phase 3 follow-up"
    ),
    strict=False,
)
@pytest.mark.django_db(transaction=True)
def test_payment_service_initiation_emits_structured_extra(seed_owner):
    """``PaymentService.initiate_payment`` logs carry the R22.5 ``extra`` dict.

    Validates: Requirements R22.5
    """
    from apps.documents.payment_service import PaymentService

    application = seed_owner["application"]
    profile = seed_owner["profile"]

    with patch("apps.documents.payment_service.logger") as mock_logger:
        try:
            PaymentService().initiate_payment(
                application_id=application.id, user_id=profile.id,
            )
        except Exception:
            # Any initiation failure is fine — we only care about the
            # logger calls made up to that point.
            pass

    extras = _captured_extras(mock_logger)
    assert extras, (
        "Expected at least one ``extra=``-tagged log record during "
        "PaymentService.initiate_payment; got none."
    )
    for extra in extras:
        _assert_structured_extra(extra)


# ===========================================================================
# Test — webhook-processor structured logging on a successful cycle
# ===========================================================================


@pytest.mark.xfail(
    reason=(
        "Structured logging tags not yet added in service/webhook paths — "
        "Phase 3 follow-up"
    ),
    strict=False,
)
@pytest.mark.django_db(transaction=True)
@override_settings(
    PAYMENT_HARDENING_FORWARD_ONLY=True,
    PAYMENT_HARDENING_WEBHOOK_DEDUP_STRICT=True,
)
def test_webhook_processor_cycle_emits_structured_extra(
    seed_pending_payment,
):
    """``WebhookProcessor.process`` logs carry the R22.5 ``extra`` dict.

    Validates: Requirements R22.5
    """
    from apps.documents.webhook_processor import WebhookProcessor

    reference = seed_pending_payment["reference"]

    payload = {
        "data": {
            "id": "evt-log-1",
            "reference": reference,
            "amount": "153.00",
            "currency": "ZMW",
            "lencoReference": "LR-LOG",
            "type": "mobile_money",
        }
    }

    with patch(
        "apps.documents.webhook_processor.logger"
    ) as mock_webhook_logger, patch(
        "apps.documents.payment_service.logger"
    ) as mock_service_logger:
        WebhookProcessor().process(
            "collection.successful", payload, signature_valid=True,
        )

    extras = _captured_extras(mock_webhook_logger) + _captured_extras(
        mock_service_logger
    )
    assert extras, (
        "Expected at least one ``extra=``-tagged log record during a "
        "webhook processing cycle; got none."
    )
    for extra in extras:
        _assert_structured_extra(extra)
