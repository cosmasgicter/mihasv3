"""Tenant-scoped staff recipient resolution (task 9.5).

Spec: ``.kiro/specs/admissions-v2-canonical-rebuild/`` task 9.5 — "Correct tenant
audit and amendment notification scope".
Requirements: **R3** (one authorization model — authority resolves through
``AdminCapabilityService``, never a role-string comparison), **R13.10**
(amendment requests notify **only** tenant-authorized recipients through the
durable communication outbox).
Findings: **AUTH-06**.

Why this module exists
----------------------

A tenant-sensitive notification had no authority model. The amendment path did
this::

    admins = Profile.objects.filter(role__in=["admin", "super_admin"], is_active=True)
    for admin in admins:
        create_notification(user_id=admin.id, ...)

Three separate defects in four lines:

* **it is a role-string comparison**, which R3.1 forbids in favour of
  ``AdminCapabilityService``;
* **it is platform-wide**, so a Tenant_Admin at one school was told an applicant
  at *another* school had asked to change their phone number — the applicant's
  name and application number travelled with it. That is the cross-tenant
  disclosure R3.2 exists to prevent, arriving through the notification channel
  instead of an endpoint;
* **it ignores capabilities entirely**, so a view-only member of the right school
  was notified about work they may not do, while the school's actual reviewer was
  notified only if they happened to hold the ``admin`` role string.

This module is the one answer: *who, for this institution, holds this capability*
— resolved through the capability service, bounded, and never a role comparison.

The contract
------------

:meth:`TenantStaffRecipientService.recipients_for_institution` returns the active
staff profiles who hold ``capability`` **for that institution**, derived from
active (non-expired) memberships and access grants. It is deliberately narrow:

* **Super_Admins are not included.** A Beanola operator holds every tenant
  capability, so including them would restore the broadcast this module deletes —
  one notification per school per amendment, to every platform operator. A
  Super_Admin reads tenant work through the tenant console and the audit feed,
  which is a pull, not a push.
* **A school with no authorized staff yields an empty list.** The caller records
  that as an observable gap (an outbox row with ``recipient_count: 0``) rather
  than falling back to a wider audience. Failing closed is the platform's rule
  for authority, and a notification is authority-bearing: it carries applicant
  facts.
* **The set is bounded** by :data:`RECIPIENT_LIMIT` and reports its own
  truncation, for the same reason every other 9.x surface caps its rows: a
  silently truncated fan-out is worse than a capped one, because the caller
  cannot tell.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Iterable, Optional

from django.db.models import Q
from django.utils import timezone

logger = logging.getLogger(__name__)

#: Maximum notification recipients resolved for one tenant command.
#:
#: A school's authorized reviewer set is small; this is a fan-out ceiling, not a
#: capacity plan. When it bites, :class:`ResolvedRecipients` says so
#: (``truncated``) and the caller records it, so a partially notified command is
#: never mistaken for a fully notified one.
RECIPIENT_LIMIT = 50


@dataclass(frozen=True)
class ResolvedRecipients:
    """The recipients for one tenant notification, and how they were resolved."""

    #: Active staff profiles holding the capability for this institution.
    profiles: tuple[Any, ...] = ()
    #: The capability every recipient was required to hold.
    capability: str = ""
    #: The institution the capability was resolved *for* (``None`` when the
    #: subject has no resolvable tenant — a fail-closed empty result).
    institution_id: Optional[str] = None
    #: True when more authorized staff exist than :data:`RECIPIENT_LIMIT`.
    truncated: bool = False
    #: Why the set is empty, when it is: ``no_institution`` (the subject has no
    #: resolvable tenant), ``no_members`` (nobody is a member of that
    #: institution), ``no_capability`` (members exist, none holds it), or
    #: ``resolution_failed`` (the capability service could not answer — deny).
    empty_reason: Optional[str] = None
    #: Recipient ids, as strings, in the order notified.
    ids: tuple[str, ...] = field(default=())

    def __bool__(self) -> bool:  # pragma: no cover - trivial
        return bool(self.profiles)

    def __len__(self) -> int:  # pragma: no cover - trivial
        return len(self.profiles)

    def as_payload(self) -> dict[str, Any]:
        """The non-PII record of the resolution, for audit and outbox payloads.

        Recipient **ids** travel; names and email addresses do not. An id is the
        platform's own identifier and is already what the audit trail keys on; an
        address is contact PII and the notification rows already hold the routing.
        """
        return {
            "capability": self.capability,
            "institution_id": self.institution_id,
            "recipient_count": len(self.profiles),
            "recipient_ids": list(self.ids),
            "recipient_limit": RECIPIENT_LIMIT,
            "truncated": self.truncated,
            "empty_reason": self.empty_reason,
        }


class TenantStaffRecipientService:
    """Resolve *who at this school may act on this*, through capabilities only."""

    @staticmethod
    def recipients_for_institution(
        institution_id: Any,
        capability: str,
        *,
        exclude_user_ids: Iterable[Any] = (),
        limit: int = RECIPIENT_LIMIT,
    ) -> ResolvedRecipients:
        """Active staff holding ``capability`` for ``institution_id``.

        Candidates come from the tenant scope tables the capability model itself
        derives authority from — active ``UserInstitutionMembership`` rows and
        active, non-expired ``AccessGrant`` rows for that institution — and each
        candidate's authority is then confirmed by
        ``AdminCapabilityService.get_institution_capabilities``. The membership
        query narrows the candidate set; the capability service decides. No role
        string is compared here or in the caller (R3.1).

        Never raises: a resolution failure yields an empty result with
        ``empty_reason="resolution_failed"``, because a notification path must not
        be able to abort the command that triggered it — and a fan-out that cannot
        be authorized must not happen at all.
        """
        resolved_id = _uuid_str(institution_id)
        if not resolved_id:
            return ResolvedRecipients(
                capability=capability, empty_reason="no_institution"
            )

        try:
            candidate_ids = TenantStaffRecipientService._candidate_user_ids(
                resolved_id, exclude_user_ids=exclude_user_ids
            )
        except Exception:
            logger.warning(
                "Could not resolve tenant recipient candidates for institution=%s",
                resolved_id,
                exc_info=True,
            )
            return ResolvedRecipients(
                capability=capability,
                institution_id=resolved_id,
                empty_reason="resolution_failed",
            )

        if not candidate_ids:
            return ResolvedRecipients(
                capability=capability,
                institution_id=resolved_id,
                empty_reason="no_members",
            )

        try:
            from apps.accounts.models import Profile

            profiles = list(
                Profile.objects.filter(id__in=list(candidate_ids))
                .exclude(is_active=False)
                .order_by("email")
            )
        except Exception:
            logger.warning(
                "Could not load tenant recipient profiles for institution=%s",
                resolved_id,
                exc_info=True,
            )
            return ResolvedRecipients(
                capability=capability,
                institution_id=resolved_id,
                empty_reason="resolution_failed",
            )

        authorized = TenantStaffRecipientService._filter_by_capability(
            profiles, resolved_id, capability
        )
        if authorized is None:
            return ResolvedRecipients(
                capability=capability,
                institution_id=resolved_id,
                empty_reason="resolution_failed",
            )

        if not authorized:
            return ResolvedRecipients(
                capability=capability,
                institution_id=resolved_id,
                empty_reason="no_capability",
            )

        ceiling = max(0, int(limit or 0)) or RECIPIENT_LIMIT
        window = tuple(authorized[:ceiling])
        return ResolvedRecipients(
            profiles=window,
            capability=capability,
            institution_id=resolved_id,
            truncated=len(authorized) > len(window),
            ids=tuple(str(profile.id) for profile in window),
        )

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    @staticmethod
    def _candidate_user_ids(
        institution_id: str, *, exclude_user_ids: Iterable[Any] = ()
    ) -> set[str]:
        """Users with an active tenant binding to ``institution_id``.

        The same two tables ``AdminCapabilityService._derive_institution_capabilities``
        reads, with the same active/non-expired predicates — so a candidate here
        is exactly a user the capability service could derive tenant authority for.
        """
        from apps.catalog.models import AccessGrant, UserInstitutionMembership

        now = timezone.now()
        excluded = {_uuid_str(value) for value in (exclude_user_ids or ())}
        excluded.discard(None)

        member_ids = UserInstitutionMembership.objects.filter(
            institution_id=institution_id, is_active=True
        ).values_list("user_id", flat=True)
        grant_ids = (
            AccessGrant.objects.filter(institution_id=institution_id, is_active=True)
            .filter(Q(expires_at__isnull=True) | Q(expires_at__gt=now))
            .values_list("user_id", flat=True)
        )

        candidates = {str(value) for value in member_ids if value}
        candidates |= {str(value) for value in grant_ids if value}
        return candidates - {value for value in excluded if value}

    @staticmethod
    def _filter_by_capability(
        profiles: list[Any], institution_id: str, capability: str
    ) -> Optional[list[Any]]:
        """Keep the profiles the capability service grants ``capability`` for.

        Returns ``None`` when authority could not be resolved at all, so the
        caller can fail closed rather than treating "unknown" as "nobody".

        A Super_Admin candidate is dropped: platform authority subsumes every
        tenant capability, so including them would re-create the platform-wide
        broadcast this module exists to remove (see the module docstring).
        """
        from apps.accounts.permissions import is_super_admin
        from apps.catalog.services import (
            AdminCapabilityService,
            CapabilityResolutionError,
        )

        service = AdminCapabilityService()
        authorized: list[Any] = []
        for profile in profiles:
            if is_super_admin(profile):
                continue
            try:
                held = service.get_institution_capabilities(profile, institution_id)
            except CapabilityResolutionError:
                logger.warning(
                    "Capability resolution failed for recipient=%s institution=%s",
                    getattr(profile, "id", None),
                    institution_id,
                )
                return None
            except Exception:
                logger.warning(
                    "Unexpected capability resolution error for recipient=%s",
                    getattr(profile, "id", None),
                    exc_info=True,
                )
                return None
            if capability in held:
                authorized.append(profile)
        return authorized


def _uuid_str(value: Any) -> Optional[str]:
    """``value`` as a UUID string, or ``None`` (never raises)."""
    from uuid import UUID

    if value is None:
        return None
    if isinstance(value, UUID):
        return str(value)
    try:
        return str(UUID(str(value)))
    except (TypeError, ValueError):
        return None


__all__ = [
    "RECIPIENT_LIMIT",
    "ResolvedRecipients",
    "TenantStaffRecipientService",
]
