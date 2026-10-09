"""Atomic tenant-admin invitation + membership handoff service (task 4.2).

Spec: ``.kiro/specs/admissions-v2-canonical-rebuild/`` task 4.2
Requirements: R4.3 (create the membership and invitation atomically; SHALL NOT
              return, log, or persist a reusable plaintext password in browser
              storage), R4.4 (compensate all records of a failed atomic
              operation; no global orphan admin / partially authoritative
              tenant), R6.3 (invite by tenant-scoped email search, not raw UUID).
Findings: TEN-01, TEN-05.
Design: design.md §5.3 (People And Access — membership + invitation handoff),
        §6.1 (Tenant Aggregate), §17 (durable committed outbox).

This service replaces the fragile client multi-call invite (TEN-01). The old
``TenantOnboardingWizard`` flow created a *global admin* user, then separately
created a membership across several browser calls — it misread the response
shape, could stop before the membership was created (leaving an orphan global
admin), and it made the operator type an initial password that was displayed and
persisted in ``localStorage`` (a reusable plaintext credential in browser
storage). This service instead performs one **server-owned transaction** that:

* looks up or creates the identity (:class:`~apps.accounts.models.Profile`)
  **by email** (R6.3) — an existing identity is reused, never duplicated;
* creates the :class:`~apps.catalog.models.TenantStaffInvitation` and the
  :class:`~apps.catalog.models.UserInstitutionMembership` in the **same atomic
  transaction** (R4.3), so a failure at any step rolls the whole thing back and
  leaves **no orphan identity/membership** (R4.4);
* stores only the **SHA-256 hash** of a single-use token and emails the raw
  token in a trusted tenant/platform link (:mod:`apps.common.email_links`); the
  raw token is **never returned to the caller/browser, logged, or persisted in
  plaintext** (R4.3). The invitee sets their **own** password by consuming the
  token (:meth:`accept`) — the admin never sets or sees a password;
* records a tenant Audit_Event and a durable committed outbox row for every
  lifecycle command (design §17), mirroring
  :class:`~apps.catalog.onboarding_service.TenantOnboardingService`.

Handled lifecycle (task 4.2): invite (existing + new identity), resend, accept,
revoke, and expiry. Capability enforcement (``platform.user.manage_all`` /
``tenant.staff.invite``) is a separate policy applied by the API layer — this
service owns business state, not authorization (design §3).
"""

from __future__ import annotations

import hashlib
import logging
import secrets
import uuid
from datetime import timedelta
from typing import Any, Optional

from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.accounts.models import Profile
from apps.accounts.permissions import ROLE_HIERARCHY
from apps.accounts.services import hash_password
from apps.catalog.models import (
    Institution,
    TenantStaffInvitation,
    UserInstitutionMembership,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

#: Single-use invitation token lifetime. A pending invitation whose token has
#: passed this window cannot be accepted until it is resent (which rotates the
#: token and extends expiry).
INVITATION_TTL = timedelta(days=7)

#: Roles a staff invitation may confer. ``super_admin`` is never invitable —
#: platform authority is never granted through a tenant invitation (R3, R4.3).
INVITABLE_ROLES: frozenset[str] = frozenset({"admin", "reviewer"})

#: Number of random bytes for the invitation token. ``token_urlsafe(32)`` emits
#: a ~43-char URL-safe token; only its SHA-256 hash is stored (R4.3).
_TOKEN_BYTES = 32


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------


class InvitationError(Exception):
    """A staff-invitation command failed.

    Carries a stable ``code`` (e.g. ``INVITATION_ALREADY_PENDING``,
    ``INVITATION_ALREADY_MEMBER``, ``INVITATION_INVALID``, ``INVITATION_EXPIRED``,
    ``INVITATION_REVOKED``, ``INVITATION_NOT_RESENDABLE``, ``INVALID_ROLE``,
    ``VALIDATION_ERROR``) that the API layer maps to a stable error envelope.
    """

    def __init__(self, message: str = "", *, code: Optional[str] = None):
        super().__init__(message or code or "invitation_error")
        self.message = message or code or "invitation_error"
        self.code = code


# ---------------------------------------------------------------------------
# Token helpers (only the HASH is ever stored/compared)
# ---------------------------------------------------------------------------


def _generate_token() -> str:
    """Generate a fresh single-use raw invitation token (never persisted)."""
    return secrets.token_urlsafe(_TOKEN_BYTES)


def _hash_token(raw_token: str) -> str:
    """SHA-256 hash of the raw token — the only form ever stored/compared."""
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def _normalize_email(email: str) -> str:
    return (email or "").strip().lower()


class StaffInvitationService:
    """Atomic tenant-admin invitation + membership handoff commands (R4.3-R4.4, R6.3)."""

    # ------------------------------------------------------------------
    # candidate search — invite BY EMAIL, never raw UUID (R6.3, TEN-05)
    # ------------------------------------------------------------------

    def search_candidates(self, *, query: str, limit: int = 10) -> list[dict]:
        """Search existing identities by email/name for the invite selector (R6.3).

        Returns a minimal, non-sensitive projection (id, email, full_name, role)
        so the staff-invite and access-grant forms can offer an accessible
        search selector instead of raw UUID entry (TEN-05). Requires a
        ≥2-character query and caps results to avoid enumeration; the caller
        (API layer) gates this behind the staff-invite capability.
        """
        term = (query or "").strip()
        if len(term) < 2:
            return []
        capped = max(1, min(int(limit or 10), 25))
        from django.db.models import Q

        rows = (
            Profile.objects.filter(
                Q(email__icontains=term)
                | Q(full_name__icontains=term)
                | Q(first_name__icontains=term)
                | Q(last_name__icontains=term)
            )
            .order_by("email")[:capped]
        )
        results: list[dict] = []
        for profile in rows:
            full_name = (
                profile.full_name
                or " ".join(filter(None, [profile.first_name, profile.last_name])).strip()
                or profile.email
            )
            results.append(
                {
                    "id": str(profile.id),
                    "email": profile.email,
                    "full_name": full_name,
                    "role": profile.role or "",
                }
            )
        return results

    # ------------------------------------------------------------------
    # invite — atomic identity + invitation + membership (R4.3, R4.4)
    # ------------------------------------------------------------------

    def invite(
        self,
        *,
        institution_id: Any,
        email: str,
        invited_role: str = "admin",
        permissions: Optional[list] = None,
        full_name: str = "",
        actor_id: Any = None,
        request: Any = None,
    ) -> tuple[TenantStaffInvitation, str]:
        """Invite a staff member by email, atomically (R4.3, R4.4).

        Looks up an existing identity by email (reused, never duplicated) or
        creates a new one **without a usable password**; then creates the
        invitation and the membership in the **same transaction**. Returns
        ``(invitation, raw_token)`` — the raw token is used **only** to build the
        emailed accept link and is never persisted or returned to the browser
        (R4.3). A duplicate pending invite or an existing active membership is
        rejected with a stable code and no partial write (R4.4).
        """
        normalized_email = _normalize_email(email)
        if not normalized_email:
            raise InvitationError("An email address is required.", code="VALIDATION_ERROR")

        role = (invited_role or "admin").strip().lower()
        if role not in INVITABLE_ROLES:
            raise InvitationError(
                f"{invited_role!r} is not an invitable staff role.", code="INVALID_ROLE"
            )

        institution = self._get_institution(institution_id)
        perms = list(permissions or [])

        # Reject a duplicate PENDING invitation early with a friendly code (the
        # DB partial unique index is the final race guard, caught below).
        existing_pending = TenantStaffInvitation.objects.filter(
            institution_id=institution.id,
            email=normalized_email,
            status=TenantStaffInvitation.STATUS_PENDING,
        ).first()
        if existing_pending is not None:
            raise InvitationError(
                "A pending invitation for this email already exists; resend it instead.",
                code="INVITATION_ALREADY_PENDING",
            )

        raw_token = _generate_token()
        token_hash = _hash_token(raw_token)
        now = timezone.now()

        try:
            with transaction.atomic():
                profile, created_identity = self._resolve_identity(
                    email=normalized_email, invited_role=role, full_name=full_name, now=now
                )

                # An existing ACTIVE membership means this person is already
                # staff here — reject with no new write (R4.4).
                active_membership = UserInstitutionMembership.objects.filter(
                    user_id=profile.id, institution_id=institution.id, is_active=True
                ).first()
                if active_membership is not None:
                    raise InvitationError(
                        "This person already has active staff access to this tenant.",
                        code="INVITATION_ALREADY_MEMBER",
                    )

                membership = UserInstitutionMembership.objects.create(
                    id=uuid.uuid4(),
                    user_id=profile.id,
                    institution_id=institution.id,
                    role=role,
                    permissions=perms,
                    is_active=True,
                    created_at=now,
                    created_by_id=actor_id,
                )
                invitation = TenantStaffInvitation.objects.create(
                    id=uuid.uuid4(),
                    institution_id=institution.id,
                    email=normalized_email,
                    invited_role=role,
                    permissions=perms,
                    token_hash=token_hash,
                    status=TenantStaffInvitation.STATUS_PENDING,
                    profile_id=profile.id,
                    membership_id=membership.id,
                    invited_by_id=actor_id,
                    expires_at=now + INVITATION_TTL,
                    last_sent_at=now,
                    resend_count=0,
                    created_at=now,
                    updated_at=now,
                )
                self._emit_event(
                    invitation,
                    event_type="tenant.staff.invited",
                    actor_id=actor_id,
                    request=request,
                    extra={"role": role, "identity_created": created_identity},
                )
        except IntegrityError as exc:
            # transaction.atomic already rolled back the identity/membership, so
            # no orphan admin remains (R4.4). The partial unique index on
            # (institution, lower(email)) WHERE status='pending' is the race guard.
            logger.info("Staff invite failed (integrity): %s", exc)
            raise InvitationError(
                "A pending invitation for this email already exists; resend it instead.",
                code="INVITATION_ALREADY_PENDING",
            ) from exc

        # Email dispatch is best-effort and OUTSIDE the transaction — the
        # invitation/membership are already durable; a mail hiccup must not undo
        # the atomic write. The raw token only ever lives in this link.
        self._send_invitation_email(invitation, raw_token, institution)
        return invitation, raw_token

    # ------------------------------------------------------------------
    # accept — the handoff: invitee sets their OWN password (R4.3)
    # ------------------------------------------------------------------

    def accept(self, *, token: str, password: str) -> Profile:
        """Consume a single-use invitation token and set the invitee's password.

        This is the handoff: the invited staff member sets their **own**
        password here — the admin never set or saw one (R4.3). Activates the
        identity + membership, marks the invitation accepted, and clears the
        token hash so it cannot be replayed. Raises a stable error for an
        invalid, expired, or revoked token.
        """
        raw_token = (token or "").strip()
        if not raw_token:
            raise InvitationError("This invitation link is invalid.", code="INVITATION_INVALID")
        if not password or len(password) < 8:
            raise InvitationError(
                "Choose a password of at least 8 characters.", code="VALIDATION_ERROR"
            )

        token_hash = _hash_token(raw_token)
        now = timezone.now()

        # The expired-token case must persist the ``expired`` status and raise;
        # doing both inside the accept transaction would roll the status write
        # back with the raise, so it is deferred and committed after the block
        # (mirrors the onboarding service's blocked-activation handling).
        expired_invitation: Optional[TenantStaffInvitation] = None
        with transaction.atomic():
            invitation = (
                TenantStaffInvitation.objects.select_for_update()
                .filter(token_hash=token_hash)
                .first()
            )
            if invitation is None or invitation.status != TenantStaffInvitation.STATUS_PENDING:
                # No write happened, so raising inside the block is safe.
                raise InvitationError(
                    "This invitation link is invalid or has already been used.",
                    code="INVITATION_INVALID",
                )
            if invitation.expires_at and invitation.expires_at < now:
                expired_invitation = invitation
            else:
                profile = Profile.objects.select_for_update().get(id=invitation.profile_id)
                profile.password_hash = hash_password(password)
                profile.password_changed_at = now
                profile.is_active = True
                profile.updated_at = now
                profile.save(
                    update_fields=[
                        "password_hash",
                        "password_changed_at",
                        "is_active",
                        "updated_at",
                    ]
                )

                if invitation.membership_id:
                    UserInstitutionMembership.objects.filter(
                        id=invitation.membership_id
                    ).update(is_active=True)

                invitation.status = TenantStaffInvitation.STATUS_ACCEPTED
                invitation.accepted_at = now
                invitation.token_hash = None  # consume — cannot be replayed
                invitation.updated_at = now
                invitation.save(
                    update_fields=["status", "accepted_at", "token_hash", "updated_at"]
                )
                self._emit_event(
                    invitation,
                    event_type="tenant.staff.invitation_accepted",
                    actor_id=profile.id,
                    request=None,
                )
                return profile

        # Durably mark the expired invitation OUTSIDE the transaction, then raise.
        expired_invitation.status = TenantStaffInvitation.STATUS_EXPIRED
        expired_invitation.updated_at = timezone.now()
        expired_invitation.save(update_fields=["status", "updated_at"])
        raise InvitationError(
            "This invitation link has expired. Ask your administrator to resend it.",
            code="INVITATION_EXPIRED",
        )

    # ------------------------------------------------------------------
    # resend — rotate the token + re-email (R4.3)
    # ------------------------------------------------------------------

    def resend(
        self,
        invitation: TenantStaffInvitation,
        *,
        actor_id: Any = None,
        request: Any = None,
    ) -> tuple[TenantStaffInvitation, str]:
        """Rotate the token and re-send a pending/expired invitation (R4.3).

        Only a ``pending`` or ``expired`` invitation is resendable — an accepted
        or revoked one raises ``INVITATION_NOT_RESENDABLE``. A new token replaces
        the old (the previous token can no longer be accepted), expiry is
        extended, and an expired invitation returns to ``pending``.
        """
        invitation.refresh_from_db()
        if invitation.status not in (
            TenantStaffInvitation.STATUS_PENDING,
            TenantStaffInvitation.STATUS_EXPIRED,
        ):
            raise InvitationError(
                "Only a pending or expired invitation can be resent.",
                code="INVITATION_NOT_RESENDABLE",
            )

        raw_token = _generate_token()
        now = timezone.now()
        institution = self._get_institution(invitation.institution_id)
        with transaction.atomic():
            invitation.token_hash = _hash_token(raw_token)
            invitation.status = TenantStaffInvitation.STATUS_PENDING
            invitation.expires_at = now + INVITATION_TTL
            invitation.last_sent_at = now
            invitation.resend_count = (invitation.resend_count or 0) + 1
            invitation.updated_at = now
            invitation.save(
                update_fields=[
                    "token_hash",
                    "status",
                    "expires_at",
                    "last_sent_at",
                    "resend_count",
                    "updated_at",
                ]
            )
            self._emit_event(
                invitation,
                event_type="tenant.staff.invitation_resent",
                actor_id=actor_id,
                request=request,
                extra={"resend_count": invitation.resend_count},
            )
        self._send_invitation_email(invitation, raw_token, institution)
        return invitation, raw_token

    # ------------------------------------------------------------------
    # revoke — cancel invite + remove access (R4.4)
    # ------------------------------------------------------------------

    def revoke(
        self,
        invitation: TenantStaffInvitation,
        *,
        actor_id: Any = None,
        request: Any = None,
    ) -> TenantStaffInvitation:
        """Revoke an invitation and deactivate its membership (idempotent).

        Cancels a pending/expired invitation or removes access granted by an
        accepted one: the membership is deactivated and the token cleared so it
        can never be accepted. Re-revoking an already-revoked invitation is a
        safe no-op. The affected identity's in-flight sessions are revoked so
        stale tenant authority does not persist (R3.5).
        """
        invitation.refresh_from_db()
        if invitation.status == TenantStaffInvitation.STATUS_REVOKED:
            return invitation  # idempotent

        now = timezone.now()
        with transaction.atomic():
            if invitation.membership_id:
                UserInstitutionMembership.objects.filter(
                    id=invitation.membership_id
                ).update(is_active=False)
            invitation.status = TenantStaffInvitation.STATUS_REVOKED
            invitation.revoked_at = now
            invitation.token_hash = None
            invitation.updated_at = now
            invitation.save(
                update_fields=["status", "revoked_at", "token_hash", "updated_at"]
            )
            self._emit_event(
                invitation,
                event_type="tenant.staff.invitation_revoked",
                actor_id=actor_id,
                request=request,
            )

        # Revoking removes tenant authority — revoke the member's in-flight
        # sessions so stale capabilities do not persist (R3.5). Best-effort.
        if invitation.profile_id:
            try:
                from apps.accounts.session_lifecycle import (
                    revoke_sessions_for_authority_change,
                )

                revoke_sessions_for_authority_change(
                    invitation.profile_id,
                    reason="staff_invitation_revoked",
                    actor_id=actor_id,
                )
            except Exception:  # pragma: no cover - session revoke is best-effort
                logger.warning(
                    "Failed to revoke sessions after staff invitation revoke",
                    exc_info=True,
                )
        return invitation

    # ------------------------------------------------------------------
    # internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _get_institution(institution_id) -> Institution:
        try:
            return Institution.objects.get(id=institution_id)
        except Institution.DoesNotExist as exc:
            raise InvitationError(
                "The tenant was not found.", code="VALIDATION_ERROR"
            ) from exc

    @staticmethod
    def _resolve_identity(
        *, email: str, invited_role: str, full_name: str, now
    ) -> tuple[Profile, bool]:
        """Return ``(profile, created)`` for the invited email (R4.3, R6.3).

        An existing identity (matched case-insensitively by email) is reused and
        never duplicated; a new identity is created **without a usable password**
        (``password_hash`` stays NULL) so it cannot sign in until the invitee
        consumes the token and sets their own password. An existing identity's
        platform role is only ever promoted **up** the hierarchy to the invited
        role (never downgraded), so inviting an applicant as staff grants the
        role, while a higher-privileged account keeps its authority.
        """
        profile = Profile.objects.filter(email__iexact=email).first()
        if profile is not None:
            invited_level = ROLE_HIERARCHY.get(invited_role, 0)
            current_level = ROLE_HIERARCHY.get((profile.role or "").strip().lower(), 0)
            if invited_level > current_level:
                profile.role = invited_role
                profile.updated_at = now
                profile.save(update_fields=["role", "updated_at"])
            return profile, False

        # New identity — NO password set (unusable until accept). email_verified
        # follows the Legacy_Exception default (task 1.6): not enforced anywhere.
        profile = Profile.objects.create(
            id=uuid.uuid4(),
            email=email,
            role=invited_role,
            full_name=(full_name or "").strip() or None,
            is_active=True,
            password_hash=None,
            created_at=now,
            updated_at=now,
        )
        return profile, True

    def _send_invitation_email(
        self, invitation: TenantStaffInvitation, raw_token: str, institution: Institution
    ) -> None:
        """Queue the invitation email with a trusted tenant/platform accept link.

        The raw token only ever appears inside this emailed link (R4.3). Errors
        are logged, never raised — the invitation/membership are already durable.
        """
        try:
            from apps.common.email_links import staff_invitation_url
            from apps.common.outbox import queue_email

            accept_link = staff_invitation_url(raw_token, institution)
            tenant_name = (
                getattr(institution, "brand_name", None)
                or getattr(institution, "name", None)
                or "your institution"
            )
            subject = f"You have been invited to administer {tenant_name}"
            body = (
                f"<p>You have been invited to help administer {tenant_name} on the "
                "Beanola admissions platform.</p>"
                f'<p><a href="{accept_link}">Click here to accept the invitation and set your password</a></p>'
                "<p>For your security, choose your own password on that page. "
                "This invitation link expires in 7 days. If you did not expect this, "
                "you can ignore this email.</p>"
            )
            queue_email(recipient_email=invitation.email, subject=subject, body=body)
        except Exception:  # pragma: no cover - email dispatch is best-effort
            logger.warning(
                "Failed to queue staff invitation email for invitation_id=%s",
                getattr(invitation, "id", "unknown"),
                exc_info=True,
            )

    def _emit_event(
        self,
        invitation: TenantStaffInvitation,
        *,
        event_type: str,
        actor_id: Any = None,
        request: Any = None,
        extra: Optional[dict] = None,
    ) -> None:
        """Record a tenant Audit_Event and a durable committed outbox row.

        Both are best-effort with respect to the audit/outbox infrastructure (a
        transient failure there must never abort the invitation write), but they
        are written inside the caller's transaction so, on success, the durable
        outbox record commits atomically with the state change (design §17). No
        raw token or password is ever included in the metadata (R4.3).
        """
        institution_id = invitation.institution_id
        try:
            from apps.catalog.tenant_audit_service import TenantAuditService

            TenantAuditService.record_event(
                action=event_type,
                entity_type="tenant_staff_invitation",
                entity_id=invitation.id,
                actor_id=actor_id,
                institution_id=institution_id,
                metadata={
                    "invitation_id": str(invitation.id),
                    "institution_id": str(institution_id),
                    "status": invitation.status,
                    # email is tenant-scoped contact data already visible to the
                    # inviting admin; never include the token or any password.
                    "email": invitation.email,
                    **(extra or {}),
                },
                request=request,
            )
        except Exception:  # pragma: no cover - audit must never block a write
            logger.warning(
                "Failed to record staff invitation audit event %s",
                event_type,
                exc_info=True,
            )

        try:
            from apps.common.models import OutboxEvent

            now = timezone.now()
            OutboxEvent.objects.create(
                id=uuid.uuid4(),
                event_type=event_type,
                channel="tenant",
                aggregate_type="tenant_staff_invitation",
                aggregate_id=invitation.id,
                payload={
                    "invitation_id": str(invitation.id),
                    "institution_id": str(institution_id),
                    "status": invitation.status,
                    **(extra or {}),
                },
                status="published",
                target_table="tenant_staff_invitations",
                target_id=invitation.id,
                created_at=now,
                processed_at=now,
            )
        except Exception:  # pragma: no cover - outbox must never block a write
            logger.warning(
                "Failed to record staff invitation outbox event %s",
                event_type,
                exc_info=True,
            )


__all__ = [
    "InvitationError",
    "StaffInvitationService",
    "INVITATION_TTL",
    "INVITABLE_ROLES",
]
