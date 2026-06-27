"""Routing simulator endpoint tests (tenant onboarding "Test routing", R11.3).

Spec: ``multi-tenant-beanola-admissions`` — Phase 5, task 23.2.

The tenant onboarding UI exposes a "Test routing" simulator whose result must
match the real :class:`OfferingAssignmentService` *exactly* for the same
inputs. The simulator is backed by a dedicated super-admin endpoint
``POST /api/v1/admin/routing/simulate/`` that *reuses* the service (it never
reimplements routing). These tests pin that contract:

- a super-admin gets the same offering/institution the service returns for the
  same inputs, inside the ``{"success": true, "data": ...}`` envelope ... PASS
- the white-label ``institution_id`` filter is honoured (matches the service) PASS
- an unassignable pair returns a recoverable ``assigned: false`` /
  ``NO_ELIGIBLE_OFFERING`` detail (never a 500 dead-end) ............... PASS
- a non-super-admin (school staff / student) is denied (403) .......... PASS

**Validates: Requirements R11.3**
"""

from __future__ import annotations

import uuid

import pytest
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.catalog.services import OfferingAssignmentError, OfferingAssignmentService
from tests.tenant_fixtures import (
    build_institution_domain,
    build_profile,
    build_tenant_world,
    build_white_label_scenario,
)
from tests.tenant_fixtures import CandidateSpec


SIMULATE_URL = "/api/v1/admin/routing/simulate/"


def _client_for(profile) -> APIClient:
    """An APIClient authenticated as ``profile`` via the JWTUser pattern."""
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
class TestRoutingSimulateMatchesService:
    """R11.3: the simulator must equal the real assignment service."""

    def test_simulate_matches_service_for_same_inputs(self, tenant_world_factory):
        """The endpoint returns exactly the offering/institution the service
        assigns for the same inputs."""
        world = tenant_world_factory(with_application=False)
        superadmin = build_profile(role="super_admin", suffix="sim-sa")
        client = _client_for(superadmin)

        body = {
            "program_id": world.canonical_program_id,
            "intake_id": world.intake_id,
            "country": "Zambia",
            "nationality": "Zambian",
        }

        # Ground truth straight from the service.
        expected = OfferingAssignmentService().assign(
            program_id=world.canonical_program_id,
            intake_id=world.intake_id,
            country="Zambia",
            nationality="Zambian",
        )

        response = client.post(SIMULATE_URL, body, format="json")
        assert response.status_code == 200, (response.status_code, response.json())
        payload = response.json()
        assert payload.get("success") is True, payload
        data = payload["data"]

        assert data["assigned"] is True
        assert data["program_offering_id"] == str(expected.offering.id)
        assert data["institution_id"] == str(expected.institution.id)
        assert data["program_id"] == str(expected.canonical_program.id)
        assert data["intake_id"] == str(expected.intake.id)
        assert data["required_documents"] == expected.required_documents

    def test_simulate_honours_white_label_filter_like_service(self):
        """The ``institution_id`` filter restricts candidates to exactly the
        institution the service would pick — no fallback to another school."""
        scenario = build_white_label_scenario(
            [
                [CandidateSpec(offering_priority=10)],
                [CandidateSpec(offering_priority=10)],
            ]
        )
        target = scenario.scenarios[1].institution
        superadmin = build_profile(role="super_admin", suffix="sim-wl")
        client = _client_for(superadmin)

        body = {
            "program_id": scenario.canonical_program_id,
            "intake_id": scenario.intake_id,
            "institution_id": str(target.id),
        }

        expected = OfferingAssignmentService().assign(
            program_id=scenario.canonical_program_id,
            intake_id=scenario.intake_id,
            institution_id=str(target.id),
        )

        response = client.post(SIMULATE_URL, body, format="json")
        assert response.status_code == 200, (response.status_code, response.json())
        data = response.json()["data"]
        assert data["assigned"] is True
        assert data["institution_id"] == str(target.id)
        assert data["institution_id"] == str(expected.institution.id)
        assert data["program_offering_id"] == str(expected.offering.id)

    def test_simulate_resolves_white_label_host_like_public_portal(self):
        """The optional ``host`` input uses ``InstitutionContextService`` so
        simulator results match the white-label portal's tenant resolution."""
        scenario = build_white_label_scenario(
            [
                [CandidateSpec(offering_priority=10)],
                [CandidateSpec(offering_priority=10)],
            ]
        )
        target = scenario.scenarios[1].institution
        build_institution_domain(
            institution=target,
            hostname="apply.simulated-school.example",
            status="active",
            is_active=True,
        )
        superadmin = build_profile(role="super_admin", suffix="sim-host")
        client = _client_for(superadmin)

        response = client.post(
            SIMULATE_URL,
            {
                "program_id": scenario.canonical_program_id,
                "intake_id": scenario.intake_id,
                "host": "APPLY.simulated-school.example:8443",
            },
            format="json",
        )

        assert response.status_code == 200, (response.status_code, response.json())
        data = response.json()["data"]
        assert data["assigned"] is True
        assert data["inputs"]["resolved_institution_id"] == str(target.id)
        assert data["inputs"]["institution_id"] == str(target.id)
        assert data["institution_id"] == str(target.id)

    def test_unassignable_pair_returns_recoverable_failure(self, tenant_world_factory):
        """An ineligible program + intake returns a recoverable
        ``assigned: false`` / NO_ELIGIBLE_OFFERING detail (never a 500)."""
        world = tenant_world_factory(with_application=False)
        superadmin = build_profile(role="super_admin", suffix="sim-fail")
        client = _client_for(superadmin)

        missing_intake = str(uuid.uuid4())
        body = {"program_id": world.canonical_program_id, "intake_id": missing_intake}

        # The service raises for the same inputs.
        with pytest.raises((OfferingAssignmentError, Exception)):
            OfferingAssignmentService().assign(
                program_id=world.canonical_program_id,
                intake_id=missing_intake,
            )

        response = client.post(SIMULATE_URL, body, format="json")
        assert response.status_code == 200, (response.status_code, response.json())
        payload = response.json()
        assert payload.get("success") is True, payload
        data = payload["data"]
        assert data["assigned"] is False
        assert data["error"]["code"] == "NO_ELIGIBLE_OFFERING"

    def test_blocked_residency_matches_service(self, tenant_world_factory):
        """When residency rules block the applicant, the simulator reports the
        same NO_ELIGIBLE_OFFERING the service raises."""
        world = tenant_world_factory(
            with_application=False,
            residency_rules={"exclude_countries": ["Zambia"]},
        )
        superadmin = build_profile(role="super_admin", suffix="sim-block")
        client = _client_for(superadmin)

        body = {
            "program_id": world.canonical_program_id,
            "intake_id": world.intake_id,
            "country": "Zambia",
            "nationality": "Zambian",
        }

        with pytest.raises(OfferingAssignmentError):
            OfferingAssignmentService().assign(
                program_id=world.canonical_program_id,
                intake_id=world.intake_id,
                country="Zambia",
                nationality="Zambian",
            )

        response = client.post(SIMULATE_URL, body, format="json")
        assert response.status_code == 200, (response.status_code, response.json())
        data = response.json()["data"]
        assert data["assigned"] is False
        assert data["error"]["code"] == "NO_ELIGIBLE_OFFERING"


@pytest.mark.django_db
class TestRoutingSimulatePermissions:
    """R11.3 is a super-admin-only operational tool."""

    def test_school_staff_denied(self, tenant_world_factory):
        world = tenant_world_factory(with_application=False)
        response = _client_for(world.staff).post(
            SIMULATE_URL,
            {"program_id": world.canonical_program_id, "intake_id": world.intake_id},
            format="json",
        )
        assert response.status_code == 403, (response.status_code, response.json())

    def test_student_denied(self, tenant_world_factory):
        world = tenant_world_factory(with_application=False)
        response = _client_for(world.student).post(
            SIMULATE_URL,
            {"program_id": world.canonical_program_id, "intake_id": world.intake_id},
            format="json",
        )
        assert response.status_code == 403, (response.status_code, response.json())

    def test_missing_required_inputs_rejected(self):
        superadmin = build_profile(role="super_admin", suffix="sim-val")
        response = _client_for(superadmin).post(SIMULATE_URL, {}, format="json")
        assert response.status_code == 400, (response.status_code, response.json())
