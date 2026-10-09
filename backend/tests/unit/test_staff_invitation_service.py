"""Atomic tenant staff invitation + membership handoff — service tests (task 4.2).

Spec: ``.kiro/specs/admissions-v2-canonical-rebuild/`` task 4.2
Requirements: R4.3 (atomic membership+invitation; never return/log/persist a
              reusable plaintext password in browser storage), R4.4 (compensate
              a failed atomic operation; no orphan admin), R6.3 (invite by email
              search, not raw UUID). Findings: TEN-01, TEN-05.

Exercises :class:`StaffInvitationService` directly (no HTTP). Proves the atomic
identity+invitation+membership create, the compensating rollback that leaves no
orphan identity/membership, the existing-identity reuse + role-promotion rules,
the token-based accept handoff (invitee sets their own password), the
expired/invalid/revoked token paths, resend rotation, and revoke. The paired API
surface is covered by ``tests/integration/test_staff_invitation_workflow.py``.

Run (sqlite test DB, never the production/Neon DB)::

    cd backend && DJANGO_SETTINGS_MODULE=config.settings.test \
      .venv/bin/python -m pytest tests/unit/test_staff_invitation_service.py -q

**Validates: Requirements 4.3, 4.4, 6.3**
"""

from __future__ import annotations

import hashlib
import uuid

import pytest
from django.utils import timezone

from apps.accounts.models import Profile
from apps.accounts.services import verify_password
from apps.catalog.models import (
    TenantStaffInvitation,
    UserInstitutionMembership,
)
from apps.catalog.staff_invitation_service import (
    INVITATION_TTL,
    InvitationError,
    StaffInvitationService,
)
from apps.common.models import AuditLog, OutboxEvent
from tests.tenant_fixtures import build_institution, build_profile

pytestmark = [pytest.mark.django_db, pytest.mark.tenant]


def _email(suffix: str) -> str:
    return f"invitee-{suffix}@example.com"


# ---------------------------------------------------------------------------
# invite — atomic identity + invitation + membership (R4.3, R4.4)
# ---------------------------------------------------------------------------


class TestInvite:
    def test_invite_creates_identity_invitation_and_membership_atomically(self):
        institution = build_institution()
        actor = build_profile(role="super_admin")
        sfx = uuid.uuid4().hex[:8]
        email = _email(sfx)

        invitation, raw_token = StaffInvitationService().invite(
            institution_id=institution.id,
            email=email,
            invited_role="admin",
            actor_id=actor.id,
        )

        # All three records exist and are linked (R4.3).
        assert invitation.status == TenantStaffInvitation.STATUS_PENDING
        profile = Profile.objects.get(email__iexact=email)
        assert invitation.profile_id == profile.id
        membership = UserInstitutionMembership.objects.get(id=invitation.membership_id)
        assert membership.user_id == profile.id
        assert membership.institution_id == institution.id
        assert membership.role == "admin"
        assert membership.is_active is True

    def test_invite_persists_no_plaintext_password_or_token(self):
        # R4.3: no reusable plaintext credential is ever persisted. A brand-new
        # identity has NO usable password until the invitee accepts, and the
        # invitation stores only the SHA-256 HASH of the single-use token.
        institution = build_institution()
        sfx = uuid.uuid4().hex[:8]
        invitation, raw_token = StaffInvitationService().invite(
            institution_id=institution.id, email=_email(sfx), invited_role="admin"
        )
        profile = Profile.objects.get(id=invitation.profile_id)
        assert not profile.password_hash  # unusable until accept
        # Only the hash is stored — never the raw token.
        assert invitation.token_hash == hashlib.sha256(raw_token.encode()).hexdigest()
        assert invitation.token_hash != raw_token
        # No attribute on the persisted invitation leaks a plaintext secret.
        assert not hasattr(invitation, "password")
        assert not hasattr(invitation, "token")

    def test_invite_emits_audit_and_outbox(self):
        institution = build_institution()
        sfx = uuid.uuid4().hex[:8]
        invitation, _ = StaffInvitationService().invite(
            institution_id=institution.id, email=_email(sfx), invited_role="admin"
        )
        assert OutboxEvent.objects.filter(
            aggregate_id=invitation.id, event_type="tenant.staff.invited"
        ).exists()
        assert AuditLog.objects.filter(action="tenant.staff.invited").exists()

    def test_invite_reuses_existing_identity_without_duplicate_or_password_reset(self):
        # Handle existing identity: reuse, never duplicate, never touch password.
        institution = build_institution()
        sfx = uuid.uuid4().hex[:8]
        email = _email(sfx)
        existing = build_profile(role="student", suffix=sfx, email=email)
        existing.password_hash = "$2b$12$existinghashvaluethatmustnotchange000000000000000000"
        existing.save(update_fields=["password_hash"])
        original_hash = existing.password_hash

        invitation, _ = StaffInvitationService().invite(
            institution_id=institution.id, email=email, invited_role="admin"
        )
        # Exactly one profile for this email (no duplicate identity).
        assert Profile.objects.filter(email__iexact=email).count() == 1
        assert invitation.profile_id == existing.id
        existing.refresh_from_db()
        # Password of an existing identity is never reset by an invite.
        assert existing.password_hash == original_hash

    def test_invite_promotes_existing_role_up_only(self):
        institution = build_institution()
        # student -> admin promotes up.
        student = build_profile(role="student", email=_email("promote-up"))
        StaffInvitationService().invite(
            institution_id=institution.id, email=student.email, invited_role="admin"
        )
        student.refresh_from_db()
        assert student.role == "admin"

        # super_admin invited as admin is NOT downgraded.
        inst2 = build_institution()
        boss = build_profile(role="super_admin", email=_email("no-downgrade"))
        StaffInvitationService().invite(
            institution_id=inst2.id, email=boss.email, invited_role="admin"
        )
        boss.refresh_from_db()
        assert boss.role == "super_admin"

    def test_invite_rejects_duplicate_pending_invitation(self):
        institution = build_institution()
        sfx = uuid.uuid4().hex[:8]
        email = _email(sfx)
        StaffInvitationService().invite(
            institution_id=institution.id, email=email, invited_role="admin"
        )
        with pytest.raises(InvitationError) as exc:
            StaffInvitationService().invite(
                institution_id=institution.id, email=email, invited_role="admin"
            )
        assert exc.value.code == "INVITATION_ALREADY_PENDING"
        # No second invitation / membership created.
        assert TenantStaffInvitation.objects.filter(
            institution_id=institution.id, email=email
        ).count() == 1

    def test_invite_rejects_existing_active_member(self):
        institution = build_institution()
        sfx = uuid.uuid4().hex[:8]
        email = _email(sfx)
        # Pre-existing active membership for this identity.
        member = build_profile(role="admin", email=email)
        UserInstitutionMembership.objects.create(
            id=uuid.uuid4(), user=member, institution=institution, role="admin", is_active=True,
            created_at=timezone.now(),
        )
        with pytest.raises(InvitationError) as exc:
            StaffInvitationService().invite(
                institution_id=institution.id, email=email, invited_role="admin"
            )
        assert exc.value.code == "INVITATION_ALREADY_MEMBER"
        assert not TenantStaffInvitation.objects.filter(institution_id=institution.id, email=email).exists()

    def test_invite_rejects_non_invitable_role(self):
        institution = build_institution()
        with pytest.raises(InvitationError) as exc:
            StaffInvitationService().invite(
                institution_id=institution.id, email=_email("boss"), invited_role="super_admin"
            )
        assert exc.value.code == "INVALID_ROLE"

    def test_invite_compensates_leaving_no_orphan_on_failure(self, monkeypatch):
        # R4.4: if the invitation INSERT fails after the identity + membership
        # are created, the whole transaction rolls back — no orphan admin.
        institution = build_institution()
        sfx = uuid.uuid4().hex[:8]
        email = _email(sfx)
        profiles_before = Profile.objects.count()
        memberships_before = UserInstitutionMembership.objects.count()

        real_create = TenantStaffInvitation.objects.create

        def boom(*args, **kwargs):
            raise RuntimeError("simulated invitation insert failure")

        monkeypatch.setattr(TenantStaffInvitation.objects, "create", boom)
        with pytest.raises(RuntimeError):
            StaffInvitationService().invite(
                institution_id=institution.id, email=email, invited_role="admin"
            )
        monkeypatch.setattr(TenantStaffInvitation.objects, "create", real_create)

        # No orphan identity, membership, or invitation remains (R4.4).
        assert Profile.objects.filter(email__iexact=email).count() == 0
        assert Profile.objects.count() == profiles_before
        assert UserInstitutionMembership.objects.count() == memberships_before
        assert not TenantStaffInvitation.objects.filter(email=email).exists()


# ---------------------------------------------------------------------------
# accept — the handoff: invitee sets their OWN password (R4.3)
# ---------------------------------------------------------------------------


class TestAccept:
    def _invite(self, *, role="admin"):
        institution = build_institution()
        sfx = uuid.uuid4().hex[:8]
        invitation, raw_token = StaffInvitationService().invite(
            institution_id=institution.id, email=_email(sfx), invited_role=role
        )
        return invitation, raw_token

    def test_accept_sets_password_and_activates(self):
        invitation, raw_token = self._invite()
        profile = StaffInvitationService().accept(token=raw_token, password="Str0ngPass!")
        # The invitee's chosen password now works (R4.3 handoff).
        assert verify_password("Str0ngPass!", profile.password_hash)
        assert profile.is_active is True
        invitation.refresh_from_db()
        assert invitation.status == TenantStaffInvitation.STATUS_ACCEPTED
        assert invitation.accepted_at is not None
        # Token consumed — cannot be replayed.
        assert invitation.token_hash is None
        membership = UserInstitutionMembership.objects.get(id=invitation.membership_id)
        assert membership.is_active is True

    def test_accept_is_single_use(self):
        invitation, raw_token = self._invite()
        StaffInvitationService().accept(token=raw_token, password="Str0ngPass!")
        with pytest.raises(InvitationError) as exc:
            StaffInvitationService().accept(token=raw_token, password="An0therPass!")
        assert exc.value.code == "INVITATION_INVALID"

    def test_accept_rejects_invalid_token(self):
        with pytest.raises(InvitationError) as exc:
            StaffInvitationService().accept(token="not-a-real-token", password="Str0ngPass!")
        assert exc.value.code == "INVITATION_INVALID"

    def test_accept_rejects_short_password(self):
        _invitation, raw_token = self._invite()
        with pytest.raises(InvitationError) as exc:
            StaffInvitationService().accept(token=raw_token, password="short")
        assert exc.value.code == "VALIDATION_ERROR"

    def test_accept_expired_marks_expired(self):
        invitation, raw_token = self._invite()
        # Force expiry.
        invitation.expires_at = timezone.now() - INVITATION_TTL
        invitation.save(update_fields=["expires_at"])
        with pytest.raises(InvitationError) as exc:
            StaffInvitationService().accept(token=raw_token, password="Str0ngPass!")
        assert exc.value.code == "INVITATION_EXPIRED"
        invitation.refresh_from_db()
        assert invitation.status == TenantStaffInvitation.STATUS_EXPIRED

    def test_accept_rejects_revoked(self):
        invitation, raw_token = self._invite()
        StaffInvitationService().revoke(invitation)
        with pytest.raises(InvitationError) as exc:
            StaffInvitationService().accept(token=raw_token, password="Str0ngPass!")
        assert exc.value.code == "INVITATION_INVALID"


# ---------------------------------------------------------------------------
# resend — rotate token, re-email (R4.3)
# ---------------------------------------------------------------------------


class TestResend:
    def _invite(self):
        institution = build_institution()
        sfx = uuid.uuid4().hex[:8]
        return StaffInvitationService().invite(
            institution_id=institution.id, email=_email(sfx), invited_role="admin"
        )

    def test_resend_rotates_token_and_invalidates_old(self):
        invitation, old_token = self._invite()
        _invitation, new_token = StaffInvitationService().resend(invitation)
        assert new_token != old_token
        # Old token no longer accepts.
        with pytest.raises(InvitationError):
            StaffInvitationService().accept(token=old_token, password="Str0ngPass!")
        # New token accepts.
        profile = StaffInvitationService().accept(token=new_token, password="Str0ngPass!")
        assert verify_password("Str0ngPass!", profile.password_hash)

    def test_resend_increments_count_and_extends_expiry(self):
        invitation, _ = self._invite()
        before = invitation.expires_at
        updated, _new = StaffInvitationService().resend(invitation)
        assert updated.resend_count == 1
        assert updated.expires_at >= before

    def test_resend_expired_returns_to_pending(self):
        invitation, _ = self._invite()
        invitation.status = TenantStaffInvitation.STATUS_EXPIRED
        invitation.save(update_fields=["status"])
        updated, _new = StaffInvitationService().resend(invitation)
        assert updated.status == TenantStaffInvitation.STATUS_PENDING

    def test_resend_rejects_accepted(self):
        invitation, raw_token = self._invite()
        StaffInvitationService().accept(token=raw_token, password="Str0ngPass!")
        invitation.refresh_from_db()
        with pytest.raises(InvitationError) as exc:
            StaffInvitationService().resend(invitation)
        assert exc.value.code == "INVITATION_NOT_RESENDABLE"


# ---------------------------------------------------------------------------
# revoke — cancel + remove access (R4.4)
# ---------------------------------------------------------------------------


class TestRevoke:
    def test_revoke_deactivates_membership_and_clears_token(self):
        institution = build_institution()
        sfx = uuid.uuid4().hex[:8]
        invitation, _ = StaffInvitationService().invite(
            institution_id=institution.id, email=_email(sfx), invited_role="admin"
        )
        revoked = StaffInvitationService().revoke(invitation)
        assert revoked.status == TenantStaffInvitation.STATUS_REVOKED
        assert revoked.token_hash is None
        membership = UserInstitutionMembership.objects.get(id=invitation.membership_id)
        assert membership.is_active is False

    def test_revoke_is_idempotent(self):
        institution = build_institution()
        sfx = uuid.uuid4().hex[:8]
        invitation, _ = StaffInvitationService().invite(
            institution_id=institution.id, email=_email(sfx), invited_role="admin"
        )
        StaffInvitationService().revoke(invitation)
        again = StaffInvitationService().revoke(invitation)
        assert again.status == TenantStaffInvitation.STATUS_REVOKED


# ---------------------------------------------------------------------------
# search_candidates — invite by email, not raw UUID (R6.3, TEN-05)
# ---------------------------------------------------------------------------


class TestSearchCandidates:
    def test_search_matches_email_prefix(self):
        build_profile(role="student", email="searchable-target@example.com", suffix="find")
        results = StaffInvitationService().search_candidates(query="searchable-target")
        assert any(r["email"] == "searchable-target@example.com" for r in results)
        # Minimal projection only — no password / token / sensitive fields.
        for row in results:
            assert set(row.keys()) == {"id", "email", "full_name", "role"}

    def test_search_requires_minimum_query_length(self):
        build_profile(role="student", email="a@example.com")
        assert StaffInvitationService().search_candidates(query="a") == []

    def test_search_is_capped(self):
        for i in range(30):
            build_profile(role="student", email=f"capped-{i}@example.com", suffix=f"cap{i}")
        results = StaffInvitationService().search_candidates(query="capped-", limit=100)
        assert len(results) <= 25
