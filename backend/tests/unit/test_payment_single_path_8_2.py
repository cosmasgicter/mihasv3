"""One payment state machine, one service path — admissions-v2 task 8.2.

This file started life as a two-column parity harness: every scenario below ran
twice, once with ``PAYMENT_HARDENING_FORWARD_ONLY=False`` (the pre-hardening
mutator ``_update_payment_status``, reached through ``verify_payment`` /
``process_webhook_event`` / ``initiate_payment``) and once with the flag on (the
hardened ``_transition`` path), and the two ledgers were compared field by
field. That run found two real divergences — the hardened path was dropping the
provider's ``fee``/``bearer`` and the failure reason — which were fixed in the
sole writer before anything was deleted.

The verbatim two-column run, the divergence it found, and the documented
hardened-only superset are preserved in ``docs/v2-evidence/8.2/``. The legacy
column itself no longer exists: the duplicate path and the three flags that
selected it were deleted in the same change. What remains here is the outcome
table parity established, now asserted against the single surviving path, plus
a drift guard so the duplicate cannot come back.

Validates: Requirements R12.4, R12.5
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from decimal import Decimal
from unittest.mock import patch

import pytest
from django.test import override_settings
from django.utils import timezone

_VER = "apps.documents.payment_service_mixins._verification"


# ---------------------------------------------------------------------------
# Seeding
# ---------------------------------------------------------------------------


@dataclass
class Seed:
    profile: object
    application: object
    payment: object
    reference: str


def _seed(*, status: str = "pending", app_payment_status: str = "pending_review") -> Seed:
    """Seed a student + application + payment with a canonical snapshot."""
    from apps.accounts.models import Profile
    from apps.applications.models import Application
    from apps.documents.models import Payment

    now = timezone.now()
    token = uuid.uuid4().hex[:8]

    profile = Profile.objects.create(
        id=uuid.uuid4(),
        email=f"onepath-{token}@example.com",
        first_name="OnePath",
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
        full_name="OnePath Probe",
        date_of_birth=now.date().replace(year=2000),
        sex="Male",
        phone="+260977000000",
        email=profile.email,
        residence_town="Lusaka",
        nationality="Zambian",
        country="Zambia",
        program="OnePath Program",
        intake="January 2025",
        institution="MIHAS",
        status="submitted",
        payment_status=app_payment_status,
        version=1,
        created_at=now,
        updated_at=now,
    )
    reference = f"BNL-{application.application_number}-{uuid.uuid4().hex[:12]}"
    payment = Payment.objects.create(
        id=uuid.uuid4(),
        application=application,
        user=profile,
        amount=Decimal("153.00"),
        currency="ZMW",
        status=status,
        transaction_reference=reference,
        metadata={
            "snapshot": {
                "expected_amount": "153.00",
                "currency": "ZMW",
                "residency_category": "local",
                "program_code": "ONE",
                "intake_id": None,
                "waiver_applied": False,
                "original_amount": "153.00",
                "fee_source": "program_fee",
            },
        },
        created_at=now,
        updated_at=now,
    )
    return Seed(profile=profile, application=application, payment=payment, reference=reference)


def _app_payment_status(application_id) -> str | None:
    from apps.applications.models import Application

    return (
        Application.objects.filter(id=application_id)
        .values_list("payment_status", flat=True)
        .first()
    )


# ---------------------------------------------------------------------------
# Provider payloads (deterministic local adapter — no network)
# ---------------------------------------------------------------------------


def _provider_success(reference: str) -> dict:
    return {
        "status": "successful",
        "reference": reference,
        "amount": "153.00",
        "currency": "ZMW",
        "lencoReference": "LR-ONEPATH-OK",
        "type": "mobile-money",
        "fee": "1.53",
        "bearer": "customer",
    }


def _provider_failed(reference: str) -> dict:
    return {
        "status": "failed",
        "reference": reference,
        "amount": "153.00",
        "currency": "ZMW",
        "lencoReference": "LR-ONEPATH-FAIL",
        "type": "mobile-money",
        "reasonForFailure": "Insufficient balance",
    }


def _provider_pending(reference: str) -> dict:
    return {
        "status": "pay-offline",
        "reference": reference,
        "amount": "153.00",
        "currency": "ZMW",
        "lencoReference": "LR-ONEPATH-PENDING",
        "type": "mobile-money",
    }


def _provider_amount_mismatch(reference: str) -> dict:
    return {
        "status": "successful",
        "reference": reference,
        "amount": "1.00",
        "currency": "ZMW",
        "lencoReference": "LR-ONEPATH-MISMATCH",
        "type": "mobile-money",
    }


# ===========================================================================
# 1. verify(): provider outcome → ledger
# ===========================================================================


@pytest.mark.django_db(transaction=True)
@pytest.mark.parametrize(
    "payload_builder,expected_status,expected_app_status",
    [
        (_provider_success, "successful", "verified"),
        (_provider_failed, "failed", "failed"),
        (_provider_pending, "pending", "pending_review"),
    ],
    ids=["verify-success", "verify-failed", "verify-pending"],
)
def test_verify_ledger_outcomes(payload_builder, expected_status, expected_app_status):
    """The outcome table the parity run established, on the surviving path.

    Validates: Requirements R12.4, R12.5
    """
    from apps.documents.payment_service import PaymentService

    seed = _seed()
    with override_settings(
        LENCO_API_SECRET_KEY="sk_onepath",
        LENCO_API_BASE_URL="https://api.lenco.test",
    ):
        with patch(f"{_VER}._call_lenco_collection_status") as mock_lenco:
            mock_lenco.return_value = (payload_builder(seed.reference), None)
            PaymentService().verify(seed.payment.id, actor_id=None)

    seed.payment.refresh_from_db()
    assert seed.payment.status == expected_status
    assert _app_payment_status(seed.application.id) == expected_app_status


@pytest.mark.django_db(transaction=True)
def test_transition_persists_the_provider_settlement_facts():
    """``fee``, ``bearer`` and the failure reason are recorded by the sole writer.

    This is the regression the parity harness caught: the hardened path used to
    drop all three, so promoting it would have quietly stopped recording what
    the provider actually charged and why a collection failed. They are captured
    in ``_transition`` now, which means every source records them — not just
    whichever caller remembered to.

    Validates: Requirements R12.4, R12.5
    """
    from apps.documents.payment_service import PaymentService

    paid = _seed()
    with override_settings(
        LENCO_API_SECRET_KEY="sk_onepath",
        LENCO_API_BASE_URL="https://api.lenco.test",
    ):
        with patch(f"{_VER}._call_lenco_collection_status") as mock_lenco:
            mock_lenco.return_value = (_provider_success(paid.reference), None)
            PaymentService().verify(paid.payment.id, actor_id=None)
    paid.payment.refresh_from_db()
    assert str(paid.payment.fee) == "1.53", (
        "The provider's own fee must be persisted on success; got "
        f"{paid.payment.fee!r}."
    )
    assert paid.payment.bearer == "customer"

    declined = _seed()
    with override_settings(
        LENCO_API_SECRET_KEY="sk_onepath",
        LENCO_API_BASE_URL="https://api.lenco.test",
    ):
        with patch(f"{_VER}._call_lenco_collection_status") as mock_lenco:
            mock_lenco.return_value = (_provider_failed(declined.reference), None)
            PaymentService().verify(declined.payment.id, actor_id=None)
    declined.payment.refresh_from_db()
    assert declined.payment.notes == "Insufficient balance", (
        "The provider's failure reason must be persisted on failure; got "
        f"{declined.payment.notes!r}."
    )


@pytest.mark.django_db(transaction=True)
def test_transition_audit_keeps_the_callers_reason():
    """A caller-supplied transition reason is not overwritten by provider text.

    Regression guard for the shadowing bug introduced while closing the parity
    gap: capturing ``reasonForFailure`` must not clobber the ``reason`` the
    caller passed for the audit trail.

    Validates: Requirements R12.5
    """
    from apps.common.models import AuditLog
    from apps.documents.payment_service import PaymentService

    seed = _seed()
    PaymentService()._transition(
        seed.payment,
        "failed",
        source="webhook",
        actor=None,
        reason="provider declined the collection",
        provider_data=_provider_failed(seed.reference),
    )

    audit = (
        AuditLog.objects.filter(
            entity_type="payment",
            entity_id=seed.payment.id,
            action="payment.transitioned",
        )
        .order_by("-created_at")
        .first()
    )
    assert audit is not None
    assert (audit.changes or {}).get("reason") == "provider declined the collection"


# ===========================================================================
# 2. apply_webhook_event(): callback outcome → ledger
# ===========================================================================


@pytest.mark.django_db(transaction=True)
@pytest.mark.parametrize(
    "event_type,payload_builder,expected_status",
    [
        ("collection.successful", _provider_success, "successful"),
        ("collection.failed", _provider_failed, "failed"),
        ("collection.settled", _provider_success, "pending"),
        ("collection.unknown", _provider_success, "pending"),
    ],
    ids=["webhook-successful", "webhook-failed", "webhook-settled", "webhook-unknown"],
)
def test_webhook_ledger_outcomes(event_type, payload_builder, expected_status):
    """Every ``collection.*`` callback lands the outcome parity established.

    Validates: Requirements R12.4, R12.5
    """
    from apps.documents.payment_service import PaymentService

    seed = _seed()
    payload = {"data": payload_builder(seed.reference)}
    if event_type == "collection.settled":
        payload["data"]["settlement"] = {"batchId": "BATCH-ONEPATH"}

    PaymentService().apply_webhook_event(event_type, seed.reference, payload)

    seed.payment.refresh_from_db()
    assert seed.payment.status == expected_status
    if event_type == "collection.settled":
        assert (seed.payment.metadata or {}).get("settlement") is not None


@pytest.mark.django_db(transaction=True)
def test_webhook_unknown_reference_is_a_no_op():
    """A callback for a reference we never issued mutates nothing.

    Validates: Requirements R12.5
    """
    from apps.documents.models import Payment
    from apps.documents.payment_service import PaymentService

    seed = _seed()
    before = Payment.objects.filter(id=seed.payment.id).values().first()
    PaymentService().apply_webhook_event(
        "collection.successful",
        "BNL-DOES-NOT-EXIST",
        {"data": _provider_success("BNL-DOES-NOT-EXIST")},
    )
    after = Payment.objects.filter(id=seed.payment.id).values().first()
    assert before == after, "An unknown-reference callback mutated a payment row."


@pytest.mark.django_db(transaction=True)
def test_webhook_amount_mismatch_refuses_success_and_flags_it():
    """A callback contradicting the quote never marks the row paid.

    Validates: Requirements R12.4, R12.5
    """
    from apps.documents.payment_service import PaymentService

    seed = _seed()
    PaymentService().apply_webhook_event(
        "collection.successful",
        seed.reference,
        {"data": _provider_amount_mismatch(seed.reference)},
    )
    seed.payment.refresh_from_db()
    assert seed.payment.status == "pending"
    risk_types = [
        entry.get("type")
        for entry in (seed.payment.metadata or {}).get("risk_flags", [])
    ]
    assert "amount_mismatch" in risk_types, (
        "The integrity gate must record why it refused; got risk flags "
        f"{risk_types}."
    )


@pytest.mark.django_db(transaction=True)
def test_out_of_order_success_after_failure_is_accepted():
    """Integrity-clean provider truth arriving after a decline is honoured.

    The pre-hardening matrix had no ``failed`` key at all, so a late success was
    silently dropped and the student's money went unrecognised. The canonical
    matrix expresses it (R9.1).

    Validates: Requirements R12.4
    """
    from apps.documents.payment_service import PaymentService

    seed = _seed(status="failed", app_payment_status="failed")
    PaymentService().apply_webhook_event(
        "collection.successful",
        seed.reference,
        {"data": _provider_success(seed.reference)},
    )
    seed.payment.refresh_from_db()
    assert seed.payment.status == "successful"
    assert _app_payment_status(seed.application.id) == "verified"


# ===========================================================================
# 3. initiate(): creation → ledger
# ===========================================================================


@pytest.mark.django_db(transaction=True)
def test_initiate_reuses_the_active_row():
    """Re-initialisation returns the existing active payment, not a new one.

    Validates: Requirements R12.5
    """
    from apps.documents.models import Payment
    from apps.documents.payment_service import PaymentService

    seed = _seed()
    result = PaymentService().initiate(seed.application.id, seed.profile.id)
    assert result.payment_id == seed.payment.id
    assert Payment.objects.filter(application_id=seed.application.id).count() == 1


@pytest.mark.django_db(transaction=True)
def test_initiate_short_circuits_a_paid_application():
    """An already-paid application never gets another payment row.

    Validates: Requirements R12.5
    """
    from apps.documents.models import Payment
    from apps.documents.payment_service import PaymentService

    seed = _seed(status="successful", app_payment_status="verified")
    result = PaymentService().initiate(seed.application.id, seed.profile.id)
    assert result.payment_id is None
    assert Payment.objects.filter(application_id=seed.application.id).count() == 1


# ===========================================================================
# 4. Governance artefacts — unconditional now, not flag-gated
# ===========================================================================


@pytest.mark.django_db(transaction=True)
def test_successful_payment_always_gets_a_receipt_and_one_audit_row():
    """The receipt and the transition audit are no longer optional.

    Under the deleted flag these existed only when the flag was on: the same
    collection produced a receipt or not depending on an environment variable.

    Validates: Requirements R12.5
    """
    from apps.common.models import AuditLog
    from apps.documents.payment_service import PaymentService

    seed = _seed()
    PaymentService().apply_webhook_event(
        "collection.successful",
        seed.reference,
        {"data": _provider_success(seed.reference)},
    )
    seed.payment.refresh_from_db()

    assert seed.payment.receipt_number, "A successful payment must have a receipt number."
    assert (
        AuditLog.objects.filter(
            entity_type="payment",
            entity_id=seed.payment.id,
            action="payment.transitioned",
        ).count()
        == 1
    )


# ===========================================================================
# 5. WebhookProcessor ingress: one dedup contract
# ===========================================================================


def _log_shape(reference: str, event_type: str) -> list[tuple]:
    """(processed, signature_valid, has_error) per log row, oldest first."""
    from apps.documents.models import WebhookEventLog

    return [
        (row.processed, row.signature_valid, bool(row.processing_error))
        for row in WebhookEventLog.objects.filter(
            reference=reference, event_type=event_type
        ).order_by("created_at", "id")
    ]


@pytest.mark.django_db(transaction=True)
@pytest.mark.parametrize(
    "event_type,signature_valid,expected_status",
    [
        ("collection.successful", True, "successful"),
        ("collection.successful", False, "pending"),
        ("collection.failed", True, "failed"),
        ("collection.settled", True, "pending"),
        ("collection.mystery", True, "pending"),
    ],
    ids=[
        "ingress-success",
        "ingress-bad-signature",
        "ingress-failed",
        "ingress-settled",
        "ingress-unknown",
    ],
)
def test_webhook_processor_ingress_outcomes(event_type, signature_valid, expected_status):
    """Ingress always logs, never mutates on a bad signature, always answers.

    Validates: Requirements R12.5
    """
    from apps.documents.webhook_processor import WebhookProcessor

    seed = _seed()
    payload = {"data": _provider_success(seed.reference)}
    if event_type == "collection.failed":
        payload = {"data": _provider_failed(seed.reference)}

    WebhookProcessor().process(event_type, payload, signature_valid=signature_valid)

    seed.payment.refresh_from_db()
    assert seed.payment.status == expected_status
    rows = _log_shape(seed.reference, event_type)
    assert len(rows) == 1, f"Exactly one log row expected per delivery; got {rows}."
    assert rows[0][1] is signature_valid


@pytest.mark.django_db(transaction=True)
def test_webhook_processor_duplicate_delivery_is_logged_and_skipped():
    """A replayed delivery is recorded as a duplicate and mutates nothing further.

    Validates: Requirements R12.5
    """
    from apps.documents.webhook_processor import WebhookProcessor

    seed = _seed()
    payload = {"data": _provider_success(seed.reference)}
    processor = WebhookProcessor()
    processor.process("collection.successful", payload, signature_valid=True)
    processor.process("collection.successful", payload, signature_valid=True)

    seed.payment.refresh_from_db()
    assert seed.payment.status == "successful"
    rows = _log_shape(seed.reference, "collection.successful")
    assert len(rows) == 2, "Both the processed delivery and its replay must be logged."
    assert rows[1] == (False, True, True), (
        f"The replay must be logged as an unprocessed duplicate; got {rows[1]}."
    )


# ===========================================================================
# 6. Admin override: one canonical ledger shape
# ===========================================================================


@pytest.mark.django_db(transaction=True)
def test_admin_override_without_a_payment_row_records_force_approved():
    """Off-platform money is a ``force_approved`` row, never a fake ``successful``.

    The deleted flag chose between this and a synthetic zero-amount
    ``successful`` row that was indistinguishable in the ledger from a real
    collection. The application projection is ``verified`` either way — which is
    exactly why the ledger has to tell them apart (ADR-002).

    Validates: Requirements R12.4, R12.5
    """
    from apps.accounts.models import Profile
    from apps.applications.models import Application
    from apps.documents.models import Payment
    from apps.documents.payment_service import PaymentService

    now = timezone.now()
    token = uuid.uuid4().hex[:8]
    student = Profile.objects.create(
        id=uuid.uuid4(),
        email=f"override-{token}@example.com",
        first_name="Override",
        last_name="Probe",
        role="student",
        is_active=True,
        created_at=now,
        updated_at=now,
    )
    application = Application.objects.create(
        id=uuid.uuid4(),
        application_number=f"APP-{now:%Y%m%d}-{token.upper()}",
        user=student,
        full_name="Override Probe",
        date_of_birth=now.date().replace(year=2000),
        sex="Female",
        phone="+260977000001",
        email=student.email,
        residence_town="Lusaka",
        nationality="Zambian",
        country="Zambia",
        program="OnePath Program",
        intake="January 2025",
        institution="MIHAS",
        status="submitted",
        payment_status="not_paid",
        version=1,
        created_at=now,
        updated_at=now,
    )
    admin = Profile.objects.create(
        id=uuid.uuid4(),
        email=f"admin-{token}@example.com",
        first_name="Fin",
        last_name="Admin",
        role="admin",
        is_active=True,
        created_at=now,
        updated_at=now,
    )

    PaymentService().force_approve(
        application_id=application.id,
        actor_id=admin.id,
        actor_role="admin",
        reason="Offline bank transfer confirmed by finance",
    )

    application.refresh_from_db()
    row = Payment.objects.get(application_id=application.id)
    assert application.payment_status == "verified"
    assert row.status == "force_approved"


# ===========================================================================
# 7. Drift guard — the duplicate path must not come back
# ===========================================================================


def test_no_payment_flag_selects_between_two_implementations():
    """The three deleted flags are gone from settings, not merely defaulted on.

    A flag left in place "defaulting to the good value" is still a second
    behaviour someone can select in an environment file.

    Validates: Requirements R12.4
    """
    from django.conf import settings

    for flag in (
        "PAYMENT_HARDENING_FORWARD_ONLY",
        "PAYMENT_HARDENING_WEBHOOK_DEDUP_STRICT",
        "PAYMENT_HARDENING_FORCE_APPROVED",
    ):
        assert not hasattr(settings, flag), (
            f"{flag} still exists. Task 8.2 deleted the alternative "
            "implementation it selected, so the flag itself must go — "
            "otherwise an env var can still ask for a path that no longer exists."
        )


def test_the_retired_duplicate_symbols_are_absent_from_the_source_tree():
    """No module re-introduces a second payment mutator or dedup path.

    Validates: Requirements R12.4
    """
    import ast
    import pathlib
    import tokenize

    backend = pathlib.Path(__file__).resolve().parents[2]
    retired = frozenset(
        {
            "_forward_only_enabled",
            "_update_payment_status",
            "PAYMENT_HARDENING_FORWARD_ONLY",
            "PAYMENT_HARDENING_WEBHOOK_DEDUP_STRICT",
            "PAYMENT_HARDENING_FORCE_APPROVED",
            "_process_webhook_event_impl",
            "_ALLOWED_TRANSITIONS",
        }
    )
    offenders: list[str] = []
    for path in sorted((backend / "apps").rglob("*.py")) + sorted(
        (backend / "config").rglob("*.py")
    ):
        if "__pycache__" in path.parts:
            continue
        with tokenize.open(path) as handle:
            try:
                tokens = list(tokenize.generate_tokens(handle.readline))
            except (tokenize.TokenError, SyntaxError):  # pragma: no cover
                continue
        for token in tokens:
            # Identifiers: a real reference to a retired symbol.
            if token.type == tokenize.NAME and token.string in retired:
                offenders.append(
                    f"{path.relative_to(backend)}:{token.start[0]}: {token.string}"
                )
            # String literals equal to a retired name: a settings lookup such as
            # ``getattr(settings, "PAYMENT_HARDENING_FORWARD_ONLY", False)``.
            # Prose that merely explains the deletion is a longer string and is
            # therefore not matched.
            elif token.type == tokenize.STRING:
                try:
                    value = ast.literal_eval(token.string)
                except (ValueError, SyntaxError):  # pragma: no cover
                    continue
                if isinstance(value, str) and value in retired:
                    offenders.append(
                        f"{path.relative_to(backend)}:{token.start[0]}: {value!r}"
                    )
    assert not offenders, (
        "Retired payment-duplication symbols reappeared in application code:\n"
        + "\n".join(offenders)
    )
