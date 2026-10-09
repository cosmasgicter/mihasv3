"""Deterministic authority-policy proof for Admissions V2 task 2.2.

These cases are selected directly from the approved task-2.1 authority matrix.
They pin the regressions that raw ``IsAdmin``/role checks create: legitimate
scoped reviewers are rejected, tenant admins are admitted to platform-only
surfaces, and students receive a distinguishable 403 on tenant-staff actions.

**Validates: Requirements R3.1, R3.2, R3.3, R3.4, R3.6**
"""

from __future__ import annotations

import uuid

import pytest
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.catalog.services import AccessScopeService
from tests.tenant_fixtures import build_membership, build_profile, build_tenant_world


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


@pytest.fixture(autouse=True)
def production_scope(monkeypatch):
    """Exercise membership/grant authority, never the test admin shortcut."""
    monkeypatch.setattr(
        AccessScopeService, "_test_settings_active", staticmethod(lambda: False)
    )


@pytest.mark.django_db
class TestCapabilityDerivedEndpointAuthority:
    """Representative endpoint decisions from the approved 2.1 matrix."""

    @pytest.mark.parametrize(
        "path",
        [
            "/api/v1/admin/capabilities/",
            "/api/v1/admin/scope/",
            "/api/v1/payments/settlements/",
        ],
    )
    def test_scoped_reviewer_can_reach_read_surfaces(self, path):
        world = build_tenant_world()
        reviewer = build_profile(role="reviewer")
        build_membership(
            user=reviewer,
            institution=world.institution,
            role="reviewer",
        )

        response = _client_for(reviewer).get(path)

        assert response.status_code == 200, (path, response.content)

    def test_tenant_admin_cannot_reach_platform_tenant_directory(self):
        world = build_tenant_world()

        response = _client_for(world.staff).get("/api/v1/admin/institutions/")

        assert response.status_code == 403, response.content
        assert world.institution.name not in str(response.json())

    def test_student_staff_mutation_is_masked_as_not_found(self):
        world = build_tenant_world()
        missing_id = uuid.uuid4()
        client = _client_for(world.student)

        existing = client.post(
            f"/api/v1/applications/{world.application.id}/interviews/",
            data={},
            format="json",
        )
        missing = client.post(
            f"/api/v1/applications/{missing_id}/interviews/",
            data={},
            format="json",
        )

        assert existing.status_code == 404, existing.content
        assert missing.status_code == 404, missing.content
        # Byte-identical *modulo* ``request_id``. That field is a per-request
        # correlation id the envelope handler stamps on every error body, so it
        # differs between any two requests and carries nothing about the target
        # — the platform states its own contract that way
        # (``docs/canonical-truth-map.md`` line 462 "byte-identical,
        # ``request_id`` aside"; ``docs/v2-evidence/9.4/README.md`` "byte-identical
        # to an unknown id's 404 (``request_id`` stripped)", guarded by
        # ``test_review_workspace_9_4.py::_without_request_id``). It appears here
        # because task 9.4 moved this route's 404 onto ``resolve_scoped_application``,
        # raised as ``NotFound`` and rendered by the canonical handler.
        def _without_request_id(payload):
            return {k: v for k, v in payload.items() if k != "request_id"}

        assert _without_request_id(existing.json()) == _without_request_id(missing.json())
        # And the exclusion is sound rather than convenient: both bodies carry a
        # non-empty correlation id, and the two differ — a value that varies
        # between two identical probes cannot encode a fact about the target.
        existing_id = existing.json().get("request_id")
        missing_id = missing.json().get("request_id")
        assert str(existing_id or "").strip() and str(missing_id or "").strip()
        assert existing_id != missing_id
