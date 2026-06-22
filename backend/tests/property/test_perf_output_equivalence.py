"""Property 6 — Output equivalence pre/post feature (system-performance-hardening, task 19.1).

# Feature: system-performance-hardening, Property 6

The performance-hardening feature is reliability- and performance-only: it must
not change any **observable** business behavior (R13.1, R13.2, R13.6). This
property proves that, for the endpoints the feature changes — the admin
dashboard (R2), the application list's payment + grade summary fields (R3/R8),
the canonical-program list with available offerings (R4.4), the admin
scope/capabilities payload (R5), and the notification list in both page-number
and cursor modes (R9) — the **live post-feature output** keeps the same:

* envelope (``{"success": true, "data": ...}``) — R13.1;
* field names, value types, nesting depth, and pagination structure — R13.1;
* notification page-number backward-compat shape (``{page, pageSize,
  totalCount, results}``) and the cursor shape (``{after, pageSize, results,
  totalCount}``) — R9.2.

…as the **pre-feature golden baseline** captured by task 2.1 under
``backend/tests/perf_baseline/fixtures/``. Rather than re-inventing a baseline,
this reuses the task-2.1 golden snapshots and the reusable divergence
comparator (``tests.perf_baseline``), exactly like the task-3.3 regression.

How the property uses Hypothesis
--------------------------------

Property 6 is a *structural*-equivalence statement: "for any input with
identical persisted state, the post-feature output shape equals the pre-feature
output shape." So each example **varies the underlying persisted data**
(varied applications / payments / grades / notifications / institutions in
scope) and asserts the live serialized output stays **shape-equivalent** to the
captured baseline for that endpoint, collapsing the task-2.1 ``volatile_keys()``
(ids / timestamps / references / scenario incidentals) so only behavioural shape
is compared. Concrete values legitimately vary run-to-run (different counts,
names, amounts), so the comparison checks envelope + field-name structure +
value *types* + nesting + pagination keys — null-tolerant on nullable leaves and
list-length independent — which is precisely the Property-6 contract.

Two endpoints are additionally checked under their flag-gated cache **on**:
a cache hit must serve output equivalent to direct recomputation (R2, R5), i.e.
caching changes latency, never the observable payload.

**Validates: Requirements 13.1, 13.2, 13.6, 9.2, 10.8**

(R10.8 is the *frontend*-observable-output preservation requirement; per the
task scope this backend property focuses on the API outputs the frontend
renders — the envelope/field/type/nesting/pagination preservation above — which
is the backend half of "no observable output change".)

Backend note: runs against the SQLite ``config.settings.test`` database via
``pytest.mark.django_db``; the unmanaged-schema fixture in
``backend/tests/conftest.py`` creates the ``managed = False`` tables. The test
DB is **not** rolled back between Hypothesis examples, so every example builds
fresh rows (unique suffixes) and scopes its reads to a fresh caller/owner where
the endpoint is per-user; shape-only comparison is inherently robust to the
extra accumulated rows.
"""

from __future__ import annotations

import uuid
from datetime import timedelta
from decimal import Decimal

import pytest
from django.core.cache import cache
from django.test import override_settings
from django.utils import timezone
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st
from rest_framework.test import APIRequestFactory, force_authenticate

from tests.perf_baseline import (
    assert_envelope,
    assert_equivalent,
    default_store,
)
from tests.perf_baseline.capture import ENDPOINTS_BY_KEY
from tests.perf_baseline.divergence import VOLATILE, normalize_snapshot

pytestmark = pytest.mark.django_db

_factory = APIRequestFactory()

_HEALTH = [
    HealthCheck.function_scoped_fixture,
    HealthCheck.too_slow,
    HealthCheck.data_too_large,
]


# ---------------------------------------------------------------------------
# Lightweight authenticated caller (mirrors test_perf_golden_snapshots)
# ---------------------------------------------------------------------------


class _JWTUser:
    """Minimal JWT-style principal: role + id, no DB row needed for auth."""

    is_authenticated = True

    def __init__(self, role: str, user_id):
        self.role = role
        self.id = user_id
        self.pk = user_id


# ---------------------------------------------------------------------------
# Shape-equivalence comparator
# ---------------------------------------------------------------------------
#
# Property 6 compares *shape* (envelope, field names, value types, nesting,
# pagination structure), not concrete values — those vary with the data. The
# comparator walks a normalized baseline against a normalized candidate and:
#
#   * treats the VOLATILE sentinel (collapsed ids/timestamps/refs/incidentals)
#     as a wildcard on either side;
#   * treats ``None`` on either side as a wildcard (a nullable leaf may be null
#     in one scenario and populated in another — the type is preserved either
#     way);
#   * requires identical key sets for fixed-structure dicts and recurses;
#   * for a *dynamic map* path (e.g. the dashboard ``by_status`` status→count
#     map, whose keys are data-derived) requires a dict whose populated values
#     match the baseline value type(s) — never identical keys;
#   * for lists, compares each candidate element against the merged baseline
#     element shape (so list length is irrelevant); an empty list on either
#     side is a wildcard (its element shape is unobservable);
#   * for leaves, requires the same scalar kind (bool / int / float / str),
#     treating int/float as interchangeable numerics.


def _leaf_kind(value):
    if isinstance(value, bool):
        return "bool"
    if isinstance(value, int):
        return "int"
    if isinstance(value, float):
        return "float"
    if isinstance(value, str):
        return "str"
    return type(value).__name__


def _merge_elements(items):
    """Merge a list's element shapes into one representative element.

    For a list of dicts, the merged element is the union of all keys, choosing
    a non-null / non-volatile representative value per key where available so
    the merged shape carries the most informative type for each field. For a
    non-dict list, the first element is representative.
    """
    if items and all(isinstance(el, dict) for el in items):
        merged: dict = {}
        for el in items:
            for key, val in el.items():
                cur = merged.get(key, _MISSING)
                if cur is _MISSING or cur is None or cur == VOLATILE:
                    merged[key] = val
        return merged
    return items[0]


_MISSING = object()


def _join(prefix: str, key: str) -> str:
    return f"{prefix}.{key}" if prefix else key


def assert_shape_equivalent(baseline, candidate, *, label, dynamic_map_paths=frozenset(), path=""):
    """Assert ``candidate`` is shape-equivalent to ``baseline`` (Property 6)."""
    # Wildcards: collapsed volatile values and nullable leaves.
    if baseline == VOLATILE or candidate == VOLATILE:
        return
    if baseline is None or candidate is None:
        return

    # Dynamic status→count style maps: data-derived keys, fixed value type.
    if path in dynamic_map_paths:
        assert isinstance(candidate, dict), (
            f"{label}: {path or '<root>'} expected a dynamic map (dict), "
            f"got {_leaf_kind(candidate)}"
        )
        base_value_kinds = {
            _leaf_kind(v) for v in baseline.values() if v is not None and v != VOLATILE
        } or {"int"}
        for key, val in candidate.items():
            if val is None or val == VOLATILE:
                continue
            ck = _leaf_kind(val)
            assert ck in base_value_kinds or base_value_kinds <= {"int", "float"}, (
                f"{label}: dynamic-map value type at {_join(path, str(key))}: "
                f"{ck} not in baseline {sorted(base_value_kinds)}"
            )
        return

    # Dicts: identical key set, recurse.
    if isinstance(baseline, dict) or isinstance(candidate, dict):
        assert isinstance(baseline, dict) and isinstance(candidate, dict), (
            f"{label}: container kind mismatch at {path or '<root>'}: "
            f"{_leaf_kind(baseline)} vs {_leaf_kind(candidate)}"
        )
        base_keys, cand_keys = set(baseline), set(candidate)
        assert base_keys == cand_keys, (
            f"{label}: field-name mismatch at {path or '<root>'}: "
            f"missing={sorted(base_keys - cand_keys)} extra={sorted(cand_keys - base_keys)}"
        )
        for key in sorted(base_keys):
            assert_shape_equivalent(
                baseline[key], candidate[key],
                label=label, dynamic_map_paths=dynamic_map_paths, path=_join(path, str(key)),
            )
        return

    # Lists: element-shape equivalence, length-independent.
    if isinstance(baseline, list) or isinstance(candidate, list):
        assert isinstance(baseline, list) and isinstance(candidate, list), (
            f"{label}: container kind mismatch at {path or '<root>'}: "
            f"{_leaf_kind(baseline)} vs {_leaf_kind(candidate)}"
        )
        if not baseline or not candidate:
            return  # empty on either side: element shape is unobservable.
        merged = _merge_elements(baseline)
        for index, element in enumerate(candidate):
            assert_shape_equivalent(
                merged, element,
                label=label, dynamic_map_paths=dynamic_map_paths, path=f"{path}[{index}]",
            )
        return

    # Leaves: same scalar kind (int/float interchangeable).
    bk, ck = _leaf_kind(baseline), _leaf_kind(candidate)
    assert bk == ck or {bk, ck} <= {"int", "float"}, (
        f"{label}: value-type mismatch at {path or '<root>'}: {bk} vs {ck}"
    )


def _normalized_candidate(payload, volatile_keys):
    """Validate the envelope (R13.1) and normalize for shape comparison."""
    assert_envelope(payload, expect_success=True)
    return normalize_snapshot(payload, volatile_keys=volatile_keys)


# ===========================================================================
# Endpoint 1 — Admin dashboard aggregates (R2)
# ===========================================================================

_DASHBOARD_SPEC = ENDPOINTS_BY_KEY["admin_dashboard"]
_DASHBOARD_DYNAMIC_MAPS = frozenset({"data.applications.by_status"})

_DASH_STATUSES = ("draft", "submitted", "under_review", "approved", "rejected", "waitlisted")
_MINUTES_AGO = st.integers(min_value=0, max_value=40 * 24 * 60)
_OPT_MINUTES_AGO = st.one_of(st.none(), _MINUTES_AGO)


def _call_dashboard(user):
    from apps.accounts.admin_user_views import AdminDashboardView

    request = _factory.get("/api/v1/admin/dashboard/")
    force_authenticate(request, user=user)
    return AdminDashboardView.as_view()(request)


def _ts(now, minutes_ago):
    return None if minutes_ago is None else now - timedelta(minutes=minutes_ago)


@given(
    specs=st.lists(
        st.tuples(st.sampled_from(_DASH_STATUSES), _MINUTES_AGO, _OPT_MINUTES_AGO, _OPT_MINUTES_AGO),
        min_size=0,
        max_size=6,
    ),
)
@settings(max_examples=100, deadline=None, suppress_health_check=_HEALTH)
def test_property_6_admin_dashboard_shape_equivalent(specs):
    """The dashboard envelope/keys/types/nesting match the pre-feature golden.

    Varies the application population (status / created / submitted / updated
    timestamps); the live aggregate payload's shape — including the
    ``by_status`` dynamic map and the time-bucket integer counts — stays
    equivalent to the task-2.1 ``admin_dashboard`` golden snapshot.

    **Validates: Requirements 13.1, 13.2, 13.6**
    """
    from tests.tenant_fixtures import build_application, build_tenant_world

    assert default_store.exists("admin_dashboard"), "missing task-2.1 'admin_dashboard' baseline"
    baseline = default_store.load("admin_dashboard")

    world = build_tenant_world(with_application=False)
    now = timezone.now().replace(microsecond=0)
    for index, (status_value, c_ago, s_ago, u_ago) in enumerate(specs):
        build_application(
            student=world.student, institution=world.institution,
            canonical_program=world.canonical_program, offering=world.offering,
            intake=world.intake, suffix=f"p6dash-{index}-{uuid.uuid4().hex[:8]}",
            status=status_value,
            created_at=_ts(now, c_ago), submitted_at=_ts(now, s_ago), updated_at=_ts(now, u_ago),
        )

    response = _call_dashboard(_JWTUser("super_admin", uuid.uuid4()))
    assert response.status_code == 200

    candidate = _normalized_candidate(response.data, _DASHBOARD_SPEC.volatile_keys())
    assert_shape_equivalent(
        baseline, candidate,
        label="admin_dashboard vs pre-feature golden",
        dynamic_map_paths=_DASHBOARD_DYNAMIC_MAPS,
    )


# ===========================================================================
# Endpoint 2 — Application list payment + grade summary fields (R3/R8)
# ===========================================================================
#
# The task-2.1 ``application_list`` baseline is the per-case payment + grade
# *subset* (not an envelope), keyed by the five canonical payment cases. Each
# case shares an identical field set, so any baseline case is a valid shape
# reference (null-tolerant) for an arbitrarily-generated application row.

_APPLICATION_SUMMARY_FIELDS = (
    "payment_status", "payment_method", "paid_amount", "paid_at",
    "receipt_number", "payment_reference", "last_payment_reference",
    "payment_currency", "application_fee", "grades_summary",
    "total_subjects", "points",
)
_APP_LIST_SPEC = ENDPOINTS_BY_KEY["application_list"]
_PAYMENT_STATUSES = ("pending", "initiated", "failed", "successful", "verified", "deferred")
_PAYMENT_METHODS = ("mobile_money", "card")
_CURRENCIES = ("ZMW", "USD")


def _serialize_application_summary(application):
    from apps.applications._view_helpers import _with_payment_summary
    from apps.applications.models import Application
    from apps.applications.serializers import ApplicationListSerializer

    qs = _with_payment_summary(
        Application.objects.filter(id=application.id).prefetch_related("applicationgrade_set")
    )
    row = ApplicationListSerializer(qs.first()).data
    return {field: row[field] for field in _APPLICATION_SUMMARY_FIELDS}


@st.composite
def _application_payment_specs(draw):
    """An application's payment rows: 0..3, each (status, method, currency, amount, verified)."""
    return draw(
        st.lists(
            st.tuples(
                st.sampled_from(_PAYMENT_STATUSES),
                st.sampled_from(_PAYMENT_METHODS),
                st.sampled_from(_CURRENCIES),
                st.sampled_from(("153.00", "750.00", "1000.00")),
                st.booleans(),  # verified_at set?
            ),
            max_size=3,
        )
    )


@given(payment_specs=_application_payment_specs(), grade_count=st.integers(min_value=0, max_value=4))
@settings(max_examples=100, deadline=None, suppress_health_check=_HEALTH)
def test_property_6_application_list_shape_equivalent(payment_specs, grade_count):
    """The application list payment + grade summary fields keep the golden shape.

    Varies an application's payment rows (none/one/many; pending/failed/
    verified/deferred; varied method/currency/amount) and grade count; the
    optimized ``_with_payment_summary`` + ``ApplicationListSerializer`` row's
    payment/grade subset stays shape-equivalent (field names + value types,
    null-tolerant) to the task-2.1 ``application_list`` golden baseline.

    **Validates: Requirements 13.1, 13.2, 13.6**
    """
    from apps.catalog.models import Subject
    from apps.documents.models import ApplicationGrade
    from tests.tenant_fixtures import build_application, build_payment, build_tenant_world

    assert default_store.exists("application_list"), "missing task-2.1 'application_list' baseline"
    baseline = default_store.load("application_list")
    # Any case is a valid shape reference (identical field set across cases).
    reference_row = baseline["paid"]

    world = build_tenant_world(with_application=False)
    now = timezone.now()
    sfx = uuid.uuid4().hex[:8]
    application = build_application(
        student=world.student, institution=world.institution,
        canonical_program=world.canonical_program, offering=world.offering,
        intake=world.intake, suffix=f"p6app-{sfx}", status="submitted",
    )

    for index, (p_status, method, currency, amount, verified) in enumerate(payment_specs):
        build_payment(
            application=application, amount=Decimal(amount), currency=currency,
            status=p_status, payment_method=method,
            verified_at=now if verified else None,
            transaction_reference=f"REF-{sfx}-{index}",
            receipt_number=f"RCPT-{uuid.uuid4().hex[:8]}" if verified else None,
            created_at=now - timedelta(minutes=index), updated_at=now - timedelta(minutes=index),
        )

    for index in range(grade_count):
        subject = Subject.objects.create(
            id=uuid.uuid4(), name=f"Subject{index}", code=f"S{index}-{uuid.uuid4().hex[:6]}"
        )
        ApplicationGrade.objects.create(
            id=uuid.uuid4(), application=application, subject=subject, grade=(index % 9) + 1
        )

    row = _serialize_application_summary(application)
    candidate = normalize_snapshot(row, volatile_keys=_APP_LIST_SPEC.volatile_keys())
    assert_shape_equivalent(
        reference_row, candidate,
        label="application_list row vs pre-feature golden",
    )


# ===========================================================================
# Endpoint 3 — Canonical-program list with available offerings (R4.4)
# ===========================================================================

_CANONICAL_SPEC = ENDPOINTS_BY_KEY["canonical_program_list"]


def _call_canonical_program_list():
    from apps.catalog.views import CanonicalProgramListView

    request = _factory.get("/api/v1/catalog/canonical-programs/")
    return CanonicalProgramListView.as_view()(request)


@given(offering_count=st.integers(min_value=1, max_value=3), fee=st.sampled_from(("153.00", "750.00", "1200.50")))
@settings(max_examples=100, deadline=None, suppress_health_check=_HEALTH)
def test_property_6_canonical_program_list_shape_equivalent(offering_count, fee):
    """The canonical-program list (with available offerings) keeps the golden shape.

    Varies the number of active offerings grouped under one shared canonical
    program (and their application fee); the live envelope — pagination keys,
    ``results`` rows, nested ``available_offerings`` and ``institution`` blocks
    — stays shape-equivalent to the task-2.1 ``canonical_program_list`` golden
    baseline.

    **Validates: Requirements 13.1, 13.2, 13.6**
    """
    from tests.tenant_fixtures import build_canonical_program, build_tenant_world

    assert default_store.exists("canonical_program_list"), "missing task-2.1 'canonical_program_list' baseline"
    baseline = default_store.load("canonical_program_list")

    shared_canonical = build_canonical_program(suffix=f"p6can-{uuid.uuid4().hex[:6]}")
    for _ in range(offering_count):
        build_tenant_world(
            with_application=False,
            canonical_program=shared_canonical,
        )
    # Vary the offering fee on one offering so amounts genuinely differ.
    from apps.catalog.models import Program
    Program.objects.filter(canonical_program=shared_canonical).update(application_fee=Decimal(fee))

    response = _call_canonical_program_list()
    assert response.status_code == 200

    candidate = _normalized_candidate(response.data, _CANONICAL_SPEC.volatile_keys())
    assert_shape_equivalent(
        baseline, candidate,
        label="canonical_program_list vs pre-feature golden",
    )


# ===========================================================================
# Endpoint 4 — Admin scope / capabilities payload (R5)
# ===========================================================================

_SCOPE_SPEC = ENDPOINTS_BY_KEY["admin_scope"]


def _call_scope(user):
    from apps.accounts.admin_user_views import AdminScopeView

    request = _factory.get("/api/v1/admin/scope/")
    force_authenticate(request, user=user)
    return AdminScopeView.as_view()(request)


@given(institution_count=st.integers(min_value=1, max_value=3))
@settings(max_examples=100, deadline=None, suppress_health_check=_HEALTH)
def test_property_6_admin_scope_shape_equivalent(institution_count):
    """The super-admin scope/capabilities payload keeps the golden shape.

    Varies the number of institutions a super-admin sees; the live payload —
    ``role`` / ``is_super_admin`` / ``all_access`` flags, the platform
    ``capabilities`` list, and the per-institution ``capabilities`` entries —
    stays shape-equivalent to the task-2.1 ``admin_scope`` golden baseline.

    **Validates: Requirements 13.1, 13.2, 13.6**
    """
    from tests.tenant_fixtures import build_institution

    assert default_store.exists("admin_scope"), "missing task-2.1 'admin_scope' baseline"
    baseline = default_store.load("admin_scope")

    for _ in range(institution_count):
        build_institution(suffix=f"p6scope-{uuid.uuid4().hex[:6]}", is_active=True)

    response = _call_scope(_JWTUser("super_admin", uuid.uuid4()))
    assert response.status_code == 200

    candidate = _normalized_candidate(response.data, _SCOPE_SPEC.volatile_keys())
    assert_shape_equivalent(
        baseline, candidate,
        label="admin_scope vs pre-feature golden",
    )


# ===========================================================================
# Endpoint 5 — Notifications (page-number + cursor modes) (R9, R9.2)
# ===========================================================================

_NOTIF_SPEC = ENDPOINTS_BY_KEY["notifications"]
_NOTIF_TYPES = ("info", "success", "warning", "error")


def _call_notifications(user, query):
    from apps.common.notification_views import NotificationListView

    request = _factory.get("/api/v1/notifications/", query)
    force_authenticate(request, user=user)
    return NotificationListView.as_view()(request)


def _build_notifications(profile, specs):
    """Create one notification per spec with strictly increasing created_at."""
    from apps.common.models import Notification

    base = timezone.now().replace(microsecond=0) - timedelta(hours=len(specs) + 1)
    ids = []
    for index, (ntype, is_read, has_url) in enumerate(specs):
        notif = Notification.objects.create(
            id=uuid.uuid4(), user=profile, title=f"Notice {index}",
            message=f"Body {index}", type=ntype, is_read=is_read,
            action_url=(f"/x/{index}" if has_url else None),
            idempotency_key=str(uuid.uuid4()),
        )
        Notification.objects.filter(pk=notif.id).update(created_at=base + timedelta(minutes=index))
        ids.append(notif.id)
    return ids


@given(
    specs=st.lists(
        st.tuples(st.sampled_from(_NOTIF_TYPES), st.booleans(), st.booleans()),
        min_size=1, max_size=6,
    ),
)
@settings(max_examples=100, deadline=None, suppress_health_check=_HEALTH)
def test_property_6_notifications_page_mode_shape_equivalent(specs):
    """Page-number mode keeps the backward-compatible golden shape (R9.2).

    Varies the notification set (type / read state / action_url presence); the
    page-number response keeps the ``{page, pageSize, totalCount, results}``
    shape and per-row field set/types of the task-2.1 ``notifications``
    baseline.

    **Validates: Requirements 13.1, 13.2, 13.6, 9.2**
    """
    from tests.tenant_fixtures import build_profile

    assert default_store.exists("notifications"), "missing task-2.1 'notifications' baseline"
    baseline = default_store.load("notifications")

    profile = build_profile(role="student", suffix=f"p6npage-{uuid.uuid4().hex[:8]}")
    caller = _JWTUser("student", profile.id)
    _build_notifications(profile, specs)

    response = _call_notifications(caller, {"page": "1", "pageSize": "20"})
    assert response.status_code == 200

    candidate = _normalized_candidate(response.data, _NOTIF_SPEC.volatile_keys())
    assert_shape_equivalent(
        baseline, candidate,
        label="notifications page-mode vs pre-feature golden",
    )


@given(
    specs=st.lists(
        st.tuples(st.sampled_from(_NOTIF_TYPES), st.booleans(), st.booleans()),
        min_size=2, max_size=6,
    ),
)
@settings(max_examples=100, deadline=None, suppress_health_check=_HEALTH)
def test_property_6_notifications_cursor_mode_shape_equivalent(specs):
    """Cursor mode keeps the golden cursor shape with no full count (R9.1/R9.2).

    Varies the notification set and uses the newest id as the ``after`` cursor;
    the response keeps the ``{after, pageSize, results, totalCount}`` shape
    (``totalCount`` null) and per-row field set/types of the task-2.1
    ``notifications_cursor`` baseline.

    **Validates: Requirements 13.1, 13.2, 13.6, 9.2**
    """
    from tests.tenant_fixtures import build_profile

    assert default_store.exists("notifications_cursor"), "missing task-2.1 'notifications_cursor' baseline"
    baseline = default_store.load("notifications_cursor")

    profile = build_profile(role="student", suffix=f"p6ncur-{uuid.uuid4().hex[:8]}")
    caller = _JWTUser("student", profile.id)
    ids = _build_notifications(profile, specs)

    response = _call_notifications(caller, {"after": str(ids[-1])})
    assert response.status_code == 200
    assert response.data["data"]["totalCount"] is None  # R9.1: no full count in cursor mode

    candidate = _normalized_candidate(response.data, _NOTIF_SPEC.volatile_keys())
    assert_shape_equivalent(
        baseline, candidate,
        label="notifications cursor-mode vs pre-feature golden",
    )


# ===========================================================================
# Cache-on equivalence — a cache hit serves output equivalent to recomputation
# ===========================================================================
#
# The flag-gated caches (R2 dashboard, R5 capabilities) must change latency,
# never the observable payload: a warm cache hit must equal both the cold-miss
# computation and the flag-off direct computation, for identical persisted
# state. Deterministic (non-Hypothesis) checks against the LocMem test cache.


def _seed_dashboard_world():
    from tests.tenant_fixtures import build_application, build_tenant_world

    world = build_tenant_world(with_application=False)
    for status_value in ("submitted", "submitted", "approved"):
        build_application(
            student=world.student, institution=world.institution,
            canonical_program=world.canonical_program, offering=world.offering,
            intake=world.intake, suffix=f"cachew-{uuid.uuid4().hex[:8]}", status=status_value,
        )
    return world


def test_property_6_dashboard_cache_hit_equals_recomputation():
    """Dashboard cache-on hit == cold miss == flag-off recomputation (R2.1/R2.8).

    **Validates: Requirements 13.1, 13.2, 13.6**
    """
    _seed_dashboard_world()
    caller = _JWTUser("super_admin", uuid.uuid4())
    volatile = _DASHBOARD_SPEC.volatile_keys()

    with override_settings(PERF_CACHE_DASHBOARD=True):
        cache.clear()
        cold = _call_dashboard(caller)   # miss → compute + store
        warm = _call_dashboard(caller)   # hit  → served from cache
    assert cold.status_code == warm.status_code == 200
    assert_equivalent(cold.data, warm.data, label="dashboard cold vs warm cache", volatile_keys=volatile)

    with override_settings(PERF_CACHE_DASHBOARD=False):
        cache.clear()
        flag_off = _call_dashboard(caller)
    assert flag_off.status_code == 200
    assert_equivalent(cold.data, flag_off.data, label="dashboard cache-on vs flag-off", volatile_keys=volatile)


def test_property_6_scope_cache_hit_equals_recomputation():
    """Capability/scope cache-on hit == cold miss == flag-off recomputation (R5.1/R5.2).

    **Validates: Requirements 13.1, 13.2, 13.6**
    """
    from tests.tenant_fixtures import build_institution

    build_institution(suffix=f"cachescope-{uuid.uuid4().hex[:6]}", is_active=True)
    caller = _JWTUser("super_admin", uuid.uuid4())
    volatile = _SCOPE_SPEC.volatile_keys()

    with override_settings(PERF_CACHE_CAPABILITIES=True):
        cache.clear()
        cold = _call_scope(caller)
        warm = _call_scope(caller)
    assert cold.status_code == warm.status_code == 200
    assert_equivalent(cold.data, warm.data, label="scope cold vs warm cache", volatile_keys=volatile)

    with override_settings(PERF_CACHE_CAPABILITIES=False):
        cache.clear()
        flag_off = _call_scope(caller)
    assert flag_off.status_code == 200
    assert_equivalent(cold.data, flag_off.data, label="scope cache-on vs flag-off", volatile_keys=volatile)
