"""Concurrent auto-assignment: workload-counter locking + eligibility.

Admissions V2 canonical rebuild — task 2.5 (finding AUTH-03), design §5.3:
"Auto-assignment selects only from the same set [tenant-eligible reviewers]
and locks workload counters."

This proves, under genuine parallelism, that:

* concurrent ``auto_assign`` runs never push a reviewer past
  ``max_reviewer_workload`` (the reviewer ``Profile`` row is the workload
  counter lock, acquired in the fixed order application -> reviewer), and
* a reviewer without an active membership in the application's tenant is never
  auto-assigned, even under concurrency (eligibility is enforced inside the
  same locked transaction).

Real row-level locking requires PostgreSQL, so — like the repo's other
lock/constraint tests (``test_apply_sql_migrations``) — this is guarded with
``skipif(connection.vendor != 'postgresql')``. The V2 CI profile runs the
backend suite on PostgreSQL, so this test runs there without any environment
or credential gating; the SQLite fast suite (where ``SELECT ... FOR UPDATE`` is
a no-op) skips it with a clear reason instead of asserting a false guarantee.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor

import pytest
from django.db import connection

from apps.applications.models import Application
from apps.applications.reviewer_assignment_service import ReviewerAssignmentService
from tests.tenant_fixtures import (
    build_application,
    build_profile,
    build_tenant_world,
)

pytestmark = pytest.mark.skipif(
    connection.vendor != "postgresql",
    reason="Concurrent workload-counter locking requires PostgreSQL row locks "
    "(SELECT ... FOR UPDATE is a no-op on SQLite).",
)


def _run_auto_assign(actor_id, max_workload):
    """Thread worker: run one auto-assign pass, then close the thread's conn."""
    from django.db import connection as thread_connection

    try:
        return ReviewerAssignmentService.auto_assign(
            actor_id=actor_id, max_workload=max_workload
        )
    finally:
        thread_connection.close()


@pytest.mark.django_db(transaction=True)
def test_concurrent_auto_assign_never_exceeds_max_workload():
    """N parallel auto-assign runs fill one reviewer to EXACTLY max_workload."""
    max_workload = 3
    total_apps = 8
    threads = 4

    world = build_tenant_world(
        with_application=False, staff_role="reviewer"
    )
    reviewer = world.staff  # role=reviewer + active membership → the only eligible one

    app_ids = [
        build_application(
            student=world.student,
            institution=world.institution,
            canonical_program=world.canonical_program,
            offering=world.offering,
            intake=world.intake,
            status="submitted",
        ).id
        for _ in range(total_apps)
    ]

    # ``auto_assign`` is a *global* sweep — it takes every unassigned
    # submitted/under_review application, not only this test's. Under
    # ``transaction=True`` the whole tree's earlier rows can still be present, so
    # the reported counts below are measured as a delta against the population the
    # sweep can actually see rather than against this test's own row count.
    assigned_before = Application.objects.filter(
        assigned_reviewer_id__isnull=False
    ).count()

    with ThreadPoolExecutor(max_workers=threads) as pool:
        results = list(
            pool.map(
                lambda _: _run_auto_assign(str(world.staff.id), max_workload),
                range(threads),
            )
        )

    # Invariant: the reviewer is never pushed past max_workload, despite the
    # concurrent runs. Exactly max_workload of our applications are assigned.
    assigned_to_reviewer = Application.objects.filter(
        assigned_reviewer_id=reviewer.id, id__in=app_ids
    ).count()
    assert assigned_to_reviewer == max_workload, (
        f"expected {max_workload} assigned, got {assigned_to_reviewer}"
    )

    total_assigned = Application.objects.filter(
        id__in=app_ids, assigned_reviewer_id__isnull=False
    ).count()
    assert total_assigned == max_workload

    # The concurrent runs' own report agrees with what actually changed. This used
    # to compare the reported sum to ``max_workload``, which is a *local* number
    # while ``assigned_count`` is a *global* one: the sweep has no id filter, so any
    # unassigned application left in the database by an earlier test is legitimately
    # claimed too (by its own tenant's reviewer) and the sum ran ahead — 8 against 3
    # in every whole-tree recording, while passing in isolation. The two assertions
    # above already carry the max_workload invariant, scoped with ``id__in=app_ids``.
    # What this third one adds is that the runs do not over- or under-report, and a
    # delta states that without depending on the database being otherwise empty.
    assigned_after = Application.objects.filter(
        assigned_reviewer_id__isnull=False
    ).count()
    assert sum(r["assigned_count"] for r in results) == assigned_after - assigned_before


@pytest.mark.django_db(transaction=True)
def test_concurrent_auto_assign_never_selects_non_member():
    """An ineligible (non-member) reviewer is never assigned under concurrency."""
    max_workload = 10
    total_apps = 6
    threads = 3

    world = build_tenant_world(
        with_application=False, staff_role="reviewer"
    )
    eligible = world.staff  # member of the tenant
    outsider = build_profile(role="reviewer")  # NO membership anywhere → ineligible

    app_ids = [
        build_application(
            student=world.student,
            institution=world.institution,
            canonical_program=world.canonical_program,
            offering=world.offering,
            intake=world.intake,
            status="submitted",
        ).id
        for _ in range(total_apps)
    ]

    with ThreadPoolExecutor(max_workers=threads) as pool:
        list(
            pool.map(
                lambda _: _run_auto_assign(str(world.staff.id), max_workload),
                range(threads),
            )
        )

    # Every application is assigned (capacity is ample) and only ever to the
    # tenant-eligible reviewer — never to the non-member outsider.
    assigned = Application.objects.filter(id__in=app_ids, assigned_reviewer_id__isnull=False).count()
    assert assigned == total_apps
    assert (
        Application.objects.filter(id__in=app_ids, assigned_reviewer_id=outsider.id).count()
        == 0
    )
    assert (
        Application.objects.filter(id__in=app_ids, assigned_reviewer_id=eligible.id).count()
        == total_apps
    )
