"""Query-count regression for the admin dashboard aggregate refactor (task 5.3).

Feature: system-performance-hardening, Requirement 2.6 (R2(a) in design.md).

The pre-feature ``AdminDashboardView.get`` issued 12+ separate ``.count()`` /
``values_list().annotate(Count(...))`` round-trips (per-status counts plus
``today_created`` / ``today_submitted`` / today-week-month activity totals,
plus total/active users, plus the needs-attention payment/document/interview
counts). The R2.5 refactor collapses the **application + user aggregate block**
into exactly three count/aggregate queries over the already-scoped querysets:

1. a single ``status`` GROUP BY (``values_list("status").annotate(Count("id"))``)
   that reproduces the dynamic ``by_status`` keys faithfully;
2. a single application conditional-count ``aggregate(...)`` (grand total +
   today/week/month buckets via ``Count("id", filter=Q(...))``); and
3. a single user conditional-count ``aggregate(...)`` (total + active).

Design ``R2(a)`` states that block reaches the ``≤3 count/aggregate queries``
target (R2.6). The needs-attention block still issues separate ``.count()``
calls against the **other** tables (``payments`` pending, ``application_documents``
pending, ``application_interviews`` upcoming) because those target different
tables and are not part of the collapsed application/user aggregate; design
``R2(a)`` explicitly notes "the non-application aggregates that target other
tables ... remain". So this regression asserts the bound the implementation
actually targets and the design documents: the count/aggregate queries against
the ``applications`` and ``profiles`` tables (the collapsed block) are ``≤3``,
and the grand total of count/aggregate queries stays far below the pre-feature
12+ (it is the collapsed 3 + the 3 needs-attention table counts).

The dashboard cache flag stays OFF (``PERF_CACHE_DASHBOARD`` default ``False``),
so this measures the always-on conditional-count refactor and not a cache hit.
"""

from __future__ import annotations

import re
import uuid

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIRequestFactory, force_authenticate

pytestmark = pytest.mark.django_db


class _JWTUser:
    """Minimal JWT-style principal (mirrors test_perf_golden_snapshots)."""

    is_authenticated = True

    def __init__(self, role: str, user_id):
        self.role = role
        self.id = user_id
        self.pk = user_id


_COUNT_RE = re.compile(r"\bCOUNT\s*\(", re.IGNORECASE)
# Match the table immediately after FROM so we classify the query by its
# primary relation rather than any joined/sub-selected table.
_FROM_TABLE_RE = re.compile(r'\bFROM\s+"?(?P<table>[a-z_]+)"?', re.IGNORECASE)


def _count_queries(captured):
    """Return the COUNT/aggregate SQL statements from a CaptureQueriesContext."""
    return [q["sql"] for q in captured.captured_queries if _COUNT_RE.search(q["sql"])]


def _primary_table(sql: str) -> str:
    match = _FROM_TABLE_RE.search(sql)
    return match.group("table").lower() if match else ""


def _call_dashboard(user, query: dict | None = None):
    from apps.accounts.admin_user_views import AdminDashboardView

    request = APIRequestFactory().get("/api/v1/admin/dashboard/", query or {})
    force_authenticate(request, user=user)
    return AdminDashboardView.as_view()(request)


def _seed_dashboard_world():
    """Populate applications (several statuses), payments, and users."""
    from tests.tenant_fixtures import build_application, build_payment, build_tenant_world

    world = build_tenant_world(with_application=False)

    statuses = ["submitted", "submitted", "under_review", "approved", "rejected"]
    apps = []
    for status_value in statuses:
        app = build_application(
            student=world.student,
            institution=world.institution,
            canonical_program=world.canonical_program,
            offering=world.offering,
            intake=world.intake,
            suffix=f"{status_value}-{uuid.uuid4().hex[:6]}",
            status=status_value,
        )
        apps.append(app)

    # A couple of payments so the recent-activity / needs-attention paths have rows.
    build_payment(application=apps[0], status="successful")
    build_payment(application=apps[1], status="pending")

    return world


@pytest.mark.django_db
def test_dashboard_collapsed_aggregate_block_is_at_most_three(settings):
    """R2.6: the collapsed application+user aggregate block issues <=3 count/aggregate queries."""
    # Keep the always-on refactor under test (not a cache hit).
    settings.PERF_CACHE_DASHBOARD = False

    _seed_dashboard_world()

    with CaptureQueriesContext(connection) as captured:
        response = _call_dashboard(_JWTUser("super_admin", uuid.uuid4()))

    assert response.status_code == 200, response.data

    count_sqls = _count_queries(captured)

    # The collapsed application + user aggregate block: count/aggregate queries
    # whose primary relation is the applications or profiles table. R2.5 brings
    # this block from 12+ down to exactly the status GROUP BY + application
    # aggregate + user aggregate (<=3).
    collapsed_block = [
        sql for sql in count_sqls if _primary_table(sql) in {"applications", "profiles"}
    ]

    assert len(collapsed_block) <= 3, (
        "R2.6: the collapsed application+user aggregate block must issue <=3 "
        f"count/aggregate queries, saw {len(collapsed_block)}:\n"
        + "\n".join(collapsed_block)
    )

    # Regression floor: the grand total of count/aggregate queries must stay far
    # below the pre-feature 12+. With the refactor it is the collapsed <=3 plus
    # the three needs-attention table counts (payments / documents / interviews),
    # so <=6 in total. This documents R2(a)'s "other-table aggregates remain".
    assert len(count_sqls) <= 6, (
        "Total count/aggregate queries regressed above the post-refactor bound "
        f"(expected <=6, pre-feature was 12+), saw {len(count_sqls)}:\n"
        + "\n".join(count_sqls)
    )
