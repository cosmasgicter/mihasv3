"""Unit tests — ``RiskFlagsListView`` (Tasks 47.3 + 47.4).

Scope
-----
Pin down two layers of guarantees for
``GET /api/v1/payments/risk-flags/``:

1. **Task 47.3 — permission matrix (R17.5).** Actors with role
   ``student``, ``reviewer``, or ``admin`` must be rejected with
   HTTP 403 + ``INSUFFICIENT_PERMISSIONS``. Unauthenticated requests
   must return HTTP 401. Only ``super_admin`` actors reach the handler
   and receive a 200 carrying the paginated envelope
   ``{success: true, data: {page, pageSize, totalCount, results}}``.

2. **Task 47.4 — filtering + ordering + pagination (R17.5).** With
   three seeded payments and four mixed risk flags, the endpoint must:

   * Filter by ``type`` (return only matching flags).
   * Filter by ``since`` / ``until`` date range (inclusive bounds).
   * Order results by ``recorded_at DESC`` (newest first, NULLS LAST).
   * Paginate with ``page_size=25`` default and surface ``page``,
     ``pageSize``, ``totalCount`` in the envelope.
   * Reject invalid ``type`` with 400 + ``VALIDATION_ERROR``.
   * Reject invalid ``since`` with 400 + ``VALIDATION_ERROR``.

These tests use real model factories (Profile, Application, Payment)
against the test DB because the view reads ``payments.metadata`` via
raw SQL (``jsonb_array_elements``). Authentication mirrors
``test_super_admin_payment_correction.py`` — ``JWTUser`` +
``force_authenticate``.

Validates: Requirements R17.5
"""

from __future__ import annotations

import uuid
from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.accounts.authentication import JWTUser
from apps.documents.risk_views import RiskFlagsListView


# ---------------------------------------------------------------------------
# Shared fixture + helpers
# ---------------------------------------------------------------------------


@pytest.fixture
def seed_risk_flag_payments(db):
    """Seed 4 Profiles + 3 Applications + 3 Payments with mixed risk flags.

    The four risk-flag entries span three types and four distinct
    ``recorded_at`` timestamps so filter + ordering + pagination tests
    can all use the same fixture:

    =================== ===================== ==================
    Payment             Flag type             recorded_at (rel.)
    =================== ===================== ==================
    payment_1 (app 1)   amount_mismatch       T-10d
    payment_1 (app 1)   currency_mismatch     T-5d
    payment_2 (app 2)   amount_mismatch       T-3d
    payment_3 (app 3)   invalid_amount        T-1d
    =================== ===================== ==================

    Totals by type:

    * ``amount_mismatch``     = 2
    * ``currency_mismatch``   = 1
    * ``invalid_amount``      = 1
    * grand total             = 4
    """
    from apps.accounts.models import Profile
    from apps.applications.models import Application
    from apps.documents.models import Payment

    now = timezone.now()

    def _make_profile(role: str) -> Profile:
        return Profile.objects.create(
            id=uuid.uuid4(),
            email=f"{role}-{uuid.uuid4().hex[:8]}@example.com",
            first_name=role.title(),
            last_name="RiskFlagTester",
            role=role,
            is_active=True,
            created_at=now,
            updated_at=now,
        )

    student = _make_profile("student")
    reviewer = _make_profile("reviewer")
    admin = _make_profile("admin")
    super_admin = _make_profile("super_admin")

    def _make_application(suffix: str) -> Application:
        return Application.objects.create(
            id=uuid.uuid4(),
            application_number=(
                f"APP-{now:%Y%m%d}-{suffix}{uuid.uuid4().hex[:6].upper()}"
            ),
            user=student,
            full_name=f"Risk Flag Student {suffix}",
            date_of_birth=now.date().replace(year=2000),
            sex="Female",
            phone="+260977000000",
            email=f"risk-{suffix}-{uuid.uuid4().hex[:6]}@example.com",
            residence_town="Lusaka",
            nationality="Zambian",
            country="Zambia",
            program="Risk Flag Program",
            intake="January 2025",
            institution="MIHAS",
            status="submitted",
            payment_status="pending",
            version=1,
            created_at=now,
            updated_at=now,
        )

    application_1 = _make_application("A")
    application_2 = _make_application("B")
    application_3 = _make_application("C")

    # Risk-flag timestamps — four distinct instants so ORDER BY DESC is
    # unambiguous. Using isoformat() to mirror the shape produced by
    # ``PaymentService._record_payment_risk``.
    t_10d = now - timedelta(days=10)
    t_5d = now - timedelta(days=5)
    t_3d = now - timedelta(days=3)
    t_1d = now - timedelta(days=1)

    def _make_payment(application, *, risk_flags: list[dict], suffix: str):
        return Payment.objects.create(
            id=uuid.uuid4(),
            application=application,
            user=student,
            amount=Decimal("153.00"),
            currency="ZMW",
            status="pending",
            transaction_reference=(
                f"MIHAS-{application.application_number}-"
                f"{suffix}-{int(now.timestamp() * 1000)}"
            ),
            metadata={
                "snapshot": {
                    "expected_amount": "153.00",
                    "currency": "ZMW",
                    "residency_category": "local",
                    "program_code": "RFP",
                    "intake_id": None,
                    "waiver_applied": False,
                    "original_amount": "153.00",
                    "fee_source": "program_fee",
                },
                "risk_flags": risk_flags,
            },
            created_at=now,
            updated_at=now,
        )

    payment_1 = _make_payment(
        application_1,
        suffix="1",
        risk_flags=[
            {
                "type": "amount_mismatch",
                "details": {
                    "expected": "153.00",
                    "received": "150.00",
                    "source": "webhook",
                },
                "recorded_at": t_10d.isoformat(),
            },
            {
                "type": "currency_mismatch",
                "details": {
                    "expected": "ZMW",
                    "received": "USD",
                    "source": "webhook",
                },
                "recorded_at": t_5d.isoformat(),
            },
        ],
    )
    payment_2 = _make_payment(
        application_2,
        suffix="2",
        risk_flags=[
            {
                "type": "amount_mismatch",
                "details": {
                    "expected": "153.00",
                    "received": "140.00",
                    "source": "verify",
                },
                "recorded_at": t_3d.isoformat(),
            },
        ],
    )
    payment_3 = _make_payment(
        application_3,
        suffix="3",
        risk_flags=[
            {
                "type": "invalid_amount",
                "details": {"received": "-5.00", "source": "webhook"},
                "recorded_at": t_1d.isoformat(),
            },
        ],
    )

    def _jwt(profile: Profile, role: str) -> JWTUser:
        return JWTUser({
            "user_id": str(profile.id),
            "email": profile.email,
            "role": role,
            "first_name": profile.first_name,
            "last_name": profile.last_name,
        })

    return {
        "now": now,
        "timestamps": {
            "t_10d": t_10d,
            "t_5d": t_5d,
            "t_3d": t_3d,
            "t_1d": t_1d,
        },
        "student_profile": student,
        "reviewer_profile": reviewer,
        "admin_profile": admin,
        "super_admin_profile": super_admin,
        "student_user": _jwt(student, "student"),
        "reviewer_user": _jwt(reviewer, "reviewer"),
        "admin_user": _jwt(admin, "admin"),
        "super_admin_user": _jwt(super_admin, "super_admin"),
        "payment_1": payment_1,
        "payment_2": payment_2,
        "payment_3": payment_3,
        "application_1": application_1,
        "application_2": application_2,
        "application_3": application_3,
    }


def _get(query: str = "", *, jwt_user=None):
    """Build + dispatch a GET to /api/v1/payments/risk-flags/.

    When ``jwt_user`` is ``None`` the request is sent unauthenticated
    (no ``force_authenticate`` call), which exercises the 401 path on
    the default ``IsAuthenticated`` permission.
    """
    factory = APIRequestFactory()
    path = f"/api/v1/payments/risk-flags/{query}"
    request = factory.get(path)
    if jwt_user is not None:
        force_authenticate(request, user=jwt_user)
    return RiskFlagsListView.as_view()(request)


# ---------------------------------------------------------------------------
# Task 47.3 — permission matrix (R17.5)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_unauthenticated_returns_401(seed_risk_flag_payments):
    """No credentials → 401; no result leak.

    The view's ``permission_classes = [IsAuthenticated, IsSuperAdmin]``
    stack must reject anonymous callers before the handler runs. The
    envelope exception handler forces 401 for ``NotAuthenticated`` so
    the frontend refresh interceptor can differentiate auth failure
    from permission denial. The emitted code is either
    ``NOT_AUTHENTICATED`` (from DRF's ``NotAuthenticated.get_codes()``)
    or the generic ``AUTHENTICATION_REQUIRED`` — both are accepted.

    Validates: Requirements R17.5
    """
    response = _get(jwt_user=None)

    assert response.status_code == 401, (
        f"Unauthenticated risk-flag request must return 401; got "
        f"{response.status_code} / body {getattr(response, 'data', None)!r}."
    )
    body = response.data or {}
    assert body.get("success") is False
    assert body.get("code") in ("NOT_AUTHENTICATED", "AUTHENTICATION_REQUIRED"), (
        f"Expected 401 envelope to carry code NOT_AUTHENTICATED or "
        f"AUTHENTICATION_REQUIRED; got {body.get('code')!r}."
    )
    # The response body must not include any ``results`` payload — no
    # risk-flag data may leak to an unauthenticated caller.
    assert "data" not in body or not (body.get("data") or {}).get("results")


@pytest.mark.django_db
def test_student_cannot_access_risk_flags(seed_risk_flag_payments):
    """A ``student`` actor is rejected with 403 + INSUFFICIENT_PERMISSIONS.

    Validates: Requirements R17.5
    """
    response = _get(jwt_user=seed_risk_flag_payments["student_user"])

    assert response.status_code == 403, (
        f"student role must be rejected with 403; got "
        f"{response.status_code} / body {getattr(response, 'data', None)!r}."
    )
    body = response.data or {}
    assert body.get("success") is False
    assert body.get("code") == "INSUFFICIENT_PERMISSIONS"
    assert "data" not in body or not (body.get("data") or {}).get("results")


@pytest.mark.django_db
def test_reviewer_cannot_access_risk_flags(seed_risk_flag_payments):
    """A ``reviewer`` actor is rejected with 403 + INSUFFICIENT_PERMISSIONS.

    Validates: Requirements R17.5
    """
    response = _get(jwt_user=seed_risk_flag_payments["reviewer_user"])

    assert response.status_code == 403
    body = response.data or {}
    assert body.get("success") is False
    assert body.get("code") == "INSUFFICIENT_PERMISSIONS"


@pytest.mark.django_db
def test_admin_cannot_access_risk_flags(seed_risk_flag_payments):
    """An ``admin`` actor is rejected with 403 + INSUFFICIENT_PERMISSIONS.

    Admins cannot see the risk-flag register — it's reserved for
    ``super_admin`` only (R17.5). The ``IsSuperAdmin`` class enforces
    role equality, not hierarchy inclusion.

    Validates: Requirements R17.5
    """
    response = _get(jwt_user=seed_risk_flag_payments["admin_user"])

    assert response.status_code == 403
    body = response.data or {}
    assert body.get("success") is False
    assert body.get("code") == "INSUFFICIENT_PERMISSIONS"


@pytest.mark.django_db
def test_super_admin_can_access_risk_flags(seed_risk_flag_payments):
    """A ``super_admin`` actor receives HTTP 200 + paginated envelope.

    Envelope shape:

    * ``success`` → ``True``
    * ``data.page`` → ``1`` (default)
    * ``data.pageSize`` → ``25`` (default)
    * ``data.totalCount`` → ``4`` (seeded risk-flag count)
    * ``data.results`` → list of ``4`` rows, each carrying
      ``payment_id``, ``application_id``, ``type``, ``details``,
      ``recorded_at``.

    Validates: Requirements R17.5
    """
    response = _get(jwt_user=seed_risk_flag_payments["super_admin_user"])

    assert response.status_code == 200, (
        f"super_admin must receive 200; got {response.status_code} / "
        f"body {getattr(response, 'data', None)!r}."
    )
    body = response.data or {}
    assert body.get("success") is True

    data = body.get("data") or {}
    # Envelope pagination keys (platform convention).
    assert data.get("page") == 1
    assert data.get("pageSize") == 25
    assert data.get("totalCount") == 4

    results = data.get("results")
    assert isinstance(results, list)
    assert len(results) == 4

    # Each result row carries the five documented fields.
    required_fields = {
        "payment_id",
        "application_id",
        "type",
        "details",
        "recorded_at",
    }
    for row in results:
        missing = required_fields - set(row.keys())
        assert not missing, (
            f"Risk-flag row is missing required fields {missing!r}; "
            f"got row {row!r}."
        )


# ---------------------------------------------------------------------------
# Task 47.4 — filtering + ordering + pagination (R17.5)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_filter_by_type_returns_only_matching_rows(seed_risk_flag_payments):
    """``?type=amount_mismatch`` returns only the two amount_mismatch flags.

    Both rows must carry ``type == 'amount_mismatch'`` and be ordered
    ``recorded_at DESC`` (newest first): the T-3d flag precedes the
    T-10d flag.

    Validates: Requirements R17.5
    """
    seed = seed_risk_flag_payments
    response = _get("?type=amount_mismatch", jwt_user=seed["super_admin_user"])

    assert response.status_code == 200, (
        f"Expected 200; got {response.status_code} / "
        f"body {getattr(response, 'data', None)!r}."
    )
    data = (response.data or {}).get("data") or {}
    assert data.get("totalCount") == 2
    assert data.get("page") == 1
    assert data.get("pageSize") == 25

    results = data.get("results") or []
    assert len(results) == 2

    # All returned flags have the filtered type.
    assert all(row["type"] == "amount_mismatch" for row in results), (
        f"Type filter must exclude other flag types; got rows {results!r}."
    )

    # DESC ordering: newest first (T-3d > T-10d).
    timestamps = [row["recorded_at"] for row in results]
    assert timestamps == sorted(timestamps, reverse=True), (
        f"Results must be ordered recorded_at DESC; got {timestamps!r}."
    )


@pytest.mark.django_db
def test_filter_by_date_range_returns_rows_within_bounds(
    seed_risk_flag_payments,
):
    """``?since=...&until=...`` returns only flags inside the inclusive range.

    With ``since = T-8d`` and ``until = T-2d`` the range brackets the
    T-5d ``currency_mismatch`` flag and the T-3d ``amount_mismatch``
    flag. The T-10d (before ``since``) and T-1d (after ``until``) flags
    are excluded.

    Validates: Requirements R17.5
    """
    seed = seed_risk_flag_payments
    now = seed["now"]
    since = (now - timedelta(days=8)).isoformat()
    until = (now - timedelta(days=2)).isoformat()

    response = _get(
        f"?since={since}&until={until}",
        jwt_user=seed["super_admin_user"],
    )

    assert response.status_code == 200, (
        f"Expected 200; got {response.status_code} / "
        f"body {getattr(response, 'data', None)!r}."
    )
    data = (response.data or {}).get("data") or {}
    assert data.get("totalCount") == 2, (
        f"Date-range filter must include exactly 2 flags (T-5d and T-3d); "
        f"got totalCount={data.get('totalCount')!r}."
    )

    results = data.get("results") or []
    assert len(results) == 2

    # Newest-first ordering: T-3d (amount_mismatch) before T-5d
    # (currency_mismatch).
    assert [row["type"] for row in results] == [
        "amount_mismatch",
        "currency_mismatch",
    ], (
        f"Expected T-3d amount_mismatch before T-5d currency_mismatch; "
        f"got types {[row['type'] for row in results]!r}."
    )

    # Every returned timestamp must fall inside the inclusive range.
    for row in results:
        assert since <= row["recorded_at"] <= until, (
            f"Row {row!r} has recorded_at outside [{since}, {until}]."
        )


@pytest.mark.django_db
def test_results_ordered_by_recorded_at_desc(seed_risk_flag_payments):
    """Unfiltered results are ordered by ``recorded_at DESC`` (NULLS LAST).

    All four seeded flags must appear newest-first: T-1d, T-3d, T-5d,
    T-10d.

    Validates: Requirements R17.5
    """
    seed = seed_risk_flag_payments
    response = _get(jwt_user=seed["super_admin_user"])

    assert response.status_code == 200
    data = (response.data or {}).get("data") or {}
    assert data.get("totalCount") == 4

    results = data.get("results") or []
    assert len(results) == 4

    timestamps = [row["recorded_at"] for row in results]
    assert timestamps == sorted(timestamps, reverse=True), (
        f"Unfiltered results must be ordered recorded_at DESC; "
        f"got {timestamps!r}."
    )

    # The first row is the T-1d invalid_amount flag and the last is the
    # T-10d amount_mismatch flag.
    assert results[0]["type"] == "invalid_amount"
    assert results[-1]["type"] == "amount_mismatch"


@pytest.mark.django_db
def test_combined_type_and_date_filter(seed_risk_flag_payments):
    """Combining ``type`` + date range narrows the result set correctly.

    ``?type=amount_mismatch&since=T-8d&until=T-2d`` must return only the
    T-3d amount_mismatch flag (the T-10d amount_mismatch is outside
    ``since`` and the T-5d currency_mismatch is excluded by type).

    Validates: Requirements R17.5
    """
    seed = seed_risk_flag_payments
    now = seed["now"]
    since = (now - timedelta(days=8)).isoformat()
    until = (now - timedelta(days=2)).isoformat()

    response = _get(
        f"?type=amount_mismatch&since={since}&until={until}",
        jwt_user=seed["super_admin_user"],
    )

    assert response.status_code == 200
    data = (response.data or {}).get("data") or {}
    assert data.get("totalCount") == 1

    results = data.get("results") or []
    assert len(results) == 1
    assert results[0]["type"] == "amount_mismatch"
    assert since <= results[0]["recorded_at"] <= until


@pytest.mark.django_db
def test_invalid_type_returns_400_validation_error(seed_risk_flag_payments):
    """``?type=nonsense`` returns 400 + VALIDATION_ERROR.

    The view's allow-list (``ALLOWED_RISK_TYPES``) rejects any type not
    emitted by ``PaymentService._record_payment_risk``.

    Validates: Requirements R17.5
    """
    seed = seed_risk_flag_payments
    response = _get("?type=nonsense", jwt_user=seed["super_admin_user"])

    assert response.status_code == 400
    body = response.data or {}
    assert body.get("success") is False
    error = body.get("error") or {}
    code = error.get("code") if isinstance(error, dict) else body.get("code")
    assert code == "VALIDATION_ERROR", (
        f"Invalid type must map to VALIDATION_ERROR; got code={code!r} "
        f"with body {body!r}."
    )


@pytest.mark.django_db
def test_invalid_since_returns_400_validation_error(seed_risk_flag_payments):
    """``?since=not-a-date`` returns 400 + VALIDATION_ERROR.

    Malformed ISO8601 inputs are rejected up-front so they never reach
    the raw-SQL cast.

    Validates: Requirements R17.5
    """
    seed = seed_risk_flag_payments
    response = _get("?since=not-a-date", jwt_user=seed["super_admin_user"])

    assert response.status_code == 400
    body = response.data or {}
    assert body.get("success") is False
    error = body.get("error") or {}
    code = error.get("code") if isinstance(error, dict) else body.get("code")
    assert code == "VALIDATION_ERROR"


# ---------------------------------------------------------------------------
# Task 47.5 — details PII redaction (R17.4)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_risk_flag_details_pii_is_redacted_in_response(db):
    """Validates: Requirements R17.4.

    Seed a risk flag whose ``details`` carries PII markers (phone in a
    raw payload, NRC number, passport number, and a synthetic phone
    key). Hit the endpoint as a ``super_admin`` and assert the
    serialised response contains only the redacted forms —
    ``phone_hash`` / ``phone_last4`` for phone-keyed values, and a
    16-char lowercase hex SHA-256 prefix for NRC / passport — with no
    plaintext PII substrings anywhere in the envelope body.

    The ``raw_payload`` key is stripped entirely by
    :meth:`PaymentAuditService._redact_pii`.
    """
    from apps.accounts.models import Profile
    from apps.applications.models import Application
    from apps.documents.models import Payment

    now = timezone.now()
    phone = "+260977654321"
    nrc = "123456/78/1"
    passport = "ZN1234567"

    super_admin = Profile.objects.create(
        id=uuid.uuid4(),
        email=f"pii-sa-{uuid.uuid4().hex[:8]}@example.com",
        first_name="PII",
        last_name="SuperAdmin",
        role="super_admin",
        is_active=True,
        created_at=now,
        updated_at=now,
    )
    student = Profile.objects.create(
        id=uuid.uuid4(),
        email=f"pii-student-{uuid.uuid4().hex[:8]}@example.com",
        first_name="PII",
        last_name="Student",
        role="student",
        is_active=True,
        created_at=now,
        updated_at=now,
    )
    application = Application.objects.create(
        id=uuid.uuid4(),
        application_number=f"APP-{now:%Y%m%d}-{uuid.uuid4().hex[:8].upper()}",
        user=student,
        full_name="PII Student",
        date_of_birth=now.date().replace(year=2000),
        sex="Female",
        phone=phone,
        email=student.email,
        residence_town="Lusaka",
        nationality="Zambian",
        country="Zambia",
        program="PII Program",
        intake="January 2025",
        institution="MIHAS",
        status="submitted",
        payment_status="pending",
        version=1,
        created_at=now,
        updated_at=now,
    )
    Payment.objects.create(
        id=uuid.uuid4(),
        application=application,
        user=student,
        amount=Decimal("153.00"),
        currency="ZMW",
        status="pending",
        transaction_reference=f"MIHAS-PII-{uuid.uuid4().hex[:12]}",
        metadata={
            "snapshot": {
                "expected_amount": "153.00",
                "currency": "ZMW",
                "residency_category": "local",
                "program_code": "PII",
                "intake_id": None,
                "waiver_applied": False,
                "original_amount": "153.00",
                "fee_source": "program_fee",
            },
            "risk_flags": [
                {
                    "type": "amount_mismatch",
                    "details": {
                        "expected": "153.00",
                        "received": "150.00",
                        "source": "webhook",
                        "phone": phone,
                        "mobile_number": phone,
                        "nrc_number": nrc,
                        "passport_number": passport,
                        "raw_payload": {
                            "operator_phone": phone,
                            "nrc": nrc,
                        },
                    },
                    "recorded_at": now.isoformat(),
                }
            ],
        },
        created_at=now,
        updated_at=now,
    )

    jwt_user = JWTUser({
        "user_id": str(super_admin.id),
        "email": super_admin.email,
        "role": "super_admin",
        "first_name": super_admin.first_name,
        "last_name": super_admin.last_name,
    })

    response = _get(jwt_user=jwt_user)
    assert response.status_code == 200, (
        f"Expected 200; got {response.status_code} / "
        f"body {getattr(response, 'data', None)!r}."
    )

    data = (response.data or {}).get("data") or {}
    results = data.get("results") or []
    # Find the row we just seeded — filtering by phone marker substring
    # would be circular, so we pick the one carrying the
    # ``amount_mismatch`` type (seeded once in this test-case isolation).
    matching = [r for r in results if r["type"] == "amount_mismatch"]
    assert len(matching) >= 1, (
        f"Expected at least one amount_mismatch row; got results={results!r}."
    )
    row = matching[0]
    details = row.get("details") or {}

    # --- Redaction shape ------------------------------------------------
    # Phone / mobile markers must return the {phone_hash, phone_last4}
    # dict, NOT the plaintext value.
    for key in ("phone", "mobile_number"):
        assert key in details, (
            f"Expected phone-marker key {key!r} to be present in "
            f"redacted details; got {details!r}."
        )
        redacted_phone = details[key]
        assert isinstance(redacted_phone, dict), (
            f"Expected {key!r} to be redacted to a dict; got "
            f"{redacted_phone!r}."
        )
        assert redacted_phone.get("phone_last4") == phone[-4:]
        assert isinstance(redacted_phone.get("phone_hash"), str)
        assert len(redacted_phone["phone_hash"]) == 64  # sha256 hex digest

    # NRC / passport markers must be hashed to a 16-char lowercase hex
    # SHA-256 prefix (the _HASH_KEY_MARKERS rule in PaymentAuditService).
    for key in ("nrc_number", "passport_number"):
        redacted_id = details.get(key)
        assert isinstance(redacted_id, str), (
            f"Expected {key!r} to be redacted to a hex-string prefix; "
            f"got {redacted_id!r}."
        )
        assert len(redacted_id) == 16
        # Lowercase hex digits only — no plaintext slashes/alpha leaked.
        assert all(c in "0123456789abcdef" for c in redacted_id), (
            f"Redacted {key!r} must be lowercase hex; got {redacted_id!r}."
        )

    # ``raw_payload`` is stripped entirely.
    assert "raw_payload" not in details, (
        f"``raw_payload`` must be stripped from serialised details; "
        f"got {details!r}."
    )

    # --- Plaintext leak guard -------------------------------------------
    # Serialise the ENTIRE response envelope and assert none of the
    # plaintext PII strings survive anywhere — defence in depth against
    # a future key rename that slips through the shape checks above.
    import json as _json
    body_text = _json.dumps(response.data, default=str)
    for leak in (phone, nrc, passport, phone[-9:]):
        assert leak not in body_text, (
            f"Plaintext PII {leak!r} leaked into the response envelope; "
            f"body={body_text!r}."
        )
