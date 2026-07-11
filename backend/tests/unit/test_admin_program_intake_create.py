"""Unit tests for AdminProgramIntakeCreateView (Phase 6, R8.1-R8.4).

Spec: ``.kiro/specs/full-platform-remediation-2026-07/`` — task 6.3.

``POST /api/v1/admin/program-intakes/`` creates the ``ProgramIntake`` junction
row (the Intake_Offering) linking a tenant's ``Program`` offering to a global
``Intake``. Gated by ``platform.intake.manage`` — Super_Admin only, exactly
like the legacy ``IntakeListCreateView``/``IntakeDetailView`` write paths
(intakes are global, so no tenant capability can authorize this write; see
``backend/tests/property/test_capability_gated_writes.py`` for the same
pattern applied to those views).

Covers:

* Happy path — a Super_Admin creates the link; 201 with the created object.
* Duplicate ``(program_id, intake_id)`` pair — 409 ``ALREADY_LINKED``.
* Permission denied — a tenant admin (even with a "manage" membership on the
  offering's own institution) lacks ``platform.intake.manage`` and is denied
  with a non-revealing 403; no mutation occurs.
* Non-existent ``program_id`` — 404 ``PROGRAM_NOT_FOUND``.
* Non-existent ``intake_id`` — 404 ``INTAKE_NOT_FOUND``.

Run::

    cd backend && DJANGO_SETTINGS_MODULE=config.settings.test TESTING=1 SECRET_KEY=x \\
      .venv/bin/python -m pytest tests/unit/test_admin_program_intake_create.py -q
"""

from __future__ import annotations

import uuid

import pytest
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.accounts.models import Profile
from apps.catalog.models import ProgramIntake
from apps.catalog.services import AccessScopeService
from tests.tenant_fixtures import (
    build_canonical_program,
    build_institution,
    build_intake,
    build_membership,
    build_offering,
    build_profile,
)

URL = "/api/v1/admin/program-intakes/"


def _client_for(profile: Profile) -> APIClient:
    """An ``APIClient`` authenticated as ``profile`` (force_authenticate bypasses CSRF)."""
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


@pytest.fixture()
def production_scope(monkeypatch):
    """Force the production membership/grant scope model.

    Under ``config.settings.test`` a bare ``role == "admin"`` user is granted
    all-access by ``AccessScopeService`` (legacy dev/test compatibility). This
    view's permission (``platform.intake.manage``) is resolved via
    ``AdminCapabilityService`` rather than ``AccessScopeService``, but the
    same production-scope fixture is used here for consistency with the
    sibling capability-gated-writes tests and in case a future refactor
    routes through the scope service.
    """
    monkeypatch.setattr(
        AccessScopeService, "_test_settings_active", staticmethod(lambda: False)
    )


@pytest.fixture()
def offering_and_intake(db):
    """A real active Program offering + a real active Intake, unlinked."""
    institution = build_institution()
    canonical = build_canonical_program()
    offering = build_offering(institution=institution, canonical_program=canonical)
    intake = build_intake()
    return institution, offering, intake


@pytest.mark.django_db
class TestAdminProgramIntakeCreateHappyPath:
    def test_super_admin_creates_the_link(self, offering_and_intake, production_scope):
        institution, offering, intake = offering_and_intake
        super_admin = build_profile(role="super_admin")
        client = _client_for(super_admin)

        response = client.post(
            URL,
            {"program_id": str(offering.id), "intake_id": str(intake.id)},
            format="json",
        )

        assert response.status_code == 201, response.data
        body = response.json()
        assert body["success"] is True
        assert body["data"]["program_id"] == str(offering.id)
        assert body["data"]["intake_id"] == str(intake.id)
        assert ProgramIntake.objects.filter(program_id=offering.id, intake_id=intake.id).exists()


@pytest.mark.django_db
class TestAdminProgramIntakeCreateDuplicate:
    def test_duplicate_pair_returns_409_and_does_not_create_a_second_row(
        self, offering_and_intake, production_scope
    ):
        institution, offering, intake = offering_and_intake
        super_admin = build_profile(role="super_admin")
        client = _client_for(super_admin)

        first = client.post(
            URL,
            {"program_id": str(offering.id), "intake_id": str(intake.id)},
            format="json",
        )
        assert first.status_code == 201

        before_count = ProgramIntake.objects.filter(
            program_id=offering.id, intake_id=intake.id
        ).count()
        assert before_count == 1

        second = client.post(
            URL,
            {"program_id": str(offering.id), "intake_id": str(intake.id)},
            format="json",
        )

        assert second.status_code == 409, second.data
        body = second.json()
        assert body["success"] is False
        assert body["code"] == "ALREADY_LINKED"
        after_count = ProgramIntake.objects.filter(
            program_id=offering.id, intake_id=intake.id
        ).count()
        assert after_count == 1, "duplicate request must not create a second row"


@pytest.mark.django_db
class TestAdminProgramIntakeCreatePermissionDenied:
    def test_tenant_admin_with_manage_membership_is_denied(
        self, offering_and_intake, production_scope
    ):
        """A tenant admin holding a 'manage' membership on the offering's own
        institution still lacks platform.intake.manage (intakes are global,
        platform-managed only) — denied, no mutation."""
        institution, offering, intake = offering_and_intake
        tenant_admin = build_profile(role="admin")
        build_membership(
            user=tenant_admin,
            institution=institution,
            role="admin",
            permissions=["manage"],
        )
        client = _client_for(tenant_admin)

        response = client.post(
            URL,
            {"program_id": str(offering.id), "intake_id": str(intake.id)},
            format="json",
        )

        assert response.status_code == 403, response.data
        assert not ProgramIntake.objects.filter(
            program_id=offering.id, intake_id=intake.id
        ).exists()

    def test_no_scope_admin_is_denied(self, offering_and_intake, production_scope):
        institution, offering, intake = offering_and_intake
        no_scope_admin = build_profile(role="admin")
        client = _client_for(no_scope_admin)

        response = client.post(
            URL,
            {"program_id": str(offering.id), "intake_id": str(intake.id)},
            format="json",
        )

        assert response.status_code == 403, response.data
        assert not ProgramIntake.objects.filter(
            program_id=offering.id, intake_id=intake.id
        ).exists()

    def test_student_is_denied(self, offering_and_intake, production_scope):
        institution, offering, intake = offering_and_intake
        student = build_profile(role="student")
        client = _client_for(student)

        response = client.post(
            URL,
            {"program_id": str(offering.id), "intake_id": str(intake.id)},
            format="json",
        )

        assert response.status_code == 403, response.data
        assert not ProgramIntake.objects.filter(
            program_id=offering.id, intake_id=intake.id
        ).exists()


@pytest.mark.django_db
class TestAdminProgramIntakeCreateNotFound:
    def test_non_existent_program_id_returns_404(self, offering_and_intake, production_scope):
        institution, offering, intake = offering_and_intake
        super_admin = build_profile(role="super_admin")
        client = _client_for(super_admin)

        response = client.post(
            URL,
            {"program_id": str(uuid.uuid4()), "intake_id": str(intake.id)},
            format="json",
        )

        assert response.status_code == 404, response.data
        body = response.json()
        assert body["code"] == "PROGRAM_NOT_FOUND"

    def test_non_existent_intake_id_returns_404(self, offering_and_intake, production_scope):
        institution, offering, intake = offering_and_intake
        super_admin = build_profile(role="super_admin")
        client = _client_for(super_admin)

        response = client.post(
            URL,
            {"program_id": str(offering.id), "intake_id": str(uuid.uuid4())},
            format="json",
        )

        assert response.status_code == 404, response.data
        body = response.json()
        assert body["code"] == "INTAKE_NOT_FOUND"

    def test_inactive_program_returns_404(self, offering_and_intake, production_scope):
        """An inactive Program is treated the same as non-existent — it is
        never a valid link target."""
        institution, offering, intake = offering_and_intake
        offering.is_active = False
        offering.save(update_fields=["is_active"])
        super_admin = build_profile(role="super_admin")
        client = _client_for(super_admin)

        response = client.post(
            URL,
            {"program_id": str(offering.id), "intake_id": str(intake.id)},
            format="json",
        )

        assert response.status_code == 404, response.data
        assert response.json()["code"] == "PROGRAM_NOT_FOUND"


@pytest.mark.django_db
class TestAdminProgramIntakeCreateValidation:
    def test_missing_fields_returns_400(self, production_scope):
        super_admin = build_profile(role="super_admin")
        client = _client_for(super_admin)

        response = client.post(URL, {}, format="json")

        assert response.status_code == 400
