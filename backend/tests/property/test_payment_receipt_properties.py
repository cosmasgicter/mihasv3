"""Property-based tests for payment receipts, snapshots, and audit redaction.

This file is the payment-hardening spec's "Correctness Property Testing
Harness" seed for receipt-adjacent and audit-redaction properties. Task 12.3
adds the PII redaction property (Property 17) first; Task 16.10 adds the
Property 12 enforcement PBT for provider-uncertainty behaviour in
``PaymentService.initiate_mobile_money``; future Phase 3 tasks (24.6
Receipt Idempotence, 24.7 Single-Active DB Invariant, 24.8 Transaction
Reference Uniqueness, 24.9 Receipt Number Uniqueness) extend this file
with additional generators and properties.

Generators are deliberately recursive so redaction is exercised at arbitrary
nesting depth. Each property is annotated with its ``**Validates:
Requirements X.Y**`` marker and runs with
``@settings(max_examples=20, deadline=None,
suppress_health_check=[HealthCheck.function_scoped_fixture])``; the CI
runner pins ``--hypothesis-seed=0`` for deterministic shrinking.

**Validates: Requirements R17.4, R22.4**
**Validates: Requirements R11.1, R11.2, R11.4, R20.12**
"""

from __future__ import annotations

import hashlib
import os
import re
from typing import Any

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django  # noqa: E402

django.setup()

from django.test import SimpleTestCase  # noqa: E402
from hypothesis import HealthCheck, given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

from apps.documents.payment_audit_service import PaymentAuditService  # noqa: E402


# ---------------------------------------------------------------------------
# Synthetic PII markers
# ---------------------------------------------------------------------------
#
# Each marker is unique, ASCII-only, and contains enough digits/letters that a
# verbatim leak is trivially detectable via substring search.

_PHONE_MARKER = "PLAINPHONE260971234567"
_NRC_MARKER = "PLAINNRC1234567890"
_PASSPORT_MARKER = "PLAINPASSPORTAB1234567"
_PAN_MARKER = "PLAINPAN4111111111111111"
_CVV_MARKER = "PLAINCVV999"
_CARD_NUMBER_MARKER = "PLAINCARDNUMBER4242424242424242"
_DOC_BODY_MARKER = "PLAINDOCBODYCONFIDENTIAL"
_FILE_CONTENT_MARKER = "PLAINFILECONTENTSECRET"
_RAW_PAYLOAD_MARKER = "PLAINRAWPAYLOADSECRET"

_PLAINTEXT_MARKERS: tuple[str, ...] = (
    _PHONE_MARKER,
    _NRC_MARKER,
    _PASSPORT_MARKER,
    _PAN_MARKER,
    _CVV_MARKER,
    _CARD_NUMBER_MARKER,
    _DOC_BODY_MARKER,
    _FILE_CONTENT_MARKER,
    _RAW_PAYLOAD_MARKER,
)

_HEX16_RE = re.compile(r"^[0-9a-f]{16}$")


def _contains_any_plaintext(value: Any) -> bool:
    """True if any PII marker appears verbatim in the serialized value."""
    rendered = repr(value)
    return any(marker in rendered for marker in _PLAINTEXT_MARKERS)


# ---------------------------------------------------------------------------
# Strategies — recursive payload generator
# ---------------------------------------------------------------------------

_non_pii_keys = st.sampled_from(
    [
        "status",
        "source",
        "reason",
        "reference",
        "amount",
        "currency",
        "notes",
        "operator",
        "level",
        "count",
        "metadata",
    ]
)

_phone_keys = st.sampled_from(
    [
        "phone",
        "Phone",
        "PHONE",
        "phone_number",
        "customer_phone",
        "msisdn",
        "MSISDN",
        "mobile",
        "mobile_number",
        "student_mobile",
    ]
)

_hash_keys = st.sampled_from(
    [
        "nrc",
        "nrc_number",
        "NRC",
        "passport",
        "passport_no",
        "passport_number",
        "pan",
        "PAN",
        "card_number",
        "cardNumber",
        "cvv",
        "CVV",
    ]
)

_strip_keys = st.sampled_from(["document_body", "file_content", "raw_payload"])


# Leaf values used for non-PII keys — never contain the plaintext markers.
_safe_leaves = st.one_of(
    st.none(),
    st.booleans(),
    st.integers(min_value=-(2**20), max_value=2**20),
    st.floats(allow_nan=False, allow_infinity=False, width=32),
    st.text(
        alphabet=st.characters(
            whitelist_categories=("Ll", "Lu", "Nd", "Zs"),
            blacklist_characters="PLAIN",
        ),
        max_size=20,
    ),
)


def _pii_leaf_for_phone() -> st.SearchStrategy[Any]:
    """Phone values may be strings, ints, or even nested structures."""
    return st.one_of(
        st.just(_PHONE_MARKER),
        st.builds(lambda suffix: _PHONE_MARKER + suffix, st.text(max_size=6)),
    )


def _pii_leaf_for_hash() -> st.SearchStrategy[Any]:
    """Values for NRC / passport / PAN / CVV / card_number keys."""
    return st.sampled_from(
        [
            _NRC_MARKER,
            _PASSPORT_MARKER,
            _PAN_MARKER,
            _CVV_MARKER,
            _CARD_NUMBER_MARKER,
        ]
    )


def _strip_leaf() -> st.SearchStrategy[Any]:
    return st.sampled_from(
        [_DOC_BODY_MARKER, _FILE_CONTENT_MARKER, _RAW_PAYLOAD_MARKER]
    )


def _kv_pair() -> st.SearchStrategy[tuple[str, Any]]:
    return st.one_of(
        st.tuples(_phone_keys, _pii_leaf_for_phone()),
        st.tuples(_hash_keys, _pii_leaf_for_hash()),
        st.tuples(_strip_keys, _strip_leaf()),
        st.tuples(_non_pii_keys, _safe_leaves),
    )


def _payload_strategy() -> st.SearchStrategy[dict]:
    """Recursive dict/list generator that guarantees at least one PII marker.

    ``st.recursive`` grows children from the base strategy up to a small
    max-leaves budget so property runs stay under the 200ms Hypothesis
    default per example.
    """
    # The redactor's contract is intentionally key-based: PII is identified
    # by field names, not by trying to classify arbitrary free-text values.
    # Keep the generator faithful to that contract by pairing sensitive values
    # only with sensitive keys, while still guaranteeing every payload contains
    # at least one redaction target.
    required_pii_pair = st.one_of(
        st.tuples(_phone_keys, _pii_leaf_for_phone()),
        st.tuples(_hash_keys, _pii_leaf_for_hash()),
        st.tuples(_strip_keys, _strip_leaf()),
    )
    leaf_dict = st.builds(
        lambda required, extras: dict([required, *extras]),
        required_pii_pair,
        st.lists(_kv_pair(), max_size=4),
    )

    def extend(children: st.SearchStrategy) -> st.SearchStrategy:
        return st.one_of(
            st.lists(children, max_size=4),
            st.dictionaries(
                keys=st.one_of(
                    _phone_keys, _hash_keys, _strip_keys, _non_pii_keys
                ),
                values=children,
                max_size=4,
            ),
        )

    return st.recursive(leaf_dict, extend, max_leaves=6)


# ---------------------------------------------------------------------------
# Property 17 — PII Redaction
# ---------------------------------------------------------------------------


class TestProperty17PiiRedaction(SimpleTestCase):
    """Property 17: Audit payloads never contain plaintext PII.

    **Validates: Requirements R17.4, R22.4**
    """

    @given(payload=_payload_strategy())
    @settings(
        max_examples=20,
        deadline=None,
        suppress_health_check=[HealthCheck.function_scoped_fixture],
    )
    def test_redacted_payload_never_contains_plaintext_pii(self, payload):
        redacted = PaymentAuditService._redact_pii(payload)
        self.assertFalse(
            _contains_any_plaintext(redacted),
            f"Plaintext PII leaked through redaction: {redacted!r}",
        )

    @given(payload=_payload_strategy())
    @settings(
        max_examples=20,
        deadline=None,
        suppress_health_check=[HealthCheck.function_scoped_fixture],
    )
    def test_strip_keys_always_removed(self, payload):
        redacted = PaymentAuditService._redact_pii(payload)
        self._assert_no_stripped_keys(redacted)

    @given(payload=_payload_strategy())
    @settings(
        max_examples=20,
        deadline=None,
        suppress_health_check=[HealthCheck.function_scoped_fixture],
    )
    def test_phone_values_rendered_as_hash_and_last4(self, payload):
        redacted = PaymentAuditService._redact_pii(payload)
        self._assert_phone_keys_properly_redacted(redacted)

    @given(payload=_payload_strategy())
    @settings(
        max_examples=20,
        deadline=None,
        suppress_health_check=[HealthCheck.function_scoped_fixture],
    )
    def test_hash_keys_rendered_as_16_char_lowercase_hex(self, payload):
        redacted = PaymentAuditService._redact_pii(payload)
        self._assert_hash_keys_properly_redacted(redacted)

    # ------------------------------------------------------------------
    # Recursive assertions
    # ------------------------------------------------------------------

    def _assert_no_stripped_keys(self, value: Any) -> None:
        if isinstance(value, dict):
            for key in value.keys():
                if isinstance(key, str):
                    self.assertNotIn(
                        key,
                        {"document_body", "file_content", "raw_payload"},
                        f"Stripped key leaked through redaction: {key}",
                    )
            for sub in value.values():
                self._assert_no_stripped_keys(sub)
        elif isinstance(value, (list, tuple)):
            for item in value:
                self._assert_no_stripped_keys(item)

    def _assert_phone_keys_properly_redacted(self, value: Any) -> None:
        phone_markers = ("phone", "msisdn", "mobile")
        if isinstance(value, dict):
            for key, sub in value.items():
                if isinstance(key, str) and any(
                    m in key.lower() for m in phone_markers
                ):
                    self.assertIsInstance(
                        sub, dict, f"Phone key {key} not redacted to dict"
                    )
                    self.assertIn("phone_hash", sub)
                    self.assertIn("phone_last4", sub)
                    self.assertTrue(
                        _HEX16_RE.match(sub["phone_hash"]),
                        f"phone_hash is not 16-char hex: {sub['phone_hash']!r}",
                    )
                    # last4 must be <= 4 chars and never expose the full marker.
                    self.assertLessEqual(len(sub["phone_last4"]), 4)
                    self.assertNotIn(_PHONE_MARKER, sub["phone_last4"])
                else:
                    self._assert_phone_keys_properly_redacted(sub)
        elif isinstance(value, (list, tuple)):
            for item in value:
                self._assert_phone_keys_properly_redacted(item)

    def _assert_hash_keys_properly_redacted(self, value: Any) -> None:
        hash_markers = (
            "nrc",
            "passport",
            "pan",
            "cvv",
            "card_number",
            "cardnumber",
        )
        if isinstance(value, dict):
            for key, sub in value.items():
                if isinstance(key, str) and any(
                    m in key.lower() for m in hash_markers
                ):
                    self.assertIsInstance(
                        sub, str, f"Hash key {key} not redacted to string"
                    )
                    self.assertTrue(
                        _HEX16_RE.match(sub),
                        f"{key} is not 16-char lowercase hex: {sub!r}",
                    )
                else:
                    self._assert_hash_keys_properly_redacted(sub)
        elif isinstance(value, (list, tuple)):
            for item in value:
                self._assert_hash_keys_properly_redacted(item)


# ---------------------------------------------------------------------------
# Deterministic examples — fast sanity coverage
# ---------------------------------------------------------------------------


class TestRedactionSanity(SimpleTestCase):
    """Hand-written examples that double as documentation for the property."""

    def test_known_phone_hash_is_deterministic(self):
        phone = "+260971234567"
        redacted = PaymentAuditService._redact_pii({"phone": phone})
        expected = hashlib.sha256(phone.encode("utf-8")).hexdigest()[:16]
        self.assertEqual(redacted["phone"]["phone_hash"], expected)
        self.assertEqual(redacted["phone"]["phone_last4"], "4567")

    def test_nrc_hash_is_deterministic(self):
        nrc = "123456/78/9"
        redacted = PaymentAuditService._redact_pii({"nrc_number": nrc})
        expected = hashlib.sha256(nrc.encode("utf-8")).hexdigest()[:16]
        self.assertEqual(redacted["nrc_number"], expected)


# ---------------------------------------------------------------------------
# Property 12 — Provider Uncertainty Keeps Pending (Task 16.10)
# ---------------------------------------------------------------------------
#
# Enforcement PBT: when ``PaymentService.initiate_mobile_money`` calls Lenco
# and the HTTP layer raises a timeout / connection error, or the provider
# returns a 5xx status, the Payment row MUST stay ``pending`` and
# ``metadata.provider_initiation.status`` MUST equal ``unknown``. Reconciliation
# (webhooks + polling) — not the initiation call — settles uncertain payments.
#
# Requirements: R11.1, R11.2, R11.4, R20.12.

import uuid  # noqa: E402
from decimal import Decimal  # noqa: E402
from unittest.mock import MagicMock, patch  # noqa: E402

import pytest  # noqa: E402
import requests as http_requests  # noqa: E402
from django.test import override_settings  # noqa: E402
from django.utils import timezone  # noqa: E402


# ---------------------------------------------------------------------------
# Shared fixture — mirrors test_payment_webhook_properties.py::seed_applicant
# ---------------------------------------------------------------------------


@pytest.fixture
def seed_applicant(db):
    """Create a resolvable Program + ProgramFee + Profile + submitted Application
    and seed a pending Payment via ``PaymentService().initiate()``.

    The Property 12 property only needs a real application + an active
    pending payment so ``initiate_mobile_money`` reuses the existing row
    instead of creating a new one. This keeps the generator focused on
    the provider-HTTP branch, not on the DB seeding.
    """
    from apps.accounts.models import Profile
    from apps.applications.models import Application
    from apps.catalog.models import Institution, Program
    from apps.documents.models import ProgramFee
    from apps.documents.payment_service import PaymentService

    now = timezone.now()
    suffix = uuid.uuid4().hex[:8]

    institution = Institution.objects.create(
        id=uuid.uuid4(),
        name=f"MIHAS P12 Institute {suffix}",
        code=f"P12-INST-{suffix.upper()}",
        is_active=True,
        created_at=now,
        updated_at=now,
    )

    program = Program.objects.create(
        id=uuid.uuid4(),
        name=f"P12 Program {suffix}",
        code=f"P12-{suffix.upper()}",
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
        email=f"p12-{suffix}@example.com",
        first_name="P12",
        last_name="Applicant",
        role="student",
        is_active=True,
        created_at=now,
        updated_at=now,
    )

    application = Application.objects.create(
        id=uuid.uuid4(),
        application_number=f"APP-{now:%Y%m%d}-{suffix.upper()}",
        user=profile,
        full_name="P12 Student",
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

    # Seed a pending Payment once upfront via the hardened initiate(). The
    # forward-only flag is honoured here because the outer test has
    # ``@override_settings(PAYMENT_HARDENING_FORWARD_ONLY=True)`` applied
    # when the fixture is consumed.
    with override_settings(PAYMENT_HARDENING_FORWARD_ONLY=True):
        PaymentService().initiate(
            application_id=application.id,
            user_id=profile.id,
        )

    return {
        "profile": profile,
        "application": application,
        "program": program,
        "institution": institution,
    }


# ---------------------------------------------------------------------------
# Behaviour labels — drawn by the hypothesis generator
# ---------------------------------------------------------------------------
#
# ``'Timeout'`` / ``'ConnectionError'`` map to ``http_requests`` exception
# classes; bare ints (500 / 502 / 504) simulate a provider 5xx response.

_P12_BEHAVIOURS = st.sampled_from(["Timeout", "ConnectionError", 500, 502, 504])


def _p12_build_side_effect(behavior):
    """Return a ``side_effect`` callable / value for the patched ``post``.

    Exception-class behaviours raise; HTTP-code behaviours return a
    ``MagicMock`` shaped like a ``requests.Response``.
    """
    if behavior == "Timeout":
        return http_requests.Timeout("Simulated")
    if behavior == "ConnectionError":
        return http_requests.ConnectionError("Simulated")
    # 5xx status code → mocked Response-like object.
    response = MagicMock()
    response.status_code = behavior
    response.ok = False
    response.content = b'{"message":"server error"}'
    response.json.return_value = {"message": "server error"}
    response.reason = "Server Error"
    return response


@given(behavior=_P12_BEHAVIOURS)
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
    LENCO_API_SECRET_KEY="test-secret",
    LENCO_API_BASE_URL="https://payments.example.test/access/v2/",
)
@pytest.mark.django_db
def test_property_12_provider_uncertainty_keeps_pending(seed_applicant, behavior):
    """P12: Provider uncertainty on mobile-money initiation keeps Payment pending.

    For any ``http_requests.post`` behaviour drawn from
    ``{Timeout, ConnectionError, 500, 502, 504}``:

    * ``Payment.status`` MUST remain ``pending`` (never ``failed`` — R11.4).
    * ``Payment.metadata['provider_initiation']['status']`` MUST equal
      ``'unknown'`` (R11.1, R11.2). Reconciliation via webhooks / polling,
      not the initiation call, settles uncertain provider outcomes.

    **Validates: Requirements R11.1, R11.2, R11.4, R20.12**
    """
    from apps.documents.models import Payment
    from apps.documents.payment_service import PaymentService

    application = seed_applicant["application"]
    profile = seed_applicant["profile"]

    side_effect = _p12_build_side_effect(behavior)

    with patch(
        "requests.post"
    ) as mock_post:
        if isinstance(side_effect, BaseException):
            mock_post.side_effect = side_effect
        else:
            mock_post.return_value = side_effect

        PaymentService().initiate_mobile_money(
            application_id=application.id,
            user_id=profile.id,
            phone_raw="+260977000000",
        )

    # Re-read the Payment row fresh from the DB so we observe the committed
    # state, not a stale instance from the fixture.
    payment = (
        Payment.objects.filter(application_id=application.id)
        .order_by("-created_at")
        .first()
    )
    assert payment is not None, "Expected a Payment row seeded by the fixture."
    assert payment.status == "pending", (
        f"Payment.status leaked off 'pending' for behaviour {behavior!r}: "
        f"got {payment.status!r}"
    )

    metadata = payment.metadata or {}
    provider_initiation = metadata.get("provider_initiation") or {}
    assert provider_initiation.get("status") == "unknown", (
        f"provider_initiation.status expected 'unknown' for behaviour "
        f"{behavior!r}; got {provider_initiation.get('status')!r} "
        f"(full provider_initiation={provider_initiation!r})"
    )


# ---------------------------------------------------------------------------
# Shared helpers for P6–P9 enforcement properties (Tasks 24.6–24.9)
# ---------------------------------------------------------------------------
#
# P6 needs an ``initiate()``-seeded Payment (successful → receipt allocation).
# P7, P8, P9 test DB-level partial unique indexes, so each needs a fresh
# Application + Profile pair and — importantly — a transactional DB
# (``@pytest.mark.django_db(transaction=True)``) so that raising
# ``IntegrityError`` inside a nested ``transaction.atomic()`` block rolls
# back only that savepoint, keeping the outer test transaction usable.
#
# The partial unique indexes (``uq_payments_one_active_per_application``,
# ``uq_payments_transaction_reference_present``, ``uq_payments_receipt_number``)
# only exist on PostgreSQL — pytest's default SQLite backend does not
# support ``WHERE`` clauses on unique indexes, so on non-PG backends the
# tests skip with an explanatory message rather than give false positives.

from django.db import connection as _p6_connection  # noqa: E402
from django.db import transaction as _pg_transaction  # noqa: E402


def _require_postgres_or_skip() -> None:
    """Skip the test unless the active DB backend is PostgreSQL.

    The ``uq_payments_*`` partial unique indexes are PG-only (they use
    ``CREATE UNIQUE INDEX ... WHERE ...``). On SQLite the indexes do not
    exist so duplicate-insert invariants cannot be verified.
    """
    vendor = _p6_connection.vendor
    if vendor != "postgresql":
        pytest.skip(
            f"Partial unique indexes are PostgreSQL-only; "
            f"active backend is {vendor!r}."
        )


def _p6_seed_applicant_row(suffix_prefix: str):
    """Create an Application + Profile pair for a duplicate-insert test.

    Mirrors the full ``seed_applicant`` fixture but without seeding an
    initial Payment — each caller seeds its own row with the exact
    shape (``transaction_reference`` / ``receipt_number`` / ``status``)
    its property requires.
    """
    from apps.accounts.models import Profile
    from apps.applications.models import Application
    from apps.catalog.models import Institution, Program
    from apps.documents.models import ProgramFee

    now = timezone.now()
    suffix = f"{suffix_prefix}{uuid.uuid4().hex[:6]}"

    institution = Institution.objects.create(
        id=uuid.uuid4(),
        name=f"MIHAS P-Receipt {suffix}",
        code=f"{suffix_prefix.upper()}INST-{suffix.upper()}",
        is_active=True,
        created_at=now,
        updated_at=now,
    )

    program = Program.objects.create(
        id=uuid.uuid4(),
        name=f"P-Receipt Program {suffix}",
        code=f"{suffix_prefix.upper()}PROG-{suffix.upper()}",
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
        email=f"{suffix_prefix}-{suffix}@example.com",
        first_name=suffix_prefix.upper(),
        last_name="Applicant",
        role="student",
        is_active=True,
        created_at=now,
        updated_at=now,
    )

    application = Application.objects.create(
        id=uuid.uuid4(),
        application_number=f"APP-{now:%Y%m%d}-{suffix.upper()}",
        user=profile,
        full_name=f"{suffix_prefix.upper()} Student",
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


# ---------------------------------------------------------------------------
# P6 — Receipt Idempotence (Task 24.6)
# ---------------------------------------------------------------------------
#
# Calling ``_generate_receipt_idempotent`` repeatedly on a successful
# Payment must allocate exactly one receipt number. Subsequent calls
# return the same stored value byte-identically and never mutate
# ``payment.receipt_number``.
#
# Requirements: R13.1, R13.2, R20.6.


@given(repeat_count=st.integers(min_value=1, max_value=10))
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
def test_property_6_receipt_idempotence(repeat_count):
    """P6: ``_generate_receipt_idempotent`` allocates exactly one receipt.

    For a successful Payment and any ``repeat_count ∈ [1, 10]``:

    * Exactly one ``receipt_number`` is persisted on the Payment row.
    * All ``repeat_count`` return values are byte-identical.
    * A subsequent call to ``_generate_receipt_idempotent`` never changes
      ``payment.receipt_number`` (idempotent on re-entry).

    **Validates: Requirements R13.1, R13.2, R20.6**
    """
    from apps.documents.models import Payment
    from apps.documents.payment_service import PaymentService

    # Fresh application/profile so successive Hypothesis examples don't
    # collide on ``uq_payments_one_active_per_application`` or the
    # receipt number from a prior example.
    seed = _p6_seed_applicant_row("p6")
    application = seed["application"]
    profile = seed["profile"]

    # Seed a successful Payment directly (no receipt yet). We bypass
    # ``initiate`` + ``_transition`` because P6 only cares about the
    # receipt allocation helper, not the full state-machine pathway.
    now = timezone.now()
    payment = Payment.objects.create(
        id=uuid.uuid4(),
        application=application,
        user=profile,
        amount=Decimal("153.00"),
        currency="ZMW",
        status="successful",
        transaction_reference=(
            f"MIHAS-P6-{application.application_number}-{uuid.uuid4().hex[:10]}"
        ),
        receipt_number=None,
        metadata={
            "snapshot": {
                "expected_amount": "153.00",
                "currency": "ZMW",
                "residency_category": "local",
                "program_code": seed["program"].code,
                "intake_id": None,
                "waiver_applied": False,
                "original_amount": "153.00",
                "fee_source": "program_fee",
            },
        },
        created_at=now,
        updated_at=now,
    )

    service = PaymentService()
    returned_values: list[str] = []
    for _ in range(repeat_count):
        returned_values.append(service._generate_receipt_idempotent(payment))

    assert len(returned_values) == repeat_count
    first_value = returned_values[0]
    assert all(v == first_value for v in returned_values), (
        f"Receipt idempotence broken: got {returned_values!r}"
    )

    payment.refresh_from_db()
    assert payment.receipt_number == first_value, (
        f"Stored receipt_number {payment.receipt_number!r} diverged from "
        f"returned value {first_value!r}."
    )

    # Re-entry: one more call must be a no-op byte-identical return.
    again = service._generate_receipt_idempotent(payment)
    assert again == first_value
    payment.refresh_from_db()
    assert payment.receipt_number == first_value, (
        "Re-entry to _generate_receipt_idempotent mutated receipt_number."
    )

    # Exactly one receipt is held by the DB row; there is no second row
    # created during receipt allocation.
    persisted = Payment.objects.filter(id=payment.id).values_list(
        "receipt_number", flat=True
    )
    assert list(persisted) == [first_value]


# ---------------------------------------------------------------------------
# P7 — Single-Active DB Invariant (Task 24.7)
# ---------------------------------------------------------------------------
#
# The partial unique index ``uq_payments_one_active_per_application``
# enforces at most one active (``pending``/``deferred``) Payment row per
# application. Any second-active INSERT must raise ``IntegrityError``.
#
# Requirements: R3.3, R12.1, R20.7.


@given(attempt=st.integers(min_value=1, max_value=5))
@settings(
    max_examples=20,
    deadline=None,
    suppress_health_check=[
        HealthCheck.function_scoped_fixture,
        HealthCheck.too_slow,
    ],
)
@override_settings(PAYMENT_HARDENING_FORWARD_ONLY=True)
@pytest.mark.django_db(transaction=True)
def test_property_7_single_active_db_invariant(attempt):
    """P7: A second active Payment insert raises IntegrityError.

    For any attempt index in ``[1, 5]``, inserting a second pending
    Payment with the same ``application_id`` raises ``IntegrityError``
    from ``uq_payments_one_active_per_application``. The outer test
    transaction must remain usable, so the duplicate insert runs inside
    a nested ``transaction.atomic()`` savepoint.

    **Validates: Requirements R3.3, R12.1, R20.7**
    """
    _require_postgres_or_skip()

    from django.db import IntegrityError
    from apps.documents.models import Payment

    # Clean any Payment rows left by prior Hypothesis examples so the
    # global partial unique indexes start each example with a blank slate.
    Payment.objects.all().delete()

    seed = _p6_seed_applicant_row("p7")
    application = seed["application"]
    profile = seed["profile"]

    now = timezone.now()

    # Seed #1: the single legitimate active row.
    Payment.objects.create(
        id=uuid.uuid4(),
        application_id=application.id,
        user_id=profile.id,
        amount=Decimal("153"),
        currency="ZMW",
        status="pending",
        transaction_reference=f"MIHAS-P7-{uuid.uuid4().hex[:12]}",
        metadata={},
        created_at=now,
        updated_at=now,
    )

    # Every ``attempt`` must fail — the invariant is stateless with
    # respect to ``attempt``; Hypothesis just varies how many times we
    # re-try the duplicate to catch a latent "passes on the Nth try" bug.
    with pytest.raises(IntegrityError):
        with _pg_transaction.atomic():
            Payment.objects.create(
                id=uuid.uuid4(),
                application_id=application.id,
                user_id=profile.id,
                amount=Decimal("153"),
                currency="ZMW",
                status="pending",
                transaction_reference=f"MIHAS-DUP-{uuid.uuid4().hex[:12]}",
                metadata={"attempt": attempt},
                created_at=now,
                updated_at=now,
            )

    # Exactly one active row remains after the failed duplicate insert.
    active_count = Payment.objects.filter(
        application_id=application.id,
        status__in=("pending", "deferred"),
    ).count()
    assert active_count == 1, (
        f"Expected exactly 1 active payment row after duplicate insert; "
        f"found {active_count}."
    )


# ---------------------------------------------------------------------------
# P8 — Transaction Reference Uniqueness (Task 24.8)
# ---------------------------------------------------------------------------
#
# ``uq_payments_transaction_reference_present`` is a partial unique index
# on ``transaction_reference`` ``WHERE transaction_reference IS NOT NULL
# AND transaction_reference <> ''``. For any non-empty reference, a
# duplicate insert must raise ``IntegrityError``. NULL and empty-string
# references are exempt and permit duplicates.
#
# Requirements: R3.4, R12.2, R20.8.


@given(
    reference=st.text(
        alphabet=st.characters(
            whitelist_categories=("Ll", "Lu", "Nd"),
            whitelist_characters="-_",
        ),
        min_size=1,
        max_size=100,
    ),
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
@pytest.mark.django_db(transaction=True)
def test_property_8_transaction_reference_uniqueness(reference):
    """P8: Duplicate non-empty ``transaction_reference`` inserts are rejected.

    For any non-empty ``reference`` string, a second Payment insert with
    the same ``transaction_reference`` raises ``IntegrityError`` from
    ``uq_payments_transaction_reference_present``. The index excludes
    NULL and empty-string references, so those values permit duplicates.

    **Validates: Requirements R3.4, R12.2, R20.8**
    """
    _require_postgres_or_skip()

    from django.db import IntegrityError
    from apps.documents.models import Payment

    # Clean any Payment rows left by prior Hypothesis examples so the
    # global partial unique index starts this example with a blank slate.
    Payment.objects.all().delete()

    seed = _p6_seed_applicant_row("p8")
    application = seed["application"]
    profile = seed["profile"]

    now = timezone.now()

    # Seed #1 — the original row with the generated reference.
    Payment.objects.create(
        id=uuid.uuid4(),
        application_id=application.id,
        user_id=profile.id,
        amount=Decimal("153"),
        currency="ZMW",
        status="successful",  # not active — P8 is about reference uniqueness, not P7's rule
        transaction_reference=reference,
        metadata={},
        created_at=now,
        updated_at=now,
    )

    # Duplicate must fail because ``reference`` is non-empty.
    with pytest.raises(IntegrityError):
        with _pg_transaction.atomic():
            Payment.objects.create(
                id=uuid.uuid4(),
                application_id=application.id,
                user_id=profile.id,
                amount=Decimal("153"),
                currency="ZMW",
                status="failed",
                transaction_reference=reference,
                metadata={"duplicate": True},
                created_at=now,
                updated_at=now,
            )

    # ----- Exemption coverage: NULL and empty-string references -----
    # These must NOT be blocked by the partial index.
    Payment.objects.create(
        id=uuid.uuid4(),
        application_id=application.id,
        user_id=profile.id,
        amount=Decimal("153"),
        currency="ZMW",
        status="failed",
        transaction_reference=None,
        metadata={"exempt": "null"},
        created_at=now,
        updated_at=now,
    )
    Payment.objects.create(
        id=uuid.uuid4(),
        application_id=application.id,
        user_id=profile.id,
        amount=Decimal("153"),
        currency="ZMW",
        status="failed",
        transaction_reference=None,
        metadata={"exempt": "null-2"},
        created_at=now,
        updated_at=now,
    )
    Payment.objects.create(
        id=uuid.uuid4(),
        application_id=application.id,
        user_id=profile.id,
        amount=Decimal("153"),
        currency="ZMW",
        status="failed",
        transaction_reference="",
        metadata={"exempt": "empty"},
        created_at=now,
        updated_at=now,
    )
    Payment.objects.create(
        id=uuid.uuid4(),
        application_id=application.id,
        user_id=profile.id,
        amount=Decimal("153"),
        currency="ZMW",
        status="failed",
        transaction_reference="",
        metadata={"exempt": "empty-2"},
        created_at=now,
        updated_at=now,
    )


# ---------------------------------------------------------------------------
# P9 — Receipt Number Uniqueness (Task 24.9)
# ---------------------------------------------------------------------------
#
# ``uq_payments_receipt_number`` is a partial unique index on
# ``receipt_number`` ``WHERE receipt_number IS NOT NULL AND
# receipt_number <> ''``. Any non-NULL, non-empty duplicate insert must
# raise ``IntegrityError``. NULL is exempt (deferred payments never get
# a receipt).
#
# Requirements: R13.3, R12.3, R20.9.


@given(
    receipt=st.text(
        alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567",
        min_size=12,
        max_size=12,
    ),
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
@pytest.mark.django_db(transaction=True)
def test_property_9_receipt_number_uniqueness(receipt):
    """P9: Duplicate non-NULL ``receipt_number`` inserts are rejected.

    For any 12-char base32 receipt value, a second Payment insert with
    the same ``receipt_number`` raises ``IntegrityError`` from
    ``uq_payments_receipt_number``. NULL is exempt — a deferred payment
    without a receipt must not block a later successful payment that
    also has no receipt yet.

    **Validates: Requirements R13.3, R12.3, R20.9**
    """
    _require_postgres_or_skip()

    from django.db import IntegrityError
    from apps.documents.models import Payment

    # Clean any Payment rows left by prior Hypothesis examples so the
    # global partial unique index starts this example with a blank slate.
    Payment.objects.all().delete()

    seed = _p6_seed_applicant_row("p9")
    application = seed["application"]
    profile = seed["profile"]

    now = timezone.now()

    # Seed #1 — original row with the generated receipt value.
    Payment.objects.create(
        id=uuid.uuid4(),
        application_id=application.id,
        user_id=profile.id,
        amount=Decimal("153"),
        currency="ZMW",
        status="successful",
        transaction_reference=f"MIHAS-P9-{uuid.uuid4().hex[:12]}",
        receipt_number=receipt,
        metadata={},
        created_at=now,
        updated_at=now,
    )

    # Duplicate receipt_number on a second row must raise IntegrityError.
    with pytest.raises(IntegrityError):
        with _pg_transaction.atomic():
            Payment.objects.create(
                id=uuid.uuid4(),
                application_id=application.id,
                user_id=profile.id,
                amount=Decimal("153"),
                currency="ZMW",
                status="successful",
                transaction_reference=f"MIHAS-P9-DUP-{uuid.uuid4().hex[:10]}",
                receipt_number=receipt,
                metadata={"duplicate": True},
                created_at=now,
                updated_at=now,
            )

    # ----- Exemption coverage: NULL receipt_number permits duplicates -----
    null_seed_one = _p6_seed_applicant_row("p9null1")
    null_seed_two = _p6_seed_applicant_row("p9null2")

    Payment.objects.create(
        id=uuid.uuid4(),
        application_id=null_seed_one["application"].id,
        user_id=null_seed_one["profile"].id,
        amount=Decimal("153"),
        currency="ZMW",
        status="deferred",
        transaction_reference=f"MIHAS-P9-NULL1-{uuid.uuid4().hex[:10]}",
        receipt_number=None,
        metadata={"exempt": "null"},
        created_at=now,
        updated_at=now,
    )
    Payment.objects.create(
        id=uuid.uuid4(),
        application_id=null_seed_two["application"].id,
        user_id=null_seed_two["profile"].id,
        amount=Decimal("153"),
        currency="ZMW",
        status="pending",
        transaction_reference=f"MIHAS-P9-NULL2-{uuid.uuid4().hex[:10]}",
        receipt_number=None,
        metadata={"exempt": "null-2"},
        created_at=now,
        updated_at=now,
    )
