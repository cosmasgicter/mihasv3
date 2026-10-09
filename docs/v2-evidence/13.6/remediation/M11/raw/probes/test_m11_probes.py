"""M11 review probes — read-only behavioural measurements of the current tree.

Each test encodes ONE claim made in ../../README.md. A passing test means the
claim was observed on the local test stack; a failing test means the claim is
wrong and the README must not make it. Nothing here edits source: every object
is created inside pytest-django's per-test transaction and rolled back.

Run from ``backend/`` (see ../30-probe-run.txt for the exact invocation):

    pytest -p tests.conftest <this file>

``-p tests.conftest`` loads the suite's own fixtures (the unmanaged-schema
session fixture, the per-test cache reset) without placing this file under
``backend/tests/``.
"""
from __future__ import annotations

import csv
import io
import time
import uuid
from datetime import date, timedelta

import pytest
from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.catalog.models import TenantStaffInvitation, UserInstitutionMembership
from apps.catalog.services import AccessScopeService, AdminCapabilityService
from tests.tenant_fixtures import (
    build_access_grant,
    build_application,
    build_institution,
    build_membership,
    build_offering,
    build_profile,
    build_tenant_world,
    build_two_tenant_worlds,
)

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _production_scope(monkeypatch):
    """The real membership/grant scope model (no legacy test all-access)."""
    monkeypatch.setattr(
        AccessScopeService, "_test_settings_active", staticmethod(lambda: False)
    )


def _jwt(profile) -> JWTUser:
    return JWTUser(
        {
            "user_id": str(profile.id),
            "email": profile.email,
            "role": profile.role,
            "first_name": getattr(profile, "first_name", ""),
            "last_name": getattr(profile, "last_name", ""),
        }
    )


def _client(profile) -> APIClient:
    client = APIClient()
    client.force_authenticate(user=_jwt(profile))
    return client


def _ids(response) -> set[str]:
    data = response.data.get("data", response.data)
    results = data.get("results", data) if isinstance(data, dict) else data
    return {str(row["id"]) for row in results}


def _csv_rows(response) -> list[list[str]]:
    rows = list(csv.reader(io.StringIO(response.content.decode("utf-8"))))
    return rows[1:]  # drop the header


def _sibling(world, *, same_offering: bool):
    """A second submitted application in the SAME institution as ``world``."""
    offering = world.offering if same_offering else build_offering(
        institution=world.institution, canonical_program=world.canonical_program
    )
    return build_application(
        student=build_profile(role="student"),
        institution=world.institution,
        canonical_program=world.canonical_program,
        offering=offering,
        intake=world.intake,
        status="submitted",
    )


AGGREGATE_SURFACES = (
    "/api/v1/admin/dashboard/",
    "/api/v1/payments/settlements/",
    "/api/v1/admin/fees/",
    "/api/v1/admin/audit-logs/",
    "/api/v1/admin/users/",
)


# ---------------------------------------------------------------------------
# Q1 — offering/application grants: per-grain maps, aggregates masked
# ---------------------------------------------------------------------------


class TestQ1NarrowGrants:
    def test_offering_grant_is_keyed_by_offering_not_institution(self):
        world = build_tenant_world(application_status="submitted")
        actor = build_profile(role="admin")
        build_access_grant(user=actor, scope_type="program_offering", program=world.offering)

        caps = AdminCapabilityService().get_capabilities(actor)
        assert caps.institution_capabilities == {}
        assert set(caps.offering_capabilities) == {world.offering_id}
        assert "tenant.application.read" in caps.offering_capabilities[world.offering_id]

    @pytest.mark.parametrize("path", AGGREGATE_SURFACES)
    def test_offering_only_actor_is_masked_on_aggregate_surfaces(self, path):
        world = build_tenant_world(application_status="submitted")
        _sibling(world, same_offering=False)
        actor = build_profile(role="admin")
        build_access_grant(user=actor, scope_type="program_offering", program=world.offering)

        response = _client(actor).get(path)
        assert response.status_code == 404, (path, response.status_code, response.data)

    @pytest.mark.parametrize("path", AGGREGATE_SURFACES)
    def test_application_only_actor_is_masked_on_aggregate_surfaces(self, path):
        world = build_tenant_world(application_status="submitted")
        _sibling(world, same_offering=True)
        actor = build_profile(role="admin")
        build_access_grant(
            user=actor, scope_type="application", application_id=world.application.id
        )

        response = _client(actor).get(path)
        assert response.status_code == 404, (path, response.status_code, response.data)

    def test_offering_only_actor_is_masked_on_the_institution_audit_feed(self):
        world = build_tenant_world(application_status="submitted")
        actor = build_profile(role="admin")
        build_access_grant(user=actor, scope_type="program_offering", program=world.offering)

        response = _client(actor).get(f"/api/v1/admin/institutions/{world.institution_id}/audit/")
        assert response.status_code == 404, (response.status_code, response.data)

    def test_offering_grant_reads_only_its_offering_on_the_admin_query(self):
        world = build_tenant_world(application_status="submitted")
        sibling = _sibling(world, same_offering=False)
        actor = build_profile(role="admin")
        build_access_grant(user=actor, scope_type="program_offering", program=world.offering)

        response = _client(actor).get("/api/v1/admin/applications/")
        assert response.status_code == 200, response.data
        ids = _ids(response)
        assert str(world.application.id) in ids
        assert str(sibling.id) not in ids
        assert response.data["data"]["totalCount"] == 1

    def test_application_grant_reads_only_its_row_on_the_v1_list(self):
        world = build_tenant_world(application_status="submitted")
        sibling = _sibling(world, same_offering=True)
        actor = build_profile(role="admin")
        build_access_grant(
            user=actor, scope_type="application", application_id=world.application.id
        )

        response = _client(actor).get("/api/v1/applications/")
        assert response.status_code == 200, response.data
        ids = _ids(response)
        assert ids == {str(world.application.id)}, ids
        assert str(sibling.id) not in ids

    def test_application_grant_can_open_its_own_detail_now(self):
        """M8 4.1's 403 on the granted target is gone."""
        world = build_tenant_world(application_status="submitted")
        actor = build_profile(role="admin")
        build_access_grant(
            user=actor, scope_type="application", application_id=world.application.id
        )

        response = _client(actor).get(f"/api/v1/admin/applications/{world.application.id}/")
        assert response.status_code == 200, (response.status_code, response.data)


class TestQ1ExportGrain:
    """The export capability is checked at ANY grain, then applied to the whole scoped set."""

    def _mixed_actor(self, *, with_export_grant: bool):
        world = build_tenant_world(application_status="submitted")
        sibling = _sibling(world, same_offering=True)
        actor = build_profile(role="admin")
        # Read-only school membership: the platform's read-default bundle, no export.
        build_membership(user=actor, institution=world.institution, role="admin")
        if with_export_grant:
            build_access_grant(
                user=actor,
                scope_type="application",
                application_id=world.application.id,
                permissions=["export"],
            )
        return world, sibling, actor

    def test_control_read_only_membership_cannot_export(self):
        _world, _sibling_app, actor = self._mixed_actor(with_export_grant=False)
        response = _client(actor).get("/api/v1/applications/export/")
        assert response.status_code == 403, (response.status_code, getattr(response, "data", None))

    def test_one_application_export_grant_exports_the_whole_school(self):
        world, sibling, actor = self._mixed_actor(with_export_grant=True)
        response = _client(actor).get("/api/v1/applications/export/")
        assert response.status_code == 200, (response.status_code, getattr(response, "data", None))
        rows = _csv_rows(response)
        # Both of the school's applications are exported, although export was
        # granted for exactly one of them.
        assert len(rows) == 2, rows

    def test_same_widening_through_the_query_export(self):
        _world, _sibling_app, actor = self._mixed_actor(with_export_grant=True)
        response = _client(actor).get("/api/v1/admin/applications/?export=csv")
        assert response.status_code == 200, (response.status_code, getattr(response, "data", None))
        assert len(_csv_rows(response)) == 2


# ---------------------------------------------------------------------------
# Q2 — the authorization CapabilitySet is cached; three changes do not invalidate it
# ---------------------------------------------------------------------------


class TestQ2CachedAuthority:
    @pytest.fixture(autouse=True)
    def _cache_on(self, settings):
        # The flag the runbook plans to enable (docs/runbooks/
        # end-to-end-production-readiness-finalization.md).
        settings.PERF_CACHE_CAPABILITIES = True

    def test_flag_is_off_unless_the_environment_turns_it_on(self):
        import os

        import config.settings.base as base

        # config/settings/base.py reads PERF_CACHE_CAPABILITIES from the
        # environment; unset here, so the shipped default is the uncached path.
        assert not os.environ.get("PERF_CACHE_CAPABILITIES")
        assert base.PERF_CACHE_CAPABILITIES is False

    def test_expired_grant_keeps_authorizing_a_capability_only_write(self):
        inst = build_institution()
        actor = build_profile(role="admin")
        build_access_grant(
            user=actor,
            scope_type="institution",
            institution=inst,
            permissions=["manage"],
            expires_at=timezone.now() + timedelta(seconds=2),
        )
        service = AdminCapabilityService()
        assert "tenant.staff.invite" in service.get_institution_capabilities(_jwt(actor), inst)

        time.sleep(3)  # wall-clock expiry: no row changes, no signal fires

        fresh = service._compute_capabilities(_jwt(actor))
        assert str(inst.id) not in fresh.institution_capabilities, "grant really expired"
        assert "tenant.staff.invite" in service.get_institution_capabilities(_jwt(actor), inst), (
            "cached CapabilitySet still carries the expired grant"
        )

        payload = {
            "email": f"m11-{uuid.uuid4().hex[:8]}@example.com",
            "institution_id": str(inst.id),
            "role": "reviewer",
        }
        stale = _client(actor).post("/api/v1/admin/staff/invitations/", payload, format="json")
        assert stale.status_code not in (403, 404), (stale.status_code, stale.data)

        cache.clear()  # what a TTL expiry would eventually do
        payload["email"] = f"m11-{uuid.uuid4().hex[:8]}@example.com"
        fresh_response = _client(actor).post("/api/v1/admin/staff/invitations/", payload, format="json")
        assert fresh_response.status_code == 403, (fresh_response.status_code, fresh_response.data)

    def test_canonical_tenant_deactivation_does_not_invalidate(
        self, django_capture_on_commit_callbacks
    ):
        from apps.catalog.canonical_config_commands import apply_institution_profile_change

        inst = build_institution()
        actor = build_profile(role="admin")
        build_membership(user=actor, institution=inst, role="admin")
        service = AdminCapabilityService()
        assert str(inst.id) in service.get_capabilities(_jwt(actor)).institution_capabilities

        with django_capture_on_commit_callbacks(execute=True) as callbacks:
            apply_institution_profile_change(inst, {"is_active": False}, request=None)
        assert callbacks, "the institution post_save handler did register its on-commit resolver"
        assert not UserInstitutionMembership.objects.filter(user=actor, is_active=True).exists()

        fresh = service._compute_capabilities(_jwt(actor))
        assert str(inst.id) not in fresh.institution_capabilities
        cached = service.get_capabilities(_jwt(actor))
        assert str(inst.id) in cached.institution_capabilities, (
            "resolver ran after the memberships were already deactivated and found nobody"
        )

    def test_staff_invitation_revoke_does_not_invalidate(
        self, django_capture_on_commit_callbacks
    ):
        from apps.catalog.staff_invitation_service import StaffInvitationService

        inst = build_institution()
        actor = build_profile(role="admin")
        membership = build_membership(user=actor, institution=inst, role="admin")
        now = timezone.now()
        invitation = TenantStaffInvitation.objects.create(
            institution=inst,
            email=actor.email,
            invited_role="admin",
            permissions=[],
            status=TenantStaffInvitation.STATUS_ACCEPTED,
            profile=actor,
            membership=membership,
            accepted_at=now,
            created_at=now,
            updated_at=now,
        )
        service = AdminCapabilityService()
        assert str(inst.id) in service.get_capabilities(_jwt(actor)).institution_capabilities

        with django_capture_on_commit_callbacks(execute=True):
            StaffInvitationService().revoke(invitation)
        membership.refresh_from_db()
        assert membership.is_active is False

        fresh = service._compute_capabilities(_jwt(actor))
        assert str(inst.id) not in fresh.institution_capabilities
        cached = service.get_capabilities(_jwt(actor))
        assert str(inst.id) in cached.institution_capabilities

    def test_control_orm_save_path_does_invalidate(self, django_capture_on_commit_callbacks):
        inst = build_institution()
        actor = build_profile(role="admin")
        membership = build_membership(user=actor, institution=inst, role="admin")
        service = AdminCapabilityService()
        assert str(inst.id) in service.get_capabilities(_jwt(actor)).institution_capabilities

        with django_capture_on_commit_callbacks(execute=True):
            membership.is_active = False
            membership.save(update_fields=["is_active"])

        assert str(inst.id) not in service.get_capabilities(_jwt(actor)).institution_capabilities


# ---------------------------------------------------------------------------
# Q5 — tenant directory 403; the console's two replacement reads
# ---------------------------------------------------------------------------


class TestQ5TenantDirectory:
    def test_tenant_admin_reads(self):
        world_a, world_b = build_two_tenant_worlds()
        client = _client(world_a.staff)

        directory = client.get("/api/v1/admin/institutions/")
        assert directory.status_code == 403, (directory.status_code, directory.data)
        assert world_a.institution.name not in str(directory.data)

        own = client.get(f"/api/v1/admin/institutions/{world_a.institution_id}/")
        assert own.status_code == 200, own.data

        other = client.get(f"/api/v1/admin/institutions/{world_b.institution_id}/")
        unknown = client.get(f"/api/v1/admin/institutions/{uuid.uuid4()}/")
        assert other.status_code == 404 and unknown.status_code == 404
        assert other.data == unknown.data

        scope = client.get("/api/v1/admin/scope/")
        assert scope.status_code == 200, scope.data
        listed = {str(row["id"]) for row in scope.data["data"]["institutions"]}
        assert listed == {world_a.institution_id}, listed


# ---------------------------------------------------------------------------
# Q10 — the generic student write is refused; the canonical write needs both preconditions
# ---------------------------------------------------------------------------


class TestQ10CanonicalDraftWrite:
    def test_generic_student_write_is_refused(self):
        world = build_tenant_world(application_status="draft")
        client = _client(world.student)
        for method in ("put", "patch"):
            response = getattr(client, method)(
                f"/api/v1/applications/{world.application.id}/",
                {"residence_town": "Kitwe"},
                format="json",
            )
            assert response.status_code == 409, (method, response.status_code, response.data)
            assert response.data["code"] == "CANONICAL_DRAFT_UPDATE_REQUIRED"

    def test_canonical_write_requires_key_and_version(self):
        world = build_tenant_world(application_status="draft")
        client = _client(world.student)
        path = f"/api/v1/applications/drafts/{world.application.id}/"

        no_key = client.patch(path, {"residence_town": "Kitwe", "expected_version": 1}, format="json")
        no_version = client.patch(
            path, {"residence_town": "Kitwe"}, format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4())
        )
        assert no_key.status_code >= 400 and no_version.status_code >= 400, (
            no_key.status_code,
            no_version.status_code,
        )
        ok = client.patch(
            path,
            {"residence_town": "Kitwe", "expected_version": 1},
            format="json",
            HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
        )
        assert ok.status_code == 200, (ok.status_code, ok.data)
        world.application.refresh_from_db()
        assert world.application.residence_town == "Kitwe"
        assert world.application.version == 2


# ---------------------------------------------------------------------------
# Q12 — the two drift guards now fail on a calendar date, whatever the code says
# ---------------------------------------------------------------------------


class _AfterRemoveBy(date):
    @classmethod
    def today(cls):  # noqa: D401 - a fixed "today" one day after 2027-02-07
        return cls(2027, 2, 8)


class TestQ12CalendarGuards:
    def test_brand_guard_passes_today_and_fails_on_2027_02_08(self, monkeypatch):
        import tests.unit.test_brand_drift_guard as brand

        case = brand.BrandDriftGuardTests("test_allowlist_file_is_present_and_well_formed")
        case.test_allowlist_file_is_present_and_well_formed()  # green today

        monkeypatch.setattr(brand, "date", _AfterRemoveBy)
        with pytest.raises(AssertionError, match="expired"):
            case.test_allowlist_file_is_present_and_well_formed()

    def test_predicate_guard_passes_today_and_fails_on_2027_02_08(self, monkeypatch):
        import tests.unit.test_canonical_tenant_drift_guard as guard

        guard.test_allowed_predicates_have_owner_and_live_removal_date()  # green today

        monkeypatch.setattr(guard, "date", _AfterRemoveBy)
        with pytest.raises(AssertionError, match="future removal"):
            guard.test_allowed_predicates_have_owner_and_live_removal_date()
