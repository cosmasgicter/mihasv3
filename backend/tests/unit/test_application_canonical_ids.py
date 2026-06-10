"""Application canonical-ID exploration tests (P12).

Spec: ``multi-tenant-beanola-admissions`` — Phase 0 exploration baseline
(task 1.8, building on the task 1.1 scaffold). Pins the
canonical-ID-on-create property:

    P12 New applications persist all four canonical IDs
        (``institution_id``, ``program_id``, ``program_offering_id``,
        ``intake_id``); legacy rows with null canonical IDs remain readable.

R1.1 (verbatim): *"WHEN a new application is created through the program-first
flow, THE system SHALL persist all four Canonical_IDs (institution_id,
program_id, program_offering_id, intake_id) on the applications row in the same
transaction as creation."*

These are **exploration** tests: each property either passes against the
current create path or is recorded as a durable
``@pytest.mark.xfail(strict=True)`` carrying a minimised counter-example,
triaged to the phase task that will fix it (matching the convention used by
tasks 1.3, 1.6, and 1.7). No production code is changed in this task.

Coverage:

- a built application round-trips all four canonical IDs ............. PASS
- the program-first CREATE endpoint persists all four canonical IDs
  + the legacy display snapshots from the assigned school ........... PASS
- a legacy row with null canonical IDs is still readable via its
  legacy string snapshots ........................................... PASS

The create-path test drives the real ``POST /api/v1/applications/`` endpoint
with ``program_id`` + ``intake_id`` so the assignment → ``create_kwargs``
canonical-ID write is exercised end to end.

**Validates: Requirements R1.1, R1.4, R8.1, R14.7**
"""

from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.applications.models import Application


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _student_client(student) -> APIClient:
    """An APIClient authenticated as ``student`` (a Profile).

    ``force_authenticate`` injects a ``JWTUser`` directly, so the cookie-based
    CSRF enforcement path is not exercised (it only fires for cookie-sourced
    tokens). This mirrors the auth pattern used by the P9 isolation tests.
    """
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


@pytest.mark.django_db
class TestCanonicalIdsPersisted:
    """P12: canonical IDs are persisted and legacy rows stay readable.

    **Validates: Requirements R1.1, R1.4, R14.7**
    """

    def test_all_four_canonical_ids_round_trip(self, tenant_world):
        """A built application persists all four canonical IDs."""
        app = Application.objects.get(id=tenant_world.application.id)
        assert str(app.institution_ref_id) == tenant_world.institution_id
        assert str(app.canonical_program_id) == tenant_world.canonical_program_id
        assert str(app.program_offering_id) == tenant_world.offering_id
        assert str(app.intake_ref_id) == tenant_world.intake_id

    def test_create_endpoint_persists_all_four_canonical_ids(self, tenant_world_factory):
        """R1.1: the program-first CREATE endpoint persists all four canonical
        IDs (and the legacy display snapshots) on the new application.

        We build a clean tenant world (no pre-existing application), then POST
        ``program_id`` + ``intake_id`` to ``/api/v1/applications/``. The view
        runs ``OfferingAssignmentService``, resolves the single eligible
        offering, and writes the four canonical IDs in the same
        ``Application.objects.create(...)`` call.
        """
        world = tenant_world_factory(with_application=False)
        client = _student_client(world.student)

        payload = {
            "full_name": "Test Applicant",
            "nrc_number": "123456/78/9",
            "date_of_birth": "2000-01-01",
            "sex": "female",
            "phone": "+260970000001",
            "email": "test-applicant@example.com",
            "residence_town": "Lusaka",
            "country": "Zambia",
            "nationality": "Zambian",
            "program_id": world.canonical_program_id,
            "intake_id": world.intake_id,
        }

        response = client.post("/api/v1/applications/", payload, format="json")

        assert response.status_code == 201, (response.status_code, response.json())
        body = response.json()
        assert body.get("success") is True, body
        created_id = body["data"]["id"]

        # Authoritative check: re-fetch the persisted row.
        app = Application.objects.get(id=created_id)
        assert str(app.institution_ref_id) == world.institution_id
        assert str(app.canonical_program_id) == world.canonical_program_id
        assert str(app.program_offering_id) == world.offering_id
        assert str(app.intake_ref_id) == world.intake_id

        # Legacy display snapshots are written from the assigned school context.
        assert app.program == world.canonical_program.name
        assert app.intake == world.intake.name
        assert app.institution == world.institution.name

        # Response envelope echoes the canonical IDs (read serializer mirror).
        data = body["data"]
        assert str(data["institution_id"]) == world.institution_id
        assert str(data["program_id"]) == world.canonical_program_id
        assert str(data["program_offering_id"]) == world.offering_id
        assert str(data["intake_id"]) == world.intake_id

    def test_create_endpoint_assigns_correct_institution(self, tenant_world_factory):
        """R1.1/R2: the persisted ``institution_id`` is the assigned school's id
        (derived from the offering), not a client-supplied value."""
        world = tenant_world_factory(with_application=False)
        client = _student_client(world.student)

        response = client.post(
            "/api/v1/applications/",
            {
                "full_name": "Routing Applicant",
                "nrc_number": "654321/21/1",
                "date_of_birth": "1999-05-05",
                "sex": "male",
                "phone": "+260970000002",
                "email": "routing-applicant@example.com",
                "residence_town": "Ndola",
                "country": "Zambia",
                "nationality": "Zambian",
                "program_id": world.canonical_program_id,
                "intake_id": world.intake_id,
            },
            format="json",
        )

        assert response.status_code == 201, (response.status_code, response.json())
        body = response.json()
        assigned = body["data"].get("assigned_school")
        assert assigned is not None, body
        assert str(assigned["id"]) == world.institution_id
        assert assigned["code"] == world.offering.institution.code


@pytest.mark.django_db
class TestLegacyRowsRemainReadable:
    """P12: legacy rows with null canonical IDs remain readable (R1.4).

    **Validates: Requirements R1.4, R14.7**
    """

    def test_legacy_null_id_row_is_readable(self, tenant_world_factory):
        """A legacy row with null canonical IDs is still readable via its
        legacy string snapshots without raising."""
        world = tenant_world_factory(with_canonical_ids=False)
        app = Application.objects.get(id=world.application.id)
        assert app.institution_ref_id is None
        assert app.canonical_program_id is None
        assert app.program_offering_id is None
        assert app.intake_ref_id is None
        # Legacy display snapshots remain populated.
        assert app.program
        assert app.intake
        assert app.institution

    def test_legacy_row_serializes_without_error(self, tenant_world_factory):
        """R1.4: a null-canonical-ID legacy row serializes through the read
        serializer with null canonical IDs and intact legacy strings."""
        from apps.applications.serializers import ApplicationSerializer

        world = tenant_world_factory(with_canonical_ids=False)
        app = Application.objects.get(id=world.application.id)
        data = ApplicationSerializer(app).data
        assert data["institution_id"] is None
        assert data["program_id"] is None
        assert data["program_offering_id"] is None
        assert data["intake_id"] is None
        # Legacy display fields still present and populated.
        assert data["program"]
        assert data["intake"]
        assert data["institution"]
