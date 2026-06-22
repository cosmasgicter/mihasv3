"""Query-count regression for the canonical-program offerings prefetch fix (task 6.2).

Task 6.1 killed an N+1 in the canonical-program listing: previously
``CanonicalProgramSerializer.get_available_offerings`` issued one ``programs``
query *per canonical program on the page* (a per-object offering lookup that
scaled with the number of programs). The fix resolves each canonical program's
``available_offerings`` from a single view-level
``Prefetch("program_set", queryset=offering_qs, to_attr="prefetched_offerings")``
attached in ``CanonicalProgramListView.get``, so the whole page's offerings load
in **one** query regardless of how many canonical programs are listed.

This is a deterministic regression test (not a property test). It mirrors the
view's queryset + prefetch + serializer ``context={"institution_id": ...}`` for
the shared Beanola portal (``institution_id=None`` — the case most prone to
N-scaling because it lists every active offering grouped by canonical program)
and uses Django's ``CaptureQueriesContext`` to count queries whose primary
relation is the ``programs`` table (the offering-related queries).

What it pins:
  (a) NO per-object offering query fires during serialization — once the page is
      evaluated (the prefetch runs), serializing every canonical program's
      ``available_offerings`` issues zero further ``programs`` queries because the
      offerings come from the prefetched set (R4.4).
  (b) The offering-related query count is CONSTANT as the number of canonical
      programs grows (2 programs vs 5 programs) — it is the single ``program_set``
      prefetch query for the whole page, not one query per program (R4.4).

The catalog read cache flag stays OFF (``PERF_CACHE_CATALOG`` default ``False``)
so this measures the always-on prefetch fix and not a cache hit. The test
bypasses the view's cache wrapper entirely by mirroring the queryset/prefetch/
serializer directly.

# Feature: system-performance-hardening
Requirements: 4.4
"""

from __future__ import annotations

import re
import uuid

import pytest
from django.db import connection
from django.db.models import Prefetch
from django.test.utils import CaptureQueriesContext
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from apps.catalog.models import CanonicalProgram, Program
from apps.catalog.serializers import CanonicalProgramSerializer
from apps.catalog.services import OfferingDirectoryService

from tests.tenant_fixtures import (
    build_canonical_program,
    build_institution,
    build_offering,
)

pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# Query classification helpers (mirror test_perf_dashboard_query_count.py)
# ---------------------------------------------------------------------------

# Match the table immediately after the first FROM so we classify each query by
# its primary relation. The canonical-program list query is ``FROM
# canonical_programs`` (with the offering existence check living in a nested
# ``EXISTS(... FROM programs ...)`` subquery, so it does NOT count as an
# offering query). The prefetch / per-object offering lookups are ``FROM
# programs`` and are exactly what we want to count.
_FROM_TABLE_RE = re.compile(r'\bFROM\s+"?(?P<table>[a-z_]+)"?', re.IGNORECASE)


def _primary_table(sql: str) -> str:
    match = _FROM_TABLE_RE.search(sql)
    return match.group("table").lower() if match else ""


def _count_offering_queries(captured: CaptureQueriesContext) -> int:
    """Number of captured queries whose primary relation is the programs table."""
    return sum(1 for q in captured.captured_queries if _primary_table(q["sql"]) == "programs")


# ---------------------------------------------------------------------------
# Builders
# ---------------------------------------------------------------------------


def _make_request() -> Request:
    """A DRF request for the shared Beanola portal listing (no query params)."""
    return Request(APIRequestFactory().get("/api/v1/catalog/canonical-programs/"))


def _build_canonical_programs_with_offerings(
    *, count: int, offerings_each: int
) -> list[CanonicalProgram]:
    """Build ``count`` canonical programs, each with ``offerings_each`` active offerings."""
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
    """Mirror ``CanonicalProgramListView.get`` for the shared portal.

    Builds the same directory queryset + ``program_set`` prefetch the view
    attaches, evaluates the page, then serializes it. Returns the serialized
    rows, the evaluated page, and the captured queries spanning BOTH page
    evaluation (where the prefetch runs) and serialization (where the N+1 would
    have fired without the fix).
    """
    directory = OfferingDirectoryService()
    # Shared Beanola portal (R8.6): institution_id=None lists every active
    # offering grouped by canonical program. Narrow to the page's program ids so
    # the measurement is over a known-size page (stand-in for pagination).
    queryset = directory.canonical_program_directory(
        institution_id=None, intake_id=None
    ).filter(id__in=program_ids)

    # The exact offering queryset the view attaches (active offerings ordered by
    # assignment_priority, name), resolved via a single prefetch for the page.
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
        # Force resolution of the nested offerings on every row so any
        # per-object offering query would be captured here.
        for row in data:
            _ = row["available_offerings"]
    return data, page, captured


# ---------------------------------------------------------------------------
# (a) No per-object offering query during serialization — R4.4
# ---------------------------------------------------------------------------


def test_no_per_object_offering_query_during_serialization():
    """Once the page is evaluated (prefetch run), serializing every canonical
    program's ``available_offerings`` issues zero further ``programs`` queries —
    the offerings come from the prefetched set, not a per-object query (R4.4)."""
    programs = _build_canonical_programs_with_offerings(count=4, offerings_each=2)

    directory = OfferingDirectoryService()
    queryset = directory.canonical_program_directory(
        institution_id=None, intake_id=None
    ).filter(id__in=[p.id for p in programs])
    offering_qs = (
        Program.objects.select_related("institution")
        .filter(is_active=True, offering_status="active")
        .order_by("assignment_priority", "name")
    )
    inner_queryset = queryset.prefetch_related(
        Prefetch("program_set", queryset=offering_qs, to_attr="prefetched_offerings")
    )
    context = {"request": _make_request(), "institution_id": None}

    # Evaluate the page OUTSIDE the capture so the prefetch query is not counted;
    # we only want queries that fire during serialization.
    page = list(inner_queryset)
    assert len(page) == 4

    with CaptureQueriesContext(connection) as captured:
        data = CanonicalProgramSerializer(page, many=True, context=context).data
        for row in data:
            _ = row["available_offerings"]

    offering_queries = _count_offering_queries(captured)
    assert offering_queries == 0, (
        "R4.4: serializing available_offerings must issue NO per-object offering "
        f"query (offerings come from the prefetch), saw {offering_queries}:\n"
        + "\n".join(
            q["sql"] for q in captured.captured_queries if _primary_table(q["sql"]) == "programs"
        )
    )

    # Sanity: the offerings actually resolved from the prefetch.
    assert all(len(row["available_offerings"]) == 2 for row in data)


# ---------------------------------------------------------------------------
# (b) Constant offering-query count as the program count grows — R4.4
# ---------------------------------------------------------------------------


def test_offering_query_count_is_constant_as_programs_grow():
    """The offering-related query count for a 5-program page equals the count for
    a 2-program page — constant, not N-scaling. With the prefetch fix it is the
    single ``program_set`` prefetch query for the whole page (R4.4)."""
    small = _build_canonical_programs_with_offerings(count=2, offerings_each=2)
    large = _build_canonical_programs_with_offerings(count=5, offerings_each=2)

    small_data, small_page, small_q = _serialize_canonical_list([p.id for p in small])
    large_data, large_page, large_q = _serialize_canonical_list([p.id for p in large])

    # The page sizes are what we asked for (proving the directory query is scoped
    # to each measurement's program ids, not leaking the other measurement's).
    assert len(small_page) == 2
    assert len(large_page) == 5

    # Each canonical program nests its two offerings on both pages.
    assert all(len(row["available_offerings"]) == 2 for row in small_data)
    assert all(len(row["available_offerings"]) == 2 for row in large_data)

    small_offering_queries = _count_offering_queries(small_q)
    large_offering_queries = _count_offering_queries(large_q)

    # Constant: the offering-related query count does not grow with the number of
    # canonical programs on the page.
    assert small_offering_queries == large_offering_queries, (
        "R4.4: offering-related query count scaled with the number of canonical "
        f"programs: 2 programs -> {small_offering_queries}, 5 programs -> "
        f"{large_offering_queries}"
    )
    # With a single ``program_set`` prefetch for the whole page, the offerings
    # load in exactly one query regardless of page size.
    assert large_offering_queries == 1
