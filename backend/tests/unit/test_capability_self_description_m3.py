"""The Capability_Endpoint answers a staff actor's own authority; it masks everyone else.

13.6 remediation **M3**, cluster B. Requirements **R2.1** / **R2.4** (the
Capability_Endpoint payload is returned for every actor that can reach the
endpoint) composed with the task 2.1 authority matrix's
"student not in tenant admin scope (not-found mask)".

The defect this pins: ``GET /api/v1/admin/capabilities/`` and
``GET /api/v1/admin/scope/`` had been placed behind the same masked-404
disclosure contract as the tenant *data* surfaces, so an **unassigned staff
actor** — an ``admin`` or ``reviewer`` with no active membership/grant — was
refused instead of being told that its scope is empty. That is the one payload
the frontend's "No school access assigned" state can honestly be derived from
(``CapabilityContext.noAccess``), and a refusal cannot carry it. The endpoints
disclose no tenant identifier, name, count or attribute for such an actor, so
there was nothing there to mask.

Both directions are asserted, because relaxing the mask for a staff actor must
not relax it for a Student — the frontend provider already documents that it
does not even ask on a student's behalf "because the endpoint masks them as a
404", and that has to stay true.
"""

from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.catalog.services import AccessScopeService
from tests.tenant_fixtures import build_institution, build_membership, build_profile

pytestmark = pytest.mark.django_db

_ENDPOINTS = ("/api/v1/admin/capabilities/", "/api/v1/admin/scope/")


@pytest.fixture(autouse=True)
def production_scope(monkeypatch):
    """Exercise real membership/grant authority, never the test admin shortcut.

    Without this the test-settings legacy-admin compat branch gives a
    membership-less ``admin`` all-access, which would make the unassigned-admin
    case pass for the wrong reason.
    """
    monkeypatch.setattr(
        AccessScopeService, "_test_settings_active", staticmethod(lambda: False)
    )


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
            }
        )
    )
    return client


class TestCapabilityEndpointAnswersItsOwnActor:
    """An unassigned staff actor is answered with an empty capability set."""

    @pytest.mark.parametrize("path", _ENDPOINTS)
    @pytest.mark.parametrize("role", ["admin", "reviewer"])
    def test_unassigned_staff_actor_is_answered_with_an_empty_set(self, path, role):
        actor = build_profile(role=role)

        response = _client(actor).get(path)

        assert response.status_code == 200, (path, role, response.content)
        data = response.json()["data"]
        assert data["role"] == role
        assert data["is_super_admin"] is False
        assert data["all_access"] is False
        assert data["capabilities"] == []
        assert data["institutions"] == []

    @pytest.mark.parametrize("path", _ENDPOINTS)
    def test_scoped_staff_actor_still_sees_only_its_own_institution(self, path):
        """The relaxation must not widen a scoped actor's scope."""
        mine = build_institution(suffix="m3-mine")
        build_institution(suffix="m3-other")
        actor = build_profile(role="admin")
        build_membership(user=actor, institution=mine, role="admin")

        response = _client(actor).get(path)

        assert response.status_code == 200, response.content
        data = response.json()["data"]
        assert [entry["id"] for entry in data["institutions"]] == [str(mine.id)]

    @pytest.mark.parametrize("path", _ENDPOINTS)
    def test_super_admin_is_unaffected(self, path):
        actor = build_profile(role="super_admin")

        response = _client(actor).get(path)

        assert response.status_code == 200, response.content
        assert response.json()["data"]["is_super_admin"] is True


class TestCapabilityEndpointStillMasksNonStaff:
    """The disclosure contract for a non-staff caller is unchanged."""

    @pytest.mark.parametrize("path", _ENDPOINTS)
    def test_student_is_masked_as_not_found(self, path):
        """A Student must not be able to confirm the staff surface exists."""
        institution = build_institution(suffix="m3-mask")
        student = build_profile(role="student")

        response = _client(student).get(path)

        assert response.status_code == 404, (path, response.content)
        body = response.json()
        assert body["success"] is False
        # The refusal discloses nothing about any tenant.
        serialized = str(body)
        assert str(institution.id) not in serialized
        assert institution.name not in serialized

    @pytest.mark.parametrize("path", _ENDPOINTS)
    def test_unknown_role_is_masked_as_not_found(self, path):
        """A role outside the four canonical roles resolves to zero authority
        (R1.1) and is masked here, so the staff-tier gate is a hierarchy check
        rather than "anything that is not a student"."""
        actor = build_profile(role="student")
        actor.role = "auditor"
        actor.save(update_fields=["role"])

        response = _client(actor).get(path)

        assert response.status_code == 404, (path, response.content)

    @pytest.mark.parametrize("path", _ENDPOINTS)
    def test_unauthenticated_caller_is_rejected(self, path):
        response = APIClient().get(path)

        assert response.status_code in (401, 403), (path, response.content)


class TestOnlyTheSelfSurfacesOptIn:
    """The opt-in is bounded to the two Capability_Endpoints."""

    def test_tenant_data_surface_still_masks_an_unassigned_admin(self):
        """The dashboard is a tenant-data surface: task 9.2 deliberately masks a
        no-scope admin there, and this change must not have widened it."""
        actor = build_profile(role="admin")

        response = _client(actor).get("/api/v1/admin/dashboard/")

        assert response.status_code == 404, response.content

    def test_exactly_two_views_declare_the_opt_in(self):
        """Any third view adopting ``capability_self_description`` has to justify
        it here, so the flag cannot spread quietly into a data surface."""
        from django.urls import get_resolver
        from rest_framework.views import APIView

        seen: set[str] = set()

        def walk(patterns, prefix=""):
            for pattern in patterns:
                nested = getattr(pattern, "url_patterns", None)
                if nested is not None:
                    walk(nested, prefix)
                    continue
                callback = getattr(pattern, "callback", None)
                view_class = getattr(callback, "view_class", None) or getattr(
                    callback, "cls", None
                )
                if (
                    view_class is not None
                    and isinstance(view_class, type)
                    and issubclass(view_class, APIView)
                    and getattr(view_class, "capability_self_description", False)
                ):
                    seen.add(f"{view_class.__module__}.{view_class.__name__}")

        walk(get_resolver().url_patterns)

        assert seen == {
            "apps.accounts.admin_user_views.AdminCapabilitiesView",
            "apps.accounts.admin_user_views.AdminScopeView",
        }, seen
