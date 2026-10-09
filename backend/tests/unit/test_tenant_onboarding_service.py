"""Durable resumable tenant onboarding workflow — service tests (task 4.1).

Spec: ``.kiro/specs/admissions-v2-canonical-rebuild/`` task 4.1
Requirements: R4.1-R4.6
Findings: TEN-01, TEN-02
Design: design.md §6.1 (TenantOnboarding aggregate + state machine),
        §6.2 (readiness invariants / blockers), §17 (durable committed outbox).

These exercise the ``TenantOnboardingService`` aggregate directly (no HTTP) and
prove every state transition, the idempotent ``begin``/step retry behaviour, the
live-derived blocker query, the blocker-gated audited activation, and the
begin-time compensation that leaves no orphan institution. The paired API
surface is covered by ``tests/integration/test_tenant_onboarding_workflow.py``.

Run (sqlite test DB, never the production/Neon DB)::

    cd backend && DJANGO_SETTINGS_MODULE=config.settings.test \
      .venv/bin/python -m pytest tests/unit/test_tenant_onboarding_service.py -q

**Validates: Requirements 4.1, 4.2, 4.4, 4.5, 4.6**
"""

from __future__ import annotations

import uuid

import pytest
from django.utils import timezone

from apps.catalog.models import (
    Institution,
    InstitutionAsset,
    InstitutionDocumentProfile,
    TenantOnboarding,
    UserInstitutionMembership,
)
from apps.catalog.onboarding_service import (
    OnboardingError,
    OnboardingStateMachine,
    TenantOnboardingService,
)
from apps.common.models import AuditLog, OutboxEvent
from tests.tenant_fixtures import (
    build_canonical_program,
    build_membership,
    build_offering,
    build_profile,
)

pytestmark = [pytest.mark.django_db, pytest.mark.tenant]


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


# ---------------------------------------------------------------------------
# State machine (design §6.1)
# ---------------------------------------------------------------------------


class TestOnboardingStateMachine:
    def test_allowed_transitions(self):
        allowed = [
            ("draft", "in_review"),
            ("draft", "active"),
            ("draft", "cancelled"),
            ("in_review", "active"),
            ("in_review", "rejected"),
            ("in_review", "cancelled"),
            ("active", "suspended"),
            ("suspended", "active"),
        ]
        for src, dst in allowed:
            assert OnboardingStateMachine.can_transition(src, dst) is True

    def test_rejected_transitions(self):
        rejected = [
            ("draft", "draft"),  # no-op self transition
            ("active", "draft"),  # cannot rewind a launched tenant
            ("rejected", "active"),  # terminal
            ("cancelled", "active"),  # terminal
            ("draft", "suspended"),  # only an active tenant suspends
            ("suspended", "suspended"),
            ("active", "rejected"),
        ]
        for src, dst in rejected:
            assert OnboardingStateMachine.can_transition(src, dst) is False

    def test_terminal_states_have_no_targets(self):
        assert OnboardingStateMachine.allowed_targets("rejected") == frozenset()
        assert OnboardingStateMachine.allowed_targets("cancelled") == frozenset()


# ---------------------------------------------------------------------------
# begin — never active on create, idempotent, compensating (R4.1, R4.4)
# ---------------------------------------------------------------------------


class TestBegin:
    def test_begin_creates_inactive_institution_and_draft_workflow(self):
        actor = build_profile(role="super_admin")
        sfx = uuid.uuid4().hex[:8]
        onboarding = TenantOnboardingService().begin(
            profile=_profile_payload(sfx),
            created_by_id=actor.id,
        )
        # R4.1: durable draft workflow with an explicit completion state.
        assert onboarding.state == TenantOnboarding.STATE_DRAFT
        assert onboarding.current_step is not None
        assert onboarding.configuration_version == 1
        # R4.1 / TEN-02: the institution is NEVER active on create.
        institution = Institution.objects.get(id=onboarding.institution_id)
        assert institution.is_active is False
        # R4.1: idempotency key is even absent-safe (no accidental collisions).
        assert TenantOnboarding.objects.filter(institution_id=institution.id).count() == 1

    def test_begin_forces_inactive_even_when_payload_requests_active(self):
        # The old fragile client sent is_active=True; begin must ignore it.
        actor = build_profile(role="super_admin")
        sfx = uuid.uuid4().hex[:8]
        payload = _profile_payload(sfx)
        payload["is_active"] = True
        onboarding = TenantOnboardingService().begin(profile=payload, created_by_id=actor.id)
        assert Institution.objects.get(id=onboarding.institution_id).is_active is False

    def test_begin_is_idempotent_on_replay(self):
        # R4.1: a retried begin with the same idempotency key returns the same
        # onboarding rather than creating a second orphan institution.
        actor = build_profile(role="super_admin")
        sfx = uuid.uuid4().hex[:8]
        svc = TenantOnboardingService()
        key = f"begin-{sfx}"
        first = svc.begin(profile=_profile_payload(sfx), created_by_id=actor.id, idempotency_key=key)
        before = Institution.objects.count()
        second = svc.begin(profile=_profile_payload(sfx), created_by_id=actor.id, idempotency_key=key)
        assert second.id == first.id
        assert Institution.objects.count() == before  # no second institution

    def test_begin_compensates_leaving_no_orphan_on_duplicate_code(self):
        # R4.4: a failed begin (duplicate institution code) leaves NO orphan
        # institution — the institution + workflow are one atomic operation.
        actor = build_profile(role="super_admin")
        sfx = uuid.uuid4().hex[:8]
        svc = TenantOnboardingService()
        svc.begin(profile=_profile_payload(sfx), created_by_id=actor.id)
        before = Institution.objects.count()
        dup = _profile_payload(uuid.uuid4().hex[:8])
        dup["code"] = f"NEW-{sfx.upper()}"  # collide with the first code
        with pytest.raises(OnboardingError):
            svc.begin(profile=dup, created_by_id=actor.id)
        assert Institution.objects.count() == before  # no orphan created

    def test_begin_emits_audit_and_outbox(self):
        actor = build_profile(role="super_admin")
        sfx = uuid.uuid4().hex[:8]
        onboarding = TenantOnboardingService().begin(profile=_profile_payload(sfx), created_by_id=actor.id)
        assert OutboxEvent.objects.filter(
            aggregate_id=onboarding.id, event_type="tenant.onboarding.begun"
        ).exists()
        assert AuditLog.objects.filter(action="tenant.onboarding.begun").exists()


# ---------------------------------------------------------------------------
# record_step — idempotent step commands (R4.2)
# ---------------------------------------------------------------------------


class TestRecordStep:
    def _begin(self):
        actor = build_profile(role="super_admin")
        sfx = uuid.uuid4().hex[:8]
        return TenantOnboardingService().begin(profile=_profile_payload(sfx), created_by_id=actor.id), actor

    def test_record_step_marks_completed_and_bumps_version(self):
        onboarding, actor = self._begin()
        svc = TenantOnboardingService()
        updated = svc.record_step(onboarding, "branding", actor_id=actor.id)
        assert updated.steps["branding"]["completed"] is True
        assert updated.current_step == "branding"
        assert updated.configuration_version == 2

    def test_record_step_is_idempotent_on_identical_replay(self):
        onboarding, actor = self._begin()
        svc = TenantOnboardingService()
        svc.record_step(onboarding, "branding", actor_id=actor.id)
        onboarding.refresh_from_db()
        version_after_first = onboarding.configuration_version
        # Identical replay does not bump the configuration version again.
        again = svc.record_step(onboarding, "branding", actor_id=actor.id)
        assert again.configuration_version == version_after_first

    def test_record_step_rejects_unknown_step(self):
        onboarding, actor = self._begin()
        with pytest.raises(OnboardingError):
            TenantOnboardingService().record_step(onboarding, "not-a-real-step", actor_id=actor.id)

    def test_record_step_rejected_after_activation(self):
        onboarding, actor = self._begin()
        _make_launch_ready(
            Institution.objects.get(id=onboarding.institution_id),
            suffix=uuid.uuid4().hex[:8],
        )
        TenantOnboardingService().activate(onboarding, actor_id=actor.id)
        onboarding.refresh_from_db()
        with pytest.raises(OnboardingError):
            TenantOnboardingService().record_step(onboarding, "branding", actor_id=actor.id)


# ---------------------------------------------------------------------------
# blockers — derived from live canonical data (R4.5)
# ---------------------------------------------------------------------------


class TestBlockers:
    def test_get_blockers_lists_missing_blocking_items(self):
        actor = build_profile(role="super_admin")
        sfx = uuid.uuid4().hex[:8]
        onboarding = TenantOnboardingService().begin(profile=_profile_payload(sfx), created_by_id=actor.id)
        blockers = TenantOnboardingService().get_blockers(onboarding.institution_id)
        keys = {b["key"] for b in blockers}
        # A brand-new tenant blocks on every blocking readiness item.
        assert {"logo", "signature", "document_profile", "program_offering", "tenant_admin"} <= keys

    def test_get_blockers_empty_when_launch_ready(self):
        actor = build_profile(role="super_admin")
        sfx = uuid.uuid4().hex[:8]
        onboarding = TenantOnboardingService().begin(profile=_profile_payload(sfx), created_by_id=actor.id)
        _make_launch_ready(Institution.objects.get(id=onboarding.institution_id), suffix=sfx)
        assert TenantOnboardingService().get_blockers(onboarding.institution_id) == []


# ---------------------------------------------------------------------------
# activate — locked, re-evaluated, audited, blocker-gated (R4.6)
# ---------------------------------------------------------------------------


class TestActivate:
    def test_activate_blocked_when_readiness_incomplete(self):
        actor = build_profile(role="super_admin")
        sfx = uuid.uuid4().hex[:8]
        onboarding = TenantOnboardingService().begin(profile=_profile_payload(sfx), created_by_id=actor.id)
        with pytest.raises(OnboardingError) as exc:
            TenantOnboardingService().activate(onboarding, actor_id=actor.id)
        assert exc.value.code == "ONBOARDING_BLOCKED"
        onboarding.refresh_from_db()
        # State unchanged and institution still inactive (R4.6).
        assert onboarding.state == TenantOnboarding.STATE_DRAFT
        assert onboarding.blockers  # cached blocker snapshot recorded
        assert Institution.objects.get(id=onboarding.institution_id).is_active is False

    def test_activate_succeeds_when_launch_ready(self):
        actor = build_profile(role="super_admin")
        sfx = uuid.uuid4().hex[:8]
        onboarding = TenantOnboardingService().begin(profile=_profile_payload(sfx), created_by_id=actor.id)
        _make_launch_ready(Institution.objects.get(id=onboarding.institution_id), suffix=sfx)
        activated = TenantOnboardingService().activate(onboarding, actor_id=actor.id)
        assert activated.state == TenantOnboarding.STATE_ACTIVE
        assert activated.activated_at is not None
        assert list(activated.blockers) == []
        assert Institution.objects.get(id=onboarding.institution_id).is_active is True
        # R4.6: one audited event + a durable outbox record on activation.
        assert AuditLog.objects.filter(action="tenant.onboarding.activated").exists()
        assert OutboxEvent.objects.filter(
            aggregate_id=onboarding.id, event_type="tenant.onboarding.activated"
        ).exists()

    def test_activate_from_in_review(self):
        actor = build_profile(role="super_admin")
        sfx = uuid.uuid4().hex[:8]
        svc = TenantOnboardingService()
        onboarding = svc.begin(profile=_profile_payload(sfx), created_by_id=actor.id)
        _make_launch_ready(Institution.objects.get(id=onboarding.institution_id), suffix=sfx)
        svc.submit_for_review(onboarding, actor_id=actor.id)
        onboarding.refresh_from_db()
        assert onboarding.state == TenantOnboarding.STATE_IN_REVIEW
        activated = svc.activate(onboarding, actor_id=actor.id)
        assert activated.state == TenantOnboarding.STATE_ACTIVE

    def test_activate_is_idempotent_when_already_active(self):
        actor = build_profile(role="super_admin")
        sfx = uuid.uuid4().hex[:8]
        svc = TenantOnboardingService()
        onboarding = svc.begin(profile=_profile_payload(sfx), created_by_id=actor.id)
        _make_launch_ready(Institution.objects.get(id=onboarding.institution_id), suffix=sfx)
        svc.activate(onboarding, actor_id=actor.id)
        onboarding.refresh_from_db()
        # Re-activating an already-active onboarding is a safe no-op (retry).
        again = svc.activate(onboarding, actor_id=actor.id)
        assert again.state == TenantOnboarding.STATE_ACTIVE


# ---------------------------------------------------------------------------
# lifecycle transitions — submit/reject/cancel/suspend/resume (R4.4, R4.6)
# ---------------------------------------------------------------------------


class TestLifecycle:
    def _begin(self):
        actor = build_profile(role="super_admin")
        sfx = uuid.uuid4().hex[:8]
        return TenantOnboardingService().begin(profile=_profile_payload(sfx), created_by_id=actor.id), actor, sfx

    def test_submit_for_review(self):
        onboarding, actor, _ = self._begin()
        updated = TenantOnboardingService().submit_for_review(onboarding, actor_id=actor.id)
        assert updated.state == TenantOnboarding.STATE_IN_REVIEW

    def test_reject_from_in_review(self):
        onboarding, actor, _ = self._begin()
        svc = TenantOnboardingService()
        svc.submit_for_review(onboarding, actor_id=actor.id)
        onboarding.refresh_from_db()
        rejected = svc.reject(onboarding, actor_id=actor.id, reason="Incomplete documentation")
        assert rejected.state == TenantOnboarding.STATE_REJECTED
        # A rejected tenant is never active.
        assert Institution.objects.get(id=onboarding.institution_id).is_active is False

    def test_reject_from_draft_is_invalid(self):
        onboarding, actor, _ = self._begin()
        with pytest.raises(OnboardingError):
            TenantOnboardingService().reject(onboarding, actor_id=actor.id, reason="nope")

    def test_cancel_from_draft(self):
        onboarding, actor, _ = self._begin()
        cancelled = TenantOnboardingService().cancel(onboarding, actor_id=actor.id, reason="Duplicate request")
        assert cancelled.state == TenantOnboarding.STATE_CANCELLED
        assert Institution.objects.get(id=onboarding.institution_id).is_active is False

    def test_suspend_and_resume(self):
        onboarding, actor, sfx = self._begin()
        svc = TenantOnboardingService()
        _make_launch_ready(Institution.objects.get(id=onboarding.institution_id), suffix=sfx)
        svc.activate(onboarding, actor_id=actor.id)
        onboarding.refresh_from_db()
        # Suspend stops new applications by deactivating the institution.
        suspended = svc.suspend(onboarding, actor_id=actor.id, reason="Compliance hold")
        assert suspended.state == TenantOnboarding.STATE_SUSPENDED
        assert Institution.objects.get(id=onboarding.institution_id).is_active is False
        # Resume re-activates a still-ready tenant.
        onboarding.refresh_from_db()
        resumed = svc.resume(onboarding, actor_id=actor.id)
        assert resumed.state == TenantOnboarding.STATE_ACTIVE
        assert Institution.objects.get(id=onboarding.institution_id).is_active is True
