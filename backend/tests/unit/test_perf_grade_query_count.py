"""Query-count regression test for grade-summary computation (task 4.3).

R8 memoizes the grade summary in ``ApplicationListSerializer`` so that the three
grade-dependent fields (``grades_summary``, ``total_subjects``, ``points``) are
derived from a single grade resolution per application, and so the
grade-related query count stays CONSTANT as a list page grows (it must not
scale with the number of applications when grades are prefetched).

This is a deterministic regression test (not a property test). It uses Django's
``CaptureQueriesContext`` to count queries that touch the ``application_grades``
table while serializing a list of applications through the real
``ApplicationListSerializer``, mirroring how the admin application-list view
builds its queryset (``prefetch_related('applicationgrade_set', ...)`` in
``backend/apps/applications/admin_review_views.py``).

What it pins:
  (a) With grades prefetched, the grade-related query count for a larger page
      (N apps) equals the count for a smaller page (constant, not N-scaling) —
      it is the single prefetch query for the whole page (R8.2, R8.5).
  (b) Even without a prefetch, the grade summary is resolved AT MOST ONCE per
      application: exactly one ``application_grades`` query per application
      across all three grade-dependent fields, proving the per-instance
      memoization holds (no re-query across the 3 fields) (R8.1, R8.3, R8.6).

# Feature: system-performance-hardening
Requirements: 8.5, 8.6
"""

from __future__ import annotations

import uuid

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from apps.applications._view_helpers import _with_payment_summary
from apps.applications.models import Application
from apps.applications.serializers import ApplicationListSerializer
from apps.catalog.models import Subject
from apps.documents.models import ApplicationGrade

from tests.tenant_fixtures import build_application, build_tenant_world

pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_subjects(count: int) -> list[Subject]:
    """Create ``count`` distinct subjects reused across applications."""
    subjects = []
    for index in range(count):
        sfx = uuid.uuid4().hex[:6]
        subjects.append(
            Subject.objects.create(
                id=uuid.uuid4(),
                name=f"Subject {index} {sfx}",
                code=f"SUB-{sfx.upper()}",
            )
        )
    return subjects


def _build_apps_with_grades(world, *, count: int, subjects: list[Subject]) -> list[Application]:
    """Build ``count`` submitted applications, each with one grade per subject."""
    apps: list[Application] = []
    for _ in range(count):
        app = build_application(
            student=world.student,
            institution=world.institution,
            canonical_program=world.canonical_program,
            offering=world.offering,
            intake=world.intake,
            suffix=f"grade-{uuid.uuid4().hex[:6]}",
            status="submitted",
        )
        for position, subject in enumerate(subjects):
            ApplicationGrade.objects.create(
                id=uuid.uuid4(),
                application=app,
                subject=subject,
                grade=(position % 9) + 1,
            )
        apps.append(app)
    return apps


def _count_grade_queries(captured: CaptureQueriesContext) -> int:
    """Number of captured queries that touch the ``application_grades`` table."""
    return sum(1 for q in captured.captured_queries if "application_grades" in q["sql"])


def _serialize_page(ids: list[uuid.UUID], *, prefetch_grades: bool) -> tuple[list[dict], CaptureQueriesContext]:
    """Serialize the given applications through the list serializer.

    Mirrors the admin application-list queryset: ``select_related`` for the
    payment verifier, a window-bounded payment ``Prefetch`` via
    ``_with_payment_summary``, and (optionally) the ``applicationgrade_set``
    prefetch the admin view attaches. Queries are captured across BOTH queryset
    evaluation and serialization so the prefetch query (a grade query) is
    counted.
    """
    base = Application.objects.select_related("payment_verified_by")
    if prefetch_grades:
        base = base.prefetch_related("applicationgrade_set")
    queryset = _with_payment_summary(base.filter(id__in=ids))

    with CaptureQueriesContext(connection) as captured:
        page = list(queryset)
        data = ApplicationListSerializer(page, many=True).data
        # Touch every grade-dependent field so any per-field re-query would be
        # captured here (the serializer already computes these, but force the
        # access explicitly to make the intent unambiguous).
        for row in data:
            _ = row["grades_summary"], row["total_subjects"], row["points"]
    return data, captured


# ---------------------------------------------------------------------------
# (a) Constant grade-query count as the page grows (with prefetch) — R8.5
# ---------------------------------------------------------------------------


def test_grade_query_count_is_constant_as_page_grows_with_prefetch():
    """With grades prefetched, the grade-related query count for a 5-app page
    equals the count for a 2-app page — constant, not N-scaling (R8.5)."""
    world = build_tenant_world(with_application=False)
    subjects = _make_subjects(3)

    small = _build_apps_with_grades(world, count=2, subjects=subjects)
    large = _build_apps_with_grades(world, count=5, subjects=subjects)

    small_data, small_q = _serialize_page([a.id for a in small], prefetch_grades=True)
    large_data, large_q = _serialize_page([a.id for a in large], prefetch_grades=True)

    small_grade_queries = _count_grade_queries(small_q)
    large_grade_queries = _count_grade_queries(large_q)

    # The grade-summary output is non-trivial and correct on both pages.
    assert all(row["total_subjects"] == 3 for row in small_data)
    assert all(row["total_subjects"] == 3 for row in large_data)

    # Constant: the grade-related query count does not grow with the number of
    # applications on the page.
    assert small_grade_queries == large_grade_queries, (
        f"grade-query count scaled with page size: "
        f"2 apps -> {small_grade_queries}, 5 apps -> {large_grade_queries}"
    )
    # With a single prefetch of ``applicationgrade_set`` for the whole page, the
    # grade records are fetched in exactly one query regardless of page size.
    assert large_grade_queries == 1


# ---------------------------------------------------------------------------
# (b) Grade summary resolved at most once per application — R8.1, R8.6
# ---------------------------------------------------------------------------


def test_grade_summary_resolved_at_most_once_per_application_without_prefetch():
    """Without a prefetch, the serializer issues at most ONE grade query per
    application across all three grade-dependent fields, proving the
    per-instance memoization (R8.1, R8.3, R8.6)."""
    world = build_tenant_world(with_application=False)
    subjects = _make_subjects(3)
    count = 3
    apps = _build_apps_with_grades(world, count=count, subjects=subjects)

    data, captured = _serialize_page([a.id for a in apps], prefetch_grades=False)

    grade_queries = _count_grade_queries(captured)

    # Each application contributes its grade summary to three fields
    # (grades_summary, total_subjects, points). Without memoization that would
    # be 3 grade queries per application (9 total); memoization collapses it to
    # at most one per application.
    assert grade_queries <= count, (
        f"grade summary re-queried across fields: {grade_queries} grade queries "
        f"for {count} applications (expected at most {count})"
    )
    # Sanity: the computed summary is still correct per application.
    assert all(row["total_subjects"] == 3 for row in data)
    assert all(row["points"] == sum(sorted((p % 9) + 1 for p in range(3))[:5]) for row in data)
