"""Tenant management endpoint tests — collision validation + scope (task 15.1).

Spec: ``multi-tenant-beanola-admissions`` — Phase 4 task 15.1
("Collision validation + scope on tenant management endpoints").

These cover the Super_Admin tenant onboarding surface mounted under
``/api/v1/admin/`` (``backend/apps/catalog/admin_views.py`` +
``admin_serializers.py``) against four acceptance criteria:

- **R5.1** Super_Admin tenant management endpoints (institutions, domains,
  memberships, access grants) expose list/create + detail PATCH lifecycle.
- **R5.2** creating/updating an institution or domain SHALL reject slug, code,
  and hostname collisions with a descriptive validation error (400).
- **R5.5** the access-grants API SHALL support filtering by institution and
  SHALL NOT expose grants for unrelated institutions.
- **R5.6** a School_Staff user calling any tenant management endpoint outside
  their scope SHALL be denied without leaking the existence/configuration of
  other schools.

Auth follows the JWTUser ``force_authenticate`` pattern used by
``test_cross_tenant_isolation.py`` / ``test_analytics_scope.py``. Under
``config.settings.test`` the legacy-admin compat branch grants a
membership-less admin all-access, so tests that assert genuinely *scoped*
school-staff behaviour either give the staff a real membership (so scope is
genuine) or disable the compat branch with the ``production_scope`` fixture
(per tasks 12.4 / 12.5).

**Validates: Requirements R5.1, R5.2, R5.5, R5.6**
"""

from __future__ import annotations

import uuid

import pytest
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.catalog.models import InstitutionDomain
from apps.catalog.services import AccessScopeService
from tests.tenant_fixtures import (
    build_institution,
    build_institution_domain,
    build_membership,
    build_profile,
    build_tenant_world,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _client_for(profile) -> APIClient:
    """An APIClient authenticated as ``profile`` via the JWTUser pattern.

    ``force_authenticate`` bypasses the authentication classes, so CSRF is not
    enforced for the POST/PATCH calls here (mirrors the existing isolation
    suite). The acting profile is always a real ``Profile`` row so any
    ``created_by`` FK written on create resolves.
    """
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


def _rows(body) -> list[dict]:
    """Extract the list of row dicts from a list/paginated envelope body."""
    if not isinstance(body, dict):
        return []
    data = body.get("data", body)
    rows = data.get("results", data) if isinstance(data, dict) else data
    return [row for row in rows if isinstance(row, dict)] if isinstance(rows, list) else []


def _ids(body) -> set[str]:
    return {str(row["id"]) for row in _rows(body) if row.get("id") is not None}


def _super_admin():
    return build_profile(role="super_admin")


_INSTITUTIONS = "/api/v1/admin/institutions/"


# ---------------------------------------------------------------------------
# R5.2 — slug / code collision validation (create + update)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestInstitutionCollisionValidation:
    """Slug and code collisions are rejected with a descriptive 400 (R5.2).

    **Validates: Requirements R5.2**
    """

    def test_slug_collision_rejected_on_create(self):
        build_institution(slug="collide-slug", code="UNIQ-CODE-A")
        client = _client_for(_super_admin())

        response = client.post(
            _INSTITUTIONS,
            data={"name": "New School", "code": "UNIQ-CODE-B", "slug": "collide-slug"},
            format="json",
        )

        assert response.status_code == 400, response.content
        body = response.json()
        assert body["success"] is False
        assert body["code"] == "VALIDATION_ERROR"
        assert "slug" in body["details"]
        assert "already in use" in str(body["details"]["slug"]).lower()

    def test_slug_collision_is_case_insensitive(self):
        build_institution(slug="case-slug", code="CI-CODE-A")
        client = _client_for(_super_admin())

        response = client.post(
            _INSTITUTIONS,
            data={"name": "New School", "code": "CI-CODE-B", "slug": "CASE-SLUG"},
            format="json",
        )

        assert response.status_code == 400, response.content
        assert "slug" in response.json()["details"]

    def test_code_collision_rejected_on_create(self):
        build_institution(slug="code-slug-a", code="DUP-CODE")
        client = _client_for(_super_admin())

        response = client.post(
            _INSTITUTIONS,
            data={"name": "Another School", "code": "dup-code", "slug": "code-slug-b"},
            format="json",
        )

        assert response.status_code == 400, response.content
        body = response.json()
        assert body["code"] == "VALIDATION_ERROR"
        assert "code" in body["details"]
        assert "already in use" in str(body["details"]["code"]).lower()

    def test_slug_collision_rejected_on_update(self):
        build_institution(slug="existing-slug", code="UPD-CODE-A")
        target = build_institution(slug="target-slug", code="UPD-CODE-B")
        client = _client_for(_super_admin())

        response = client.patch(
            f"{_INSTITUTIONS}{target.id}/",
            data={"slug": "existing-slug"},
            format="json",
        )

        assert response.status_code == 400, response.content
        assert "slug" in response.json()["details"]

    def test_code_collision_rejected_on_update(self):
        build_institution(slug="upd-slug-x", code="TAKEN-CODE")
        target = build_institution(slug="upd-slug-y", code="OWN-CODE")
        client = _client_for(_super_admin())

        response = client.patch(
            f"{_INSTITUTIONS}{target.id}/",
            data={"code": "TAKEN-CODE"},
            format="json",
        )

        assert response.status_code == 400, response.content
        assert "code" in response.json()["details"]

    def test_update_with_own_slug_and_code_succeeds(self):
        """Self-exclusion: updating an institution to its own slug/code is not a
        collision."""
        target = build_institution(slug="self-slug", code="SELF-CODE")
        client = _client_for(_super_admin())

        response = client.patch(
            f"{_INSTITUTIONS}{target.id}/",
            data={"slug": "self-slug", "code": "SELF-CODE", "brand_name": "Renamed"},
            format="json",
        )

        assert response.status_code == 200, response.content
        assert response.json()["data"]["brand_name"] == "Renamed"


# ---------------------------------------------------------------------------
# R5.2 — hostname collision validation (create + update, case-insensitive)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestHostnameCollisionValidation:
    """Domain hostname collisions are rejected case-insensitively (R5.2).

    **Validates: Requirements R5.2**
    """

    def test_hostname_collision_rejected_on_create(self):
        institution = build_institution()
        build_institution_domain(institution=institution, hostname="apply.school.edu")
        client = _client_for(_super_admin())

        response = client.post(
            f"{_INSTITUTIONS}{institution.id}/domains/",
            data={"hostname": "apply.school.edu", "is_active": True},
            format="json",
        )

        assert response.status_code == 400, response.content
        body = response.json()
        assert body["code"] == "VALIDATION_ERROR"
        assert "hostname" in body["details"]
        # Descriptive collision message. An exact-case duplicate is caught by
        # the model-level UniqueValidator ("...already exists."); a different-
        # case duplicate falls through to the serializer's case-insensitive
        # ``validate_hostname`` ("...already in use."). Both are descriptive.
        assert "already" in str(body["details"]["hostname"]).lower()

    def test_hostname_collision_is_case_insensitive(self):
        institution = build_institution()
        build_institution_domain(institution=institution, hostname="portal.school.edu")
        client = _client_for(_super_admin())

        response = client.post(
            f"{_INSTITUTIONS}{institution.id}/domains/",
            data={"hostname": "PORTAL.School.EDU", "is_active": True},
            format="json",
        )

        assert response.status_code == 400, response.content
        assert "hostname" in response.json()["details"]

    def test_hostname_collision_across_institutions_rejected(self):
        """A hostname already used by one school cannot be claimed by another."""
        inst_a = build_institution()
        inst_b = build_institution()
        build_institution_domain(institution=inst_a, hostname="shared.example.edu")
        client = _client_for(_super_admin())

        response = client.post(
            f"{_INSTITUTIONS}{inst_b.id}/domains/",
            data={"hostname": "shared.example.edu", "is_active": True},
            format="json",
        )

        assert response.status_code == 400, response.content
        assert "hostname" in response.json()["details"]

    def test_hostname_collision_rejected_on_update(self):
        institution = build_institution()
        build_institution_domain(institution=institution, hostname="first.school.edu")
        target = build_institution_domain(institution=institution, hostname="second.school.edu")
        client = _client_for(_super_admin())

        response = client.patch(
            f"{_INSTITUTIONS}{institution.id}/domains/{target.id}/",
            data={"hostname": "FIRST.school.edu"},
            format="json",
        )

        assert response.status_code == 400, response.content
        assert "hostname" in response.json()["details"]


# ---------------------------------------------------------------------------
# R5.6 — tenant writes require super-admin; reads are scoped
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestTenantWriteRequiresSuperAdmin:
    """School_Staff cannot create/patch tenant config (403 FORBIDDEN) (R5.6).

    The staff actor here holds a genuine membership to their own institution,
    so the legacy-admin compat branch does not apply — they are a real,
    single-school admin who is still denied every write.

    **Validates: Requirements R5.1, R5.6**
    """

    def test_staff_cannot_create_institution(self, tenant_world):
        client = _client_for(tenant_world.staff)

        response = client.post(
            _INSTITUTIONS,
            data={"name": "Sneaky School", "code": "SNEAKY-1", "slug": "sneaky-1"},
            format="json",
        )

        assert response.status_code == 403, response.content
        assert response.json()["code"] == "FORBIDDEN"

    def test_staff_cannot_patch_own_institution(self, tenant_world):
        client = _client_for(tenant_world.staff)

        response = client.patch(
            f"{_INSTITUTIONS}{tenant_world.institution.id}/",
            data={"brand_name": "Hijacked"},
            format="json",
        )

        assert response.status_code == 403, response.content
        assert response.json()["code"] == "FORBIDDEN"

    def test_staff_cannot_create_domain(self, tenant_world):
        client = _client_for(tenant_world.staff)

        response = client.post(
            f"{_INSTITUTIONS}{tenant_world.institution.id}/domains/",
            data={"hostname": "staff-added.example.edu", "is_active": True},
            format="json",
        )

        assert response.status_code == 403, response.content
        assert response.json()["code"] == "FORBIDDEN"


@pytest.mark.django_db
class TestTenantReadScoping:
    """School_Staff reads are scoped; out-of-scope reads do not leak (R5.6).

    **Validates: Requirements R5.6**
    """

    @pytest.fixture()
    def production_scope(self, monkeypatch):
        """Disable the test-settings legacy-admin all-access compat branch so a
        membership-less admin resolves to a genuine empty scope (task 12.4)."""
        monkeypatch.setattr(
            AccessScopeService, "_test_settings_active", staticmethod(lambda: False)
        )

    def test_staff_lists_only_their_own_institution(self):
        world_a = build_tenant_world()
        world_b = build_tenant_world()
        client = _client_for(world_a.staff)

        response = client.get(_INSTITUTIONS)
        assert response.status_code == 200, response.content
        ids = _ids(response.json())
        assert world_a.institution_id in ids
        assert world_b.institution_id not in ids

    def test_staff_can_list_own_institution_child_resources(self):
        world_a = build_tenant_world()
        own_domain = build_institution_domain(
            institution=world_a.institution, hostname="own.school.edu"
        )
        client = _client_for(world_a.staff)

        response = client.get(f"{_INSTITUTIONS}{world_a.institution.id}/domains/")
        assert response.status_code == 200, response.content
        assert str(own_domain.id) in _ids(response.json())

    def test_out_of_scope_institution_detail_is_not_found(self):
        world_a = build_tenant_world()
        world_b = build_tenant_world()
        client = _client_for(world_a.staff)

        # Baseline: a truly missing institution is a 404 NOT_FOUND envelope.
        missing = client.get(f"{_INSTITUTIONS}{uuid.uuid4()}/")
        # Out-of-scope: school B's real institution must look identical.
        out_of_scope = client.get(f"{_INSTITUTIONS}{world_b.institution.id}/")

        assert missing.status_code == 404
        assert out_of_scope.status_code == 404, out_of_scope.content
        body = out_of_scope.json()
        assert body["success"] is False
        assert body["code"] == "NOT_FOUND"
        # No leakage: the other school's name/brand never appears.
        assert world_b.institution.name not in str(body)

    def test_out_of_scope_child_list_does_not_leak(self):
        world_a = build_tenant_world()
        world_b = build_tenant_world()
        other_domain = build_institution_domain(
            institution=world_b.institution, hostname="other.school.edu"
        )
        client = _client_for(world_a.staff)

        response = client.get(f"{_INSTITUTIONS}{world_b.institution.id}/domains/")
        assert response.status_code == 200, response.content
        # School B's domain must never surface to school-A staff.
        assert str(other_domain.id) not in _ids(response.json())
        assert "other.school.edu" not in str(response.json())

    def test_no_scope_staff_cannot_read_child_resources(self, production_scope):
        """A membership/grant-less admin (production semantics) cannot list any
        school's child resources — the no-scope set must not be treated as the
        super-admin global set (R5.6)."""
        world_a = build_tenant_world()
        build_institution_domain(institution=world_a.institution, hostname="leaky.school.edu")
        no_scope_admin = build_profile(role="admin")
        client = _client_for(no_scope_admin)

        response = client.get(f"{_INSTITUTIONS}{world_a.institution.id}/domains/")
        assert response.status_code == 200, response.content
        assert _rows(response.json()) == []
        assert "leaky.school.edu" not in str(response.json())


# ---------------------------------------------------------------------------
# R5.5 — access-grant filtering by institution
# ---------------------------------------------------------------------------

_GRANTS = "/api/v1/admin/access-grants/"


@pytest.mark.django_db
class TestAccessGrantInstitutionFilter:
    """Access grants filter by institution and never leak other schools (R5.5).

    **Validates: Requirements R5.5, R5.6**
    """

    def test_super_admin_filter_returns_only_that_institutions_grants(self, two_tenant_worlds):
        world_a, world_b = two_tenant_worlds
        client = _client_for(_super_admin())

        response = client.get(f"{_GRANTS}?institution={world_a.institution_id}")
        assert response.status_code == 200, response.content
        ids = _ids(response.json())
        assert str(world_a.access_grant.id) in ids
        assert str(world_b.access_grant.id) not in ids

    def test_super_admin_unfiltered_sees_grants_globally(self, two_tenant_worlds):
        world_a, world_b = two_tenant_worlds
        client = _client_for(_super_admin())

        response = client.get(_GRANTS)
        assert response.status_code == 200, response.content
        ids = _ids(response.json())
        assert str(world_a.access_grant.id) in ids
        assert str(world_b.access_grant.id) in ids

    def test_staff_never_sees_other_institution_grants(self, two_tenant_worlds):
        world_a, world_b = two_tenant_worlds
        client = _client_for(world_a.staff)

        response = client.get(_GRANTS)
        assert response.status_code == 200, response.content
        ids = _ids(response.json())
        assert str(world_a.access_grant.id) in ids
        assert str(world_b.access_grant.id) not in ids


# ---------------------------------------------------------------------------
# R5.1 — super-admin global create + list lifecycle
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestSuperAdminGlobalManagement:
    """Super_Admin can create tenant config and list globally (R5.1).

    **Validates: Requirements R5.1**
    """

    def test_super_admin_creates_institution(self):
        client = _client_for(_super_admin())

        response = client.post(
            _INSTITUTIONS,
            data={"name": "Greenfield College", "code": "GREEN-1", "slug": "greenfield"},
            format="json",
        )

        assert response.status_code == 201, response.content
        body = response.json()
        assert body["success"] is True
        assert body["data"]["code"] == "GREEN-1"

    def test_super_admin_creates_domain(self):
        institution = build_institution()
        client = _client_for(_super_admin())

        response = client.post(
            f"{_INSTITUTIONS}{institution.id}/domains/",
            data={"hostname": "Apply.Greenfield.EDU", "is_primary": True, "is_active": True},
            format="json",
        )

        assert response.status_code == 201, response.content
        # validate_hostname normalises to lowercase.
        assert response.json()["data"]["hostname"] == "apply.greenfield.edu"
        assert InstitutionDomain.objects.filter(hostname="apply.greenfield.edu").exists()

    def test_super_admin_creates_membership(self):
        super_admin = _super_admin()
        institution = build_institution()
        member = build_profile(role="admin")
        client = _client_for(super_admin)

        response = client.post(
            "/api/v1/admin/memberships/",
            data={
                "user_id": str(member.id),
                "institution_id": str(institution.id),
                "role": "admin",
            },
            format="json",
        )

        assert response.status_code == 201, response.content
        body = response.json()
        assert body["success"] is True
        assert str(body["data"]["institution_id"]) == str(institution.id)

    def test_super_admin_creates_access_grant(self):
        super_admin = _super_admin()
        institution = build_institution()
        grantee = build_profile(role="reviewer")
        client = _client_for(super_admin)

        response = client.post(
            _GRANTS,
            data={
                "user_id": str(grantee.id),
                "scope_type": "institution",
                "institution_id": str(institution.id),
            },
            format="json",
        )

        assert response.status_code == 201, response.content
        assert response.json()["success"] is True

    def test_access_grant_scope_type_requires_matching_id(self):
        """R5.2-adjacent: an institution grant without institution_id is a
        descriptive validation error (serializer ``validate``)."""
        super_admin = _super_admin()
        grantee = build_profile(role="reviewer")
        client = _client_for(super_admin)

        response = client.post(
            _GRANTS,
            data={"user_id": str(grantee.id), "scope_type": "institution"},
            format="json",
        )

        assert response.status_code == 400, response.content
        assert "institution_id" in response.json()["details"]

    def test_super_admin_lists_institutions_globally(self):
        world_a = build_tenant_world()
        world_b = build_tenant_world()
        client = _client_for(_super_admin())

        response = client.get(_INSTITUTIONS)
        assert response.status_code == 200, response.content
        ids = _ids(response.json())
        assert world_a.institution_id in ids
        assert world_b.institution_id in ids
