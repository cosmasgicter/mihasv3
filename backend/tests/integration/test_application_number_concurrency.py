"""Application numbers under concurrent creates (problem 4, finish-2026-11-21).

A harness run logged ``next_application_number SQL helper unavailable, falling
back to count+attempt`` and then answered ``POST /api/v1/applications/`` with a
500: an ``IntegrityError`` on ``applications_application_number_key`` while a
spec created applications concurrently. Three causes, each pinned here against
real PostgreSQL with one connection per concurrent request:

1. Databases built from the models (the harness and this test database) never
   ran ``backend/scripts/application_number_sequences.sql``, so the helper did not
   exist there. ``apps.common.runtime_sql_functions`` now installs it from that
   script for both builds.
2. The helper's own first use of a new (code, year) raced. ``CREATE SEQUENCE IF
   NOT EXISTS`` fails in every concurrent caller but one, the application read
   that as "helper unavailable" and fell back. Fixed by
   ``application_number_sequences_race_safe.sql``.
3. The count-based fallback gives concurrent creates the same number, and the
   second insert failed. ``_create_application_with_number`` now retries on that
   one constraint with a fresh number, a bounded number of times.

Each concurrent test lines its requests up on a barrier at the exact point the
race needs: just before the helper call (cause 2), or just after every request
has drawn its number and before any has inserted it (cause 3).
"""

from __future__ import annotations

import logging
import threading
from datetime import date

import pytest
from django.db import IntegrityError, connection, connections
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.applications import _view_helpers
from apps.applications.models import Application
from tests.tenant_fixtures import build_application, build_profile, build_tenant_world

pytestmark = [
    pytest.mark.django_db(transaction=True),
    pytest.mark.skipif(
        connection.vendor != "postgresql",
        reason="the allocation helper and the races are PostgreSQL behaviour",
    ),
]

HELPER_UNAVAILABLE = "next_application_number SQL helper unavailable"
NUMBER_TAKEN = "application number already taken"
BARRIER_TIMEOUT_SECONDS = 60


class _Records(logging.Handler):
    """Collects the allocation path's log messages from every thread."""

    def __init__(self) -> None:
        super().__init__(level=logging.WARNING)
        self.messages: list[str] = []

    def emit(self, record: logging.LogRecord) -> None:
        self.messages.append(record.getMessage())

    def count(self, fragment: str) -> int:
        return sum(fragment in message for message in self.messages)


@pytest.fixture
def allocation_log():
    logger = logging.getLogger(_view_helpers.__name__)
    handler = _Records()
    logger.addHandler(handler)
    try:
        yield handler
    finally:
        logger.removeHandler(handler)


def _client_for(student) -> APIClient:
    client = APIClient()
    client.force_authenticate(
        user=JWTUser(
            {
                "user_id": str(student.id),
                "email": student.email,
                "role": student.role,
                "first_name": student.first_name,
                "last_name": student.last_name,
                "token_type": "access",
            }
        )
    )
    return client


def _payload(world, index: int) -> dict:
    """A valid program-first create, distinct per applicant (no duplicate hits)."""
    return {
        "full_name": f"Concurrent Applicant {index}",
        "nrc_number": f"{100000 + index}/26/1",
        "date_of_birth": "2000-01-01",
        "sex": "female",
        "phone": f"+26097{index:07d}",
        "email": f"concurrent-{index}@example.com",
        "residence_town": "Lusaka",
        "country": "Zambia",
        "nationality": "Zambian",
        "program_id": world.canonical_program_id,
        "intake_id": world.intake_id,
    }


def _create_concurrently(world, count: int) -> list:
    """POST ``count`` creates from ``count`` threads, one student each."""
    students = [build_profile(role="student") for _ in range(count)]
    results: list = [None] * count

    def create(index: int) -> None:
        try:
            response = _client_for(students[index]).post(
                "/api/v1/applications/", _payload(world, index), format="json"
            )
            results[index] = (response.status_code, response.json())
        except BaseException as exc:  # noqa: BLE001 - surfaced by the assertions
            results[index] = exc
        finally:
            connections.close_all()

    threads = [threading.Thread(target=create, args=(i,)) for i in range(count)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    return results


def _assert_all_created(results: list) -> list[str]:
    failures = [r for r in results if not (isinstance(r, tuple) and r[0] == 201)]
    assert failures == [], f"concurrent creates did not all succeed: {failures!r}"
    return [body["data"]["application_number"] for _, body in results]


def _expected_numbers(world, count: int) -> set[str]:
    prefix = f"{world.institution.code.upper()}{timezone.now().year}"
    return {f"{prefix}{n:05d}" for n in range(1, count + 1)}


def test_the_helper_exists_in_a_database_built_from_the_models():
    """Cause 1: the test database is built from the models, as the harness's is."""
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT count(*) FROM pg_proc WHERE proname = 'next_application_number'"
        )
        assert cursor.fetchone()[0] == 1


def test_concurrent_first_use_of_a_new_code_takes_numbers_from_the_sequence(
    monkeypatch, allocation_log
):
    """Cause 2: eight creates reach the helper at once for a code it has never seen.

    Before the race-safe helper, seven of them failed inside ``CREATE SEQUENCE IF
    NOT EXISTS``, fell back to counting rows, and collided on the insert.
    """
    world = build_tenant_world(with_application=False)
    workers = 8
    barrier = threading.Barrier(workers, timeout=BARRIER_TIMEOUT_SECONDS)
    real_generate = _view_helpers._generate_application_number

    def generate_together(institution_name=""):
        barrier.wait()
        return real_generate(institution_name)

    monkeypatch.setattr(
        "apps.applications.admin_review_views._generate_application_number",
        generate_together,
    )

    numbers = _assert_all_created(_create_concurrently(world, workers))

    assert set(numbers) == _expected_numbers(world, workers), sorted(numbers)
    assert allocation_log.count(HELPER_UNAVAILABLE) == 0, allocation_log.messages
    assert allocation_log.count(NUMBER_TAKEN) == 0, allocation_log.messages
    assert Application.objects.filter(
        application_number__in=numbers
    ).count() == workers


def test_concurrent_creates_on_the_count_fallback_all_succeed(monkeypatch, allocation_log):
    """Cause 3: with no helper, concurrent creates are handed the same number.

    The barrier holds every request after it has drawn its count-based number
    and before any of them inserts, so all of them hold ``...00001``. Exactly
    ``APPLICATION_NUMBER_INSERT_ATTEMPTS`` requests compete: each collision means
    another request succeeded with that number, so none needs more attempts.
    """
    world = build_tenant_world(with_application=False)
    workers = _view_helpers.APPLICATION_NUMBER_INSERT_ATTEMPTS
    barrier = threading.Barrier(workers, timeout=BARRIER_TIMEOUT_SECONDS)
    real_tracking_code = _view_helpers._generate_tracking_code

    def tracking_code_together(institution_name=""):
        # Called right after the application number is drawn (create_kwargs).
        barrier.wait()
        return real_tracking_code(institution_name)

    monkeypatch.setattr(
        "apps.applications.admin_review_views._generate_tracking_code",
        tracking_code_together,
    )

    with connection.cursor() as cursor:
        cursor.execute(
            "ALTER FUNCTION next_application_number(text, integer) "
            "RENAME TO next_application_number_hidden_by_test"
        )
    try:
        numbers = _assert_all_created(_create_concurrently(world, workers))
    finally:
        with connection.cursor() as cursor:
            cursor.execute(
                "ALTER FUNCTION next_application_number_hidden_by_test(text, integer) "
                "RENAME TO next_application_number"
            )

    assert set(numbers) == _expected_numbers(world, workers), sorted(numbers)
    # The path under test really ran: every request fell back, and the first
    # round of inserts collided for all but one of them.
    assert allocation_log.count(HELPER_UNAVAILABLE) >= workers, allocation_log.messages
    assert allocation_log.count(NUMBER_TAKEN) >= workers - 1, allocation_log.messages


def test_the_retry_recognises_only_the_application_number_constraint():
    """The retry keys on the real PostgreSQL constraint name, and nothing else."""
    world = build_tenant_world(with_application=False)
    first = build_application(
        student=world.student,
        institution=world.institution,
        canonical_program=world.canonical_program,
        offering=world.offering,
        intake=world.intake,
    )

    with pytest.raises(IntegrityError) as duplicate_number:
        build_application(
            student=build_profile(role="student"),
            institution=world.institution,
            canonical_program=world.canonical_program,
            offering=world.offering,
            intake=world.intake,
            application_number=first.application_number,
        )
    assert _view_helpers._is_application_number_conflict(duplicate_number.value)

    with pytest.raises(IntegrityError) as duplicate_tracking_code:
        build_application(
            student=build_profile(role="student"),
            institution=world.institution,
            canonical_program=world.canonical_program,
            offering=world.offering,
            intake=world.intake,
            public_tracking_code=first.public_tracking_code,
        )
    assert not _view_helpers._is_application_number_conflict(duplicate_tracking_code.value)


def test_a_retried_create_keeps_every_other_field(monkeypatch):
    """A retry changes the number and nothing else in the row it inserts."""
    world = build_tenant_world(with_application=False)
    taken = build_application(
        student=world.student,
        institution=world.institution,
        canonical_program=world.canonical_program,
        offering=world.offering,
        intake=world.intake,
    )
    student = build_profile(role="student")
    create_kwargs = {
        "user_id": str(student.id),
        "application_number": taken.application_number,
        "public_tracking_code": "TRK-RETRYKEEPS01",
        "full_name": "Retry Applicant",
        "nrc_number": "",
        "passport_number": "",
        "date_of_birth": date(2000, 1, 1),
        "sex": "female",
        "phone": "+260970000123",
        "email": "retry-applicant@example.com",
        "residence_town": "Lusaka",
        "country": "Zambia",
        "nationality": "Zambian",
        "program": world.canonical_program.name,
        "intake": world.intake.name,
        "institution": world.institution.name,
        "status": "draft",
        "version": 1,
    }

    application = _view_helpers._create_application_with_number(
        create_kwargs, world.institution.name
    )

    assert application.application_number != taken.application_number
    assert application.application_number.startswith(
        f"{world.institution.code.upper()}{timezone.now().year}"
    )
    stored = Application.objects.get(pk=application.pk)
    assert stored.public_tracking_code == "TRK-RETRYKEEPS01"
    assert stored.email == "retry-applicant@example.com"
    assert str(stored.user_id) == str(student.id)
    # The caller's dict is not rewritten behind its back.
    assert create_kwargs["application_number"] == taken.application_number
