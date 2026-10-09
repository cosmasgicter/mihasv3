"""Bulk user role/status changes as one server command (task 9.3).

Spec: ``.kiro/specs/admissions-v2-canonical-rebuild/`` task 9.3.
Requirement: **R6.5** ("BULK mutation and export SHALL be backend commands with
explicit capability, audit, redaction, size, and rate limits").
Findings: **ADM-03**, **AUTH-04**.

What this replaces
------------------
``useUserManagement.bulkUpdateRoles`` / ``bulkDeleteUsers`` were ``for`` loops in
the browser issuing one ``PATCH`` per selected account and counting the
responses. That has three properties nobody wanted:

* **It is not a command.** There is no single decision to authorize, audit, rate
  limit, or replay. Twenty-five role changes were twenty-five unrelated events.
* **It cannot be atomic.** A network drop halfway through left half the
  selection changed, and the only record of which half was a number in a dialog
  that closed.
* **It confirms nothing it changes.** The SHA-256 confirmation token was computed
  in the browser and checked in the browser, so it guarded against a mis-click
  and against nothing else.

The command here is authorized once through ``AdminCapabilityService``, applies
the platform's role ceiling per target, runs in **one transaction**, is bounded
by :data:`MAX_BULK_SIZE`, requires the confirmation token the platform's other
bulk command already uses, revokes sessions whose authority it changed, and
audits the batch.
"""

from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass
from typing import Any, Iterable, Optional

from django.db import DatabaseError, transaction
from django.utils import timezone

from apps.accounts.user_directory_service import (
    SUPPORTED_ROLES,
    UserDirectoryQueryService,
    role_level,
)

logger = logging.getLogger(__name__)

#: Ceiling on one bulk command. Matches ``ApplicationBulkStatusView.MAX_BATCH_SIZE``
#: — one batch-safety budget for the platform, not one per surface.
MAX_BULK_SIZE = 25

#: The two operations. Deliberately not "delete": an account is never deleted,
#: because applications, documents, and audit rows are attached to it. It is
#: deactivated, which is what the previous ``bulkDeleteUsers`` did under a name
#: that promised something else.
BULK_OP_SET_ROLE = "set_role"
BULK_OP_DEACTIVATE = "deactivate"
BULK_OP_REACTIVATE = "reactivate"
BULK_OPERATIONS: tuple[str, ...] = (
    BULK_OP_SET_ROLE,
    BULK_OP_DEACTIVATE,
    BULK_OP_REACTIVATE,
)

ACTION_USER_BULK_UPDATED = "user_bulk_updated"

#: Stable per-target failure codes.
BULK_ERROR_NOT_FOUND = "NOT_FOUND"
BULK_ERROR_ROLE_ABOVE_ACTOR = "ROLE_ABOVE_ACTOR"
BULK_ERROR_TARGET_ABOVE_ACTOR = "TARGET_ABOVE_ACTOR"
BULK_ERROR_SELF_DEACTIVATION = "SELF_DEACTIVATION_FORBIDDEN"
BULK_ERROR_WRITE_FAILED = "WRITE_FAILED"


class UserBulkRejected(Exception):
    """The *command* is unacceptable, independent of any target."""

    def __init__(self, code: str, message: str, *, data: Optional[dict] = None) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.data = data or {}


@dataclass(frozen=True)
class BulkTargetError:
    """One target the command refused, and why."""

    user_id: str
    code: str
    message: str

    def as_payload(self) -> dict[str, Any]:
        return {"user_id": self.user_id, "code": self.code, "message": self.message}


@dataclass(frozen=True)
class BulkResult:
    operation: str
    role: Optional[str]
    applied_ids: tuple[str, ...]
    errors: tuple[BulkTargetError, ...]
    committed: bool
    requested_count: int
    sessions_revoked: int = 0

    def as_payload(self) -> dict[str, Any]:
        return {
            "operation": self.operation,
            "role": self.role,
            "committed": self.committed,
            "requested_count": self.requested_count,
            # On a rolled-back command this is 0, not "how far it got".
            "updated": len(self.applied_ids),
            "updated_ids": list(self.applied_ids),
            "failed": len(self.errors),
            "errors": [error.as_payload() for error in self.errors],
            "sessions_revoked": self.sessions_revoked,
            "size_limit": MAX_BULK_SIZE,
        }


def confirmation_token_for(operation: str, user_ids: Iterable[str], role: Optional[str]) -> str:
    """The token a caller must echo to run the command.

    SHA-256 over the sorted target ids plus the operation and role — the same
    construction ``ApplicationBulkStatusView`` uses. It is now checked on the
    **server**, which is what turns it from a mis-click guard into part of the
    command's identity: a token computed for one selection cannot authorise a
    different one.
    """
    payload = "".join(sorted(str(item) for item in user_ids)) + operation + (role or "")
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


class UserBulkService:
    """Apply one bulk role/status change as a single transaction (R6.5)."""

    def __init__(self, directory: Optional[UserDirectoryQueryService] = None) -> None:
        self.directory = directory or UserDirectoryQueryService()

    @staticmethod
    def resolve_operation(raw: Any) -> str:
        operation = str(raw or "").strip().lower()
        if operation not in BULK_OPERATIONS:
            raise UserBulkRejected(
                "INVALID_BULK_OPERATION",
                "Unknown bulk operation.",
                data={"supported_operations": list(BULK_OPERATIONS)},
            )
        return operation

    def apply(
        self,
        actor,
        *,
        operation: str,
        user_ids: list[str],
        role: Optional[str] = None,
        confirmation_token: str = "",
        request=None,
    ) -> BulkResult:
        """Validate and apply the command, all-or-nothing.

        There is no per-target mode here, unlike the import. An import is a
        create — a partially-created batch is recoverable by importing the rest.
        A bulk authority change is not: an operator who asked for twenty-five
        reviewers and got nineteen has no way to tell which six without
        re-reading the directory, and in the meantime six people hold authority
        the operator believes they removed.
        """
        from apps.accounts.models import Profile

        ids = [str(item).strip() for item in (user_ids or []) if str(item).strip()]
        if not ids:
            raise UserBulkRejected("EMPTY_SELECTION", "Select at least one account.")
        if len(ids) > MAX_BULK_SIZE:
            raise UserBulkRejected(
                "BATCH_SIZE_EXCEEDED",
                f"A bulk change may cover at most {MAX_BULK_SIZE} accounts.",
                data={"requested_count": len(ids), "size_limit": MAX_BULK_SIZE},
            )

        if operation == BULK_OP_SET_ROLE:
            role = str(role or "").strip().lower()
            if role not in SUPPORTED_ROLES:
                raise UserBulkRejected(
                    "UNSUPPORTED_ROLE",
                    "That is not a role this platform issues.",
                    data={"supported_roles": list(SUPPORTED_ROLES)},
                )
            if role_level(role) > role_level(getattr(actor, "role", None)):
                # A ceiling breach is the *command's* failure, not a per-target
                # one: the operator asked for something they may never do, and
                # reporting it twenty-five times would bury it.
                raise UserBulkRejected(
                    "PRIVILEGE_ESCALATION",
                    "You cannot assign a role higher than your own.",
                )
        else:
            role = None

        expected = confirmation_token_for(operation, ids, role)
        if str(confirmation_token or "") != expected:
            raise UserBulkRejected(
                "INVALID_CONFIRMATION_TOKEN",
                "This confirmation does not match the selected accounts. Reopen the dialog and try again.",
            )

        actor_id = str(getattr(actor, "id", None) or getattr(actor, "pk", None) or "")
        actor_level = role_level(getattr(actor, "role", None))

        # Scope before lookup: the selection is narrowed through the actor's own
        # directory queryset, so an id outside their scope is reported exactly
        # like an id that does not exist.
        scoped = self.directory.scoped_users(actor).filter(pk__in=ids)
        found = {str(profile.pk): profile for profile in scoped}

        errors: list[BulkTargetError] = []
        targets: list[Any] = []
        for user_id in ids:
            profile = found.get(user_id)
            if profile is None:
                errors.append(
                    BulkTargetError(
                        user_id=user_id,
                        code=BULK_ERROR_NOT_FOUND,
                        message="This account was not found.",
                    )
                )
                continue
            if role_level(profile.role) > actor_level:
                errors.append(
                    BulkTargetError(
                        user_id=user_id,
                        code=BULK_ERROR_TARGET_ABOVE_ACTOR,
                        message="You cannot modify an account with a higher role than your own.",
                    )
                )
                continue
            if operation == BULK_OP_DEACTIVATE and user_id == actor_id:
                errors.append(
                    BulkTargetError(
                        user_id=user_id,
                        code=BULK_ERROR_SELF_DEACTIVATION,
                        message="You cannot deactivate your own account.",
                    )
                )
                continue
            targets.append(profile)

        if errors or not targets:
            # All-or-nothing: nothing is written and the operator is told which
            # targets were the problem.
            result = BulkResult(
                operation=operation,
                role=role,
                applied_ids=(),
                errors=tuple(errors),
                committed=False,
                requested_count=len(ids),
            )
            self._audit(actor, result, request=request)
            return result

        applied: list[str] = []
        authority_changed: list[str] = []
        now = timezone.now()
        try:
            with transaction.atomic():
                locked = list(
                    Profile.objects.filter(
                        pk__in=[profile.pk for profile in targets]
                    ).select_for_update()
                )
                for profile in locked:
                    if operation == BULK_OP_SET_ROLE:
                        if profile.role != role:
                            profile.role = role
                            authority_changed.append(str(profile.pk))
                    elif operation == BULK_OP_DEACTIVATE:
                        if profile.is_active is not False:
                            profile.is_active = False
                            authority_changed.append(str(profile.pk))
                    else:
                        profile.is_active = True
                    profile.updated_at = now
                    profile.save(update_fields=["role", "is_active", "updated_at"])
                    applied.append(str(profile.pk))
        except DatabaseError:
            logger.warning("Bulk user command failed to write", exc_info=True)
            result = BulkResult(
                operation=operation,
                role=role,
                applied_ids=(),
                errors=tuple(
                    [
                        BulkTargetError(
                            user_id=str(profile.pk),
                            code=BULK_ERROR_WRITE_FAILED,
                            message="This change could not be saved. Nothing was changed.",
                        )
                        for profile in targets
                    ]
                ),
                committed=False,
                requested_count=len(ids),
            )
            self._audit(actor, result, request=request)
            return result

        # A role change or a deactivation changes effective authority, so the
        # target's in-flight sessions carry stale authority. Revoking them is
        # what makes the bulk change take effect now rather than at the end of
        # the current access-token lifetime.
        revoked = self._revoke_sessions(authority_changed, operation, actor_id)

        result = BulkResult(
            operation=operation,
            role=role,
            applied_ids=tuple(applied),
            errors=(),
            committed=True,
            requested_count=len(ids),
            sessions_revoked=revoked,
        )
        self._audit(actor, result, request=request)
        return result

    # ------------------------------------------------------------------
    # Side effects
    # ------------------------------------------------------------------

    @staticmethod
    def _revoke_sessions(user_ids: list[str], operation: str, actor_id: str) -> int:
        if not user_ids:
            return 0
        from apps.accounts.session_lifecycle import revoke_sessions_for_authority_change

        reason = "role" if operation == BULK_OP_SET_ROLE else "deactivated"
        total = 0
        for user_id in user_ids:
            try:
                total += int(
                    revoke_sessions_for_authority_change(
                        user_id, reason=reason, actor_id=actor_id or None
                    )
                    or 0
                )
            except Exception:  # pragma: no cover - revocation must not fail the command
                logger.warning(
                    "Failed to revoke sessions after bulk authority change",
                    exc_info=True,
                )
        return total

    @staticmethod
    def _audit(actor, result: BulkResult, *, request=None) -> None:
        """Record the bulk change as one command. Never raises.

        Account ids travel; names, emails, and phone numbers do not. An id is
        the handle an operator needs to follow the trail; the rest is PII the
        audit table has no reason to hold.
        """
        from apps.catalog.tenant_audit_service import TenantAuditService

        try:
            TenantAuditService.record_event(
                action=ACTION_USER_BULK_UPDATED,
                entity_type="profiles",
                actor_id=getattr(actor, "id", None) or getattr(actor, "pk", None),
                actor_role=getattr(actor, "role", None),
                metadata={
                    "operation": result.operation,
                    "role": result.role,
                    "committed": result.committed,
                    "requested_count": result.requested_count,
                    "updated_count": len(result.applied_ids),
                    "failed_count": len(result.errors),
                    "updated_ids": list(result.applied_ids),
                    "error_codes": sorted({error.code for error in result.errors}),
                    "sessions_revoked": result.sessions_revoked,
                },
                retention_category="security",
                request=request,
            )
        except Exception:  # pragma: no cover
            logger.warning("Failed to audit bulk user command", exc_info=True)


__all__ = [
    "ACTION_USER_BULK_UPDATED",
    "BULK_ERROR_NOT_FOUND",
    "BULK_ERROR_ROLE_ABOVE_ACTOR",
    "BULK_ERROR_SELF_DEACTIVATION",
    "BULK_ERROR_TARGET_ABOVE_ACTOR",
    "BULK_ERROR_WRITE_FAILED",
    "BULK_OPERATIONS",
    "BULK_OP_DEACTIVATE",
    "BULK_OP_REACTIVATE",
    "BULK_OP_SET_ROLE",
    "MAX_BULK_SIZE",
    "BulkResult",
    "BulkTargetError",
    "UserBulkRejected",
    "UserBulkService",
    "confirmation_token_for",
]
