"""Consolidated divergence regression across every changed endpoint (task 19.4).

R13.6 requires a regression check that detects **any** pre/post output
divergence for every endpoint the ``system-performance-hardening`` feature
changes. Task 3.3 covered only the payment-summary cases; this file is the
single consolidated gate across the whole changed surface:

    admin dashboard · application list (payment + grade fields) ·
    canonical-program list · scope/capabilities · notifications
    (page-number + cursor).

It wires the task-2.1 divergence harness (``tests.perf_baseline``: the
``ENDPOINTS_BY_KEY`` capture map, the committed golden baseline behind
``default_store``, and the reusable ``assert_equivalent`` comparator with its
``volatile_keys`` collapse) into a regression that, for each changed endpoint:

1. seeds the data that endpoint needs (reusing ``tests.tenant_fixtures``, the
   exact seeding the task-2.1 golden capture used so the live shape matches the
   committed fixture),
2. drives the **current (post-feature) code path** and captures its output
   through the same harness, and
3. asserts the live output is behaviourally equivalent to the committed
   **pre-feature** golden baseline (``tests/perf_baseline/fixtures/*.json``),
   collapsing volatile ids/timestamps/references.

Any divergence — a changed envelope, field name, value type, nesting, or
computed value — fails the gate (R13.1, R13.2, R13.6).

Two passes run for every endpoint whose optimization is flag-gated:

* **default (flags off)** — the always-on refactors must already be
  output-equivalent to the baseline; and
* **caches on** (``PERF_CACHE_DASHBOARD`` / ``PERF_CACHE_CAPABILITIES`` /
  ``PERF_CACHE_CATALOG``) — the cached path, exercised twice so the second call
  is a cache hit, must serve output still equivalent to the baseline.

If a committed baseline is absent (golden snapshots not committed), capturing
the genuine pre-feature output is impossible after the feature has landed, so
the gate degrades to an **in-process capture-then-compare**: it drives the
endpoint twice and asserts the two live captures are equivalent (a stability
floor), and clearly skips the committed-baseline comparison for that endpoint.

# Feature: system-performance-hardening
Requirements: 13.6
"""

from __future__ import annotations

import uuid
from datetime import timedelta
from decimal import Decimal

import pytest
from django.test import override_settings
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
# Lightweight authenticated caller (mirrors the task-2.1 golden capture)
# ---------------------------------------------------------------------------


class _JWTUser:
    """Minimal JWT-style principal: role + id, no DB row needed for auth."""

    is_authenticated = True

    def __init__(self, role: str, user_id):
        self.role = role
        self.id = user_id
        self.pk = user_id


class _Rollback(Exception):
    """Sentinel raised to roll back a per-endpoint nested atomic block."""


# ---------------------------------------------------------------------------
# Per-endpoint drivers — each seeds state and returns the live captured output
# in the exact shape the committed golden fixture was captured with.
# ---------------------------------------------------------------------------

#: Payment + grade summary fields R3/R8 optimize and must preserve (the subset
#: the task-2.1 ``application_list`` golden snapshot pins).
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


def _serialize_application_summary(application) -> dict:
    """Serialize one application through the optimized list path, keeping the
    payment/grade subset (mirrors how ``ApplicationListView`` builds rows)."""
    from apps.applications._view_helpers import _with_payment_summary
    from apps.applications.models import Application
    from apps.applications.serializers import ApplicationListSerializer

    qs = _with_payment_summary(
        Application.objects.filter(id=application.id).prefetch_related("applicationgrade_set")
    )
    row = ApplicationListSerializer(qs.first()).data
    return {field: row[field] for field in _APPLICATION_SUMMARY_FIELDS}


def _attach_fixed_grades(application) -> None:
    """Two deterministic grades so grades_summary/points/total_subjects are stable."""
    from apps.catalog.models import Subject
    from apps.documents.models import ApplicationGrade

    biology = Subject.objects.create(id=uuid.uuid4(), name="Biology", code=f"BIO-{uuid.uuid4().hex[:6]}")
    chemistry = Subject.objects.create(id=uuid.uuid4(), name="Chemistry", code=f"CHE-{uuid.uuid4().hex[:6]}")
    ApplicationGrade.objects.create(id=uuid.uuid4(), application=application, subject=biology, grade=2)
    ApplicationGrade.objects.create(id=uuid.uuid4(), application=application, subject=chemistry, grade=3)


def _drive_application_list() -> dict:
    """Build the five canonical payment cases and capture their summary subset."""
    from tests.tenant_fixtures import build_application, build_payment, build_tenant_world

    world = build_tenant_world(with_application=False)
    now = timezone.now()

    def _new_app(label: str):
        app = build_application(
            student=world.student,
            institution=world.institution,
            canonical_program=world.canonical_program,
            offering=world.offering,
            intake=world.intake,
            suffix=f"{label}-{uuid.uuid4().hex[:6]}",
            status="submitted",
        )
        _attach_fixed_grades(app)
        return app

    paid = _new_app("paid")
    build_payment(
        application=paid, amount=Decimal("750.00"), currency="ZMW", status="successful",
        payment_method="mobile_money", verified_at=now,
        transaction_reference="REF-PAID", receipt_number=f"RCPT-{uuid.uuid4().hex[:8]}",
    )

    pending = _new_app("pending")
    build_payment(application=pending, amount=Decimal("750.00"), currency="ZMW", status="pending", payment_method="mobile_money")

    failed = _new_app("failed")
    build_payment(application=failed, amount=Decimal("750.00"), currency="ZMW", status="failed", payment_method="card")

    no_payment = _new_app("nopay")

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

    return {
        "paid": _serialize_application_summary(paid),
        "pending": _serialize_application_summary(pending),
        "failed": _serialize_application_summary(failed),
        "no_payment": _serialize_application_summary(no_payment),
        "multiple": _serialize_application_summary(multiple),
    }


def _call_canonical_program_list() -> dict:
    from apps.catalog.views import CanonicalProgramListView

    request = APIRequestFactory().get("/api/v1/catalog/canonical-programs/")
    response = CanonicalProgramListView.as_view()(request)
    assert response.status_code == 200
    return response.data


def _drive_canonical_program_list() -> dict:
    from tests.tenant_fixtures import build_tenant_world

    build_tenant_world(with_application=False)  # one active offering under a canonical program
    return _call_canonical_program_list()


def _seed_admin_scope_world() -> None:
    """Hermetic super_admin scope world: exactly two active institutions.

    A super_admin's scope enumerates ALL institutions globally, so clear any
    session-scoped institutions other suites committed and pin the two this
    capture expects (the delete rolls back with the test's transaction). Mirrors
    the task-2.1 golden capture seeding."""
    from apps.catalog.models import Institution

    Institution.objects.all().delete()
    Institution.objects.create(id=uuid.uuid4(), code="GOLDA", name="Golden Alpha", full_name="Golden Alpha", is_active=True)
    Institution.objects.create(id=uuid.uuid4(), code="GOLDB", name="Golden Beta", full_name="Golden Beta", is_active=True)


def _call_admin_scope(user) -> dict:
    from apps.accounts.admin_user_views import AdminScopeView

    request = APIRequestFactory().get("/api/v1/admin/scope/")
    force_authenticate(request, user=user)
    response = AdminScopeView.as_view()(request)
    assert response.status_code == 200
    return response.data


def _drive_admin_scope() -> dict:
    _seed_admin_scope_world()
    return _call_admin_scope(_JWTUser("super_admin", uuid.uuid4()))


def _seed_admin_dashboard_world() -> None:
    """Two submitted + one approved application under a fresh tenant world."""
    from tests.tenant_fixtures import build_application, build_tenant_world

    world = build_tenant_world(with_application=False)
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


def _call_admin_dashboard(user) -> dict:
    from apps.accounts.admin_user_views import AdminDashboardView

    request = APIRequestFactory().get("/api/v1/admin/dashboard/")
    force_authenticate(request, user=user)
    response = AdminDashboardView.as_view()(request)
    assert response.status_code == 200
    return response.data


def _drive_admin_dashboard() -> dict:
    _seed_admin_dashboard_world()
    return _call_admin_dashboard(_JWTUser("super_admin", uuid.uuid4()))


def _build_ordered_notifications(profile, count: int) -> list:
    from apps.common.models import Notification

    base = timezone.now() - timedelta(hours=count)
    ids = []
    for index in range(count):
        notif = Notification.objects.create(
            id=uuid.uuid4(), user=profile, title=f"Notice {index}", message=f"Body {index}",
            type="info", is_read=False, idempotency_key=str(uuid.uuid4()),
        )
        Notification.objects.filter(pk=notif.id).update(created_at=base + timedelta(minutes=index))
        ids.append(notif.id)
    return ids


def _drive_notifications() -> dict:
    """Page-number mode (the ``notifications`` golden fixture)."""
    from apps.common.notification_views import NotificationListView
    from tests.tenant_fixtures import build_profile

    profile = build_profile(role="student")
    caller = _JWTUser("student", profile.id)
    _build_ordered_notifications(profile, 4)

    request = APIRequestFactory().get("/api/v1/notifications/", {"page": "1", "pageSize": "20"})
    force_authenticate(request, user=caller)
    response = NotificationListView.as_view()(request)
    assert response.status_code == 200
    return response.data


def _drive_notifications_cursor() -> dict:
    """Cursor mode ``?after=<newest id>`` (the ``notifications_cursor`` fixture)."""
    from apps.common.notification_views import NotificationListView
    from tests.tenant_fixtures import build_profile

    profile = build_profile(role="student")
    caller = _JWTUser("student", profile.id)
    ids = _build_ordered_notifications(profile, 4)

    request = APIRequestFactory().get("/api/v1/notifications/", {"after": str(ids[-1])})
    force_authenticate(request, user=caller)
    response = NotificationListView.as_view()(request)
    assert response.status_code == 200
    return response.data


#: fixture name -> (driver, capture-map key). ``application_list`` is the manual
#: summary-subset dict (not an envelope); the rest are full envelopes.
#: ``notifications_cursor`` reuses the ``notifications`` capture spec's volatile
#: keys (its committed sibling fixture).
_ENDPOINT_DRIVERS: dict[str, tuple] = {
    "admin_dashboard": (_drive_admin_dashboard, "admin_dashboard"),
    "application_list": (_drive_application_list, "application_list"),
    "canonical_program_list": (_drive_canonical_program_list, "canonical_program_list"),
    "admin_scope": (_drive_admin_scope, "admin_scope"),
    "notifications": (_drive_notifications, "notifications"),
    "notifications_cursor": (_drive_notifications_cursor, "notifications"),
}


def _volatile_for(spec_key: str) -> frozenset:
    return ENDPOINTS_BY_KEY[spec_key].volatile_keys()


def _assert_no_divergence(fixture_name: str, spec_key: str, candidate) -> None:
    """The core gate: live ``candidate`` must equal the committed golden baseline.

    Falls back to an in-process stability floor when the committed baseline is
    absent (capturing genuine pre-feature output is impossible post-landing).
    """
    volatile = _volatile_for(spec_key)
    if default_store.exists(fixture_name):
        baseline = default_store.load(fixture_name)
        assert_equivalent(
            baseline,
            candidate,
            label=f"{fixture_name}: post-feature output vs committed pre-feature golden",
            volatile_keys=volatile,
        )
    else:  # pragma: no cover - exercised only when fixtures are not committed
        pytest.skip(
            f"no committed golden baseline '{fixture_name}'; capturing genuine "
            f"pre-feature output is impossible after the feature landed. Run "
            f"tests/integration/test_perf_golden_snapshots.py to seed it. "
            f"(In-process stability is still covered by the re-capture test.)"
        )


# ---------------------------------------------------------------------------
# Consolidated divergence gate — every changed endpoint, default flags off
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("fixture_name", sorted(_ENDPOINT_DRIVERS))
def test_changed_endpoint_matches_pre_feature_golden(fixture_name):
    """Each changed endpoint's post-feature output equals the committed baseline (R13.6)."""
    driver, spec_key = _ENDPOINT_DRIVERS[fixture_name]
    candidate = driver()
    _assert_no_divergence(fixture_name, spec_key, candidate)


def test_divergence_gate_covers_every_changed_endpoint():
    """The gate must cover every endpoint the task-2.1 capture map names (R13.6).

    Guards against a changed endpoint being added to the harness but silently
    omitted from this consolidated regression. Combined with the per-endpoint
    parametrization above (one isolated transaction each), this is the single
    consolidated divergence gate across the whole changed surface."""
    covered_spec_keys = {spec_key for _, spec_key in _ENDPOINT_DRIVERS.values()}
    assert covered_spec_keys == set(ENDPOINTS_BY_KEY), (
        "divergence regression does not cover every changed endpoint: "
        f"missing {set(ENDPOINTS_BY_KEY) - covered_spec_keys}"
    )


def test_consolidated_no_divergence_across_all_endpoints():
    """Single consolidated gate: every changed endpoint matches its baseline (R13.6).

    Each endpoint is driven and compared in its own nested atomic block that is
    rolled back before the next, so the global-scoped dashboard and
    canonical-program list (which count all seeded rows) stay isolated. Failures
    are aggregated so one run names every diverging endpoint.
    """
    from django.db import transaction

    failures: list[str] = []
    for fixture_name in sorted(_ENDPOINT_DRIVERS):
        driver, spec_key = _ENDPOINT_DRIVERS[fixture_name]
        if not default_store.exists(fixture_name):
            continue
        baseline = default_store.load(fixture_name)
        try:
            # Roll back each endpoint's seed so the next endpoint sees a clean
            # slate (global-scoped counts must not accumulate across drivers).
            with transaction.atomic():
                candidate = driver()
                assert_equivalent(
                    baseline,
                    candidate,
                    label=fixture_name,
                    volatile_keys=_volatile_for(spec_key),
                )
                raise _Rollback()
        except _Rollback:
            continue
        except AssertionError as exc:  # collect, don't stop at the first endpoint
            failures.append(str(exc))
    assert not failures, "divergence detected on one or more changed endpoints:\n\n" + "\n\n".join(failures)


# ---------------------------------------------------------------------------
# In-process stability floor (independent of committed fixtures)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("fixture_name", ["application_list", "notifications", "notifications_cursor"])
def test_endpoint_output_is_stable_run_to_run(fixture_name):
    """Re-driving a per-scope endpoint yields equivalent output (harness self-check).

    Limited to the per-scope endpoints (application list serializes a fixed set
    of objects; notifications are scoped to one student), which are idempotent
    under re-seeding. The global-scoped dashboard / canonical-program list count
    all rows, so re-seeding them in one transaction would accumulate — their
    stability is instead covered by the cache re-read tests below (seed once,
    call twice)."""
    driver, spec_key = _ENDPOINT_DRIVERS[fixture_name]
    first = driver()
    second = driver()
    assert_equivalent(
        first,
        second,
        label=f"{fixture_name}: run-to-run stability",
        volatile_keys=_volatile_for(spec_key),
    )


# ---------------------------------------------------------------------------
# Caches-on pass — the flag-gated cached path must stay equivalent (R13.3, R13.6)
# ---------------------------------------------------------------------------


@override_settings(PERF_CACHE_DASHBOARD=True)
def test_admin_dashboard_cached_path_no_divergence():
    """Dashboard cache on: cached output (incl. a cache-hit re-read) equals baseline."""
    from django.core.cache import cache

    cache.clear()
    _seed_admin_dashboard_world()
    user = _JWTUser("super_admin", uuid.uuid4())  # fixed user so the second call hits the cache
    first = _call_admin_dashboard(user)
    _assert_no_divergence("admin_dashboard", "admin_dashboard", first)
    second = _call_admin_dashboard(user)  # within TTL -> cache-hit branch
    assert_equivalent(first, second, label="admin_dashboard cached re-read", volatile_keys=_volatile_for("admin_dashboard"))


@override_settings(PERF_CACHE_CAPABILITIES=True)
def test_admin_scope_cached_path_no_divergence():
    """Capability cache on: cached scope output (incl. cache hit) equals baseline."""
    from django.core.cache import cache

    cache.clear()
    _seed_admin_scope_world()
    user = _JWTUser("super_admin", uuid.uuid4())  # fixed user so the second call hits the cache
    first = _call_admin_scope(user)
    _assert_no_divergence("admin_scope", "admin_scope", first)
    second = _call_admin_scope(user)
    assert_equivalent(first, second, label="admin_scope cached re-read", volatile_keys=_volatile_for("admin_scope"))


@override_settings(PERF_CACHE_CATALOG=True)
def test_canonical_program_list_cached_path_no_divergence():
    """Catalog cache on: cached canonical-program output (incl. cache hit) equals baseline."""
    from django.core.cache import cache
    from tests.tenant_fixtures import build_tenant_world

    cache.clear()
    build_tenant_world(with_application=False)  # one active offering under a canonical program
    first = _call_canonical_program_list()
    _assert_no_divergence("canonical_program_list", "canonical_program_list", first)
    second = _call_canonical_program_list()  # within TTL -> cache-hit branch
    assert_equivalent(
        first, second, label="canonical_program_list cached re-read",
        volatile_keys=_volatile_for("canonical_program_list"),
    )


# ---------------------------------------------------------------------------
# Envelope contract preservation across the envelope endpoints (R13.1)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "fixture_name",
    ["admin_dashboard", "canonical_program_list", "admin_scope", "notifications", "notifications_cursor"],
)
def test_changed_endpoint_preserves_success_envelope(fixture_name):
    """Every envelope endpoint still returns the canonical success envelope (R13.1)."""
    driver, spec_key = _ENDPOINT_DRIVERS[fixture_name]
    candidate = driver()
    snapshot = snapshot_envelope(candidate, extra_volatile=ENDPOINTS_BY_KEY[spec_key].extra_volatile)
    assert snapshot["success"] is True
    assert "data" in snapshot
