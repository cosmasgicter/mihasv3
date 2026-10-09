"""Property-based tests for payment status update from a provider response.

# Feature: lenco-payment-integration, Property 3: Payment status update from Lenco response

For any pending Payment and any provider verification/webhook response, the
service updates the payment status to match the provider's answer (successful →
``successful``, failed → ``failed``, pending → unchanged), records the provider's
own fields, and keeps the derived application summary in step.

admissions-v2 task 8.2 rewrote this module. It previously called the deleted
``PaymentService._update_payment_status`` with mocked querysets, so the property
was asserted about MagicMock attributes. It now drives the surviving path
(``PaymentService.verify`` → ``_transition``) against a real database with a
deterministic provider stub, over the full status mapping the provider can
return.

**Validates: Requirements 3.2, 3.3, 3.4, 4.3, 4.4, 4.9, 12.3, 12.4**
"""

from __future__ import annotations

import uuid
from decimal import Decimal
from unittest.mock import patch

import pytest
from django.test import override_settings
from django.utils import timezone
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

_VER = "apps.documents.payment_service_mixins._verification"

# Every provider status string the platform maps, paired with the payment status
# and derived application summary it must produce. ``_LENCO_STATUS_MAP`` is the
# mapping under test; this table is the expectation stated independently of it.
PROVIDER_OUTCOMES = [
    ("successful", "successful", "verified"),
    ("paid", "successful", "verified"),
    ("failed", "failed", "failed"),
    ("pending", "pending", "pending_review"),
    ("pay-offline", "pending", "pending_review"),
    ("otp-required", "pending", "pending_review"),
]

provider_outcomes = st.sampled_from(PROVIDER_OUTCOMES)

amounts = st.decimals(
    min_value=Decimal("1.00"),
    max_value=Decimal("99999.99"),
    places=2,
    allow_nan=False,
    allow_infinity=False,
)


def _seed(amount: Decimal):
    from apps.accounts.models import Profile
    from apps.applications.models import Application
    from apps.documents.models import Payment

    now = timezone.now()
    token = uuid.uuid4().hex[:8]

    profile = Profile.objects.create(
        id=uuid.uuid4(),
        email=f"status-{token}@example.com",
        first_name="Status",
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
        full_name="Status Probe",
        date_of_birth=now.date().replace(year=2000),
        sex="Female",
        phone="+260977000000",
        email=profile.email,
        residence_town="Lusaka",
        nationality="Zambian",
        country="Zambia",
        program="Status Program",
        intake="January 2025",
        institution="MIHAS",
        status="submitted",
        payment_status="pending_review",
        version=1,
        created_at=now,
        updated_at=now,
    )
    reference = f"BNL-{application.application_number}-{uuid.uuid4().hex[:12]}"
    payment = Payment.objects.create(
        id=uuid.uuid4(),
        application=application,
        user=profile,
        amount=amount,
        currency="ZMW",
        status="pending",
        transaction_reference=reference,
        metadata={
            "snapshot": {
                "expected_amount": str(amount),
                "currency": "ZMW",
                "residency_category": "local",
                "program_code": "STA",
                "intake_id": None,
                "waiver_applied": False,
                "original_amount": str(amount),
                "fee_source": "program_fee",
            },
        },
        created_at=now,
        updated_at=now,
    )
    return application, payment, reference


def _app_status(application_id):
    from apps.applications.models import Application

    return (
        Application.objects.filter(id=application_id)
        .values_list("payment_status", flat=True)
        .first()
    )


# ===========================================================================
# Property 3 — the provider's answer decides the status, nothing else does
# ===========================================================================


@pytest.mark.django_db(transaction=True)
@given(outcome=provider_outcomes, amount=amounts)
@settings(
    max_examples=8,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture],
)
def test_provider_status_maps_to_payment_and_application_status(outcome, amount):
    """Each provider status yields its mapped payment status and projection.

    **Validates: Requirements 3.2, 3.3, 3.4, 12.3, 12.4**
    """
    from apps.documents.payment_service import PaymentService

    provider_status, expected_payment_status, expected_app_status = outcome
    application, payment, reference = _seed(amount)

    provider_payload = {
        "status": provider_status,
        "reference": reference,
        "amount": str(amount),
        "currency": "ZMW",
        "lencoReference": "LR-STATUS",
        "type": "mobile-money",
    }
    if provider_status == "failed":
        provider_payload["reasonForFailure"] = "Declined by issuer"

    with override_settings(
        LENCO_API_SECRET_KEY="sk_status",
        LENCO_API_BASE_URL="https://api.lenco.test",
    ):
        with patch(f"{_VER}._call_lenco_collection_status") as mock_lenco:
            mock_lenco.return_value = (provider_payload, None)
            PaymentService().verify(payment.id, actor_id=None)

    payment.refresh_from_db()
    assert payment.status == expected_payment_status, (
        f"provider status {provider_status!r} should map to "
        f"{expected_payment_status!r}; got {payment.status!r}."
    )
    assert _app_status(application.id) == expected_app_status, (
        f"provider status {provider_status!r} should leave the application "
        f"summary at {expected_app_status!r}; got {_app_status(application.id)!r}."
    )


@pytest.mark.django_db(transaction=True)
@given(amount=amounts)
@settings(
    max_examples=4,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture],
)
def test_provider_fields_are_stored_on_a_successful_transition(amount):
    """The provider's reference, method, fee and bearer are persisted.

    **Validates: Requirements 4.3, 4.4, 4.9**
    """
    from apps.documents.payment_service import PaymentService

    application, payment, reference = _seed(amount)
    provider_payload = {
        "status": "successful",
        "reference": reference,
        "amount": str(amount),
        "currency": "ZMW",
        "lencoReference": "LR-STORED",
        "type": "mobile-money",
        "fee": "2.50",
        "bearer": "customer",
    }

    with override_settings(
        LENCO_API_SECRET_KEY="sk_status",
        LENCO_API_BASE_URL="https://api.lenco.test",
    ):
        with patch(f"{_VER}._call_lenco_collection_status") as mock_lenco:
            mock_lenco.return_value = (provider_payload, None)
            PaymentService().verify(payment.id, actor_id=None)

    payment.refresh_from_db()
    assert payment.lenco_reference == "LR-STORED"
    assert payment.payment_method == "mobile-money"
    assert str(payment.fee) == "2.50"
    assert payment.bearer == "customer"
    assert (payment.metadata or {}).get("lenco_response"), (
        "The sanitised provider response must be retained for audit."
    )
