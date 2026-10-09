"""Integration test — same-name two-tenant assignment/requirement isolation.

Spec: ``.kiro/specs/admissions-v2-canonical-rebuild/`` — task 5.2.
Requirements: R7.1-R7.3, R11.6 · Findings: DATA-01, STU-01, STU-13

Required_Evidence (task 5.2): *"same-name tenant isolation ... integration
test"*. Two tenants offer the **same canonical program on the same intake**,
each with its own required-document configuration. This proves the canonical
assignment + requirement snapshot resolved for one tenant never resolves,
snapshots, or leaks the other tenant's institution, offering, requirements, or
configuration version — the isolation guarantee of the resolution service and
the create endpoint.

Runs entirely against the ephemeral Django test DB and the in-process DRF test
client (never Neon / production).

**Validates: Requirements R7.1, R7.2, R11.6**
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass

import pytest
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.applications.assignment_resolution import resolve_assignment_snapshot
from apps.applications.models import Application
from apps.catalog.models import InstitutionRequiredDocument
from tests.tenant_fixtures import (
    build_canonical_program,
    build_intake,
    build_institution,
    build_offering,
    build_profile,
    build_program_intake,
)

pytestmark = pytest.mark.django_db


@dataclass
class SameNameWorlds:
    """Two institutions offering the SAME canonical program on the SAME intake."""

    canonical: object
    intake: object
    institution_a: object
    offering_a: object
    institution_b: object
    offering_b: object


def _build_same_name_worlds() -> SameNameWorlds:
    # One shared canonical program + one shared intake — the same-name collision.
    canonical = build_canonical_program(suffix="shared")
    intake = build_intake(suffix="shared")

    institution_a = build_institution(suffix="aaa")
    offering_a = build_offering(
        institution=institution_a, canonical_program=canonical, suffix="aaa"
    )
    build_program_intake(offering=offering_a, intake=intake)

    institution_b = build_institution(suffix="bbb")
    offering_b = build_offering(
        institution=institution_b, canonical_program=canonical, suffix="bbb"
    )
    build_program_intake(offering=offering_b, intake=intake)

    # Distinct required-document configuration per tenant.
    InstitutionRequiredDocument.objects.create(
        id=uuid.uuid4(), institution=institution_a,
        document_type="transcript_a", label="Tenant A Transcript",
        is_required=True, is_active=True,
    )
    InstitutionRequiredDocument.objects.create(
        id=uuid.uuid4(), institution=institution_b,
        document_type="transcript_b", label="Tenant B Transcript",
        is_required=True, is_active=True,
    )
    return SameNameWorlds(
        canonical=canonical, intake=intake,
        institution_a=institution_a, offering_a=offering_a,
        institution_b=institution_b, offering_b=offering_b,
    )


class TestServiceLevelIsolation:
    def test_snapshot_resolves_only_the_requested_tenant(self):
        w = _build_same_name_worlds()

        snap_a = resolve_assignment_snapshot(
            program_id=str(w.canonical.id),
            intake_id=str(w.intake.id),
            institution_id=str(w.institution_a.id),
        )
        snap_b = resolve_assignment_snapshot(
            program_id=str(w.canonical.id),
            intake_id=str(w.intake.id),
            institution_id=str(w.institution_b.id),
        )

        # Each snapshot resolves to exactly its own tenant + offering.
        assert snap_a.institution_id == str(w.institution_a.id)
        assert snap_a.program_offering_id == str(w.offering_a.id)
        assert snap_b.institution_id == str(w.institution_b.id)
        assert snap_b.program_offering_id == str(w.offering_b.id)

        # Required-document snapshots never leak across tenants.
        a_types = {r["document_type"] for r in snap_a.required_documents}
        b_types = {r["document_type"] for r in snap_b.required_documents}
        assert "transcript_a" in a_types and "transcript_b" not in a_types
        assert "transcript_b" in b_types and "transcript_a" not in b_types

        # The configuration version is tenant-isolated by construction.
        assert snap_a.configuration_version != snap_b.configuration_version

    def test_shared_canonical_program_id_is_identical_but_offering_differs(self):
        """Same canonical program (same name); different offering per tenant."""
        w = _build_same_name_worlds()
        snap_a = resolve_assignment_snapshot(
            program_id=str(w.canonical.id), intake_id=str(w.intake.id),
            institution_id=str(w.institution_a.id),
        )
        snap_b = resolve_assignment_snapshot(
            program_id=str(w.canonical.id), intake_id=str(w.intake.id),
            institution_id=str(w.institution_b.id),
        )
        assert snap_a.canonical_program_id == snap_b.canonical_program_id
        assert snap_a.program_name == snap_b.program_name  # same display name
        assert snap_a.program_offering_id != snap_b.program_offering_id


class TestCreateEndpointIsolation:
    def _client(self, student):
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

    def _payload(self, w, *, institution_id, email):
        return {
            "full_name": "Same Name Applicant",
            "nrc_number": "123456/78/9",
            "date_of_birth": "2000-01-01",
            "sex": "female",
            "phone": "+260970000055",
            "email": email,
            "residence_town": "Lusaka",
            "country": "Zambia",
            "nationality": "Zambian",
            "program_id": str(w.canonical.id),
            "intake_id": str(w.intake.id),
            "institution_id": str(institution_id),
        }

    def test_create_snapshots_only_requesting_tenant_config(self):
        w = _build_same_name_worlds()
        student = build_profile(role="student", suffix="samecreate")
        client = self._client(student)

        response = client.post(
            "/api/v1/applications/",
            self._payload(w, institution_id=w.institution_a.id, email="a-applicant@example.com"),
            format="json",
        )
        assert response.status_code == 201, (response.status_code, response.json())
        data = response.json()["data"]

        # The response carries the tenant-A configuration version and required docs.
        assert data["configuration_version"] is not None
        req_types = {r["document_type"] for r in data["required_documents"]}
        assert "transcript_a" in req_types and "transcript_b" not in req_types

        # The persisted application snapshot is tenant-A-only.
        app = Application.objects.get(id=data["id"])
        assert str(app.institution_ref_id) == str(w.institution_a.id)
        assert str(app.program_offering_id) == str(w.offering_a.id)
        snap_types = {r["document_type"] for r in (app.requirements_snapshot or [])}
        assert "transcript_a" in snap_types and "transcript_b" not in snap_types
        assert app.configuration_version == data["configuration_version"]
        assert app.assignment_version == 1
