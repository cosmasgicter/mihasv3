"""Assignment-preview endpoint tests (program-first wizard, R10.2 / R10.3).

Spec: ``multi-tenant-beanola-admissions`` — Phase 5, task 21.1.

The program-first student wizard reviews the assigned school + fee + required
documents + contact *before* payment. The frontend sources that review from
``GET /api/v1/catalog/assignment-preview/?program_id&intake_id`` which re-runs
the canonical :class:`OfferingAssignmentService` (read-only — no application
row is created) and returns the assigned school the eventual create call would
pick for the same inputs.

These tests pin the endpoint contract the wizard's assigned-school checkpoint
depends on:

- a valid program + intake resolves the assigned school + required documents,
  with the ``{"success": true, "data": ...}`` envelope ............... PASS
- missing ids return a 400 VALIDATION_ERROR (no silent assignment) ... PASS
- an unassignable program + intake returns a recoverable
  NO_ELIGIBLE_OFFERING (never a dead-end / 500) ..................... PASS

**Validates: Requirements R10.2, R10.3**
"""

from __future__ import annotations

import uuid

import pytest
from rest_framework.test import APIClient


@pytest.mark.django_db
class TestAssignmentPreviewEndpoint:
    """R10.2/R10.3: assigned-school preview before payment."""

    def test_valid_program_intake_returns_assigned_school(self, tenant_world_factory):
        """A valid program + intake resolves the assigned school and required
        documents inside the standard success envelope."""
        world = tenant_world_factory(with_application=False)
        client = APIClient()

        response = client.get(
            "/api/v1/catalog/assignment-preview/",
            {"program_id": world.canonical_program_id, "intake_id": world.intake_id},
        )

        assert response.status_code == 200, (response.status_code, response.json())
        body = response.json()
        assert body.get("success") is True, body
        data = body["data"]
        assert data["institution_id"] == world.institution_id
        assert data["program_offering_id"] == world.offering_id
        assert data["program_id"] == world.canonical_program_id
        assert data["intake_id"] == world.intake_id
        assert data["assigned_school"]["id"] == world.institution_id
        # Contract keys the wizard checkpoint reads.
        assert "fee" in data
        assert "required_documents" in data
        assert "contact" in data

    def test_missing_ids_returns_validation_error(self):
        """Missing program_id/intake_id is a 400 — never a silent assignment."""
        client = APIClient()
        response = client.get("/api/v1/catalog/assignment-preview/")
        assert response.status_code == 400
        body = response.json()
        assert body.get("success") is False
        assert body.get("code") == "VALIDATION_ERROR"

    def test_unassignable_pair_returns_recoverable_error(self, tenant_world_factory):
        """An ineligible program + intake returns a recoverable
        NO_ELIGIBLE_OFFERING (400), never a 500 dead-end (R10.4 groundwork)."""
        world = tenant_world_factory(with_application=False)
        client = APIClient()

        # Real canonical program, but an intake with no offering for it.
        response = client.get(
            "/api/v1/catalog/assignment-preview/",
            {"program_id": world.canonical_program_id, "intake_id": str(uuid.uuid4())},
        )

        assert response.status_code == 400, (response.status_code, response.json())
        body = response.json()
        assert body.get("success") is False
        assert body.get("code") == "NO_ELIGIBLE_OFFERING"
