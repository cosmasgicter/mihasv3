"""Unit test — legacy synthetic review path preserved under flag off.

Scope (Phase 5 — payment-hardening Task 45.5)
---------------------------------------------
When ``PAYMENT_HARDENING_FORCE_APPROVED=False`` (the default during the
Phase 5 rollout) the ``ApplicationReviewView`` admin-verification branch
must continue to exercise ``PaymentService.review_application_payment``
and produce the legacy synthetic zero-amount ``successful`` Payment row
for applications that do not yet have a Payment record.

This is the behavioural bit-parity guarantee from R22.6: flipping the
Phase 5 flag off must restore the pre-hardening shape exactly — same
HTTP status, same envelope, same Payment row shape (zero amount, ZMW,
``payment_method='admin_override'``, status ``successful`` rather than
``force_approved``), and ``Application.payment_status='verified'``. The
complementary positive-case assertions for the hardened path live in
``test_application_review_force_approved.py``.

Validates: Requirements R22.6
"""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.accounts.authentication import JWTUser
from apps.applications.admin_review_views import ApplicationReviewView


@pytest.fixture(autouse=True)
def _passthrough_access_scope_autouse():
    """Neutralise multi-tenant application scoping for these tests.

    The admin review / document / export paths now route through
    ``AccessScopeService().filter_applications`` (multi-tenant Beanola). These
    tests predate that scoping and assert review/notification/export behaviour
    for an admin actor, so the scope service returns the queryset unchanged
    (document_views imports it at module level; other call sites import it
    lazily from apps.catalog.services).
    """
    from unittest.mock import patch as _patch
    targets = []
    try:
        import apps.applications.document_views  # noqa: F401
        targets.append("apps.applications.document_views.AccessScopeService")
    except Exception:
        pass
    targets.append("apps.catalog.services.AccessScopeService")
    mocks = []
    import contextlib
    with contextlib.ExitStack() as stack:
        for t in targets:
            m = stack.enter_context(_patch(t))
            m.return_value.filter_applications.side_effect = lambda qs, _user: qs
            m.return_value.filters_for_user.return_value = __import__(
                "apps.catalog.services", fromlist=["ScopeFilters"]
            ).ScopeFilters(True, set(), set(), set())
        yield



# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def seed_admin_and_application(db):
    """Seed a student Profile + submitted Application + admin Profile.

    Matches the fixture in ``test_application_review_force_approved.py``
    so the two tests exercise identical starting conditions and differ
    only in the Phase 5 flag value.
    """
    from apps.accounts.models import Profile
    from apps.applications.models import Application

    now = timezone.now()

    profile = Profile.objects.create(
        id=uuid.uuid4(),
        email=f"legacy-student-{uuid.uuid4().hex[:8]}@example.com",
        first_name="Legacy",
        last_name="Student",
        role="student",
        is_active=True,
        created_at=now,
        updated_at=now,
    )

    admin = Profile.objects.create(
        id=uuid.uuid4(),
        email=f"legacy-admin-{uuid.uuid4().hex[:8]}@example.com",
        first_name="Legacy",
        last_name="Admin",
        role="admin",
        is_active=True,
        created_at=now,
        updated_at=now,
    )

    application = Application.objects.create(
        id=uuid.uuid4(),
        application_number=f"APP-{now:%Y%m%d}-{uuid.uuid4().hex[:8].upper()}",
        user=profile,
        full_name="Legacy Student",
        date_of_birth=now.date().replace(year=2000),
        sex="Female",
        phone="+260977000000",
        email=profile.email,
        residence_town="Lusaka",
        nationality="Zambian",
        country="Zambia",
        program="Legacy Review Program",
        intake="January 2025",
        institution="MIHAS",
        status="submitted",
        payment_status="pending_review",
        version=1,
        created_at=now,
        updated_at=now,
    )

    admin_jwt = JWTUser({
        "user_id": str(admin.id),
        "email": admin.email,
        "role": "admin",
        "first_name": admin.first_name,
        "last_name": admin.last_name,
    })

    return {
        "profile": profile,
        "application": application,
        "admin_profile": admin,
        "admin_jwt_user": admin_jwt,
    }


def _post_review(seed, payload):
    """Build + dispatch a POST to /api/v1/applications/{id}/review/."""
    factory = APIRequestFactory()
    app = seed["application"]
    request = factory.post(
        f"/api/v1/applications/{app.id}/review/",
        data=payload,
        format="json",
    )
    force_authenticate(request, user=seed["admin_jwt_user"])
    view = ApplicationReviewView.as_view()
    return view(request, application_id=app.id)


# ---------------------------------------------------------------------------
# Task 45.5 — legacy path behavioural bit-parity
# ---------------------------------------------------------------------------


@pytest.mark.django_db
@override_settings(PAYMENT_HARDENING_FORCE_APPROVED=False)
def test_legacy_synthetic_successful_payment_preserved(
    seed_admin_and_application,
):
    """Flag off → legacy synthetic zero-amount ``successful`` Payment.

    The pre-hardening admin-verification path creates a Payment row with
    ``amount=0``, ``currency='ZMW'``, ``payment_method='admin_override'``,
    ``status='successful'``, and stamps
    ``Application.payment_status='verified'`` plus an audit record in
    the legacy ``metadata.admin_review`` slot. Those fields form the
    behavioural contract other surfaces depend on (student dashboard
    normalization, admin status queue) and must stay intact while
    ``PAYMENT_HARDENING_FORCE_APPROVED`` remains off.

    Validates: Requirements R22.6
    """
    from apps.documents.models import Payment
    from apps.applications.models import Application

    seed = seed_admin_and_application
    app = seed["application"]
    admin = seed["admin_profile"]

    # Baseline: no Payment row yet.
    assert Payment.objects.filter(application_id=app.id).count() == 0

    notes = "Offline bank deposit confirmed"  # >= 10 chars; legacy path
    # tolerates any notes length — the override-reason floor is only
    # enforced by the hardened path.
    response = _post_review(
        seed,
        payload={"paymentStatus": "verified", "notes": notes},
    )

    # (a) Envelope — 200 + success=true, same as before the hardening.
    assert response.status_code == 200, (
        f"Expected 200 from legacy review path; got {response.status_code}. "
        f"Body: {getattr(response, 'data', None)!r}"
    )
    body = response.data
    assert body.get("success") is True
    data = body.get("data") or {}
    assert data.get("payment_status") == "verified", (
        f"Legacy envelope must echo back payment_status='verified'; "
        f"got {data.get('payment_status')!r}."
    )
    assert data.get("application_id") == str(app.id)

    # (b) Exactly one Payment row — the legacy synthetic insert.
    payments = list(Payment.objects.filter(application_id=app.id))
    assert len(payments) == 1, (
        f"Expected exactly one synthetic Payment row on the legacy "
        f"path; found {len(payments)}."
    )
    payment = payments[0]

    # (c) Legacy shape — zero amount, ZMW, admin_override method,
    # ``successful`` status (NOT ``force_approved`` — that is the
    # hardened path only).
    assert payment.status == "successful", (
        f"Expected legacy synthetic row to use status='successful'; "
        f"got {payment.status!r}. A status of 'force_approved' would "
        f"indicate the Phase 5 hardened path fired despite "
        f"PAYMENT_HARDENING_FORCE_APPROVED=False."
    )
    assert payment.amount == Decimal("0"), (
        f"Expected synthetic amount=0; got {payment.amount!r}."
    )
    assert payment.currency == "ZMW"
    assert payment.payment_method == "admin_override"
    assert payment.verified_by_id == admin.id, (
        f"Expected verified_by to point at the reviewing admin; "
        f"got {payment.verified_by_id!s}."
    )
    assert payment.verified_at is not None

    # (d) Legacy metadata slot — ``admin_review.synthetic=True`` is the
    # marker the legacy path writes. The hardened path uses the
    # top-level ``override`` flag instead, so its absence here is an
    # additional guarantee that we are on the legacy branch.
    meta = payment.metadata or {}
    legacy_review = meta.get("admin_review") or {}
    assert legacy_review.get("synthetic") is True, (
        f"Expected metadata.admin_review.synthetic=True on the legacy "
        f"synthetic Payment row; got admin_review={legacy_review!r}."
    )
    assert legacy_review.get("reviewed_by") == str(admin.id)
    assert legacy_review.get("status") == "verified"
    assert "override" not in meta, (
        "Legacy synthetic rows must not stamp metadata.override — that "
        "is the hardened-path marker."
    )

    # (e) Application summary row — payment_status written through to
    # the Application row so downstream reads see a consistent verified
    # state.
    app.refresh_from_db()
    assert app.payment_status == "verified", (
        f"Expected Application.payment_status='verified' after legacy "
        f"review; got {app.payment_status!r}."
    )
