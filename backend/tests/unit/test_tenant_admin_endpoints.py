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
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.catalog.models import InstitutionAsset, InstitutionDocumentProfile, InstitutionDomain, Program
from apps.documents.models import ProgramFee
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
    if isinstance(body, list):
        return [row for row in body if isinstance(row, dict)]
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
# Tenant readiness aggregate
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestTenantReadinessEndpoint:
    """Canonical onboarding readiness is derived from tenant source tables."""

    def test_super_admin_reads_launch_ready_tenant(self):
        world = build_tenant_world(with_application=False)
        now = timezone.now()
        InstitutionAsset.objects.create(
            institution=world.institution,
            asset_type="logo",
            storage_key="tenants/logo.png",
            public_url="https://cdn.example/logo.png",
            mime_type="image/png",
            checksum_sha256="a" * 64,
            is_active=True,
            created_at=now,
        )
        InstitutionAsset.objects.create(
            institution=world.institution,
            asset_type="signature",
            storage_key="tenants/signature.png",
            public_url="https://cdn.example/signature.png",
            mime_type="image/png",
            checksum_sha256="b" * 64,
            is_active=True,
            created_at=now,
        )
        InstitutionDocumentProfile.objects.create(
            institution=world.institution,
            document_type="acceptance_letter",
            layout_key="fee_chart_letter",
            sections={"body": "Welcome {{student_name}}"},
            fee_chart=[],
            bank_accounts=[],
            requirements=[],
            signatory={"name": "Registrar"},
            is_active=True,
            created_at=now,
            updated_at=now,
        )
        build_institution_domain(
            institution=world.institution,
            hostname="apply-ready.example",
            status=InstitutionDomain.STATUS_ACTIVE,
        )

        response = _client_for(_super_admin()).get(
            f"/api/v1/admin/institutions/{world.institution.id}/readiness/"
        )

        assert response.status_code == 200, response.content
        body = response.json()["data"]
        assert body["launch_ready"] is True
        items = {item["key"]: item for item in body["items"]}
        assert items["logo"]["ready"] is True
        assert items["signature"]["ready"] is True
        assert items["document_profile"]["ready"] is True
        assert items["program_offering"]["ready"] is True
        assert items["tenant_admin"]["ready"] is True
        assert items["active_domain"]["ready"] is True

    def test_scoped_admin_cannot_read_other_tenant_readiness(self):
        own = build_tenant_world(with_application=False, suffix="ready-own")
        other = build_tenant_world(with_application=False, suffix="ready-other")
        client = _client_for(own.staff)

        response = client.get(f"/api/v1/admin/institutions/{other.institution.id}/readiness/")

        assert response.status_code == 404
        assert response.json()["code"] == "NOT_FOUND"


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

    def test_domain_list_exposes_lifecycle_fields(self):
        institution = build_institution()
        domain = build_institution_domain(
            institution=institution,
            hostname="pending.school.edu",
            status=InstitutionDomain.STATUS_PENDING_DNS,
            verification_token="verify-token",
            dns_target="abc.verify.beanola.com",
            last_error="DNS record has not propagated.",
        )
        client = _client_for(_super_admin())

        response = client.get(f"{_INSTITUTIONS}{institution.id}/domains/")

        assert response.status_code == 200, response.content
        row = next(item for item in _rows(response.json()) if item["id"] == str(domain.id))
        assert row["status"] == "pending_dns"
        assert row["verification_token"] == "verify-token"
        assert row["dns_target"] == "abc.verify.beanola.com"
        assert row["last_error"] == "DNS record has not propagated."

    def test_deactivate_active_domain_moves_to_disabled_status(self):
        institution = build_institution()
        domain = build_institution_domain(
            institution=institution,
            hostname="active.school.edu",
            status=InstitutionDomain.STATUS_ACTIVE,
            is_active=True,
        )
        client = _client_for(_super_admin())

        response = client.patch(
            f"{_INSTITUTIONS}{institution.id}/domains/{domain.id}/",
            data={"is_active": False},
            format="json",
        )

        assert response.status_code == 200, response.content
        assert response.json()["data"]["status"] == "disabled"
        domain.refresh_from_db()
        assert domain.status == InstitutionDomain.STATUS_DISABLED
        assert domain.is_active is False

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
# Enterprise authority — legacy catalog reads/writes cannot bypass tenant scope
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestLegacyCatalogTenantIsolation:
    """Legacy catalog endpoints must not leak other tenants to tenant admins.

    The stricter `/api/v1/admin/institutions/...` APIs are not enough by
    themselves: old catalog routes are still routable, so they must enforce the
    same tenant boundary. These tests pin the specific MIHAS/KATC-class failure
    mode where a school admin could list or mutate another school's catalog
    data through the legacy surface.
    """

    def test_tenant_admin_catalog_institutions_list_is_scoped(self, two_tenant_worlds):
        world_a, world_b = two_tenant_worlds
        client = _client_for(world_a.staff)

        response = client.get("/api/v1/catalog/institutions/")

        assert response.status_code == 200, response.content
        ids = _ids(response.json())
        assert world_a.institution_id in ids
        assert world_b.institution_id not in ids

    def test_tenant_admin_catalog_programs_list_is_scoped(self, two_tenant_worlds):
        world_a, world_b = two_tenant_worlds
        client = _client_for(world_a.staff)

        response = client.get("/api/v1/catalog/programs/")

        assert response.status_code == 200, response.content
        ids = _ids(response.json())
        assert world_a.offering_id in ids
        assert world_b.offering_id not in ids

    def test_tenant_admin_catalog_program_detail_masks_other_tenant(self, two_tenant_worlds):
        world_a, world_b = two_tenant_worlds
        client = _client_for(world_a.staff)

        response = client.get(f"/api/v1/catalog/programs/{world_b.offering.id}/")

        assert response.status_code == 404, response.content
        assert response.json()["code"] == "NOT_FOUND"

    def test_tenant_admin_catalog_institution_detail_masks_other_tenant(self, two_tenant_worlds):
        world_a, world_b = two_tenant_worlds
        client = _client_for(world_a.staff)

        response = client.get(f"/api/v1/catalog/institutions/{world_b.institution.id}/")

        assert response.status_code == 404, response.content
        assert response.json()["code"] == "NOT_FOUND"

    def test_tenant_scoped_admin_programs_endpoint_returns_only_that_school(self, two_tenant_worlds):
        world_a, world_b = two_tenant_worlds
        client = _client_for(world_a.staff)

        own = client.get(f"{_INSTITUTIONS}{world_a.institution.id}/programs/")
        other = client.get(f"{_INSTITUTIONS}{world_b.institution.id}/programs/")

        assert own.status_code == 200, own.content
        assert world_a.offering_id in _ids(own.json())
        assert world_b.offering_id not in _ids(own.json())
        assert other.status_code == 200, other.content
        assert _ids(other.json()) == set()

    def test_super_admin_updates_offering_rules_through_tenant_admin_endpoint(self, two_tenant_worlds):
        world_a, _world_b = two_tenant_worlds
        client = _client_for(_super_admin())

        response = client.patch(
            f"{_INSTITUTIONS}{world_a.institution.id}/programs/{world_a.offering.id}/",
            data={
                "assignment_priority": 7,
                "offering_status": "paused",
                "assignment_rules": {"allowed_countries": ["Zambia"]},
            },
            format="json",
        )

        assert response.status_code == 200, response.content
        world_a.offering.refresh_from_db()
        assert world_a.offering.assignment_priority == 7
        assert world_a.offering.offering_status == "paused"
        assert world_a.offering.assignment_rules == {"allowed_countries": ["Zambia"]}

    def test_tenant_admin_cannot_mutate_offering_rules_through_tenant_admin_endpoint(self, two_tenant_worlds):
        world_a, _world_b = two_tenant_worlds
        client = _client_for(world_a.staff)

        response = client.patch(
            f"{_INSTITUTIONS}{world_a.institution.id}/programs/{world_a.offering.id}/",
            data={"assignment_priority": 1},
            format="json",
        )

        assert response.status_code == 403, response.content
        world_a.offering.refresh_from_db()
        assert world_a.offering.assignment_priority != 1

    def test_request_change_capability_does_not_authorize_real_program_mutation(self, two_tenant_worlds):
        world_a, _world_b = two_tenant_worlds
        world_a.membership.permissions = ["manage"]
        world_a.membership.save(update_fields=["permissions"])
        client = _client_for(world_a.staff)

        response = client.patch(
            f"/api/v1/catalog/programs/{world_a.offering.id}/",
            data={"assignment_priority": 1},
            format="json",
        )

        assert response.status_code == 403, response.content
        world_a.offering.refresh_from_db()
        assert world_a.offering.assignment_priority != 1

    def test_super_admin_can_still_create_program_offering(self, two_tenant_worlds):
        world_a, _world_b = two_tenant_worlds
        client = _client_for(_super_admin())

        response = client.post(
            "/api/v1/catalog/programs/",
            data={
                "name": "Platform Assigned Offering",
                "code": f"PLAT-{uuid.uuid4().hex[:8].upper()}",
                "institution_id": str(world_a.institution.id),
                "canonical_program_id": str(world_a.canonical_program.id),
                "duration_months": 36,
                "application_fee": "153.00",
                "is_active": True,
            },
            format="json",
        )

        assert response.status_code == 201, response.content
        assert Program.objects.filter(id=response.json()["data"]["id"]).exists()

    def test_tenant_admin_program_fee_list_is_scoped_to_own_offering(self, two_tenant_worlds):
        world_a, world_b = two_tenant_worlds
        own_fee = ProgramFee.objects.create(
            program=world_a.offering,
            fee_type="application",
            residency_category="local",
            amount="153.00",
            currency="ZMW",
            is_active=True,
        )
        other_fee = ProgramFee.objects.create(
            program=world_b.offering,
            fee_type="application",
            residency_category="local",
            amount="200.00",
            currency="ZMW",
            is_active=True,
        )
        client = _client_for(world_a.staff)

        own = client.get(f"/api/v1/programs/{world_a.offering.id}/fees/")
        other = client.get(f"/api/v1/programs/{world_b.offering.id}/fees/")

        assert own.status_code == 200, own.content
        assert str(own_fee.id) in _ids(own.json())
        assert str(other_fee.id) not in _ids(own.json())
        assert other.status_code == 200, other.content
        assert _ids(other.json()) == set()

    def test_tenant_admin_cannot_mutate_program_fees(self, two_tenant_worlds):
        world_a, _world_b = two_tenant_worlds
        client = _client_for(world_a.staff)

        response = client.post(
            f"/api/v1/programs/{world_a.offering.id}/fees/",
            data={
                "fee_type": "application",
                "residency_category": "local",
                "amount": "153.00",
                "currency": "ZMW",
            },
            format="json",
        )

        assert response.status_code == 403, response.content
        assert not ProgramFee.objects.filter(program=world_a.offering).exists()

    def test_super_admin_can_still_create_program_fee(self, two_tenant_worlds):
        world_a, _world_b = two_tenant_worlds
        client = _client_for(_super_admin())

        response = client.post(
            f"/api/v1/programs/{world_a.offering.id}/fees/",
            data={
                "fee_type": "application",
                "residency_category": "local",
                "amount": "153.00",
                "currency": "ZMW",
            },
            format="json",
        )

        assert response.status_code == 201, response.content
        assert ProgramFee.objects.filter(
            program=world_a.offering,
            fee_type="application",
            residency_category="local",
            amount="153.00",
            currency="ZMW",
        ).exists()


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
