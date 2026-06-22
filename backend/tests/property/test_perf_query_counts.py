"""Property 10 — Constant query count under scaling (system-performance-hardening, task 19.2).

# Feature: system-performance-hardening, Property 10

This is the HYPOTHESIS generalization of the two deterministic query-count
siblings (``tests/unit/test_perf_grade_query_count.py`` and
``tests/unit/test_perf_canonical_offerings_query_count.py``). Where those pin a
fixed 2-vs-5 page comparison, this draws **arbitrary** distinct page sizes
``N1 < N2`` and asserts that the query count for the optimized list paths does
NOT grow with the number of rows on the page — it is *constant under scaling*:

* **Application list payment summary (R3.4)** — the payment-related query count
  (``FROM payments`` — the single window-bounded ``Prefetch`` attached by
  ``_with_payment_summary``) is constant as the number of applications grows.
* **Application list grade summary (R8.2, R8.5)** — the grade-related query
  count (touching ``application_grades`` — the single ``applicationgrade_set``
  prefetch) is constant as the number of applications grows when grades are
  prefetched.
* **Canonical-program offerings (R4.4)** — the offering-related query count
  (``FROM programs`` — the single ``program_set`` prefetch attached by
  ``CanonicalProgramListView``) is constant as the number of canonical programs
  grows.

The test mirrors the **real** optimized view querysets/prefetches and the same
query-classification approach (regex on the primary ``FROM <table>`` for
payments/programs, substring for ``application_grades``) the sibling tests use,
serializing through the real ``ApplicationListSerializer`` /
``CanonicalProgramSerializer`` under ``CaptureQueriesContext`` so the assertion
is faithful to production behavior.

The catalog read cache flag stays OFF (``PERF_CACHE_CATALOG`` default ``False``)
so this measures the always-on prefetch fixes, not a cache hit — the
serialization mirrors bypass the view's cache wrapper entirely.

Backend note: the run command exercises this against the SQLite
``config.settings.test`` database, where Django compiles the window-function
prefetch into a wrapping subquery that SQLite (>= 3.25) executes successfully.
The test DB is **not** rolled back between Hypothesis examples, so every example
builds fresh rows (uuid-suffixed) and scopes each measurement to its own freshly
created ids.

**Validates: Requirements 3.4, 4.4, 8.2, 8.5**
"""

from __future__ import annotations

import re
import uuid

import pytest
from django.db import connection
from django.db.models import Prefetch
from django.test.utils import CaptureQueriesContext
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from apps.applications._view_helpers import _with_payment_summary
from apps.applications.models import Application
from apps.applications.serializers import ApplicationListSerializer
from apps.catalog.models import CanonicalProgram, Program, Subject
from apps.catalog.serializers import CanonicalProgramSerializer
from apps.catalog.services import OfferingDirectoryService
from apps.documents.models import ApplicationGrade

from tests.tenant_fixtures import (
    build_application,
    build_canonical_program,
    build_institution,
    build_offering,
    build_payment,
    build_tenant_world,
)

pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# Query classification (mirrors the deterministic siblings)
# ---------------------------------------------------------------------------

# Match the table immediately after the first FROM so each query is classified
# by its primary relation. The application-list query is ``FROM applications``;
# its payment prefetch is ``FROM payments`` and its grade prefetch touches
# ``application_grades``. The canonical-program list query is ``FROM
# canonical_programs`` (the offering existence check lives in a nested
# ``EXISTS(... FROM programs ...)`` subquery so it does NOT count as a primary
# ``programs`` query); the offerings prefetch is ``FROM programs``.
_FROM_TABLE_RE = re.compile(r'\bFROM\s+"?(?P<table>[a-z_]+)"?', re.IGNORECASE)


def _primary_table(sql: str) -> str:
    match = _FROM_TABLE_RE.search(sql)
    return match.group("table").lower() if match else ""


def _count_primary(captured: CaptureQueriesContext, table: str) -> int:
    """Number of captured queries whose primary relation is ``table``."""
    return sum(1 for q in captured.captured_queries if _primary_table(q["sql"]) == table)


def _count_touching(captured: CaptureQueriesContext, needle: str) -> int:
    """Number of captured queries whose SQL references ``needle`` (e.g. a table)."""
    return sum(1 for q in captured.captured_queries if needle in q["sql"])


# ---------------------------------------------------------------------------
# Page-size strategy: two arbitrary DISTINCT sizes N1 < N2
# ---------------------------------------------------------------------------


@st.composite
def _two_page_sizes(draw) -> tuple[int, int]:
    """Draw two distinct small page sizes ``(n1, n2)`` with ``n1 < n2``.

    Kept small (n1 ∈ [1,2], n2 = n1 + δ, δ ∈ [1,3], so n2 ≤ 5) because each
    example is DB-backed and builds both pages; the property is about the count
    being independent of the size, which any distinct pair exercises.
    """
    n1 = draw(st.integers(min_value=1, max_value=2))
    delta = draw(st.integers(min_value=1, max_value=3))
    return n1, n1 + delta


_SETTINGS = settings(
    max_examples=100,
    deadline=None,
    suppress_health_check=[
        HealthCheck.function_scoped_fixture,
        HealthCheck.too_slow,
        HealthCheck.data_too_large,
    ],
)


# ---------------------------------------------------------------------------
# Application-list builders + serialization mirror (R3.4, R8.2, R8.5)
# ---------------------------------------------------------------------------


def _make_subjects(count: int) -> list[Subject]:
    subjects: list[Subject] = []
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


def _build_apps_with_grades_and_payments(
    world, *, count: int, subjects: list[Subject]
) -> list[Application]:
    """Build ``count`` submitted applications, each with one grade per subject
    and a single verified payment (so the payment summary and grade summary are
    both non-trivial and the single-active-payment DB invariant is respected)."""
    apps: list[Application] = []
    for _ in range(count):
        app = build_application(
            student=world.student,
            institution=world.institution,
            canonical_program=world.canonical_program,
            offering=world.offering,
            intake=world.intake,
            suffix=f"p10-{uuid.uuid4().hex[:8]}",
            status="submitted",
        )
        build_payment(
            application=app,
            amount="153.00",
            status="successful",
            transaction_reference=f"TXN-{uuid.uuid4().hex[:18].upper()}",
            receipt_number=f"RCPT-{uuid.uuid4().hex[:10].upper()}",
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


def _serialize_app_page(ids: list[uuid.UUID]) -> tuple[list[dict], CaptureQueriesContext]:
    """Serialize the given applications through the real optimized list path.

    Mirrors the admin application-list queryset
    (``backend/apps/applications/admin_review_views.py``):
    ``select_related('payment_verified_by')``, a ``applicationgrade_set``
    prefetch, and the window-bounded payment ``Prefetch`` via
    ``_with_payment_summary``. Both queryset evaluation (where the prefetches
    run) and serialization are captured so every prefetch query is counted.
    """
    base = Application.objects.select_related("payment_verified_by").prefetch_related(
        "applicationgrade_set"
    )
    queryset = _with_payment_summary(base.filter(id__in=ids))

    with CaptureQueriesContext(connection) as captured:
        page = list(queryset)
        data = ApplicationListSerializer(page, many=True).data
        # Force resolution of every payment- and grade-dependent field so any
        # per-row re-query would be captured here.
        for row in data:
            _ = row["grades_summary"], row["total_subjects"], row["points"]
            _ = row["payment_method"], row["paid_amount"], row["application_fee"]
    return data, captured


# ---------------------------------------------------------------------------
# Canonical-offerings builders + serialization mirror (R4.4)
# ---------------------------------------------------------------------------


def _make_request() -> Request:
    return Request(APIRequestFactory().get("/api/v1/catalog/canonical-programs/"))


def _build_canonical_programs_with_offerings(
    *, count: int, offerings_each: int
) -> list[CanonicalProgram]:
    institution = build_institution(suffix=f"inst-{uuid.uuid4().hex[:6]}")
    programs: list[CanonicalProgram] = []
    for _ in range(count):
        canonical = build_canonical_program(suffix=f"canon-{uuid.uuid4().hex[:6]}")
        for _ in range(offerings_each):
            build_offering(
                institution=institution,
                canonical_program=canonical,
                suffix=f"offer-{uuid.uuid4().hex[:6]}",
            )
        programs.append(canonical)
    return programs


def _serialize_canonical_list(
    program_ids: list[uuid.UUID],
) -> tuple[list[dict], list, CaptureQueriesContext]:
    """Mirror ``CanonicalProgramListView.get`` for the shared Beanola portal.

    Builds the same directory queryset + single ``program_set`` prefetch the
    view attaches (``institution_id=None`` lists every active offering grouped
    by canonical program — the case most prone to N-scaling), evaluates the
    page, then serializes it, capturing queries across both phases.
    """
    directory = OfferingDirectoryService()
    queryset = directory.canonical_program_directory(
        institution_id=None, intake_id=None
    ).filter(id__in=program_ids)

    offering_qs = (
        Program.objects.select_related("institution")
        .filter(is_active=True, offering_status="active")
        .order_by("assignment_priority", "name")
    )
    inner_queryset = queryset.prefetch_related(
        Prefetch("program_set", queryset=offering_qs, to_attr="prefetched_offerings")
    )

    context = {"request": _make_request(), "institution_id": None}

    with CaptureQueriesContext(connection) as captured:
        page = list(inner_queryset)
        data = CanonicalProgramSerializer(page, many=True, context=context).data
        for row in data:
            _ = row["available_offerings"]
    return data, page, captured


# ---------------------------------------------------------------------------
# Property 10a — application list payment + grade query counts (R3.4, R8.2, R8.5)
# ---------------------------------------------------------------------------


@given(sizes=_two_page_sizes())
@_SETTINGS
def test_property_10_application_list_constant_query_count(sizes):
    """Across arbitrary page sizes N1 < N2, the payment-related and
    grade-related query counts for the application list are identical (constant,
    independent of the number of applications on the page).

    **Validates: Requirements 3.4, 8.2, 8.5**
    """
    n1, n2 = sizes
    world = build_tenant_world(with_application=False)
    subjects = _make_subjects(2)

    small = _build_apps_with_grades_and_payments(world, count=n1, subjects=subjects)
    large = _build_apps_with_grades_and_payments(world, count=n2, subjects=subjects)

    small_data, small_q = _serialize_app_page([a.id for a in small])
    large_data, large_q = _serialize_app_page([a.id for a in large])

    # The measurements are scoped to each page's own ids.
    assert len(small_data) == n1
    assert len(large_data) == n2

    # Payment-related query count is constant under scaling (R3.4): the single
    # window-bounded ``payment_set`` Prefetch for the whole page.
    small_payment = _count_primary(small_q, "payments")
    large_payment = _count_primary(large_q, "payments")
    assert small_payment == large_payment, (
        f"R3.4: payment-related query count scaled with page size: "
        f"{n1} apps -> {small_payment}, {n2} apps -> {large_payment}"
    )

    # Grade-related query count is constant under scaling (R8.2, R8.5): the
    # single ``applicationgrade_set`` prefetch for the whole page.
    small_grade = _count_touching(small_q, "application_grades")
    large_grade = _count_touching(large_q, "application_grades")
    assert small_grade == large_grade, (
        f"R8.5: grade-related query count scaled with page size: "
        f"{n1} apps -> {small_grade}, {n2} apps -> {large_grade}"
    )

    # Sanity: the optimized output is non-trivial and correct on both pages.
    assert all(row["total_subjects"] == 2 for row in small_data)
    assert all(row["total_subjects"] == 2 for row in large_data)


# ---------------------------------------------------------------------------
# Property 10b — canonical-program offerings query count (R4.4)
# ---------------------------------------------------------------------------


@given(sizes=_two_page_sizes())
@_SETTINGS
def test_property_10_canonical_offerings_constant_query_count(sizes):
    """Across arbitrary page sizes N1 < N2, the offering-related query count for
    the canonical-program list is identical (constant, independent of the number
    of canonical programs on the page).

    **Validates: Requirements 4.4**
    """
    n1, n2 = sizes

    small = _build_canonical_programs_with_offerings(count=n1, offerings_each=2)
    large = _build_canonical_programs_with_offerings(count=n2, offerings_each=2)

    small_data, small_page, small_q = _serialize_canonical_list([p.id for p in small])
    large_data, large_page, large_q = _serialize_canonical_list([p.id for p in large])

    # The directory query is scoped to each measurement's own program ids.
    assert len(small_page) == n1
    assert len(large_page) == n2

    # Offering-related query count is constant under scaling (R4.4): the single
    # ``program_set`` prefetch for the whole page, not one query per program.
    small_offering = _count_primary(small_q, "programs")
    large_offering = _count_primary(large_q, "programs")
    assert small_offering == large_offering, (
        f"R4.4: offering-related query count scaled with the number of canonical "
        f"programs: {n1} programs -> {small_offering}, {n2} programs -> "
        f"{large_offering}"
    )

    # Sanity: every canonical program nests its two offerings from the prefetch.
    assert all(len(row["available_offerings"]) == 2 for row in small_data)
    assert all(len(row["available_offerings"]) == 2 for row in large_data)
