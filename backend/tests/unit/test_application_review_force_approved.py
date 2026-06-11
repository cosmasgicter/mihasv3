"""Unit tests — admin review under ``PAYMENT_HARDENING_FORCE_APPROVED``.

Scope (Phase 5 — payment-hardening Tasks 45.3 + 45.4)
----------------------------------------------------
When ``PAYMENT_HARDENING_FORCE_APPROVED=True`` the ``ApplicationReviewView``
admin-verification branch must route applications with no prior Payment
row through ``PaymentService.force_approve(...)`` rather than the legacy
synthetic zero-amount ``successful`` insert path (R2.3, R22.6).

These tests pin two things:

1. Task 45.3 — happy path: POST ``/api/v1/applications/{id}/review/``
   with ``paymentStatus='verified'`` and a reason of at least 10 chars
   creates a canonical ``force_approved`` Payment row (not
   ``successful``), stamps ``metadata.override=True``,
   ``metadata.reviewed_by``, ``metadata.reviewed_at``,
   ``metadata.reason``, and ``metadata.actor_role``, emits a
   ``payment.force_approved`` audit row at the ``security`` retention
   category, and allocates a receipt number — which (per the design's
   receipt-label rule) is paired with the "Administrative Override"
   label visible to downstream receipt renderers because the row's
   terminal status is ``force_approved`` (R2.3, R2.4, R2.6, R13.5).

2. Task 45.4 — guard: POSTing the same review with a short reason
   (< 10 characters) returns HTTP 400 + stable error code
   ``OVERRIDE_REASON_REQUIRED`` and leaves the Payment ledger
   untouched (no row created, none mutated) (R2.5).

Validates: Requirements R2.3, R2.4, R2.5, R2.6
"""

from __future__ import annotations

import uuid
from decimal import Decimal

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



# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def seed_admin_and_application(db):
    """Seed a student Profile + submitted Application + admin Profile.

    Mirrors ``test_payment_service_force_approve.seed_applicant`` so both
    test modules exercise the same shape of row. The admin Profile's UUID
    is used to build the ``JWTUser`` driving the view, and the view's
    ``PaymentService.force_approve(actor_id=request.user.id, ...)`` call
    will stamp that same UUID onto the Payment override metadata and
    audit row.

    Returns ``{profile, application, admin_profile, admin_jwt_user}``.
    """
    from apps.accounts.models import Profile
    from apps.applications.models import Application

    now = timezone.now()

    profile = Profile.objects.create(
        id=uuid.uuid4(),
        email=f"review-student-{uuid.uuid4().hex[:8]}@example.com",
        first_name="Review",
        last_name="Student",
        role="student",
        is_active=True,
        created_at=now,
        updated_at=now,
    )

    admin = Profile.objects.create(
        id=uuid.uuid4(),
        email=f"review-admin-{uuid.uuid4().hex[:8]}@example.com",
        first_name="Review",
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
        full_name="Review Student",
        date_of_birth=now.date().replace(year=2000),
        sex="Female",
        phone="+260977000000",
        email=profile.email,
        residence_town="Lusaka",
        nationality="Zambian",
        country="Zambia",
        program="Force-Approve Review Program",
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


def _receipt_label_for(payment):
    """Mirror the receipt-rendering rule: force_approved → label present.

    The design's Phase 2 receipt-generation contract (R13.5, R13.6) pins
    the user-visible label to ``"Administrative Override"`` whenever the
    Payment row's terminal status is ``force_approved``. Downstream
    receipt view code derives the label from ``payment.status`` — we
    mirror that derivation here so this unit test exercises the same
    logic without needing to spin up the full receipt endpoint.
    """
    return (
        "Administrative Override"
        if getattr(payment, "status", None) == "force_approved"
        else None
    )


# ---------------------------------------------------------------------------
# Task 45.3 — happy path (canonical force_approved ledger row)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
@override_settings(
    PAYMENT_HARDENING_FORCE_APPROVED=True,
    PAYMENT_HARDENING_FORWARD_ONLY=True,
)
def test_force_approved_path_creates_canonical_ledger_row(
    seed_admin_and_application,
):
    """``paymentStatus='verified'`` review creates a ``force_approved`` row.

    With the Phase 5 flag on, the endpoint delegates to
    ``PaymentService.force_approve`` so the newly-created Payment row
    carries the canonical ``force_approved`` status, the full set of
    override metadata fields, a ``payment.force_approved`` audit entry at
    the ``security`` retention window, and an allocated receipt number
    that maps to the "Administrative Override" receipt label.

    Validates: Requirements R2.3, R2.4, R2.6
    """
    from apps.common.models import AuditLog
    from apps.documents.models import Payment

    seed = seed_admin_and_application
    app = seed["application"]
    admin = seed["admin_profile"]

    # Baseline: no Payment row exists yet for this application.
    assert Payment.objects.filter(application_id=app.id).count() == 0

    reason = "student paid in person at the bursar office"  # 44 chars
    response = _post_review(
        seed,
        payload={"paymentStatus": "verified", "notes": reason},
    )

    # (a) Envelope — review endpoint returns 200 + {success: true}.
    assert response.status_code == 200, (
        f"Expected 200 from force-approved review path; "
        f"got {response.status_code}. Body: {getattr(response, 'data', None)!r}"
    )
    body = response.data
    assert body.get("success") is True, (
        f"Expected envelope 'success=true'; got body={body!r}"
    )

    # (b) Canonical ledger row — exactly one Payment, status
    # ``force_approved`` (NOT ``successful`` — that was the legacy
    # synthetic zero-amount path removed by Task 45.2).
    payments = list(Payment.objects.filter(application_id=app.id))
    assert len(payments) == 1, (
        f"Expected exactly one Payment row after force-approved review; "
        f"found {len(payments)}."
    )
    payment = payments[0]
    assert payment.status == "force_approved", (
        f"Expected Payment.status='force_approved' under "
        f"PAYMENT_HARDENING_FORCE_APPROVED=True; got {payment.status!r}. "
        f"A status of 'successful' would indicate the legacy synthetic "
        f"path is still running."
    )

    # (c) Override metadata (R2.4) — five fields populated by
    # ``PaymentService.force_approve`` before the _transition runs.
    meta = payment.metadata or {}
    assert meta.get("override") is True, (
        f"Expected metadata.override=True; got {meta.get('override')!r}."
    )
    assert meta.get("reviewed_by") == str(admin.id), (
        f"Expected metadata.reviewed_by={admin.id!s}; "
        f"got {meta.get('reviewed_by')!r}."
    )
    assert meta.get("reviewed_at"), "Expected a non-empty metadata.reviewed_at."
    assert meta.get("reason") == reason, (
        f"Expected metadata.reason={reason!r}; got {meta.get('reason')!r}."
    )
    assert meta.get("actor_role") == "admin", (
        f"Expected metadata.actor_role='admin'; "
        f"got {meta.get('actor_role')!r}."
    )

    # (d) Audit trail (R2.6) — exactly one ``payment.force_approved`` row
    # at ``security`` retention, attributed to the admin.
    audits = list(
        AuditLog.objects.filter(
            entity_type="payment",
            entity_id=payment.id,
            action="payment.force_approved",
        )
    )
    assert len(audits) == 1, (
        f"Expected exactly one 'payment.force_approved' audit row; "
        f"got {len(audits)}."
    )
    audit = audits[0]
    assert audit.retention_category == "security", (
        f"Expected retention_category='security' on force_approved "
        f"audit; got {audit.retention_category!r}."
    )
    assert audit.actor_id == admin.id, (
        f"Expected audit.actor_id={admin.id!s}; got {audit.actor_id!s}."
    )

    # (e) Receipt — ``force_approved`` Payments allocate a receipt_number
    # during ``_transition`` (R13.1) and the downstream receipt label
    # derivation stamps "Administrative Override" for this status
    # (R13.5).
    assert payment.receipt_number, (
        "Expected a non-null receipt_number on the force_approved "
        "Payment row — force-approved transitions generate a receipt "
        "idempotently inside _transition."
    )
    assert _receipt_label_for(payment) == "Administrative Override", (
        "Expected the derived receipt label to be 'Administrative "
        "Override' for a force_approved Payment row — the receipt "
        "rendering layer keys the label off payment.status."
    )


# ---------------------------------------------------------------------------
# Task 45.4 — short reason rejected with OVERRIDE_REASON_REQUIRED
# ---------------------------------------------------------------------------


@pytest.mark.django_db
@override_settings(
    PAYMENT_HARDENING_FORCE_APPROVED=True,
    PAYMENT_HARDENING_FORWARD_ONLY=True,
)
def test_force_approved_rejects_short_reason(seed_admin_and_application):
    """A reason shorter than 10 chars yields 400 ``OVERRIDE_REASON_REQUIRED``.

    No Payment row may be created or mutated by the rejected attempt —
    the admin must be sent back to re-submit with a fuller justification
    before the ledger receives a canonical ``force_approved`` row.

    Validates: Requirements R2.5
    """
    from apps.documents.models import Payment

    seed = seed_admin_and_application
    app = seed["application"]

    # Baseline: no Payment row exists yet for this application.
    assert Payment.objects.filter(application_id=app.id).count() == 0

    response = _post_review(
        seed,
        payload={"paymentStatus": "verified", "notes": "ok"},  # 2 chars
    )

    # (a) Response — 400 + stable code ``OVERRIDE_REASON_REQUIRED``.
    assert response.status_code == 400, (
        f"Expected HTTP 400 for short-reason force-approve; "
        f"got {response.status_code}. Body: {getattr(response, 'data', None)!r}"
    )
    body = response.data
    assert body.get("success") is False, (
        f"Expected envelope 'success=false'; got body={body!r}"
    )
    error = body.get("error")
    error_code = (
        error.get("code")
        if isinstance(error, dict)
        else body.get("code")
    )
    assert error_code == "OVERRIDE_REASON_REQUIRED", (
        f"Expected stable code 'OVERRIDE_REASON_REQUIRED'; "
        f"got {error_code!r}. Full body: {body!r}"
    )

    # (b) Ledger unchanged — no Payment row was created by the
    # rejected attempt. The guard must fire BEFORE the placeholder
    # pending row is inserted.
    assert Payment.objects.filter(application_id=app.id).count() == 0, (
        "Short-reason force-approve must not create a placeholder "
        "Payment row — the OVERRIDE_REASON_REQUIRED guard runs before "
        "any row is inserted."
    )
