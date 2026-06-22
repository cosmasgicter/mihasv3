"""Property 8 — Conditional-count aggregate equivalence (system-performance-hardening, task 5.2).

# Feature: system-performance-hardening, Property 8

R2.5 collapses the admin dashboard's application-count block from many separate
``.count()`` / ``values_list().annotate(Count)`` round-trips into a **single**
conditional-count aggregate query plus one ``GROUP BY status`` query, over the
already-scoped ``app_queryset`` and the existing
``activity_at = Coalesce(submitted_at, updated_at, created_at)`` annotation
(see ``AdminDashboardView.get`` in
``backend/apps/accounts/admin_user_views.py``).

Property 8 proves that, across arbitrary populations of applications with varied
statuses (including unexpected status values) and varied activity timestamps
(today / this-week / this-month / older, with nullable ``submitted_at`` /
``updated_at``), the production single-aggregate path produces values
**identical** to an independent field-by-field reference computation of the same
buckets — so the optimization changes nothing observable (R2.5):

* ``by_status`` — the dynamic ``GROUP BY status`` dict (keeps unexpected status
  values, never injects zero-count keys);
* ``total`` — ``Count("id")``;
* ``today_created`` — ``created_at >= today_start``;
* ``today_submitted`` — ``submitted_at >= today_start`` (NULL excluded);
* ``today`` / ``today_activity`` — ``activity_at >= today_start``;
* ``this_week`` — ``activity_at >= week_start``;
* ``this_month`` — ``activity_at >= month_start``.

The reference oracle derives the activity-bucket counts in pure Python from the
raw row timestamps (``submitted_at or updated_at or created_at``), so it is a
genuinely independent check of the ORM conditional-count aggregate rather than a
restatement of it.

**Validates: Requirements 2.5**

Backend note: this runs against the SQLite ``config.settings.test`` database via
``pytest.mark.django_db``; the unmanaged-schema fixture in
``backend/tests/conftest.py`` creates the ``managed = False`` tables in the
ephemeral test DB. The aggregate uses only ``Count(filter=Q(...))`` and
``Coalesce`` over datetime columns, which Django compiles identically on SQLite
and Postgres, so the property holds on both backends with no DB-specific skips.
"""

from __future__ import annotations

import uuid
from collections import Counter
from datetime import timedelta

import pytest
from django.db.models import Count, Q
from django.db.models.functions import Coalesce
from django.utils import timezone
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# Status space
# ---------------------------------------------------------------------------
#
# ``applications.status`` is a free-form CharField with no fixed choice set, so
# the generator includes the canonical lifecycle statuses *and* unexpected
# values to prove the GROUP BY path keeps them verbatim (and the conditional
# aggregate never silently drops them).

_CANONICAL_STATUSES = (
    "draft",
    "submitted",
    "under_review",
    "waitlisted",
    "conditionally_approved",
    "approved",
    "enrolled",
    "rejected",
    "withdrawn",
    "expired",
    "enrollment_expired",
)
_UNEXPECTED_STATUSES = ("", "weird_status", "PENDING", "queued-x")
_STATUS_SPACE = (*_CANONICAL_STATUSES, *_UNEXPECTED_STATUSES)


# ---------------------------------------------------------------------------
# Generators
# ---------------------------------------------------------------------------
#
# Each timestamp is expressed as "minutes ago" relative to a single ``now``
# anchor so the generated population naturally spans today, earlier this week,
# earlier this month, and older-than-a-month. ``None`` is allowed for
# submitted_at / updated_at to exercise the Coalesce fallback and the
# NULL-excluded submitted_at filter.

# 0 .. ~62 days, in minutes.
_MINUTES_AGO = st.integers(min_value=0, max_value=62 * 24 * 60)
_OPTIONAL_MINUTES_AGO = st.one_of(st.none(), _MINUTES_AGO)


@st.composite
def _application_population(draw):
    """Generate a list of (status, created_ago, submitted_ago, updated_ago) specs.

    ``created_ago`` is always present (created_at is the final Coalesce
    fallback); ``submitted_ago`` / ``updated_ago`` may be ``None``.
    """
    return draw(
        st.lists(
            st.tuples(
                st.sampled_from(_STATUS_SPACE),
                _MINUTES_AGO,            # created_ago (never None)
                _OPTIONAL_MINUTES_AGO,   # submitted_ago
                _OPTIONAL_MINUTES_AGO,   # updated_ago
            ),
            max_size=14,
        )
    )


def _ts(now, minutes_ago):
    if minutes_ago is None:
        return None
    return now - timedelta(minutes=minutes_ago)


# ---------------------------------------------------------------------------
# Production aggregate path (mirrors AdminDashboardView.get exactly)
# ---------------------------------------------------------------------------


def _production_aggregates(app_queryset, *, today_start, week_start, month_start):
    """Compute the application-count block the way the dashboard view does.

    A single ``GROUP BY status`` query for ``by_status`` plus one
    conditional-count ``aggregate(...)`` over the ``activity_at`` annotation for
    every scalar bucket — byte-for-byte the expression in
    ``AdminDashboardView.get``'s ``compute()`` block.
    """
    status_counts = dict(
        app_queryset.values_list("status")
        .annotate(count=Count("id"))
        .values_list("status", "count")
    )

    application_aggregates = app_queryset.annotate(
        activity_at=Coalesce("submitted_at", "updated_at", "created_at")
    ).aggregate(
        total=Count("id"),
        today_created=Count("id", filter=Q(created_at__gte=today_start)),
        today_submitted=Count("id", filter=Q(submitted_at__gte=today_start)),
        today_activity=Count("id", filter=Q(activity_at__gte=today_start)),
        this_week=Count("id", filter=Q(activity_at__gte=week_start)),
        this_month=Count("id", filter=Q(activity_at__gte=month_start)),
    )

    return {
        "by_status": status_counts,
        "total": application_aggregates["total"],
        "today_created": application_aggregates["today_created"],
        "today_submitted": application_aggregates["today_submitted"],
        "today": application_aggregates["today_activity"],
        "this_week": application_aggregates["this_week"],
        "this_month": application_aggregates["this_month"],
    }


# ---------------------------------------------------------------------------
# Independent reference oracle (pure Python over the raw rows)
# ---------------------------------------------------------------------------


def _reference_aggregates(rows, *, today_start, week_start, month_start):
    """Derive the same buckets field-by-field straight from the raw timestamps.

    ``activity_at`` is the Python equivalent of
    ``Coalesce(submitted_at, updated_at, created_at)`` — the first non-null of
    the three. This mirrors the pre-feature, per-bucket ``.count()`` semantics
    without touching the ORM aggregate under test.
    """
    by_status = Counter(status for (status, *_rest) in rows)

    total = len(rows)
    today_created = 0
    today_submitted = 0
    today_activity = 0
    this_week = 0
    this_month = 0

    for _status, created_at, submitted_at, updated_at in rows:
        if created_at is not None and created_at >= today_start:
            today_created += 1
        if submitted_at is not None and submitted_at >= today_start:
            today_submitted += 1

        # Coalesce(submitted_at, updated_at, created_at): first non-null.
        if submitted_at is not None:
            activity_at = submitted_at
        elif updated_at is not None:
            activity_at = updated_at
        else:
            activity_at = created_at

        if activity_at is not None and activity_at >= today_start:
            today_activity += 1
        if activity_at is not None and activity_at >= week_start:
            this_week += 1
        if activity_at is not None and activity_at >= month_start:
            this_month += 1

    return {
        "by_status": dict(by_status),
        "total": total,
        "today_created": today_created,
        "today_submitted": today_submitted,
        "today": today_activity,
        "this_week": this_week,
        "this_month": this_month,
    }


# ---------------------------------------------------------------------------
# Fixture builder
# ---------------------------------------------------------------------------


def _build_population(specs):
    """Persist a fresh tenant world + one application per spec.

    Returns ``(app_queryset, rows)`` where ``app_queryset`` is scoped to exactly
    the created applications (by id) — the test DB is not rolled back between
    Hypothesis examples, so scoping by id keeps each example's population
    isolated. ``rows`` is the parallel list of resolved timestamps for the
    Python oracle.
    """
    from tests.tenant_fixtures import build_application, build_tenant_world
    from apps.applications.models import Application

    now = timezone.now().replace(microsecond=0)

    world = build_tenant_world(with_application=False)
    created_ids = []
    rows = []
    for index, (status, created_ago, submitted_ago, updated_ago) in enumerate(specs):
        created_at = _ts(now, created_ago)
        submitted_at = _ts(now, submitted_ago)
        updated_at = _ts(now, updated_ago)
        application = build_application(
            student=world.student,
            institution=world.institution,
            canonical_program=world.canonical_program,
            offering=world.offering,
            intake=world.intake,
            suffix=f"p8-{index}-{uuid.uuid4().hex[:8]}",
            status=status,
            created_at=created_at,
            updated_at=updated_at,
            submitted_at=submitted_at,
        )
        created_ids.append(application.id)
        rows.append((status, created_at, submitted_at, updated_at))

    app_queryset = Application.objects.filter(id__in=created_ids)
    return app_queryset, rows, now


# ---------------------------------------------------------------------------
# Property 8 — Conditional-count aggregate equivalence
# ---------------------------------------------------------------------------


@given(specs=_application_population())
@settings(
    max_examples=100,
    deadline=None,
    suppress_health_check=[
        HealthCheck.function_scoped_fixture,
        HealthCheck.too_slow,
        HealthCheck.data_too_large,
    ],
)
def test_property_8_conditional_count_aggregate_equivalence(specs):
    """The single conditional-count aggregate equals the field-by-field oracle.

    For any population of applications with arbitrary statuses (canonical or
    unexpected) and arbitrary today/week/month/older activity timestamps, every
    dashboard application bucket — ``by_status``, ``total``, ``today``,
    ``today_created``, ``today_submitted``, ``this_week``, ``this_month`` —
    matches an independent Python computation of the same buckets.

    **Validates: Requirements 2.5**
    """
    app_queryset, rows, now = _build_population(specs)

    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=today_start.weekday())
    month_start = today_start.replace(day=1)

    actual = _production_aggregates(
        app_queryset,
        today_start=today_start,
        week_start=week_start,
        month_start=month_start,
    )
    expected = _reference_aggregates(
        rows,
        today_start=today_start,
        week_start=week_start,
        month_start=month_start,
    )

    assert actual["by_status"] == expected["by_status"], (
        f"by_status diverged: {actual['by_status']!r} != {expected['by_status']!r}"
    )
    for bucket in (
        "total",
        "today",
        "today_created",
        "today_submitted",
        "this_week",
        "this_month",
    ):
        assert actual[bucket] == expected[bucket], (
            f"{bucket}: {actual[bucket]!r} != {expected[bucket]!r}"
        )


# ---------------------------------------------------------------------------
# Deterministic anchors for the named buckets (R2.5)
# ---------------------------------------------------------------------------
#
# Concrete instances of Property 8 that pin the empty population and a mixed
# population spanning every bucket explicitly.


def test_property_8_empty_population():
    """An empty scope yields all-zero counts and an empty by_status dict."""
    app_queryset, rows, now = _build_population([])
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=today_start.weekday())
    month_start = today_start.replace(day=1)

    actual = _production_aggregates(
        app_queryset, today_start=today_start, week_start=week_start, month_start=month_start
    )
    assert actual == {
        "by_status": {},
        "total": 0,
        "today_created": 0,
        "today_submitted": 0,
        "today": 0,
        "this_week": 0,
        "this_month": 0,
    }


def test_property_8_mixed_population_spans_every_bucket():
    """A hand-built population touching today / this-week / this-month / older."""
    specs = [
        # (status, created_ago, submitted_ago, updated_ago) in minutes
        ("submitted", 30, 30, 30),        # fully today
        ("submitted", 30, None, None),    # today via created fallback
        ("approved", 4 * 24 * 60, None, 4 * 24 * 60),   # ~4 days ago via updated
        ("approved", 20 * 24 * 60, None, None),          # ~20 days ago via created
        ("rejected", 50 * 24 * 60, None, None),          # ~50 days ago (older than month)
        ("weird_status", 30, None, None),                # unexpected status, today
    ]
    app_queryset, rows, now = _build_population(specs)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=today_start.weekday())
    month_start = today_start.replace(day=1)

    actual = _production_aggregates(
        app_queryset, today_start=today_start, week_start=week_start, month_start=month_start
    )
    expected = _reference_aggregates(
        rows, today_start=today_start, week_start=week_start, month_start=month_start
    )
    assert actual == expected
    # The unexpected status survives the GROUP BY verbatim.
    assert "weird_status" in actual["by_status"]
