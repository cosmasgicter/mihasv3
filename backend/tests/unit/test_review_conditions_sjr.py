"""R7-c: the review command requires conditions for ``conditionally_approved``.

Spec: student-journey-repair task 5.3 (design R7-c, clause 2.38, preservation 3.20).
Emails and codes are fictional.
"""
from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.applications.models import Application
from apps.catalog.services import AccessScopeService
from tests.tenant_fixtures import build_membership, build_profile, build_tenant_world

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture(autouse=True)
def production_scope(monkeypatch):
    monkeypatch.setattr(AccessScopeService, "_test_settings_active", staticmethod(lambda: False))


def _setup():
    world = build_tenant_world(application_status="under_review")
    Application.objects.filter(id=world.application.id).update(payment_status="verified")
    admin = build_profile(role="admin")
    build_membership(user=admin, institution=world.institution, role="admin", permissions=["review"])
    client = APIClient()
    client.force_authenticate(
        user=JWTUser(
            {
                "user_id": str(admin.id),
                "email": admin.email,
                "role": "admin",
                "first_name": admin.first_name,
                "last_name": admin.last_name,
                "token_type": "access",
            }
        )
    )
    return world, client


def _post(world, client, payload):
    return client.post(
        f"/api/v1/applications/{world.application.id}/review/",
        {"new_status": "conditionally_approved", **payload},
        format="json",
    )


def _unchanged(world):
    world.application.refresh_from_db()
    return world.application.status == "under_review"


def test_empty_list_is_refused_and_nothing_is_written():
    world, client = _setup()
    response = _post(world, client, {"conditions": []})
    assert response.status_code == 400
    assert response.json()["code"] == "NO_CONDITIONS_PROVIDED"
    assert _unchanged(world)


@pytest.mark.parametrize("bad", ["a string", {"description": "x"}, ["not an object"], [{"description": 5}]])
def test_a_malformed_payload_is_a_validation_error(bad):
    world, client = _setup()
    response = _post(world, client, {"conditions": bad})
    assert response.status_code == 400
    body = response.json()
    assert body["code"] == "VALIDATION_ERROR"
    assert "conditions" in body["details"]
    assert _unchanged(world)


def test_more_than_ten_conditions_are_refused():
    world, client = _setup()
    conditions = [{"description": f"Condition {i}", "deadline": "2099-01-01"} for i in range(11)]
    response = _post(world, client, {"conditions": conditions})
    assert response.status_code == 400
    assert response.json()["code"] == "TOO_MANY_CONDITIONS"
    assert _unchanged(world)


def test_valid_conditions_still_assign_through_the_condition_manager():
    world, client = _setup()
    response = _post(
        world,
        client,
        {"conditions": [{"description": "Submit a certified transcript", "deadline": "2099-01-01"}]},
    )
    assert response.status_code == 200, response.content
    world.application.refresh_from_db()
    assert world.application.status == "conditionally_approved"
