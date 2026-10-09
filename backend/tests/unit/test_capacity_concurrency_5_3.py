"""Concurrent last-seat / withdrawal races (admissions-v2 task 5.3).

Spec:         .kiro/specs/admissions-v2-canonical-rebuild/ — task 5.3
Requirements: R7.6, R7.7, R10.6 · Findings: DATA-02, DATA-03
Design:       design.md §7.3 (Capacity And Waitlist).

Genuinely concurrent proof (Required_Evidence: "concurrent last-seat,
withdrawal, promotion ... tests") that keying capacity on the canonical
Intake_Offering row **and locking it** makes seat allocation correct under
contention:

* ``test_concurrent_last_seat_never_exceeds_capacity`` — N parallel submissions
  race for the last seat of a capacity-limited offering; the ``ProgramIntake``
  row lock in ``CapacityService.take_seat_for_submission`` serializes them so
  *exactly* ``capacity`` submits win and the counter equals ``capacity`` — never
  more (DATA-03).
* ``test_concurrent_withdrawal_decrement_never_goes_negative`` — N parallel
  withdrawals of distinct occupying applications drive the counter down by
  exactly N with a non-negative floor, keyed on the canonical IDs (DATA-02).

Real row-level locking requires PostgreSQL (``SELECT ... FOR UPDATE`` is a no-op
on SQLite), so — like ``test_reviewer_assignment_concurrency`` and
``test_integrity_constraints_3_3`` — these skip on the SQLite fast suite with a
clear reason and run on the Postgres CI profile.

**Validates: Requirements R7.6, R7.7, R10.6**
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor

import pytest
from django.db import connection

from apps.applications.models import Application
from apps.applications.services import ApplicationSubmissionError, submit_application
from apps.applications.withdrawal_service import WithdrawalService
from apps.catalog.models import ProgramIntake
from tests.tenant_fixtures import (
    build_application,
    build_canonical_program,
    build_institution,
    build_intake,
    build_offering,
    build_profile,
    build_program_intake,
)

pytestmark = pytest.mark.skipif(
    connection.vendor != "postgresql",
    reason="Concurrent last-seat/withdrawal races require PostgreSQL row locks "
    "(SELECT ... FOR UPDATE is a no-op on SQLite).",
)


def _build_offering_world(*, capacity: int | None):
    institution = build_institution()
    canonical = build_canonical_program()
    offering = build_offering(institution=institution, canonical_program=canonical)
    intake = build_intake(max_capacity=None)
    program_intake = build_program_intake(
        offering=offering, intake=intake, max_capacity=capacity
    )
    return institution, canonical, offering, intake, program_intake


def _draft(student, institution, canonical, offering, intake):
    return build_application(
        student=student,
        institution=institution,
        canonical_program=canonical,
        offering=offering,
        intake=intake,
        status="draft",
    )


@pytest.mark.django_db(transaction=True)
def test_concurrent_last_seat_never_exceeds_capacity():
    """N concurrent admin-force submits fill EXACTLY `capacity` seats."""
    capacity = 3
    workers = 8
    institution, canonical, offering, intake, program_intake = _build_offering_world(
        capacity=capacity
    )
    admin_id = str(build_profile(role="super_admin").id)
    students = [build_profile(role="student") for _ in range(workers)]
    app_ids = [
        str(_draft(students[i], institution, canonical, offering, intake).id)
        for i in range(workers)
    ]

    successes = [0]
    capacity_rejections = [0]
    import threading

    barrier = threading.Barrier(workers)
    lock = threading.Lock()

    def worker(app_id: str):
        from django.db import connection as tconn

        try:
            barrier.wait(timeout=15)
            app = Application.objects.get(id=app_id)
            try:
                # admin_force bypasses payment/document/revalidation gates but
                # still runs the locked last-seat capacity guard.
                submit_application(application=app, changed_by=admin_id, admin_force=True)
                with lock:
                    successes[0] += 1
            except ApplicationSubmissionError as exc:
                if exc.code in ("PROGRAM_CAPACITY_REACHED", "INTAKE_CAPACITY_REACHED"):
                    with lock:
                        capacity_rejections[0] += 1
                else:  # pragma: no cover - surfaced in the assertion below
                    raise
        finally:
            tconn.close()

    try:
        with ThreadPoolExecutor(max_workers=workers) as pool:
            list(pool.map(worker, app_ids))

        # Exactly `capacity` submissions won a seat; the rest were rejected for
        # capacity — never more than capacity submitted (DATA-03).
        assert successes[0] == capacity, (
            f"expected {capacity} winners, got {successes[0]}"
        )
        assert capacity_rejections[0] == workers - capacity
        submitted = Application.objects.filter(
            id__in=app_ids, status="submitted"
        ).count()
        assert submitted == capacity
        program_intake.refresh_from_db()
        assert program_intake.current_enrollment == capacity
    finally:
        # transaction=True commits rows; clean up so later tests are unaffected.
        Application.objects.filter(id__in=app_ids).delete()


@pytest.mark.django_db(transaction=True)
def test_concurrent_withdrawal_decrement_never_goes_negative():
    """N concurrent withdrawals decrement the canonical counter by exactly N."""
    workers = 6
    institution, canonical, offering, intake, program_intake = _build_offering_world(
        capacity=100
    )
    students = [build_profile(role="student") for _ in range(workers)]
    apps = [
        build_application(
            student=students[i],
            institution=institution,
            canonical_program=canonical,
            offering=offering,
            intake=intake,
            status="submitted",
        )
        for i in range(workers)
    ]
    app_ids = [str(a.id) for a in apps]
    # Start the counter at exactly the number of occupying rows.
    ProgramIntake.objects.filter(id=program_intake.id).update(current_enrollment=workers)

    import threading

    barrier = threading.Barrier(workers)

    def worker(app_id: str):
        from django.db import connection as tconn

        try:
            barrier.wait(timeout=15)
            WithdrawalService.withdraw(
                application_id=app_id,
                user_id=str(Application.objects.get(id=app_id).user_id),
                reason="Concurrent withdrawal race test reason.",
            )
        finally:
            tconn.close()

    try:
        with ThreadPoolExecutor(max_workers=workers) as pool:
            list(pool.map(worker, app_ids))

        assert (
            Application.objects.filter(id__in=app_ids, status="withdrawn").count()
            == workers
        )
        program_intake.refresh_from_db()
        # Decremented by exactly N, floored at 0 — never negative.
        assert program_intake.current_enrollment == 0
    finally:
        Application.objects.filter(id__in=app_ids).delete()
