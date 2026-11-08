"""R6 exploration: grades can be saved as a partial set, atomically.

Spec: student-journey-repair task 1.6, clause 1.30 (design R6-b, backend half).

At HEAD ``POST /applications/{id}/grades/`` refuses any set below the minimum
(``MINIMUM_SUBJECTS_REQUIRED``), so the wizard cannot autosave grades as the
student types them, and the replace is not atomic: rows outside the new set are
deleted first, then each row is upserted, so a failure midway leaves a mixture.
"""
from __future__ import annotations

from unittest.mock import patch

import pytest
from django.db.models.query import QuerySet
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.documents.models import ApplicationGrade
from tests.tenant_fixtures import build_grades, build_subject, build_tenant_world

pytestmark = pytest.mark.django_db(transaction=True)


def _client(profile, **kwargs) -> APIClient:
    client = APIClient(**kwargs)
    client.force_authenticate(
        user=JWTUser(
            {
                "user_id": str(profile.id),
                "email": profile.email,
                "role": profile.role,
                "first_name": profile.first_name,
                "last_name": profile.last_name,
                "token_type": "access",
            }
        )
    )
    return client


def _rows(subjects, grade):
    return [{"subject_id": str(subject.id), "grade": grade} for subject in subjects]


@pytest.mark.xfail(strict=True, reason="SJR R6: fixed in task 3.23")
def test_a_partial_set_is_accepted_and_stored():
    world = build_tenant_world(application_status="draft")
    subjects = [build_subject() for _ in range(3)]

    response = _client(world.student).post(
        f"/api/v1/applications/{world.application.id}/grades/",
        {"grades": _rows(subjects, 4), "partial": True},
        format="json",
    )

    # HEAD: 400 MINIMUM_SUBJECTS_REQUIRED, so a half-filled grid never autosaves.
    assert response.status_code == 200, response.content
    stored = ApplicationGrade.objects.filter(application_id=world.application.id)
    assert stored.count() == 3
    assert {str(row.subject_id) for row in stored} == {str(s.id) for s in subjects}


@pytest.mark.xfail(strict=True, reason="SJR R6: fixed in task 3.23")
def test_a_failure_midway_leaves_the_previous_set_intact():
    world = build_tenant_world(application_status="draft")
    kept = [build_subject() for _ in range(5)]
    build_grades(application=world.application, subjects=kept, count=5, grade=2)
    before = {
        str(row.subject_id): row.grade
        for row in ApplicationGrade.objects.filter(application_id=world.application.id)
    }
    # Drop the last subject and add a new one, all at a different grade.
    replacement = kept[:4] + [build_subject()]
    real = QuerySet.update_or_create
    calls = {"count": 0}

    def fail_on_third(self, *args, **kwargs):
        calls["count"] += 1
        if calls["count"] == 3:
            raise RuntimeError("database went away mid-replace")
        return real(self, *args, **kwargs)

    client = _client(world.student, raise_request_exception=False)
    with patch.object(QuerySet, "update_or_create", fail_on_third):
        response = client.post(
            f"/api/v1/applications/{world.application.id}/grades/",
            {"grades": _rows(replacement, 7)},
            format="json",
        )

    assert response.status_code >= 500
    after = {
        str(row.subject_id): row.grade
        for row in ApplicationGrade.objects.filter(application_id=world.application.id)
    }
    # HEAD deleted the dropped subject and rewrote two rows before failing.
    assert after == before
