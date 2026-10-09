"""Action-required is not provider-processing — admissions-v2 task 8.2.

Finding STU-09: a pending payment can be waiting on the **student** (a
mobile-money prompt is on their handset and needs a PIN) or on **Lenco** (the
request is in the provider's hands and the student can do nothing). The platform
conflated the two, so it either told students to act when they could not, or told
them to wait when they were the bottleneck.

``derive_payment_phase`` is the single answer, and the API returns it alongside
``status`` so the UI reads the same derivation the backend made.

Validates: Requirements R12.4, R12.6
"""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
from django.utils import timezone

from apps.documents.payment_phase import (
    PHASE_UI_TIMEOUT_SECONDS,
    derive_payment_phase,
    phase_ui_timeout_seconds,
)


# ===========================================================================
# 1. The derivation
# ===========================================================================


@pytest.mark.parametrize(
    "provider_status,expected",
    [
        # Lenco accepted the collection request → the customer prompt is out,
        # and only the student can answer it.
        ("accepted", "action_required"),
        # We handed it over but have no confirmation anyone was prompted.
        ("sent", "provider_processing"),
        # Provider errored in a way that leaves the request's fate unknown.
        ("unknown", "provider_processing"),
        # Provider refused outright; no money moved, a retry is the way out.
        ("rejected", "failed_retryable"),
        # No provider call yet (card widget pre-completion, fresh row).
        ("not_started", "not_started"),
    ],
    ids=["accepted", "sent", "unknown", "rejected", "not-started"],
)
def test_pending_payment_phase_depends_on_who_is_being_waited_on(
    provider_status, expected
):
    """A pending payment's phase distinguishes the student from the provider.

    Validates: Requirements R12.4
    """
    assert (
        derive_payment_phase("pending", {"status": provider_status}) == expected
    )


def test_pending_payment_with_no_provider_metadata_claims_nothing():
    """Absent provider state, the phase does not pretend to know.

    Validates: Requirements R12.4
    """
    assert derive_payment_phase("pending", None) == "not_started"
    assert derive_payment_phase("pending", {}) == "not_started"


@pytest.mark.parametrize(
    "status,expected",
    [
        ("successful", "paid"),
        ("force_approved", "paid"),
        ("verified", "paid"),  # legacy DB value
        ("paid", "paid"),  # legacy DB value
        ("failed", "failed_retryable"),
        ("expired", "expired"),
        ("deferred", "deferred"),
        ("", "not_started"),
        (None, "not_started"),
    ],
    ids=[
        "successful",
        "force-approved",
        "legacy-verified",
        "legacy-paid",
        "failed",
        "expired",
        "deferred",
        "blank",
        "none",
    ],
)
def test_settled_statuses_have_a_settled_phase(status, expected):
    """Settled statuses map to their phase regardless of provider metadata.

    A stale ``provider_initiation`` must never make a paid payment look like it
    is still waiting for a PIN.

    Validates: Requirements R12.4
    """
    assert derive_payment_phase(status, {"status": "accepted"}) == expected


def test_only_the_two_waiting_phases_have_a_ui_timeout():
    """Timeout semantics differ per phase, and settled phases have none.

    Validates: Requirements R12.6
    """
    assert phase_ui_timeout_seconds("action_required") == 120
    assert phase_ui_timeout_seconds("provider_processing") == 600
    for phase in ("paid", "failed_retryable", "expired", "deferred", "not_started"):
        assert phase_ui_timeout_seconds(phase) is None, (
            f"{phase} is not a waiting state and must not carry a wait budget."
        )


def test_action_required_times_out_sooner_than_provider_processing():
    """The student's prompt is chased sooner than the provider's silence.

    A lost handset prompt is cheap to resend; a premature retry against a
    provider that is still working is how a student gets charged twice.

    Validates: Requirements R12.6
    """
    assert (
        PHASE_UI_TIMEOUT_SECONDS["action_required"]
        < PHASE_UI_TIMEOUT_SECONDS["provider_processing"]
    )


# ===========================================================================
# 2. The API contract
# ===========================================================================


def _seed_payment(*, status: str, provider_initiation: dict | None):
    from apps.accounts.models import Profile
    from apps.applications.models import Application
    from apps.documents.models import Payment

    now = timezone.now()
    token = uuid.uuid4().hex[:8]

    profile = Profile.objects.create(
        id=uuid.uuid4(),
        email=f"phase-{token}@example.com",
        first_name="Phase",
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
        full_name="Phase Probe",
        date_of_birth=now.date().replace(year=2000),
        sex="Male",
        phone="+260977000000",
        email=profile.email,
        residence_town="Lusaka",
        nationality="Zambian",
        country="Zambia",
        program="Phase Program",
        intake="January 2025",
        institution="MIHAS",
        status="submitted",
        payment_status="pending_review",
        version=1,
        created_at=now,
        updated_at=now,
    )
    metadata: dict = {}
    if provider_initiation is not None:
        metadata["provider_initiation"] = provider_initiation
    return Payment.objects.create(
        id=uuid.uuid4(),
        application=application,
        user=profile,
        amount=Decimal("153.00"),
        currency="ZMW",
        status=status,
        transaction_reference=f"BNL-{application.application_number}-{token}",
        metadata=metadata,
        created_at=now,
        updated_at=now,
    )


@pytest.mark.django_db
@pytest.mark.parametrize(
    "status,provider_initiation,expected_phase,expected_timeout",
    [
        ("pending", {"status": "accepted"}, "action_required", 120),
        ("pending", {"status": "sent"}, "provider_processing", 600),
        ("pending", None, "not_started", None),
        ("successful", {"status": "accepted"}, "paid", None),
        ("failed", None, "failed_retryable", None),
    ],
    ids=["action-required", "provider-processing", "not-started", "paid", "failed"],
)
def test_payment_serializer_exposes_phase_and_its_timeout(
    status, provider_initiation, expected_phase, expected_timeout
):
    """The read contract carries the phase, so the client derives nothing.

    Validates: Requirements R12.4, R12.6
    """
    from apps.documents.serializers import PaymentSerializer

    payment = _seed_payment(status=status, provider_initiation=provider_initiation)
    data = PaymentSerializer(payment).data

    assert data["status"] == status
    assert data["phase"] == expected_phase
    assert data["phase_timeout_seconds"] == expected_timeout


@pytest.mark.django_db
def test_phase_does_not_leak_provider_contact_details():
    """The phase is derived from a status word, never from a phone number.

    ``provider_initiation`` also carries ``phone_hash`` / ``phone_last4``; the
    derivation must not depend on them, and the phase must not smuggle them out.

    Validates: Requirements R12.4
    """
    from apps.documents.serializers import PaymentSerializer

    payment = _seed_payment(
        status="pending",
        provider_initiation={
            "status": "accepted",
            "phone_hash": "a" * 64,
            "phone_last4": "1234",
            "operator": "airtel",
        },
    )
    data = PaymentSerializer(payment).data

    assert data["phase"] == "action_required"
    assert "1234" not in str(data["phase"])
    assert derive_payment_phase("pending", {"status": "accepted"}) == data["phase"], (
        "The phase must be a function of the status word alone."
    )


# ===========================================================================
# 3. The frontend mirror
# ===========================================================================
#
# ``phase`` is a new canonical domain concept with a frontend mirror
# (``PaymentPhase`` and ``PAYMENT_WAITING_STATES`` in
# ``apps/admissions/src/lib/paymentStatus.ts``), so it needs a drift guard that
# fails from *either* side. The frontend has its own assertions that the two wait
# budgets are 120 s and 600 s, but a test that compares the frontend's literal to
# another copy of the same literal cannot detect the backend changing underneath
# it. This one reads the real TypeScript.


def _frontend_payment_status_source() -> str:
    from pathlib import Path

    repo_root = Path(__file__).resolve().parents[3]
    path = repo_root / "apps" / "admissions" / "src" / "lib" / "paymentStatus.ts"
    if not path.exists():  # pragma: no cover - frontend absent from the checkout
        pytest.skip(f"frontend mirror not present at {path}")
    return path.read_text()


def test_frontend_phase_union_matches_the_backend_derivation():
    """The client's ``PaymentPhase`` union is exactly the server's.

    A phase the backend can emit but the frontend cannot name renders as
    "unknown"; a phase the frontend names but the backend never emits is dead
    UI that will eventually be wired to something wrong.

    Validates: Requirements R12.4
    """
    import re
    import typing

    source = _frontend_payment_status_source()
    match = re.search(
        r"export type PaymentPhase\s*=\s*(.*?)\n\s*\n", source, re.DOTALL
    )
    assert match, "PaymentPhase union not found in paymentStatus.ts"
    frontend_phases = set(re.findall(r"'([a-z_]+)'", match.group(1)))

    from apps.documents.payment_phase import PaymentPhase

    backend_phases = set(typing.get_args(PaymentPhase))

    assert frontend_phases == backend_phases, (
        "PaymentPhase drifted between backend/apps/documents/payment_phase.py and "
        "apps/admissions/src/lib/paymentStatus.ts: "
        f"backend-only={sorted(backend_phases - frontend_phases)} "
        f"frontend-only={sorted(frontend_phases - backend_phases)}"
    )


def test_frontend_wait_budgets_match_the_backend_timeouts():
    """The two UI wait budgets are the server's numbers, not a second opinion.

    Validates: Requirements R12.6
    """
    import re

    source = _frontend_payment_status_source()
    block = source[source.index("export const PAYMENT_WAITING_STATES") :]
    frontend_budgets = {
        phase: int(seconds)
        for phase, seconds in re.findall(
            r"(action_required|provider_processing):\s*\{.*?timeoutSeconds:\s*(\d+)",
            block,
            re.DOTALL,
        )
    }

    assert frontend_budgets == PHASE_UI_TIMEOUT_SECONDS, (
        "Wait budgets drifted between payment_phase.PHASE_UI_TIMEOUT_SECONDS and "
        f"PAYMENT_WAITING_STATES: backend={PHASE_UI_TIMEOUT_SECONDS} "
        f"frontend={frontend_budgets}"
    )
