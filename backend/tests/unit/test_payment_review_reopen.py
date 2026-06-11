"""Regression: admin "Reopen Review" on a failed/deferred payment.

Production 500 (POST /review/ {payment_status: pending_review}) root cause:
with ``PAYMENT_HARDENING_FORWARD_ONLY=True`` the legacy admin review path
treated ``failed``/``expired`` Payment rows as terminal-immutable and
raised ``ValueError('TERMINAL_PAYMENT_IMMUTABLE')``, which the review view
did not handle — so it surfaced as HTTP 500.

The frontend ("Reopen Review" in ApplicationApprovalActions) offers this
action for rejected/failed and deferred payments. No money was collected
in those states, so reopening to ``pending`` is a safe, reversible
correction. Only ``successful``/``force_approved`` (money received) stay
locked behind CANNOT_REVERSE_SUCCESSFUL_PAYMENT (HTTP 409).

Validates: reopen works under forward-only; money-received stays locked.
"""

from __future__ import annotations

import uuid

import pytest
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.accounts.authentication import JWTUser
from apps.applications.views import ApplicationReviewView


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



@pytest.fixture
def seed(db):
    from apps.accounts.models import Profile
    from apps.applications.models import Application

    now = timezone.now()
    student = Profile.objects.create(
        id=uuid.uuid4(), email=f"s-{uuid.uuid4().hex[:8]}@e.com",
        first_name="S", last_name="T", role="student", is_active=True,
        created_at=now, updated_at=now,
    )
    admin = Profile.objects.create(
        id=uuid.uuid4(), email=f"a-{uuid.uuid4().hex[:8]}@e.com",
        first_name="A", last_name="D", role="admin", is_active=True,
        created_at=now, updated_at=now,
    )
    app = Application.objects.create(
        id=uuid.uuid4(),
        application_number=f"APP-{now:%Y%m%d}-{uuid.uuid4().hex[:8].upper()}",
        user=student, full_name="S T", date_of_birth=now.date().replace(year=2000),
        sex="Female", phone="+260977000000", email=student.email,
        residence_town="Lusaka", nationality="Zambian", country="Zambia",
        program="P", intake="January 2025", institution="MIHAS",
        status="submitted", payment_status="failed", version=1,
        created_at=now, updated_at=now,
    )
    admin_jwt = JWTUser({
        "user_id": str(admin.id), "email": admin.email, "role": "admin",
        "first_name": "A", "last_name": "D",
    })
    return {"student": student, "admin": admin, "app": app, "admin_jwt": admin_jwt}


def _seed_payment(app, student, status):
    from apps.documents.models import Payment
    now = timezone.now()
    return Payment.objects.create(
        application_id=app.id, user_id=student.id, status=status,
        amount=0, currency="ZMW", payment_method="admin_override",
        created_at=now, updated_at=now,
    )


def _reopen(seed):
    factory = APIRequestFactory()
    app = seed["app"]
    request = factory.post(
        f"/api/v1/applications/{app.id}/review/",
        data={"paymentStatus": "pending_review", "notes": "Reopening for review"},
        format="json",
    )
    force_authenticate(request, user=seed["admin_jwt"])
    return ApplicationReviewView.as_view()(request, application_id=app.id)


@pytest.mark.django_db
@override_settings(PAYMENT_HARDENING_FORWARD_ONLY=True)
def test_reopen_failed_payment_to_pending_succeeds(seed):
    """A failed Payment can be reopened to pending — no 500, app updated."""
    _seed_payment(seed["app"], seed["student"], "failed")

    response = _reopen(seed)

    assert response.status_code == 200, (
        f"Reopen should succeed; got {response.status_code}: "
        f"{getattr(response, 'data', None)!r}"
    )
    from apps.applications.models import Application
    from apps.documents.models import Payment
    seed["app"].refresh_from_db()
    assert Application.objects.get(id=seed["app"].id).payment_status == "pending_review"
    latest = Payment.objects.filter(application_id=seed["app"].id).order_by("-created_at").first()
    assert latest.status == "pending"


@pytest.mark.django_db
@override_settings(PAYMENT_HARDENING_FORWARD_ONLY=True)
def test_reopen_deferred_payment_to_pending_succeeds(seed):
    """A deferred Payment can be reopened to pending."""
    _seed_payment(seed["app"], seed["student"], "deferred")

    response = _reopen(seed)

    assert response.status_code == 200
    from apps.documents.models import Payment
    latest = Payment.objects.filter(application_id=seed["app"].id).order_by("-created_at").first()
    assert latest.status == "pending"


@pytest.mark.django_db
@override_settings(PAYMENT_HARDENING_FORWARD_ONLY=True)
def test_reopen_successful_payment_blocked_409(seed):
    """A successful Payment (money received) stays locked → 409, not 500."""
    _seed_payment(seed["app"], seed["student"], "successful")

    response = _reopen(seed)

    assert response.status_code == 409
    body = response.data
    code = (body.get("error") or {}).get("code") if isinstance(body.get("error"), dict) else body.get("code")
    assert code == "CANNOT_REVERSE_SUCCESSFUL_PAYMENT"
    from apps.documents.models import Payment
    latest = Payment.objects.filter(application_id=seed["app"].id).order_by("-created_at").first()
    assert latest.status == "successful"
