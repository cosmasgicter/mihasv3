"""``ocr_available`` on the required-documents contract (platform-simplification task 18.2).

Decision D4 option B, Requirements 11.1 and 11.3: the contract tells the wizard
whether the application's institution has opted in to OCR, so the wizard calls
the extract endpoint and polls only where OCR is on. The rest of the contract
(requirement rows, policy, upload validation) is unchanged (R22.12).
"""

from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.applications.required_documents import build_contract
from tests.ocr_fixtures import opt_in_ocr
from tests.tenant_fixtures import build_institution, build_tenant_world


def _client_for(profile) -> APIClient:
    client = APIClient()
    client.force_authenticate(
        user=JWTUser(
            {
                "user_id": str(profile.id),
                "email": profile.email,
                "role": profile.role,
                "first_name": profile.first_name,
                "last_name": profile.last_name,
            }
        )
    )
    return client


@pytest.mark.django_db
def test_contract_says_ocr_is_off_by_default():
    world = build_tenant_world(application_status="draft")
    assert build_contract(world.application)["ocr_available"] is False


@pytest.mark.django_db
def test_contract_says_ocr_is_on_only_for_an_opted_in_institution():
    world = build_tenant_world(application_status="draft")
    opt_in_ocr(build_institution())
    assert build_contract(world.application)["ocr_available"] is False
    opt_in_ocr(world.institution)
    assert build_contract(world.application)["ocr_available"] is True


@pytest.mark.django_db
def test_the_student_endpoint_publishes_the_field():
    world = build_tenant_world(application_status="draft")
    client = _client_for(world.student)
    url = f"/api/v1/applications/{world.application.id}/required-documents/"

    off = client.get(url)
    assert off.status_code == 200, off.content
    assert off.json()["data"]["ocr_available"] is False

    opt_in_ocr(world.institution)
    on = client.get(url)
    assert on.json()["data"]["ocr_available"] is True
    # Nothing else in the contract depends on the opt-in.
    for field in ("requirements", "missing_required", "satisfied", "policy"):
        assert on.json()["data"][field] == off.json()["data"][field]
