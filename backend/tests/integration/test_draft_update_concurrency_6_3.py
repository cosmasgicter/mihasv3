"""Integration contract for canonical student draft PATCH concurrency.

Admissions V2 task 6.3 / R10.3: every draft update carries an idempotency key
and the version the student last read. The command advances exactly once,
replays exactly once, and never lets a stale browser overwrite a newer answer.
"""

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from django.db import close_old_connections, connection, connections

from apps.applications.models import Application
from tests.integration.test_draft_start_list_rename_6_2 import (
    DRAFTS_URL,
    _build_two_offering_world,
    _client,
    _start_payload,
)

pytestmark = pytest.mark.django_db


def _start_draft():
    world = _build_two_offering_world()
    client = _client(world.student)
    response = client.post(
        DRAFTS_URL,
        _start_payload(
            world,
            program=world.program_a,
            intake=world.intake_a,
            email="draft-update@example.com",
        ),
        format="json",
    )
    assert response.status_code == 201, response.json()
    application = Application.objects.get(id=response.json()["data"]["id"])
    return client, application


def _update_url(application_id) -> str:
    return f"/api/v1/applications/drafts/{application_id}/"


class TestDraftUpdatePreconditions:
    def test_missing_idempotency_key_is_stable_and_does_not_mutate(self):
        client, application = _start_draft()
        before_version = application.version
        before_town = application.residence_town

        response = client.patch(
            _update_url(application.id),
            {"residence_town": "Kitwe", "expected_version": before_version},
            format="json",
        )

        assert response.status_code == 400
        assert response.json()["code"] == "IDEMPOTENCY_KEY_REQUIRED"
        application.refresh_from_db()
        assert application.version == before_version
        assert application.residence_town == before_town

    def test_missing_expected_version_is_stable_and_does_not_mutate(self):
        client, application = _start_draft()
        before_version = application.version
        before_town = application.residence_town

        response = client.patch(
            _update_url(application.id),
            {"residence_town": "Kitwe"},
            format="json",
            HTTP_IDEMPOTENCY_KEY="draft-update-missing-version",
        )

        assert response.status_code == 400
        assert response.json()["code"] == "EXPECTED_VERSION_REQUIRED"
        application.refresh_from_db()
        assert application.version == before_version
        assert application.residence_town == before_town

    def test_stale_version_returns_current_version_and_does_not_mutate(self):
        client, application = _start_draft()
        before_version = application.version
        before_town = application.residence_town

        response = client.patch(
            _update_url(application.id),
            {"residence_town": "Kitwe", "expected_version": before_version + 7},
            format="json",
            HTTP_IDEMPOTENCY_KEY="draft-update-stale",
        )

        assert response.status_code == 409
        assert response.json()["code"] == "VERSION_CONFLICT"
        assert response.json()["current_version"] == before_version
        application.refresh_from_db()
        assert application.version == before_version
        assert application.residence_town == before_town


class TestDraftUpdateIdempotency:
    def test_same_key_replay_bumps_version_once(self):
        client, application = _start_draft()
        before_version = application.version
        payload = {"residence_town": "Kitwe", "expected_version": before_version}
        request = {
            "path": _update_url(application.id),
            "data": payload,
            "format": "json",
            "HTTP_IDEMPOTENCY_KEY": "draft-update-replay",
        }

        first = client.patch(**request)
        second = client.patch(**request)

        assert first.status_code == 200, first.json()
        assert second.status_code == 200, second.json()
        assert first.json() == second.json()
        assert first.json()["data"]["version"] == before_version + 1
        application.refresh_from_db()
        assert application.version == before_version + 1
        assert application.residence_town == "Kitwe"

    def test_same_key_with_different_body_conflicts_without_second_mutation(self):
        client, application = _start_draft()
        before_version = application.version
        url = _update_url(application.id)

        first = client.patch(
            url,
            {"residence_town": "Kitwe", "expected_version": before_version},
            format="json",
            HTTP_IDEMPOTENCY_KEY="draft-update-body-mismatch",
        )
        second = client.patch(
            url,
            {"residence_town": "Ndola", "expected_version": before_version},
            format="json",
            HTTP_IDEMPOTENCY_KEY="draft-update-body-mismatch",
        )

        assert first.status_code == 200, first.json()
        assert second.status_code == 409
        assert second.json()["code"] == "IDEMPOTENCY_CONFLICT"
        application.refresh_from_db()
        assert application.version == before_version + 1
        assert application.residence_town == "Kitwe"


@pytest.mark.django_db(transaction=True)
def test_two_distinct_commands_from_the_same_version_have_exactly_one_winner():
    """The PostgreSQL row lock closes the real two-tab lost-update race."""

    if connection.vendor != "postgresql":
        pytest.skip("row-lock concurrency is verified on PostgreSQL")

    world = _build_two_offering_world()
    owner_client = _client(world.student)
    started = owner_client.post(
        DRAFTS_URL,
        _start_payload(
            world,
            program=world.program_a,
            intake=world.intake_a,
            email="draft-update-race@example.com",
        ),
        format="json",
        HTTP_IDEMPOTENCY_KEY="draft-update-race-start",
    )
    assert started.status_code == 201, started.json()
    application_id = started.json()["data"]["id"]
    before_version = started.json()["data"]["version"]
    barrier = Barrier(2)

    def write(town: str, key: str):
        close_old_connections()
        try:
            client = _client(world.student)
            barrier.wait(timeout=10)
            response = client.patch(
                _update_url(application_id),
                {"residence_town": town, "expected_version": before_version},
                format="json",
                HTTP_IDEMPOTENCY_KEY=key,
            )
            return response.status_code, response.json()
        finally:
            # Thread-local PostgreSQL connections are not reclaimed by
            # ``close_old_connections`` while they remain healthy. Close them
            # explicitly so Django can drop the transactional test database.
            connections.close_all()

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(
            pool.map(
                lambda args: write(*args),
                [("Kitwe", "draft-race-a"), ("Ndola", "draft-race-b")],
            )
        )

    assert sorted(status_code for status_code, _body in results) == [200, 409]
    loser = next(body for status_code, body in results if status_code == 409)
    assert loser["code"] == "VERSION_CONFLICT"
    assert loser["current_version"] == before_version + 1

    application = Application.objects.get(id=application_id)
    winner = next(body for status_code, body in results if status_code == 200)
    assert application.version == before_version + 1
    assert application.residence_town == winner["data"]["residence_town"]
