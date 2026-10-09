"""Durable resumable tenant onboarding workflow — V2 API integration (task 4.1).

Spec: ``.kiro/specs/admissions-v2-canonical-rebuild/`` task 4.1
Requirements: R4.1-R4.6
Findings: TEN-01, TEN-02
Design: design.md §6.1 (TenantOnboarding aggregate + state machine),
        §6.2 (readiness invariants / blockers), §14 (V2 envelope), §17 (outbox).

The paired ``tests/unit/test_tenant_onboarding_service.py`` proves the service
aggregate directly. This module proves the **server workflow API** that replaces
the fragile client multi-call orchestration (TEN-01): the browser no longer
creates an institution, then an admin, then a membership across several calls
(misreading shapes, stopping half-way, marking the tenant active on create).
Instead it makes single durable server workflow calls — begin, record-step,
blockers, submit, activate, reject, cancel, suspend, resume — each an audited,
idempotent, transactional command behind a ``platform.tenant.*`` capability.

It exercises every state, the idempotent begin/step retry, the compensating
begin failure (no orphan institution), the blocker-gated activation, and the
authority boundary (anonymous 401, non-super-admin 403) entirely through the
DRF test client and the canonical V2 envelope.

Run (sqlite test DB, never the production/Neon DB)::

    cd backend && DJANGO_SETTINGS_MODULE=config.settings.test \
      .venv/bin/python -m pytest tests/integration/test_tenant_onboarding_workflow.py -q

**Validates: Requirements 4.1, 4.2, 4.4, 4.5, 4.6**
"""

from __future__ import annotations

import uuid

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.catalog.models import (
    Institution,
    InstitutionAsset,
    InstitutionDocumentProfile,
    TenantOnboarding,
)
from apps.common.models import AuditLog, OutboxEvent
from tests.tenant_fixtures import (
    build_canonical_program,
    build_membership,
    build_offering,
    build_profile,
)

pytestmark = [pytest.mark.django_db, pytest.mark.tenant]

ONBOARDING_URL = "/api/v2/admin/onboarding/"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


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


def _profile_payload(suffix: str) -> dict:
    return {
        "name": f"New Tenant {suffix}",
        "code": f"NEW-{suffix.upper()}",
        "slug": f"new-tenant-{suffix}",
        "brand_name": f"New Tenant {suffix}",
        "support_email": f"support-{suffix}@newtenant.edu",
        "admissions_email": f"admissions-{suffix}@newtenant.edu",
        "primary_color": "#0F766E",
    }


def _data(response) -> dict:
    """Return the V2 success-envelope ``data`` payload."""
    body = response.json()
    assert body["success"] is True, body
    assert body["meta"]["api_version"] == "v2"
    return body["data"]


def _error(response) -> dict:
    """Return the V2 error-envelope ``error`` payload."""
    body = response.json()
    assert body["success"] is False, body
    return body["error"]


def _make_launch_ready(institution: Institution, *, suffix: str) -> None:
    """Create every blocking readiness prerequisite for ``institution``.

    Mirrors ``build_tenant_readiness`` blocking items: active logo + signature
    assets, an active document profile, an active program offering, and an
    active tenant-admin membership.
    """
    now = timezone.now()
    for asset_type in ("logo", "signature"):
        InstitutionAsset.objects.create(
            id=uuid.uuid4(),
            institution=institution,
            asset_type=asset_type,
            storage_key=f"institution-assets/{institution.id}/{asset_type}.png",
            mime_type="image/png",
            checksum_sha256="0" * 64,
            version=1,
            is_active=True,
            created_at=now,
        )
    InstitutionDocumentProfile.objects.create(
        id=uuid.uuid4(),
        institution=institution,
        document_type="acceptance_letter",
        layout_key="simple_letter",
        sections={},
        fee_chart=[],
        bank_accounts=[],
        requirements=[],
        signatory={},
        version=1,
        is_active=True,
        created_at=now,
        updated_at=now,
    )
    canonical = build_canonical_program(suffix=suffix)
    build_offering(
        institution=institution,
        canonical_program=canonical,
        suffix=suffix,
        offering_status="active",
        is_active=True,
    )
    admin = build_profile(role="admin", suffix=f"ta-{suffix}")
    build_membership(user=admin, institution=institution, role="admin", is_active=True)


def _begin(client, suffix: str, *, idempotency_key: str | None = None):
    headers = {}
    if idempotency_key:
        headers["HTTP_IDEMPOTENCY_KEY"] = idempotency_key
    return client.post(ONBOARDING_URL, _profile_payload(suffix), format="json", **headers)


# ---------------------------------------------------------------------------
# begin — never active on create, idempotent, compensating (R4.1, R4.4)
# ---------------------------------------------------------------------------


class TestBeginApi:
    def test_begin_creates_inactive_tenant_and_draft_workflow(self):
        actor = build_profile(role="super_admin")
        client = _client_for(actor)
        sfx = uuid.uuid4().hex[:8]
        response = _begin(client, sfx)
        assert response.status_code == 201, response.content
        data = _data(response)
        # R4.1: durable draft workflow with an explicit completion state.
        assert data["state"] == TenantOnboarding.STATE_DRAFT
        assert data["current_step"] is not None
        assert data["configuration_version"] == 1
        # R4.1 / TEN-02: the institution is NEVER active on create.
        institution = Institution.objects.get(id=data["institution_id"])
        assert institution.is_active is False
        # R4.5: live-derived blockers are returned with the aggregate.
        assert data["blockers"], "a brand-new tenant should report blockers"

    def test_begin_is_idempotent_on_replay(self):
        # R4.1: a retried begin with the same Idempotency-Key returns the same
        # onboarding rather than creating a second orphan institution.
        actor = build_profile(role="super_admin")
        client = _client_for(actor)
        sfx = uuid.uuid4().hex[:8]
        key = f"begin-{sfx}"
        first = _data(_begin(client, sfx, idempotency_key=key))
        before = Institution.objects.count()
        second = _data(_begin(client, sfx, idempotency_key=key))
        assert second["id"] == first["id"]
        assert Institution.objects.count() == before  # no second institution

    def test_begin_duplicate_code_compensates_no_orphan(self):
        # R4.4: a failed begin (duplicate institution code) leaves NO orphan
        # institution and returns a stable INSTITUTION_CONFLICT error.
        actor = build_profile(role="super_admin")
        client = _client_for(actor)
        sfx = uuid.uuid4().hex[:8]
        _begin(client, sfx)
        before = Institution.objects.count()
        dup_payload = _profile_payload(uuid.uuid4().hex[:8])
        dup_payload["code"] = f"NEW-{sfx.upper()}"  # collide with the first code
        response = client.post(ONBOARDING_URL, dup_payload, format="json")
        assert response.status_code == 409, response.content
        assert _error(response)["code"] == "INSTITUTION_CONFLICT"
        assert Institution.objects.count() == before  # no orphan created

    def test_begin_missing_required_fields_is_validation_error(self):
        actor = build_profile(role="super_admin")
        client = _client_for(actor)
        response = client.post(ONBOARDING_URL, {"name": "No Code Tenant"}, format="json")
        assert response.status_code == 400, response.content
        assert _error(response)["code"] == "VALIDATION_ERROR"


# ---------------------------------------------------------------------------
# record-step + blockers + detail (R4.2, R4.5)
# ---------------------------------------------------------------------------


class TestConfigureApi:
    def _begin_one(self, client):
        sfx = uuid.uuid4().hex[:8]
        return _data(_begin(client, sfx)), sfx

    def test_record_step_marks_complete_and_bumps_version(self):
        client = _client_for(build_profile(role="super_admin"))
        onboarding, _ = self._begin_one(client)
        oid = onboarding["id"]
        response = client.post(
            f"{ONBOARDING_URL}{oid}/steps/", {"step": "branding"}, format="json"
        )
        assert response.status_code == 200, response.content
        data = _data(response)
        assert data["steps"]["branding"]["completed"] is True
        assert data["current_step"] == "branding"
        assert data["configuration_version"] == 2

    def test_record_step_idempotent_replay_does_not_bump(self):
        client = _client_for(build_profile(role="super_admin"))
        onboarding, _ = self._begin_one(client)
        oid = onboarding["id"]
        first = _data(
            client.post(f"{ONBOARDING_URL}{oid}/steps/", {"step": "branding"}, format="json")
        )
        again = _data(
            client.post(f"{ONBOARDING_URL}{oid}/steps/", {"step": "branding"}, format="json")
        )
        assert again["configuration_version"] == first["configuration_version"]

    def test_record_unknown_step_rejected(self):
        client = _client_for(build_profile(role="super_admin"))
        onboarding, _ = self._begin_one(client)
        oid = onboarding["id"]
        response = client.post(
            f"{ONBOARDING_URL}{oid}/steps/", {"step": "not-a-real-step"}, format="json"
        )
        # ChoiceField rejects the unknown step at the transport layer.
        assert response.status_code == 400, response.content
        assert _error(response)["code"] == "VALIDATION_ERROR"

    def test_blockers_endpoint_reports_live_readiness(self):
        client = _client_for(build_profile(role="super_admin"))
        onboarding, _ = self._begin_one(client)
        oid = onboarding["id"]
        data = _data(client.get(f"{ONBOARDING_URL}{oid}/blockers/"))
        assert data["launch_ready"] is False
        keys = {b["key"] for b in data["blockers"]}
        assert {"logo", "signature", "document_profile", "program_offering", "tenant_admin"} <= keys

    def test_detail_returns_readiness_aggregate(self):
        client = _client_for(build_profile(role="super_admin"))
        onboarding, _ = self._begin_one(client)
        oid = onboarding["id"]
        data = _data(client.get(f"{ONBOARDING_URL}{oid}/"))
        assert data["id"] == oid
        assert "readiness" in data
        assert data["readiness"]["launch_ready"] is False


# ---------------------------------------------------------------------------
# activate — blocker-gated, audited, idempotent (R4.6)
# ---------------------------------------------------------------------------


class TestActivateApi:
    def test_activate_blocked_when_not_ready(self):
        client = _client_for(build_profile(role="super_admin"))
        sfx = uuid.uuid4().hex[:8]
        onboarding = _data(_begin(client, sfx))
        oid = onboarding["id"]
        response = client.post(f"{ONBOARDING_URL}{oid}/activate/", {}, format="json")
        assert response.status_code == 409, response.content
        assert _error(response)["code"] == "ONBOARDING_BLOCKED"
        # State unchanged and institution still inactive (R4.6).
        row = TenantOnboarding.objects.get(id=oid)
        assert row.state == TenantOnboarding.STATE_DRAFT
        assert Institution.objects.get(id=onboarding["institution_id"]).is_active is False

    def test_activate_succeeds_when_launch_ready_and_audits(self):
        client = _client_for(build_profile(role="super_admin"))
        sfx = uuid.uuid4().hex[:8]
        onboarding = _data(_begin(client, sfx))
        oid = onboarding["id"]
        _make_launch_ready(Institution.objects.get(id=onboarding["institution_id"]), suffix=sfx)
        data = _data(client.post(f"{ONBOARDING_URL}{oid}/activate/", {}, format="json"))
        assert data["state"] == TenantOnboarding.STATE_ACTIVE
        assert data["activated_at"] is not None
        assert data["blockers"] == []
        assert Institution.objects.get(id=onboarding["institution_id"]).is_active is True
        # R4.6: one audited event + a durable outbox record on activation.
        assert AuditLog.objects.filter(action="tenant.onboarding.activated").exists()
        assert OutboxEvent.objects.filter(
            aggregate_id=oid, event_type="tenant.onboarding.activated"
        ).exists()

    def test_activate_idempotent_when_already_active(self):
        client = _client_for(build_profile(role="super_admin"))
        sfx = uuid.uuid4().hex[:8]
        onboarding = _data(_begin(client, sfx))
        oid = onboarding["id"]
        _make_launch_ready(Institution.objects.get(id=onboarding["institution_id"]), suffix=sfx)
        client.post(f"{ONBOARDING_URL}{oid}/activate/", {}, format="json")
        again = client.post(f"{ONBOARDING_URL}{oid}/activate/", {}, format="json")
        assert again.status_code == 200, again.content
        assert _data(again)["state"] == TenantOnboarding.STATE_ACTIVE


# ---------------------------------------------------------------------------
# lifecycle transitions — submit / reject / cancel / suspend / resume
# ---------------------------------------------------------------------------


class TestLifecycleApi:
    def test_submit_then_activate_from_in_review(self):
        client = _client_for(build_profile(role="super_admin"))
        sfx = uuid.uuid4().hex[:8]
        onboarding = _data(_begin(client, sfx))
        oid = onboarding["id"]
        _make_launch_ready(Institution.objects.get(id=onboarding["institution_id"]), suffix=sfx)
        submitted = _data(client.post(f"{ONBOARDING_URL}{oid}/submit/", {}, format="json"))
        assert submitted["state"] == TenantOnboarding.STATE_IN_REVIEW
        activated = _data(client.post(f"{ONBOARDING_URL}{oid}/activate/", {}, format="json"))
        assert activated["state"] == TenantOnboarding.STATE_ACTIVE

    def test_reject_from_in_review(self):
        client = _client_for(build_profile(role="super_admin"))
        sfx = uuid.uuid4().hex[:8]
        onboarding = _data(_begin(client, sfx))
        oid = onboarding["id"]
        client.post(f"{ONBOARDING_URL}{oid}/submit/", {}, format="json")
        rejected = _data(
            client.post(
                f"{ONBOARDING_URL}{oid}/reject/",
                {"reason": "Incomplete documentation"},
                format="json",
            )
        )
        assert rejected["state"] == TenantOnboarding.STATE_REJECTED
        assert Institution.objects.get(id=onboarding["institution_id"]).is_active is False

    def test_reject_from_draft_is_invalid_state(self):
        client = _client_for(build_profile(role="super_admin"))
        sfx = uuid.uuid4().hex[:8]
        onboarding = _data(_begin(client, sfx))
        oid = onboarding["id"]
        response = client.post(f"{ONBOARDING_URL}{oid}/reject/", {"reason": "nope"}, format="json")
        assert response.status_code == 409, response.content
        assert _error(response)["code"] == "ONBOARDING_INVALID_STATE"

    def test_cancel_from_draft(self):
        client = _client_for(build_profile(role="super_admin"))
        sfx = uuid.uuid4().hex[:8]
        onboarding = _data(_begin(client, sfx))
        oid = onboarding["id"]
        cancelled = _data(
            client.post(f"{ONBOARDING_URL}{oid}/cancel/", {"reason": "Duplicate"}, format="json")
        )
        assert cancelled["state"] == TenantOnboarding.STATE_CANCELLED

    def test_suspend_then_resume(self):
        client = _client_for(build_profile(role="super_admin"))
        sfx = uuid.uuid4().hex[:8]
        onboarding = _data(_begin(client, sfx))
        oid = onboarding["id"]
        _make_launch_ready(Institution.objects.get(id=onboarding["institution_id"]), suffix=sfx)
        client.post(f"{ONBOARDING_URL}{oid}/activate/", {}, format="json")
        suspended = _data(
            client.post(f"{ONBOARDING_URL}{oid}/suspend/", {"reason": "Compliance hold"}, format="json")
        )
        assert suspended["state"] == TenantOnboarding.STATE_SUSPENDED
        assert Institution.objects.get(id=onboarding["institution_id"]).is_active is False
        resumed = _data(client.post(f"{ONBOARDING_URL}{oid}/resume/", {}, format="json"))
        assert resumed["state"] == TenantOnboarding.STATE_ACTIVE
        assert Institution.objects.get(id=onboarding["institution_id"]).is_active is True


# ---------------------------------------------------------------------------
# list + authority boundary (R4, design §5.2)
# ---------------------------------------------------------------------------


class TestListAndAuthority:
    def test_list_is_paginated_envelope(self):
        client = _client_for(build_profile(role="super_admin"))
        _begin(client, uuid.uuid4().hex[:8])
        _begin(client, uuid.uuid4().hex[:8])
        data = _data(client.get(ONBOARDING_URL))
        assert set(data.keys()) >= {"page", "page_size", "total_count", "results"}
        assert data["total_count"] >= 2

    def test_anonymous_is_unauthenticated(self):
        response = APIClient().post(ONBOARDING_URL, _profile_payload("anon"), format="json")
        assert response.status_code == 401, response.content

    def test_non_super_admin_is_forbidden(self):
        # A student (and a bare admin with no membership) has zero platform
        # capabilities: begin is denied by the backend, not just hidden in the UI.
        student = build_profile(role="student")
        response = _begin(_client_for(student), uuid.uuid4().hex[:8])
        assert response.status_code == 403, response.content
        assert _error(response)["code"] == "INSUFFICIENT_PERMISSIONS"

    def test_bare_admin_without_membership_forbidden(self):
        admin = build_profile(role="admin")
        response = _begin(_client_for(admin), uuid.uuid4().hex[:8])
        assert response.status_code == 403, response.content

    def test_detail_unknown_id_is_not_found(self):
        client = _client_for(build_profile(role="super_admin"))
        response = client.get(f"{ONBOARDING_URL}{uuid.uuid4()}/")
        assert response.status_code == 404, response.content
