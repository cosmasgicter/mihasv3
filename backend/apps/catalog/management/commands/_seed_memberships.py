"""Shared membership-permission rule for the seed commands (SJR R7-a, task 5.1).

Django does not load underscore-prefixed modules in ``management/commands/`` as
commands, so this is a private helper for ``seed_school_admins`` and
``harness_seed_tenants``.

The rule is additive and idempotent by default (DEC-11): re-running a seed
command never removes a permission an operator granted in the admin UI. It
never reads or writes ``AccessGrant`` rows. Audit events carry ids and
permission names only.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Iterable, Optional

from django.core.management.base import CommandError

from apps.catalog.admin_serializers import GRANT_PERMISSION_ALLOWLIST
from apps.catalog.models import UserInstitutionMembership

SEEDED_ACTION = "tenant.membership.permissions_seeded"

MODE_ADD = "add"
MODE_REPLACE = "replace"
MODE_READ_ONLY = "read_only"
_MODES = (MODE_ADD, MODE_REPLACE, MODE_READ_ONLY)


def seed_membership_permissions(
    existing: Optional[Iterable[str]], requested: Optional[Iterable[str]], mode: str
) -> list[str]:
    """Return the membership's permissions after a seed run.

    ``add`` is the union (existing values outside today's allowlist are kept),
    ``replace`` is the requested list, ``read_only`` is empty.
    """
    existing_set = set(existing or [])
    requested_set = set(requested or [])
    if mode == MODE_ADD:
        return sorted(existing_set | requested_set)
    if mode == MODE_REPLACE:
        return sorted(requested_set)
    if mode == MODE_READ_ONLY:
        return []
    raise ValueError(f"unknown seed mode: {mode!r}")


def resolve_permission_options(
    *, permissions: Optional[str], replace: bool, read_only: bool
) -> tuple[list[str], str]:
    """Validate the command options before any write; return (requested, mode)."""
    if read_only and (replace or permissions is not None):
        raise CommandError("--read-only cannot be combined with --permissions or --replace.")
    if read_only:
        return [], MODE_READ_ONLY
    raw = "review" if permissions is None else permissions
    requested = [p.strip() for p in raw.split(",") if p.strip()]
    if not requested:
        raise CommandError("--permissions is empty. Use --read-only to grant nothing.")
    unknown = sorted(set(requested) - GRANT_PERMISSION_ALLOWLIST)
    if unknown:
        raise CommandError(
            f"Unknown permission(s): {', '.join(unknown)}. "
            f"Allowed: {', '.join(sorted(GRANT_PERMISSION_ALLOWLIST))}."
        )
    return sorted(set(requested)), (MODE_REPLACE if replace else MODE_ADD)


@dataclass(frozen=True)
class SeedOutcome:
    state: str  # "created" | "reactivated" | "changed" | "unchanged"
    changed: bool
    before: Optional[list[str]]
    after: list[str]

    def describe(self) -> str:
        if self.state == "created":
            return "membership created"
        if self.state == "reactivated":
            return "membership reactivated"
        if self.state == "changed":
            return f"permissions {self.before} -> {self.after}"
        return "membership unchanged"


def new_run_id() -> str:
    return str(uuid.uuid4())


def seed_membership(
    *,
    user,
    institution,
    role: str,
    requested: list[str],
    mode: str,
    source: str,
    run_id: str,
    now,
    dry_run: bool = False,
) -> SeedOutcome:
    """Create/reactivate/update one membership and audit the change.

    Writes only when the membership is created, reactivated or its sorted
    permissions change; an unchanged membership is not written and gets no
    event. Must run inside the caller's ``transaction.atomic()`` block.
    """
    from apps.catalog.tenant_audit_service import TenantAuditService

    if mode not in _MODES:
        raise ValueError(f"unknown seed mode: {mode!r}")

    membership = None
    if user is not None and getattr(user, "pk", None) is not None:
        membership = UserInstitutionMembership.objects.filter(
            user=user, institution=institution, role=role
        ).first()

    if membership is None:
        after = seed_membership_permissions([], requested, mode)
        outcome = SeedOutcome("created", True, None, after)
        created, reactivated = True, False
    else:
        before = sorted(membership.permissions or [])
        after = seed_membership_permissions(before, requested, mode)
        reactivated = not membership.is_active
        if membership.is_active and before == after:
            return SeedOutcome("unchanged", False, before, after)
        outcome = SeedOutcome("reactivated" if reactivated else "changed", True, before, after)
        created = False

    if dry_run:
        return outcome

    if membership is None:
        membership = UserInstitutionMembership.objects.create(
            user=user,
            institution=institution,
            role=role,
            permissions=outcome.after,
            is_active=True,
            created_at=now,
        )
    else:
        membership.permissions = outcome.after
        membership.is_active = True
        membership.save(update_fields=["permissions", "is_active"])

    TenantAuditService.record_event(
        action=SEEDED_ACTION,
        entity_type="user_institution_membership",
        entity_id=membership.id,
        actor_role="system",
        institution_id=institution.id,
        metadata={
            "permissions_before": outcome.before,
            "permissions_after": outcome.after,
            "created": created,
            "reactivated": reactivated,
            "mode": mode,
            "source": source,
            "run_id": run_id,
        },
    )
    return outcome


def assert_audit_rows_recorded(run_id: str, expected: int) -> None:
    """Raise (rolling back the caller's transaction) when audit rows are missing.

    ``TenantAuditService.record_event`` swallows its own failures, which suits a
    request path but would let a seed run change authority without a record.
    """
    if expected == 0:
        return
    from apps.common.models import AuditLog

    recorded = AuditLog.objects.filter(
        action=SEEDED_ACTION, changes__run_id=run_id
    ).count()
    if recorded != expected:
        raise CommandError("Audit events were not recorded; no membership was changed.")
