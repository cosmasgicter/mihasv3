"""Tenant observability + audit tests — spec task 26.1.

Spec: ``multi-tenant-beanola-admissions`` — Phase 6 task 26.1
("Audit events for assignment, tenant config, uploads, document gen, scope
denials").

Covers Requirement 13 acceptance criteria:

- **R13.1** assignment decisions/failures, tenant config create/update/
  deactivate, asset uploads, official-document generation, and access-scope
  denials each write a non-PII ``audit_logs`` row (actor, action, target
  institution/application id, non-PII metadata).
- **R13.2** a Super_Admin-only view exposes recent tenant configuration changes
  + routing-failure events.
- **R13.3** a routing failure records canonical program, intake, and residency
  inputs.
- **R13.5** a per-institution audit view shown to School_Staff is scoped to the
  caller's institutions only; out-of-scope is masked as not-found.

These exercise the central :class:`TenantAuditService`
(``backend/apps/catalog/tenant_audit_service.py``), which reuses the existing
``audit_logs`` table (ADR-003) and the shared ``PaymentAuditService`` PII
redactor (R13.4 is proven exhaustively in task 26.2).

**Validates: Requirements R13.1, R13.2, R13.3, R13.5**
"""

from __future__ import annotations

import uuid
from types import SimpleNamespace

import pytest
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.catalog.services import AccessScopeService, OfferingAssignmentError, OfferingAssignmentService
from apps.catalog.tenant_audit_service import (
    ACTION_ASSIGNMENT_DECIDED,
    ACTION_ASSIGNMENT_FAILED,
    ACTION_DOCUMENT_VERIFICATION_DECIDED,
    ACTION_OFFICIAL_DOCUMENT_DOWNLOADED,
    ACTION_OFFICIAL_DOCUMENT_EMAILED,
    ACTION_OFFICIAL_DOCUMENT_GENERATED,
    ACTION_OFFICIAL_DOCUMENT_QUEUED,
    ACTION_PAYMENT_VERIFICATION_DECIDED,
    ACTION_REVIEW_DECIDED,
    ACTION_SCOPE_DENIED,
    TenantAuditService,
)
from apps.common.models import AuditLog
from tests.tenant_fixtures import (
    build_assignment_scenario,
    build_institution,
    build_profile,
    build_tenant_world,
    build_two_tenant_worlds,
    CandidateSpec,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


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


def _rows(body) -> list[dict]:
    if not isinstance(body, dict):
        return []
    data = body.get("data", body)
    rows = data.get("results", data) if isinstance(data, dict) else data
    return [r for r in rows if isinstance(r, dict)] if isinstance(rows, list) else []


def _actions(body) -> list[str]:
    return [r.get("action") for r in _rows(body)]


# ---------------------------------------------------------------------------
# R13.1 / R13.3 — assignment decided + failed events
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestAssignmentAuditEvents:
    """Assignment routing emits decided/failed Audit_Events (R13.1, R13.3).

    **Validates: Requirements R13.1, R13.3**
    """

    def test_successful_assignment_emits_decided_event(self):
        world = build_tenant_world()
        OfferingAssignmentService().assign(
            program_id=world.canonical_program_id,
            intake_id=world.intake_id,
            emit_audit=True,
            audit_source="test",
        )
        row = AuditLog.objects.filter(action=ACTION_ASSIGNMENT_DECIDED).order_by("-created_at").first()
        assert row is not None
        assert row.changes["canonical_program_id"] == world.canonical_program_id
        assert row.changes["intake_id"] == world.intake_id
        assert row.changes["program_offering_id"] == world.offering_id
        assert row.changes["institution_id"] == world.institution_id
        assert row.changes["decision"]["offering_priority"] == world.offering.assignment_priority
        assert "program_intake_priority" in row.changes["decision"]
        assert "offering_rule_keys" in row.changes["decision"]

    def test_routing_failure_records_coverage_gap_inputs(self):
        """A NO_ELIGIBLE_OFFERING failure records canonical program + intake +
        residency inputs so operators can fix coverage gaps (R13.3)."""
        # Build a scenario whose only candidate is blocked by residency rules so
        # assignment genuinely fails.
        scenario = build_assignment_scenario(
            [CandidateSpec(residency_rules={"countries": ["Zambia"]})]
        )
        with pytest.raises(OfferingAssignmentError):
            OfferingAssignmentService().assign(
                program_id=scenario.canonical_program_id,
                intake_id=scenario.intake_id,
                country="Botswana",
                nationality="Motswana",
                emit_audit=True,
                audit_source="test",
            )
        row = AuditLog.objects.filter(action=ACTION_ASSIGNMENT_FAILED).order_by("-created_at").first()
        assert row is not None
        assert row.changes["canonical_program_id"] == scenario.canonical_program_id
        assert row.changes["intake_id"] == scenario.intake_id
        assert row.changes["country"] == "Botswana"
        assert row.changes["nationality"] == "Motswana"
        assert row.changes["code"] == "NO_ELIGIBLE_OFFERING"

    def test_assignment_without_emit_flag_writes_no_audit(self):
        """The read-only preview/simulate path (emit_audit=False) must not flood
        the audit log."""
        world = build_tenant_world()
        before = AuditLog.objects.filter(action=ACTION_ASSIGNMENT_DECIDED).count()
        OfferingAssignmentService().assign(
            program_id=world.canonical_program_id,
            intake_id=world.intake_id,
        )
        after = AuditLog.objects.filter(action=ACTION_ASSIGNMENT_DECIDED).count()
        assert after == before


# ---------------------------------------------------------------------------
# R13.4 (design-now) — payload carries no plaintext PII
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestAuditPayloadRedaction:
    """Tenant audit payloads inherit the shared PII redactor (R13.4 design).

    **Validates: Requirements R13.1, R13.4**
    """

    def test_phone_and_nrc_are_masked(self):
        TenantAuditService.record_event(
            action="tenant.institution.updated",
            entity_type="institution",
            entity_id=uuid.uuid4(),
            metadata={"phone": "+260971234567", "nrc_number": "123456/78/9", "note": "ok"},
        )
        row = AuditLog.objects.filter(action="tenant.institution.updated").order_by("-created_at").first()
        assert row is not None
        # Phone replaced with hash + last4 (never the full number).
        assert "+260971234567" not in str(row.changes)
        assert row.changes["phone"]["phone_last4"] == "4567"
        # NRC replaced with a hash (never the raw value).
        assert row.changes["nrc_number"] != "123456/78/9"
        assert row.changes["note"] == "ok"


# ---------------------------------------------------------------------------
# R13.1 — tenant config-change events through the admin endpoints
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestTenantConfigAuditEvents:
    """Tenant config writes emit ``tenant.<resource>.<verb>`` events (R13.1).

    **Validates: Requirements R13.1**
    """

    def test_institution_create_emits_created_event(self):
        super_admin = build_profile(role="super_admin")
        client = _client_for(super_admin)
        resp = client.post(
            "/api/v1/admin/institutions/",
            {
                "name": "Audit School",
                "code": "AUD-1",
                "slug": "audit-school",
                "full_name": "Audit School of Health",
            },
            format="json",
        )
        assert resp.status_code == 201, resp.json()
        institution_id = resp.json()["data"]["id"]
        row = AuditLog.objects.filter(action="tenant.institution.created").order_by("-created_at").first()
        assert row is not None
        assert str(row.entity_id) == institution_id
        assert str(row.actor_id) == str(super_admin.id)
        assert row.changes["institution_id"] == institution_id

    def test_institution_deactivate_emits_deactivated_event(self):
        world = build_tenant_world()
        super_admin = build_profile(role="super_admin")
        client = _client_for(super_admin)
        resp = client.patch(
            f"/api/v1/admin/institutions/{world.institution_id}/",
            {"is_active": False},
            format="json",
        )
        assert resp.status_code == 200, resp.json()
        assert AuditLog.objects.filter(
            action="tenant.institution.deactivated",
            entity_id=world.institution.id,
        ).exists()

    def test_membership_create_emits_event(self):
        world = build_tenant_world()
        super_admin = build_profile(role="super_admin")
        target = build_profile(role="admin")
        client = _client_for(super_admin)
        resp = client.post(
            "/api/v1/admin/memberships/",
            {
                "user_id": str(target.id),
                "institution_id": world.institution_id,
                "role": "admin",
            },
            format="json",
        )
        assert resp.status_code == 201, resp.json()
        assert AuditLog.objects.filter(action="tenant.membership.created").exists()


@pytest.mark.django_db
class TestTask39AuditCoverageMatrix:
    """Every canonical Task 39 audit family writes a non-PII AuditLog row.

    **Validates: canonical-multi-tenant-alignment Task 39.1-39.10**
    """

    def test_tenant_config_action_matrix_is_complete(self):
        institution_id = uuid.uuid4()
        matrix = [
            ("institution", "created"),
            ("institution", "updated"),
            ("institution", "deactivated"),
            ("domain", "created"),
            ("domain", "activated"),
            ("domain", "updated"),
            ("domain", "deactivated"),
            ("asset", "created"),
            ("asset", "updated"),
            ("asset", "deactivated"),
            ("document_profile", "created"),
            ("document_profile", "updated"),
            ("document_profile", "deactivated"),
            ("required_document", "created"),
            ("required_document", "updated"),
            ("required_document", "deactivated"),
            ("program", "updated"),
            ("membership", "created"),
            ("membership", "updated"),
            ("membership", "deactivated"),
            ("grant", "created"),
            ("grant", "updated"),
            ("grant", "deactivated"),
        ]

        for resource, verb in matrix:
            TenantAuditService.record_config_change(
                resource=resource,
                verb=verb,
                entity_id=uuid.uuid4(),
                institution_id=institution_id,
                actor_id=uuid.uuid4(),
                actor_role="super_admin",
                metadata={
                    "phone": "+260971234567",
                    "safe_change": "enabled",
                },
            )

        actions = set(AuditLog.objects.values_list("action", flat=True))
        for resource, verb in matrix:
            assert f"tenant.{resource}.{verb}" in actions

        for row in AuditLog.objects.filter(action__startswith="tenant."):
            serialized = str(row.changes)
            assert "+260971234567" not in serialized
            assert row.changes["safe_change"] == "enabled"
            assert row.changes["institution_id"] == str(institution_id)

    def test_asset_upload_and_official_document_lifecycle_actions_are_complete(self):
        institution_id = uuid.uuid4()
        application_id = uuid.uuid4()
        document_id = uuid.uuid4()

        TenantAuditService.record_asset_upload(
            asset_id=uuid.uuid4(),
            institution_id=institution_id,
            asset_type="signature",
            version=3,
            mime_type="image/png",
            checksum_sha256="a" * 64,
            actor_id=uuid.uuid4(),
            actor_role="super_admin",
        )
        TenantAuditService.record_official_document_queued(
            application_id=application_id,
            institution_id=institution_id,
            document_type="application_slip",
            task_id="celery-task-1",
            actor_id=uuid.uuid4(),
            actor_role="student",
        )
        TenantAuditService.record_official_document_generated(
            application_id=application_id,
            institution_id=institution_id,
            document_type="application_slip",
            template_id=uuid.uuid4(),
            template_version=2,
        )
        TenantAuditService.record_official_document_downloaded(
            document_id=document_id,
            application_id=application_id,
            institution_id=institution_id,
            document_type="application_slip",
            actor_id=uuid.uuid4(),
            actor_role="student",
        )
        TenantAuditService.record_official_document_emailed(
            application_id=application_id,
            institution_id=institution_id,
            document_type="application_slip",
            actor_id=uuid.uuid4(),
            actor_role="student",
        )

        actions = set(AuditLog.objects.values_list("action", flat=True))
        assert "tenant.asset.uploaded" in actions
        assert ACTION_OFFICIAL_DOCUMENT_QUEUED in actions
        assert ACTION_OFFICIAL_DOCUMENT_GENERATED in actions
        assert ACTION_OFFICIAL_DOCUMENT_DOWNLOADED in actions
        assert ACTION_OFFICIAL_DOCUMENT_EMAILED in actions

        for row in AuditLog.objects.filter(action__startswith="official_document."):
            serialized = str(row.changes).lower()
            assert "student@example.com" not in serialized
            assert "storage_key" not in serialized
            assert "file_url" not in serialized
            assert row.changes["institution_id"] == str(institution_id)

    def test_application_decision_and_denial_actions_are_complete(self):
        institution_id = uuid.uuid4()
        application_id = uuid.uuid4()
        actor_id = uuid.uuid4()

        TenantAuditService.record_review_decision(
            application_id=application_id,
            institution_id=institution_id,
            old_status="submitted",
            new_status="approved",
            actor_id=actor_id,
            actor_role="super_admin",
            reason="Approved after review",
        )
        TenantAuditService.record_document_verification(
            document_id=uuid.uuid4(),
            application_id=application_id,
            institution_id=institution_id,
            document_type="nrc",
            new_status="verified",
            actor_id=actor_id,
            actor_role="super_admin",
            reason="Readable",
        )
        TenantAuditService.record_payment_verification(
            payment_id=uuid.uuid4(),
            application_id=application_id,
            institution_id=institution_id,
            outcome_status="verified",
            outcome_code="PROVIDER_VERIFIED",
            actor_id=actor_id,
            actor_role="super_admin",
            reason="Provider matched",
        )
        TenantAuditService.record_scope_denied(
            resource_type="application",
            resource_id=application_id,
            actor_id=actor_id,
            actor_role="admin",
        )

        actions = set(AuditLog.objects.values_list("action", flat=True))
        assert ACTION_REVIEW_DECIDED in actions
        assert ACTION_DOCUMENT_VERIFICATION_DECIDED in actions
        assert ACTION_PAYMENT_VERIFICATION_DECIDED in actions
        assert ACTION_SCOPE_DENIED in actions

        denied = AuditLog.objects.get(action=ACTION_SCOPE_DENIED)
        assert denied.retention_category == "security"
        assert denied.changes["resource_type"] == "application"
        assert denied.changes["actor_role"] == "admin"
        assert "institution_id" not in denied.changes

    def test_official_document_failure_helpers_write_non_pii_failure_events(self):
        from apps.applications.tasks.pdf_generation import (
            _audit_profile_not_configured,
            _audit_render_failure,
        )

        application = SimpleNamespace(id=uuid.uuid4(), institution_ref_id=uuid.uuid4())
        _audit_render_failure(
            application,
            "acceptance_letter",
            RuntimeError("contains applicant name and phone +260971234567"),
            attempts=3,
        )
        _audit_profile_not_configured(
            application,
            "conditional_offer",
            SimpleNamespace(code="DOCUMENT_PROFILE_NOT_CONFIGURED"),
        )

        rows = list(AuditLog.objects.filter(action="official_document_render_failed"))
        assert len(rows) == 2
        for row in rows:
            serialized = str(row.changes)
            assert "+260971234567" not in serialized
            assert "applicant name" not in serialized.lower()
            assert row.changes["institution_id"] == str(application.institution_ref_id)
            assert row.changes["recoverable"] is True


# ---------------------------------------------------------------------------
# R13.1 — scope-denial events
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestScopeDenialAuditEvent:
    """A masked out-of-scope read emits a ``scope.denied`` event (R13.1).

    **Validates: Requirements R13.1**
    """

    @pytest.fixture()
    def production_scope(self, monkeypatch):
        monkeypatch.setattr(
            AccessScopeService, "_test_settings_active", staticmethod(lambda: False)
        )

    def test_out_of_scope_application_read_emits_scope_denied(self, production_scope):
        world_a, world_b = build_two_tenant_worlds(application_status="submitted")
        # Staff B is scoped to school B only (real membership), reads school A.
        client = _client_for(world_b.staff)
        resp = client.get(f"/api/v1/applications/{world_a.application_id}/")
        assert resp.status_code == 404
        row = AuditLog.objects.filter(action=ACTION_SCOPE_DENIED).order_by("-created_at").first()
        assert row is not None
        assert str(row.entity_id) == world_a.application_id
        assert row.retention_category == "security"


# ---------------------------------------------------------------------------
# R13.2 — Super_Admin operational-review view
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestSuperAdminTenantAuditView:
    """Super_Admin-only recent config-changes + routing-failures feed (R13.2).

    **Validates: Requirements R13.2**
    """

    URL = "/api/v1/admin/tenant-audit/"

    def _seed(self):
        inst = build_institution()
        TenantAuditService.record_config_change(
            resource="institution", verb="created", entity_id=inst.id, institution_id=inst.id
        )
        TenantAuditService.record_assignment_failed(
            program_id=uuid.uuid4(), intake_id=uuid.uuid4(), code="NO_ELIGIBLE_OFFERING"
        )
        # A non-observability event that must NOT surface here.
        TenantAuditService.record_scope_denied(resource_type="application", resource_id=uuid.uuid4())
        return inst

    def test_super_admin_sees_config_and_routing_failures(self):
        self._seed()
        client = _client_for(build_profile(role="super_admin"))
        resp = client.get(self.URL)
        assert resp.status_code == 200, resp.json()
        actions = _actions(resp.json())
        assert "tenant.institution.created" in actions
        assert ACTION_ASSIGNMENT_FAILED in actions
        # Scope-denied is not part of the config/routing feed.
        assert ACTION_SCOPE_DENIED not in actions

    def test_category_filter_routing_failure_only(self):
        self._seed()
        client = _client_for(build_profile(role="super_admin"))
        resp = client.get(self.URL, {"category": "routing_failure"})
        assert resp.status_code == 200
        actions = set(_actions(resp.json()))
        assert actions <= {ACTION_ASSIGNMENT_FAILED}
        assert ACTION_ASSIGNMENT_FAILED in actions

    def test_non_super_admin_is_forbidden(self):
        self._seed()
        client = _client_for(build_profile(role="admin"))
        resp = client.get(self.URL)
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# R13.5 — per-institution scoped audit view
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestPerInstitutionAuditScope:
    """The per-institution audit view is scoped to the caller (R13.5).

    **Validates: Requirements R13.5**
    """

    @pytest.fixture()
    def production_scope(self, monkeypatch):
        monkeypatch.setattr(
            AccessScopeService, "_test_settings_active", staticmethod(lambda: False)
        )

    def _url(self, institution_id):
        return f"/api/v1/admin/institutions/{institution_id}/audit/"

    def _seed_events(self, world):
        TenantAuditService.record_config_change(
            resource="domain",
            verb="created",
            entity_id=uuid.uuid4(),
            institution_id=world.institution.id,
        )

    def test_super_admin_sees_institution_events(self):
        world = build_tenant_world()
        self._seed_events(world)
        client = _client_for(build_profile(role="super_admin"))
        resp = client.get(self._url(world.institution_id))
        assert resp.status_code == 200, resp.json()
        assert "tenant.domain.created" in _actions(resp.json())

    def test_scoped_staff_sees_only_their_institution(self, production_scope):
        world_a, world_b = build_two_tenant_worlds()
        self._seed_events(world_a)
        self._seed_events(world_b)
        # Staff A has a real membership to school A; reading A's audit is allowed.
        client = _client_for(world_a.staff)
        resp = client.get(self._url(world_a.institution_id))
        assert resp.status_code == 200, resp.json()
        assert "tenant.domain.created" in _actions(resp.json())

    def test_out_of_scope_institution_is_not_found(self, production_scope):
        world_a, world_b = build_two_tenant_worlds()
        self._seed_events(world_a)
        # Staff B asks for school A's audit → masked as not-found (R13.5).
        client = _client_for(world_b.staff)
        resp = client.get(self._url(world_a.institution_id))
        assert resp.status_code == 404
