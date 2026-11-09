"""R7-d: a letter the school has not set up reads ``setup_required``.

Spec: student-journey-repair task 5.4 (design R7-d; D9 confirmed 2026-11-08,
option C; clauses 2.39, 2.40, 3.13). Fictional data only.
"""
from __future__ import annotations

import uuid

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.applications.models import Application
from apps.applications.tasks.pdf.render_context import has_active_document_profile
from apps.catalog.models import InstitutionDocumentProfile
from apps.catalog.services import AccessScopeService
from tests.tenant_fixtures import build_tenant_world

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture(autouse=True)
def production_scope(monkeypatch):
    monkeypatch.setattr(AccessScopeService, "_test_settings_active", staticmethod(lambda: False))


def _client(profile) -> APIClient:
    client = APIClient()
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


def _get(world, document_type):
    return _client(world.student).get(
        f"/api/v1/applications/{world.application.id}/official-documents/{document_type}/"
    )


def _add_profile(world, document_type):
    return InstitutionDocumentProfile.objects.create(
        id=uuid.uuid4(),
        institution=world.institution,
        document_type=document_type,
        program=None,
        canonical_program=None,
        intake=None,
        layout_key="fee_chart_letter",
        sections={"body": "Example body"},
        fee_chart=[],
        bank_accounts=[],
        requirements=[],
        signatory={"name": "Admissions Registrar (example)", "role": "Admissions"},
        version=1,
        is_active=True,
        created_at=timezone.now(),
    )


def test_conditional_offer_without_a_profile_is_setup_required():
    world = build_tenant_world(application_status="conditionally_approved")
    data = _get(world, "conditional_offer").json()["data"]
    assert data["status"] == "setup_required"
    assert data["error_code"] == "DOCUMENT_PROFILE_NOT_CONFIGURED"
    assert data["setup_required"] is True
    assert data["document_id"] is None


def test_a_letter_with_a_profile_is_not_setup_required():
    world = build_tenant_world(application_status="approved")
    _add_profile(world, "acceptance_letter")
    assert has_active_document_profile(world.application, "acceptance_letter") is True
    data = _get(world, "acceptance_letter").json()["data"]
    assert data["status"] == "not_requested"


def test_a_letter_the_application_cannot_receive_yet_is_not_reported():
    world = build_tenant_world(application_status="under_review")
    response = _client(world.student).get(f"/api/v1/applications/{world.application.id}/official-documents/")
    types = {entry["document_type"]: entry["status"] for entry in response.json()["data"]}
    assert "acceptance_letter" not in types
    assert "conditional_offer" not in types


def test_the_list_reports_the_letter_once_the_application_is_approved():
    world = build_tenant_world(application_status="approved")
    response = _client(world.student).get(f"/api/v1/applications/{world.application.id}/official-documents/")
    types = {entry["document_type"]: entry["status"] for entry in response.json()["data"]}
    assert types.get("acceptance_letter") == "setup_required"


def test_the_slip_is_not_profile_required():
    world = build_tenant_world(application_status="submitted")
    data = _get(world, "application_slip").json()["data"]
    assert data["status"] != "setup_required"
    assert Application.objects.filter(id=world.application.id).exists()


def test_a_resolution_error_fails_closed(monkeypatch):
    world = build_tenant_world(application_status="approved")
    _add_profile(world, "acceptance_letter")

    def boom(self, application, document_type):
        raise RuntimeError("resolver down")

    monkeypatch.setattr(
        "apps.catalog.services.InstitutionDocumentProfileService.resolve", boom
    )
    assert has_active_document_profile(world.application, "acceptance_letter") is False
