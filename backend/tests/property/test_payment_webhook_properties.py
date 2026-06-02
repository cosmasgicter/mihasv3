"""Property-based tests — Phase 2 webhook integrity invariants.

Enforcement PBTs for Task 16 of the payment-hardening spec.

**Validates: Requirements R7.1, R7.2, R7.3, R7.5, R7.6, R10.5, R20.5**
"""

from __future__ import annotations

import uuid
from decimal import Decimal, InvalidOperation
from typing import Any

import pytest
from django.test import override_settings
from django.utils import timezone
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st


# ---------------------------------------------------------------------------
# Shared fixture — duplicated from test_payment_state_machine_properties.py
# ---------------------------------------------------------------------------


@pytest.fixture
def seed_applicant(db):
    """Create a resolvable Program + ProgramFee + Profile + submitted Application.

    The webhook property only needs a Payment row with a valid
    ``metadata.snapshot`` — the catalog side is populated for parity with
    the state-machine fixture so fee-resolver paths continue to work.
    """
    from apps.accounts.models import Profile
    from apps.applications.models import Application
    from apps.catalog.models import Institution, Program
    from apps.documents.models import ProgramFee

    now = timezone.now()
    suffix = uuid.uuid4().hex[:8]

    institution = Institution.objects.create(
        id=uuid.uuid4(),
        name=f"MIHAS Phase 2 Webhook Institute {suffix}",
        code=f"WH-INST-{suffix.upper()}",
        is_active=True,
        created_at=now,
        updated_at=now,
    )

    program = Program.objects.create(
        id=uuid.uuid4(),
        name=f"Phase 2 Webhook Test Program {suffix}",
        code=f"WH-PHASE2-{suffix.upper()}",
        institution=institution,
        duration_months=36,
        application_fee=Decimal("153.00"),
        is_active=True,
        created_at=now,
        updated_at=now,
    )

    ProgramFee.objects.create(
        id=uuid.uuid4(),
        program=program,
        fee_type="application",
        residency_category="local",
        amount=Decimal("153.00"),
        currency="ZMW",
        is_active=True,
        created_at=now,
        updated_at=now,
    )

    profile = Profile.objects.create(
        id=uuid.uuid4(),
        email=f"phase2-webhook-{suffix}@example.com",
        first_name="Phase2",
        last_name="WebhookTester",
        role="student",
        is_active=True,
        created_at=now,
        updated_at=now,
    )

    application = Application.objects.create(
        id=uuid.uuid4(),
        application_number=f"APP-{now:%Y%m%d}-{suffix.upper()}",
        user=profile,
        full_name="Phase2 Webhook Student",
        date_of_birth=now.date().replace(year=2000),
        sex="Male",
        phone="+260977000000",
        email=profile.email,
        residence_town="Lusaka",
        nationality="Zambian",
        country="Zambia",
        program=program.code,
        intake="January 2025",
        institution=institution.name,
        status="submitted",
        payment_status="pending",
        version=1,
        created_at=now,
        updated_at=now,
    )

    return {
        "profile": profile,
        "application": application,
        "program": program,
        "institution": institution,
    }


def _make_pending_payment(application, profile):
    """Create a minimal pending Payment row with a valid snapshot.

    Snapshot pins expected_amount=153.00 / currency=ZMW so the property
    can draw provider_data values around that canonical baseline.
    """
    from apps.documents.models import Payment

    now = timezone.now()
    return Payment.objects.create(
        id=uuid.uuid4(),
        application=application,
        user=profile,
        amount=Decimal("153.00"),
        currency="ZMW",
        status="pending",
        transaction_reference=(
            f"MIHAS-{application.application_number}-"
            f"{uuid.uuid4().hex[:12]}"
        ),
        metadata={
            "snapshot": {
                "expected_amount": "153.00",
                "currency": "ZMW",
                "residency_category": "local",
                "program_code": application.program,
                "intake_id": None,
                "waiver_applied": False,
                "original_amount": "153.00",
                "fee_source": "program_fee",
            },
        },
        created_at=now,
        updated_at=now,
    )


# ---------------------------------------------------------------------------
# Expected risk-flag type for a given provider_data shape
# ---------------------------------------------------------------------------


_EXPECTED_AMOUNT = Decimal("153.00")
_EXPECTED_CURRENCY_UPPER = "ZMW"


def _expected_risk_flag(
    amount_raw: Any, currency: str, reference: str
) -> str | None:
    """Return the risk_flag type the integrity gate should emit, or None.

    Mirrors the priority order of checks in
    ``PaymentService._run_integrity_gate``:
    ``invalid_amount`` → ``amount_mismatch`` → ``currency_mismatch`` →
    ``missing_provider_reference``. Snapshot presence is advisory and
    never blocks.
    """
    # --- Check 1: amount parseability + positivity + equality ---
    try:
        if amount_raw is None:
            return "invalid_amount"
        parsed = Decimal(str(amount_raw)).quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError, TypeError):
        return "invalid_amount"
    if parsed <= Decimal("0"):
        return "invalid_amount"
    if parsed != _EXPECTED_AMOUNT:
        return "amount_mismatch"

    # --- Check 2: currency (case-insensitive, both sides non-empty) ---
    provider_currency = str(currency or "").strip()
    if provider_currency and (
        provider_currency.upper() != _EXPECTED_CURRENCY_UPPER
    ):
        return "currency_mismatch"

    # --- Check 3: non-empty provider reference ---
    lenco_reference = str(reference or "").strip()
    if not lenco_reference:
        return "missing_provider_reference"

    return None


# ---------------------------------------------------------------------------
# Property 5 — Amount/Currency/Reference Integrity (Task 16.3)
# ---------------------------------------------------------------------------


@given(
    amount_raw=st.one_of(
        st.decimals(
            min_value=Decimal("-10"),
            max_value=Decimal("500"),
            places=2,
            allow_nan=False,
            allow_infinity=False,
        ),
        st.sampled_from(["abc", "", "0", "-0.01"]),
    ),
    currency=st.sampled_from(["ZMW", "USD", "zmw", "", "ZmW", "EUR"]),
    reference=st.sampled_from(["", "   ", "LENCO-VALID-12345", "VALID-REF"]),
)
@settings(
    max_examples=20,
    deadline=None,
    suppress_health_check=[
        HealthCheck.function_scoped_fixture,
        HealthCheck.too_slow,
    ],
)
@override_settings(PAYMENT_HARDENING_FORWARD_ONLY=True)
@pytest.mark.django_db
def test_property_5_amount_currency_reference_integrity(
    seed_applicant, amount_raw, currency, reference
):
    """P5: Integrity gate on ``collection.successful`` webhooks.

    For a pending Payment with snapshot ``expected_amount=153.00`` /
    ``currency=ZMW``:

    * When provider_data matches the snapshot exactly (amount parseable,
      positive, equal to 153.00 at 2dp; currency case-insensitive ==
      ZMW; reference non-empty after strip), the Payment transitions to
      ``successful`` and no new risk_flag is appended.
    * Otherwise the Payment stays ``pending`` AND exactly one new
      ``risk_flag`` is appended to ``metadata.risk_flags``, with the
      ``type`` matching the first failing check in the priority order
      ``invalid_amount`` → ``amount_mismatch`` → ``currency_mismatch`` →
      ``missing_provider_reference`` (matches ``_run_integrity_gate``
      in ``payment_service.py``).

    **Validates: Requirements R7.1, R7.2, R7.3, R7.5, R7.6, R10.5, R20.5**
    """
    from apps.documents.models import Payment
    from apps.documents.payment_service import PaymentService

    application = seed_applicant["application"]
    profile = seed_applicant["profile"]

    # Fresh pending Payment per example — the active-row unique index
    # forbids more than one pending Payment per application.
    Payment.objects.filter(application_id=application.id).delete()
    payment = _make_pending_payment(application, profile)

    baseline_risks = list((payment.metadata or {}).get("risk_flags") or [])
    baseline_risk_count = len(baseline_risks)

    provider_data = {
        "amount": str(amount_raw),
        "currency": currency,
        "lencoReference": reference,
    }

    # Mirror the service's integrity-gate preconditions exactly so the
    # property does not diverge from the code under test.
    try:
        amount_parseable = Decimal(str(amount_raw)).quantize(Decimal("0.01"))
        amount_ok = amount_parseable == _EXPECTED_AMOUNT
    except (InvalidOperation, ValueError, TypeError):
        amount_ok = False
    currency_ok = (
        str(currency or "").strip() != ""
        and str(currency).strip().upper() == _EXPECTED_CURRENCY_UPPER
    )
    reference_ok = str(reference or "").strip() != ""
    all_ok = amount_ok and currency_ok and reference_ok

    expected_flag = _expected_risk_flag(amount_raw, currency, reference)

    PaymentService().apply_webhook_event(
        "collection.successful",
        reference=payment.transaction_reference,
        payload={"data": provider_data},
    )

    payment.refresh_from_db()
    current_risks = list((payment.metadata or {}).get("risk_flags") or [])
    new_risks = current_risks[baseline_risk_count:]

    if all_ok:
        assert expected_flag is None, (
            f"Test oracle disagreement: all_ok=True but "
            f"expected_flag={expected_flag!r} for "
            f"provider_data={provider_data!r}."
        )
        assert payment.status == "successful", (
            f"Matching provider_data failed to transition Payment to "
            f"successful. provider_data={provider_data!r} "
            f"status={payment.status!r}."
        )
        assert len(new_risks) == 0, (
            f"Matching provider_data still wrote {len(new_risks)} new "
            f"risk_flag(s): {new_risks!r}."
        )
    else:
        assert expected_flag is not None, (
            f"Test oracle disagreement: all_ok=False but "
            f"expected_flag is None for provider_data={provider_data!r}."
        )
        assert payment.status == "pending", (
            f"Mismatching provider_data mutated Payment status to "
            f"{payment.status!r} (expected 'pending'). "
            f"provider_data={provider_data!r} "
            f"expected_flag={expected_flag!r}."
        )
        assert len(new_risks) == 1, (
            f"Expected exactly 1 new risk_flag for "
            f"provider_data={provider_data!r}; got {len(new_risks)} "
            f"({new_risks!r})."
        )
        got_type = new_risks[0].get("type")
        assert got_type == expected_flag, (
            f"Wrong risk_flag type for provider_data={provider_data!r}: "
            f"expected {expected_flag!r}, got {got_type!r}."
        )


# ---------------------------------------------------------------------------
# Phase 3 properties — Task 24 (out-of-order safety, idempotence,
# canonical JSON, webhook identity, provider-event-id preference)
# ---------------------------------------------------------------------------

import hashlib
import json

from apps.documents.webhook_processor import (
    WebhookEventIdentity,
    WebhookProcessor,
    canonical_json,
)


def _ok_successful_payload(payment) -> dict:
    """Integrity-passing payload for a ``collection.successful`` event.

    The snapshot pinned by ``_make_pending_payment`` expects
    ``amount=153.00 ZMW``; the provider reference must be non-empty.
    """
    return {
        "data": {
            "reference": payment.transaction_reference,
            "amount": "153.00",
            "currency": "ZMW",
            "lencoReference": "LENCO-OK-0001",
            "type": "mobile-money",
            "id": f"evt-{uuid.uuid4().hex[:12]}",
        }
    }


def _failed_payload(payment) -> dict:
    return {
        "data": {
            "reference": payment.transaction_reference,
            "reasonForFailure": "Insufficient funds",
            "id": f"evt-{uuid.uuid4().hex[:12]}",
        }
    }


def _settled_payload(payment) -> dict:
    return {
        "data": {
            "reference": payment.transaction_reference,
            "settlement": {
                "status": "settled",
                "settled_at": "2025-01-01T00:00:00Z",
            },
            "id": f"evt-{uuid.uuid4().hex[:12]}",
        }
    }


def _build_event_stream(payment) -> list[tuple[str, dict]]:
    """Five events: 1× successful (integrity-passing), 2× failed, 2× settled.

    The ``successful`` event is the only one that can legitimately move a
    pending Payment to a terminal status; late ``failed``/``settled``
    deliveries must be absorbed without reverting the terminal state.
    """
    return [
        ("collection.successful", _ok_successful_payload(payment)),
        ("collection.failed", _failed_payload(payment)),
        ("collection.settled", _settled_payload(payment)),
        ("collection.failed", _failed_payload(payment)),
        ("collection.settled", _settled_payload(payment)),
    ]


# ---------------------------------------------------------------------------
# Property 3 — Out-Of-Order Webhook Safety (Task 24.1)
# ---------------------------------------------------------------------------


@given(
    permutation_indices=st.permutations([0, 1, 2, 3, 4]),
)
@settings(
    max_examples=20,
    deadline=None,
    suppress_health_check=[
        HealthCheck.function_scoped_fixture,
        HealthCheck.too_slow,
    ],
)
@override_settings(
    PAYMENT_HARDENING_FORWARD_ONLY=True,
    PAYMENT_HARDENING_WEBHOOK_DEDUP_STRICT=True,
)
@pytest.mark.django_db
def test_property_3_out_of_order_webhook_safety(
    seed_applicant, permutation_indices
):
    """P3: Out-of-order webhook deliveries still converge on ``successful``.

    For any ordering of 5 events — one integrity-passing
    ``collection.successful``, two ``collection.failed``, two
    ``collection.settled`` — the forward-only state machine must absorb
    late ``failed``/``settled`` deliveries without reverting the Payment's
    terminal status (R9.1). Once the successful event has been applied,
    subsequent events either no-op (``settled`` merges metadata only) or
    are explicitly blocked by ``_transition`` (``failed`` after
    ``successful`` emits ``payment.late_failed_webhook_ignored``).

    **Validates: Requirements R9.1, R20.3**
    """
    from apps.documents.models import Payment
    from apps.documents.payment_service import PaymentService

    application = seed_applicant["application"]
    profile = seed_applicant["profile"]

    Payment.objects.filter(application_id=application.id).delete()
    payment = _make_pending_payment(application, profile)

    events = _build_event_stream(payment)
    permuted = [events[i] for i in permutation_indices]

    service = PaymentService()
    for event_type, payload in permuted:
        service.apply_webhook_event(
            event_type,
            reference=payment.transaction_reference,
            payload=payload,
        )

    payment.refresh_from_db()
    assert payment.status == "successful", (
        f"Out-of-order event stream failed to converge on 'successful'. "
        f"order={permutation_indices!r} final_status={payment.status!r}."
    )


# ---------------------------------------------------------------------------
# Property 4 — Webhook Idempotence (Task 24.2)
# ---------------------------------------------------------------------------


_IDEMPOTENT_EVENT_TYPES = st.sampled_from(
    ["collection.successful", "collection.failed", "collection.settled"]
)


def _payload_for_event(event_type: str, reference: str) -> dict:
    """Build a payload matching the event_type — integrity-passing when
    ``collection.successful`` so the happy path is exercised too."""
    base = {"reference": reference, "id": f"evt-{uuid.uuid4().hex[:12]}"}
    if event_type == "collection.successful":
        base.update({
            "amount": "153.00",
            "currency": "ZMW",
            "lencoReference": "LENCO-OK-P4",
            "type": "mobile-money",
        })
    elif event_type == "collection.failed":
        base["reasonForFailure"] = "Insufficient funds"
    else:  # collection.settled
        base["settlement"] = {
            "status": "settled",
            "settled_at": "2025-01-01T00:00:00Z",
        }
    return {"data": base}


def _snapshot_payment_state(payment_ref: str) -> dict:
    """Capture the observable state of the Payment + derived rows.

    Returns a dict comparing ``status``, derived
    ``application.payment_status``, the ``receipt_number``, and the count
    of audit rows attributed to the payment (so the idempotence check
    covers every durable side effect of ``apply_webhook_event``).
    """
    from apps.common.models import AuditLog
    from apps.documents.models import Payment

    payment = Payment.objects.get(transaction_reference=payment_ref)
    audit_count = AuditLog.objects.filter(
        entity_type="payment", entity_id=payment.id,
    ).count()
    return {
        "status": payment.status,
        "application_payment_status": payment.application.payment_status,
        "receipt_number": payment.receipt_number,
        "audit_count": audit_count,
    }


@given(
    event_type=_IDEMPOTENT_EVENT_TYPES,
)
@settings(
    max_examples=20,
    deadline=None,
    suppress_health_check=[
        HealthCheck.function_scoped_fixture,
        HealthCheck.too_slow,
    ],
)
@override_settings(
    PAYMENT_HARDENING_FORWARD_ONLY=True,
    PAYMENT_HARDENING_WEBHOOK_DEDUP_STRICT=True,
)
@pytest.mark.django_db
def test_property_4_webhook_idempotence(seed_applicant, event_type):
    """P4: Applying the same webhook event twice equals applying it once.

    For a pending Payment: ``apply_webhook_event(e); apply_webhook_event(e)``
    must produce the same observable state (``Payment.status``, derived
    ``application.payment_status``, audit row count, ``receipt_number``)
    as a single ``apply_webhook_event(e)`` against an equivalent freshly
    seeded row. This is the service-layer projection of R8.5/R8.6
    (duplicate identities short-circuit) and R9.3 (idempotent webhook
    processing).

    **Validates: Requirements R8.5, R8.6, R9.3, R20.4**
    """
    from apps.documents.models import Payment
    from apps.documents.payment_service import PaymentService

    application = seed_applicant["application"]
    profile = seed_applicant["profile"]

    # --- Baseline: single application of the event ---
    Payment.objects.filter(application_id=application.id).delete()
    baseline_payment = _make_pending_payment(application, profile)
    baseline_ref = baseline_payment.transaction_reference
    payload = _payload_for_event(event_type, baseline_ref)

    service = PaymentService()
    service.apply_webhook_event(
        event_type, reference=baseline_ref, payload=payload,
    )
    baseline_state = _snapshot_payment_state(baseline_ref)

    # --- Double-apply: fresh Payment, same event applied twice ---
    Payment.objects.filter(application_id=application.id).delete()
    double_payment = _make_pending_payment(application, profile)
    double_ref = double_payment.transaction_reference
    double_payload = _payload_for_event(event_type, double_ref)

    service.apply_webhook_event(
        event_type, reference=double_ref, payload=double_payload,
    )
    service.apply_webhook_event(
        event_type, reference=double_ref, payload=double_payload,
    )
    double_state = _snapshot_payment_state(double_ref)

    # Receipt numbers are per-Payment randoms — compare presence only.
    baseline_has_receipt = baseline_state["receipt_number"] is not None
    double_has_receipt = double_state["receipt_number"] is not None

    assert double_state["status"] == baseline_state["status"], (
        f"Double-apply status drift for event={event_type!r}: "
        f"baseline={baseline_state['status']!r} "
        f"double={double_state['status']!r}."
    )
    assert (
        double_state["application_payment_status"]
        == baseline_state["application_payment_status"]
    ), (
        f"Double-apply derived application.payment_status drift for "
        f"event={event_type!r}: baseline="
        f"{baseline_state['application_payment_status']!r} "
        f"double={double_state['application_payment_status']!r}."
    )
    assert double_has_receipt == baseline_has_receipt, (
        f"Double-apply receipt presence drift for event={event_type!r}: "
        f"baseline={baseline_has_receipt!r} double={double_has_receipt!r}."
    )
    assert double_state["audit_count"] == baseline_state["audit_count"], (
        f"Double-apply audit-row count drift for event={event_type!r}: "
        f"baseline={baseline_state['audit_count']} "
        f"double={double_state['audit_count']}."
    )


# ---------------------------------------------------------------------------
# Property 20 — Canonical JSON Round-Trip (Task 24.3)
# ---------------------------------------------------------------------------


_JSON_VALUES = st.recursive(
    st.none()
    | st.booleans()
    | st.integers()
    | st.floats(allow_nan=False, allow_infinity=False)
    | st.text(max_size=20),
    lambda children: (
        st.lists(children, max_size=4)
        | st.dictionaries(st.text(max_size=10), children, max_size=4)
    ),
    max_leaves=6,
)


@given(payload=_JSON_VALUES)
@settings(
    max_examples=20,
    deadline=None,
    suppress_health_check=[
        HealthCheck.function_scoped_fixture,
        HealthCheck.too_slow,
    ],
)
def test_property_20_canonical_json_round_trip(payload):
    """P20: ``canonical_json`` is a stable, order-independent encoder.

    For any JSON-compatible value, ``canonical_json(json.loads(
    canonical_json(d).decode())) == canonical_json(d)``. This is the
    property the payload hash relies on: two logically equivalent
    payloads must produce byte-identical canonical encodings so that
    SHA-256 digests (and therefore dedup identities) stay stable across
    key ordering, formatting whitespace, and round-tripping through
    ``json.loads``.

    Only dict inputs are covered by ``canonical_json``'s type contract;
    non-dict draws exercise the encoder through its ``default=str``
    escape hatch so the round-trip still holds.

    **Validates: Requirements R8.1, R21.1, R21.2**
    """
    try:
        first = canonical_json(payload)
    except (TypeError, ValueError):
        # Un-serialisable inputs are allowed to raise (R21.5); they fall
        # outside the round-trip property and are handled by the
        # short-circuit in ``WebhookProcessor._process_strict``.
        return

    reparsed = json.loads(first.decode("utf-8"))
    second = canonical_json(reparsed)

    assert second == first, (
        f"canonical_json round-trip drifted: first={first!r} "
        f"second={second!r} payload={payload!r}."
    )


# ---------------------------------------------------------------------------
# Property 21 — Webhook Identity Round-Trip (Task 24.4)
# ---------------------------------------------------------------------------


_HEX_ALPHABET = "0123456789abcdef"
_IDENTITY_TEXT = st.text(
    alphabet=st.characters(blacklist_characters="|"), max_size=30,
)


@given(
    provider_event_id=_IDENTITY_TEXT,
    event_type=st.sampled_from([
        "collection.successful",
        "collection.failed",
        "collection.settled",
        "collection.unknown",
    ]),
    reference=_IDENTITY_TEXT,
    payload_hash=st.text(alphabet=_HEX_ALPHABET, min_size=12, max_size=64),
)
@settings(
    max_examples=20,
    deadline=None,
    suppress_health_check=[
        HealthCheck.function_scoped_fixture,
        HealthCheck.too_slow,
    ],
)
def test_property_21_webhook_identity_round_trip(
    provider_event_id, event_type, reference, payload_hash
):
    """P21: ``WebhookEventIdentity.parse(i.print())`` recovers core fields.

    The log-safe ``print()`` form ``wh:{pid}|{type}|{ref}|{hash[:12]}``
    truncates the payload hash to 12 chars so full digests never leak
    into logs. As a result the round-trip equivalence on
    ``payload_hash`` holds only for its 12-char prefix; the other three
    fields (``provider_event_id``, ``event_type``, ``reference``) must
    round-trip exactly.

    **Validates: Requirements R21.3, R21.4**
    """
    identity = WebhookEventIdentity(
        provider_event_id=provider_event_id,
        event_type=event_type,
        reference=reference,
        payload_hash=payload_hash,
    )

    reparsed = WebhookEventIdentity.parse(identity.print())

    assert reparsed.provider_event_id == identity.provider_event_id, (
        f"provider_event_id drifted through print/parse: "
        f"expected={identity.provider_event_id!r} "
        f"got={reparsed.provider_event_id!r}."
    )
    assert reparsed.event_type == identity.event_type, (
        f"event_type drifted through print/parse: "
        f"expected={identity.event_type!r} got={reparsed.event_type!r}."
    )
    assert reparsed.reference == identity.reference, (
        f"reference drifted through print/parse: "
        f"expected={identity.reference!r} got={reparsed.reference!r}."
    )
    assert reparsed.payload_hash == identity.payload_hash[:12], (
        f"payload_hash prefix drifted through print/parse: "
        f"expected={identity.payload_hash[:12]!r} "
        f"got={reparsed.payload_hash!r}."
    )


# ---------------------------------------------------------------------------
# Property 22 — Provider Event Id Preferred In Identity (Task 24.5)
# ---------------------------------------------------------------------------


_PID_TEXT = st.text(
    alphabet=st.characters(
        blacklist_characters="|",
        blacklist_categories=("Cs",),
    ),
    min_size=1,
    max_size=20,
)


@given(
    has_id=st.booleans(),
    has_event_id_camel=st.booleans(),
    has_event_id_snake=st.booleans(),
    id_value=_PID_TEXT,
    event_id_camel_value=_PID_TEXT,
    event_id_snake_value=_PID_TEXT,
    reference=_IDENTITY_TEXT,
    event_type=st.sampled_from([
        "collection.successful",
        "collection.failed",
        "collection.settled",
    ]),
)
@settings(
    max_examples=20,
    deadline=None,
    suppress_health_check=[
        HealthCheck.function_scoped_fixture,
        HealthCheck.too_slow,
    ],
)
def test_property_22_provider_event_id_preferred_in_identity(
    has_id,
    has_event_id_camel,
    has_event_id_snake,
    id_value,
    event_id_camel_value,
    event_id_snake_value,
    reference,
    event_type,
):
    """P22: ``compute_identity`` prefers ``data.id`` → ``eventId`` → ``event_id``.

    For each combination of present/absent ``data.id``, ``data.eventId``,
    and ``data.event_id`` keys:

    * ``data.id`` wins when present.
    * Otherwise ``data.eventId`` wins when present.
    * Otherwise ``data.event_id`` wins when present.
    * Otherwise ``provider_event_id == ""`` (the processor falls back to
      the ``(event_type, reference, payload_hash)`` tuple for dedup).

    **Validates: Requirements R8.3, R8.4**
    """
    data: dict = {"reference": reference}
    if has_id:
        data["id"] = id_value
    if has_event_id_camel:
        data["eventId"] = event_id_camel_value
    if has_event_id_snake:
        data["event_id"] = event_id_snake_value

    payload = {"data": data}
    identity = WebhookProcessor().compute_identity(event_type, payload)

    if has_id:
        expected = id_value
    elif has_event_id_camel:
        expected = event_id_camel_value
    elif has_event_id_snake:
        expected = event_id_snake_value
    else:
        expected = ""

    assert identity.provider_event_id == expected, (
        f"compute_identity picked wrong provider_event_id: "
        f"data={data!r} expected={expected!r} "
        f"got={identity.provider_event_id!r}."
    )

    # Sanity: reference + event_type are carried through unchanged, and
    # the payload_hash is the SHA-256 of the canonical encoding.
    assert identity.reference == reference
    assert identity.event_type == event_type
    assert identity.payload_hash == hashlib.sha256(
        canonical_json(payload)
    ).hexdigest()
