"""Task 3.3 — IntegrityError -> stable 409 translation at the view layer.

Spec: .kiro/specs/admissions-v2-canonical-rebuild/ task 3.3
Requirements: R6.7, R7.4, R15.5 | Findings: DATA-05, DATA-06, TEN-08

Each constrained write keeps a check-then-insert / serializer guard as the
friendly fast path, but the DB uniqueness/scope constraint is the final race
guard. When a concurrent double-submit slips past the guard the insert raises
``IntegrityError``; these tests prove the view translates it to a *registered*
409 code (docs/canonical-truth-map.md -> catalog integrity 409 codes) instead of
surfacing a 500.

The DB constraints firing under real concurrency is proven in
``test_integrity_constraints_3_3.py::TestConcurrentRaces``; here we isolate the
translation path (backend-agnostic) by forcing the insert to raise
``IntegrityError`` after the guard has already passed.
"""

from __future__ import annotations

import uuid

import pytest
from django.db import IntegrityError
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.accounts.models import Profile
from tests.tenant_fixtures import (
    build_canonical_program,
    build_institution,
    build_intake,
    build_offering,
    build_profile,
)


def _client_for(profile: Profile) -> APIClient:
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


def _raise_integrity(*_a, **_k):
    raise IntegrityError("duplicate key value violates unique constraint")


@pytest.mark.django_db
class TestProgramIntakeIntegrity409:
    def test_race_past_precheck_returns_already_linked_409(self, monkeypatch):
        from apps.catalog.models import ProgramIntake

        institution = build_institution()
        offering = build_offering(
            institution=institution, canonical_program=build_canonical_program()
        )
        intake = build_intake()
        super_admin = build_profile(role="super_admin")

        # Force the create to lose the race to the DB unique AFTER the
        # .exists() pre-check has already passed (no pre-existing row).
        monkeypatch.setattr(ProgramIntake.objects, "create", _raise_integrity)

        resp = _client_for(super_admin).post(
            "/api/v1/admin/program-intakes/",
            {"program_id": str(offering.id), "intake_id": str(intake.id)},
            format="json",
        )
        assert resp.status_code == 409, resp.data
        body = resp.json()
        assert body["success"] is False
        assert body["code"] == "ALREADY_LINKED"


@pytest.mark.django_db
class TestAccessGrantIntegrity409:
    def test_race_past_serializer_guard_returns_duplicate_access_grant_409(self, monkeypatch):
        from apps.catalog.admin_serializers import AdminAccessGrantSerializer

        institution = build_institution()
        target = build_profile(role="reviewer")
        super_admin = build_profile(role="super_admin")

        # Serializer validation (incl. its duplicate check) passes; the save
        # then loses the race to the partial unique index.
        monkeypatch.setattr(AdminAccessGrantSerializer, "save", _raise_integrity)

        resp = _client_for(super_admin).post(
            "/api/v1/admin/access-grants/",
            {
                "user_id": str(target.id),
                "scope_type": "institution",
                "institution_id": str(institution.id),
                "permissions": [],
            },
            format="json",
        )
        assert resp.status_code == 409, resp.data
        body = resp.json()
        assert body["success"] is False
        assert body["code"] == "DUPLICATE_ACCESS_GRANT"


@pytest.mark.django_db
class TestProgramFeeIntegrity409:
    def test_race_past_precheck_returns_duplicate_active_fee_409(self, monkeypatch):
        from apps.documents.payment_query_views import ProgramFeeViewSet

        institution = build_institution()
        offering = build_offering(
            institution=institution, canonical_program=build_canonical_program()
        )
        super_admin = build_profile(role="super_admin")

        # perform_create passes its own check then loses the race to
        # uq_program_fees_one_active; the overridden create() must translate it.
        monkeypatch.setattr(ProgramFeeViewSet, "perform_create", _raise_integrity)

        resp = _client_for(super_admin).post(
            f"/api/v1/programs/{offering.id}/fees/",
            {
                "fee_type": "application",
                "residency_category": "local",
                "amount": "150.00",
                "currency": "ZMW",
            },
            format="json",
        )
        assert resp.status_code == 409, resp.data
        body = resp.json()
        assert body["success"] is False
        assert body["code"] == "DUPLICATE_ACTIVE_FEE"


@pytest.mark.django_db
class TestDocumentProfileVersionIntegrity409:
    def test_concurrent_clone_returns_duplicate_document_profile_version_409(self, monkeypatch):
        from apps.catalog.models import InstitutionDocumentProfile
        from apps.catalog.services import InstitutionDocumentProfileService

        institution = build_institution()
        super_admin = build_profile(role="super_admin")
        profile = InstitutionDocumentProfile.objects.create(
            id=uuid.uuid4(),
            institution_id=institution.id,
            document_type="acceptance",
            version=1,
            is_active=True,
        )

        # Two clones compute the same next version; the loser hits
        # uq_doc_profiles_scope_version.
        monkeypatch.setattr(
            InstitutionDocumentProfileService, "create_new_version", _raise_integrity
        )

        resp = _client_for(super_admin).post(
            f"/api/v1/admin/institutions/{institution.id}/document-profiles/{profile.id}/clone/",
            {"is_active": True},
            format="json",
        )
        assert resp.status_code == 409, resp.data
        body = resp.json()
        assert body["success"] is False
        assert body["code"] == "DUPLICATE_DOCUMENT_PROFILE_VERSION"
