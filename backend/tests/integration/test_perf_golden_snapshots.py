"""Golden-snapshot capture + divergence regression for system-performance-hardening (task 2.1).

Captures pre-feature golden snapshots of the response envelope and computed
field values for **every endpoint changed by the feature** — admin dashboard,
application list (payment + grade fields), canonical-program list,
scope/capabilities, and notifications — directly from the current code path,
and asserts them against the committed baseline via the reusable divergence
comparator (``tests.perf_baseline``).

Each capture exercises the real serializer/view, so the snapshot reflects the
actual output shape. The :class:`GoldenStore` seeds the baseline on first run
and compares on every run after (capture-or-compare), so this file doubles as
the cross-endpoint divergence regression scaffold that task 19.4 extends. It
also round-trips every capture through the comparator to prove the harness
detects (or clears) divergence against live output, independent of the
committed fixtures.

# Feature: system-performance-hardening
Requirements: 13.1, 13.2, 13.6
"""

from __future__ import annotations

import uuid
from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate

from tests.perf_baseline import (
    assert_equivalent,
    default_store,
    snapshot_envelope,
)
from tests.perf_baseline.capture import ENDPOINTS_BY_KEY

pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# Lightweight authenticated caller (mirrors test_admin_scope_endpoint)
# ---------------------------------------------------------------------------


class _JWTUser:
    """Minimal JWT-style principal: role + id, no DB row needed for auth."""

    is_authenticated = True

    def __init__(self, role: str, user_id):
        self.role = role
        self.id = user_id
        self.pk = user_id


# ---------------------------------------------------------------------------
# Application list — payment + grade summary fields (R3, R8)
# ---------------------------------------------------------------------------

#: The payment- and grade-summary fields R3/R8 optimize and must preserve.
_APPLICATION_SUMMARY_FIELDS = (
    "payment_status",
    "payment_method",
    "paid_amount",
    "paid_at",
    "receipt_number",
    "payment_reference",
    "last_payment_reference",
    "payment_currency",
    "application_fee",
    "grades_summary",
    "total_subjects",
    "points",
)


def _serialize_application_summary(application):
    """Serialize one application through the real list path and keep the
    payment/grade subset, mirroring how ``ApplicationListView`` builds rows."""
    from apps.applications._view_helpers import _with_payment_summary
    from apps.applications.models import Application
    from apps.applications.serializers import ApplicationListSerializer

    qs = _with_payment_summary(
        Application.objects.filter(id=application.id).prefetch_related("applicationgrade_set")
    )
    obj = qs.first()
    row = ApplicationListSerializer(obj).data
    return {field: row[field] for field in _APPLICATION_SUMMARY_FIELDS}


def _attach_fixed_grades(application):
    """Two deterministic grades so grades_summary/points/total_subjects are stable."""
    from apps.catalog.models import Subject
    from apps.documents.models import ApplicationGrade

    biology = Subject.objects.create(id=uuid.uuid4(), name="Biology", code=f"BIO-{uuid.uuid4().hex[:6]}")
    chemistry = Subject.objects.create(id=uuid.uuid4(), name="Chemistry", code=f"CHE-{uuid.uuid4().hex[:6]}")
    ApplicationGrade.objects.create(id=uuid.uuid4(), application=application, subject=biology, grade=2)
    ApplicationGrade.objects.create(id=uuid.uuid4(), application=application, subject=chemistry, grade=3)


def test_application_list_payment_and_grade_golden():
    """Golden payment + grade summary for the five payment cases (R3.6, task 3.3)."""
    from tests.tenant_fixtures import build_payment, build_tenant_world

    world = build_tenant_world(with_application=False)

    def _new_app(status_suffix):
        from tests.tenant_fixtures import build_application

        app = build_application(
            student=world.student,
            institution=world.institution,
            canonical_program=world.canonical_program,
            offering=world.offering,
            intake=world.intake,
            suffix=f"{status_suffix}-{uuid.uuid4().hex[:6]}",
            status="submitted",
        )
        _attach_fixed_grades(app)
        return app

    now = timezone.now()

    # paid: a single verified payment.
    paid = _new_app("paid")
    build_payment(
        application=paid, amount=Decimal("750.00"), currency="ZMW", status="successful",
        payment_method="mobile_money", verified_at=now,
        transaction_reference="REF-PAID", receipt_number=f"RCPT-{uuid.uuid4().hex[:8]}",
    )

    # pending: a single pending payment.
    pending = _new_app("pending")
    build_payment(application=pending, amount=Decimal("750.00"), currency="ZMW", status="pending", payment_method="mobile_money")

    # failed: a single failed payment.
    failed = _new_app("failed")
    build_payment(application=failed, amount=Decimal("750.00"), currency="ZMW", status="failed", payment_method="card")

    # no_payment: no payment rows at all.
    no_payment = _new_app("nopay")

    # multiple: a failed attempt then a later successful one (latest verified wins).
    multiple = _new_app("multi")
    build_payment(
        application=multiple, amount=Decimal("750.00"), currency="ZMW", status="failed",
        payment_method="card", created_at=now - timedelta(hours=2), updated_at=now - timedelta(hours=2),
    )
    build_payment(
        application=multiple, amount=Decimal("750.00"), currency="ZMW", status="successful",
        payment_method="mobile_money", verified_at=now, transaction_reference="REF-MULTI",
        receipt_number=f"RCPT-{uuid.uuid4().hex[:8]}", created_at=now, updated_at=now,
    )

    snapshot = {
        "paid": _serialize_application_summary(paid),
        "pending": _serialize_application_summary(pending),
        "failed": _serialize_application_summary(failed),
        "no_payment": _serialize_application_summary(no_payment),
        "multiple": _serialize_application_summary(multiple),
    }

    spec = ENDPOINTS_BY_KEY["application_list"]

    # Behavioural sanity the comparator should treat as preserved.
    assert snapshot["paid"]["grades_summary"] == "Biology: Grade 2\nChemistry: Grade 3"
    assert snapshot["paid"]["total_subjects"] == 2
    assert snapshot["paid"]["points"] == 5
    assert str(snapshot["paid"]["paid_amount"]) == "750.00"
    assert snapshot["no_payment"]["paid_amount"] is None
    assert snapshot["pending"]["receipt_number"] is None

    # Capture-or-compare against the committed golden baseline.
    default_store.assert_matches("application_list", snapshot, volatile_keys=spec.volatile_keys())
    # Re-serialize and prove the comparator clears identical live output.
    again = {key: _serialize_application_summary(app) for key, app in {
        "paid": paid, "pending": pending, "failed": failed,
        "no_payment": no_payment, "multiple": multiple,
    }.items()}
    assert_equivalent(snapshot, again, label="application_list re-capture", volatile_keys=spec.volatile_keys())


# ---------------------------------------------------------------------------
# Canonical-program list with available offerings (R4.4)
# ---------------------------------------------------------------------------


def _call_canonical_program_list():
    from apps.catalog.views import CanonicalProgramListView

    request = APIRequestFactory().get("/api/v1/catalog/canonical-programs/")
    return CanonicalProgramListView.as_view()(request)


def test_canonical_program_list_golden():
    from tests.tenant_fixtures import build_tenant_world

    build_tenant_world(with_application=False)  # one active offering grouped under a canonical program

    response = _call_canonical_program_list()
    assert response.status_code == 200

    spec = ENDPOINTS_BY_KEY["canonical_program_list"]
    snapshot = snapshot_envelope(response.data, extra_volatile=spec.extra_volatile)
    default_store.assert_matches("canonical_program_list", response.data, volatile_keys=spec.volatile_keys())

    again = _call_canonical_program_list().data
    assert_equivalent(response.data, again, label="canonical_program_list re-capture", volatile_keys=spec.volatile_keys())
    # The envelope is preserved end-to-end.
    assert snapshot["success"] is True


# ---------------------------------------------------------------------------
# Admin scope / capabilities payload (R5)
# ---------------------------------------------------------------------------


def _call_scope(user):
    from apps.accounts.admin_user_views import AdminScopeView

    request = APIRequestFactory().get("/api/v1/admin/scope/")
    force_authenticate(request, user=user)
    return AdminScopeView.as_view()(request)


def test_admin_scope_super_admin_golden():
    from apps.catalog.models import Institution

    # Hermetic baseline: a super_admin's scope payload enumerates ALL
    # institutions globally (visible_institution_queryset returns
    # Institution.objects.all() for super_admins, unfiltered by is_active), so
    # this snapshot must run against a known institutions table. Other suites'
    # session-scoped fixtures commit institutions that persist across the run
    # (e.g. the contract suite seeds a MIHAS institution), which would inflate
    # data.institutions beyond the two this snapshot pins. Clear them first;
    # the delete is rolled back with this test's transaction.
    Institution.objects.all().delete()

    Institution.objects.create(id=uuid.uuid4(), code="GOLDA", name="Golden Alpha", full_name="Golden Alpha", is_active=True)
    Institution.objects.create(id=uuid.uuid4(), code="GOLDB", name="Golden Beta", full_name="Golden Beta", is_active=True)

    response = _call_scope(_JWTUser("super_admin", uuid.uuid4()))
    assert response.status_code == 200

    spec = ENDPOINTS_BY_KEY["admin_scope"]
    data = response.data["data"]
    # Behavioural payload: a super-admin gets all_access + the full platform
    # capability catalogue; these must be preserved across the feature.
    assert data["is_super_admin"] is True
    assert data["all_access"] is True
    assert data["role"] == "super_admin"
    assert isinstance(data["capabilities"], list) and data["capabilities"]

    default_store.assert_matches("admin_scope", response.data, volatile_keys=spec.volatile_keys())

    again = _call_scope(_JWTUser("super_admin", uuid.uuid4())).data
    assert_equivalent(response.data, again, label="admin_scope re-capture", volatile_keys=spec.volatile_keys())


# ---------------------------------------------------------------------------
# Admin dashboard aggregates (R2)
# ---------------------------------------------------------------------------


def _call_dashboard(user):
    from apps.accounts.admin_user_views import AdminDashboardView

    request = APIRequestFactory().get("/api/v1/admin/dashboard/")
    force_authenticate(request, user=user)
    return AdminDashboardView.as_view()(request)


def test_admin_dashboard_golden():
    from tests.tenant_fixtures import build_application, build_tenant_world

    world = build_tenant_world(with_application=False)
    # Two submitted + one approved application so by_status is non-trivial and
    # deterministic. No status-history / success-payment rows => recent_activity
    # stays empty and the snapshot is stable.
    for _ in range(2):
        build_application(
            student=world.student, institution=world.institution,
            canonical_program=world.canonical_program, offering=world.offering,
            intake=world.intake, suffix=f"sub-{uuid.uuid4().hex[:6]}", status="submitted",
        )
    build_application(
        student=world.student, institution=world.institution,
        canonical_program=world.canonical_program, offering=world.offering,
        intake=world.intake, suffix=f"app-{uuid.uuid4().hex[:6]}", status="approved",
    )

    response = _call_dashboard(_JWTUser("super_admin", uuid.uuid4()))
    assert response.status_code == 200

    spec = ENDPOINTS_BY_KEY["admin_dashboard"]
    data = response.data["data"]
    assert data["applications"]["total"] == 3
    assert data["applications"]["by_status"] == {"submitted": 2, "approved": 1}
    assert data["recent_activity"] == []

    default_store.assert_matches("admin_dashboard", response.data, volatile_keys=spec.volatile_keys())

    again = _call_dashboard(_JWTUser("super_admin", uuid.uuid4())).data
    assert_equivalent(response.data, again, label="admin_dashboard re-capture", volatile_keys=spec.volatile_keys())


# ---------------------------------------------------------------------------
# Notifications — page-number + cursor modes (R9)
# ---------------------------------------------------------------------------


def _call_notifications(user, query: dict | None = None):
    from apps.common.notification_views import NotificationListView

    request = APIRequestFactory().get("/api/v1/notifications/", query or {})
    force_authenticate(request, user=user)
    return NotificationListView.as_view()(request)


def _build_ordered_notifications(profile, count: int):
    """Create ``count`` notifications with strictly increasing created_at."""
    from apps.common.models import Notification

    base = timezone.now() - timedelta(hours=count)
    ids = []
    for index in range(count):
        notif = Notification.objects.create(
            id=uuid.uuid4(), user=profile, title=f"Notice {index}", message=f"Body {index}",
            type="info", is_read=False, idempotency_key=str(uuid.uuid4()),
        )
        # created_at is auto-managed; pin it deterministically so cursor ordering
        # is total and the snapshot is stable.
        Notification.objects.filter(pk=notif.id).update(created_at=base + timedelta(minutes=index))
        ids.append(notif.id)
    return ids


def test_notifications_page_and_cursor_golden():
    from tests.tenant_fixtures import build_profile

    profile = build_profile(role="student")
    caller = _JWTUser("student", profile.id)
    ids = _build_ordered_notifications(profile, 4)

    # Page-number mode: classic {page, pageSize, totalCount, results} shape.
    page_resp = _call_notifications(caller, {"page": "1", "pageSize": "20"})
    assert page_resp.status_code == 200
    page_data = page_resp.data["data"]
    assert page_data["totalCount"] == 4
    assert page_data["page"] == 1
    assert len(page_data["results"]) == 4

    spec = ENDPOINTS_BY_KEY["notifications"]
    default_store.assert_matches("notifications", page_resp.data, volatile_keys=spec.volatile_keys())
    again = _call_notifications(caller, {"page": "1", "pageSize": "20"}).data
    assert_equivalent(page_resp.data, again, label="notifications page re-capture", volatile_keys=spec.volatile_keys())

    # Cursor mode: ?after=<newest id> -> the three older rows, totalCount null,
    # no count query (R9.1). Stored as a sibling golden fixture.
    newest_id = ids[-1]
    cursor_resp = _call_notifications(caller, {"after": str(newest_id)})
    assert cursor_resp.status_code == 200
    cursor_data = cursor_resp.data["data"]
    assert cursor_data["totalCount"] is None
    assert len(cursor_data["results"]) == 3

    cursor_volatile = spec.volatile_keys()
    default_store.assert_matches("notifications_cursor", cursor_resp.data, volatile_keys=cursor_volatile)
    again_cursor = _call_notifications(caller, {"after": str(newest_id)}).data
    assert_equivalent(cursor_resp.data, again_cursor, label="notifications cursor re-capture", volatile_keys=cursor_volatile)
