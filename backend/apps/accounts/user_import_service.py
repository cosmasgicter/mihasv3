"""Previewed, tenant-bound, atomic, idempotent user import (task 9.3).

Spec: ``.kiro/specs/admissions-v2-canonical-rebuild/`` task 9.3.
Requirement: **R6.4** ("BULK import SHALL provide validation preview, reject
unsupported roles, require the intended memberships, apply atomically per
declared mode, remain idempotent, and return downloadable row-level failures").
Finding: **ADM-04**. Authority finding: **AUTH-04**.

What ADM-04 actually was
------------------------
Four separate defects wearing one name:

1. **No preview.** The browser parsed the CSV, showed the first five rows as a
   *display* courtesy, and then posted the whole file. Whether row 340 was
   acceptable was discovered by importing it.
2. **No tenant binding.** ``Profile.objects.create(...)`` and nothing else. A
   created ``admin`` had the role string and **zero** capabilities, because
   tenant authority comes only from an active membership — so the import's
   output was a set of accounts that could sign in and see nothing.
3. **Not atomic in any declared sense.** Rows were written one at a time in
   their own savepoints and the response reported a count. Half a staff intake
   landing is not a state anybody asked for, and there was no way to ask for the
   other behaviour either.
4. **One opaque failure.** A row that failed at write time was reported as
   ``{"email": ["Already exists"]}`` with ``"index": None`` — the operator was
   told *something* in a 100-row file was a duplicate.

The shape of the fix
--------------------
:meth:`UserImportService.plan` is the single validator. The preview endpoint
returns its result and writes nothing; the commit endpoint runs the same plan and
then applies it. There is no second validation path, so "what the preview said"
and "what the commit did" cannot disagree — which is the only way a preview is
worth anything.

**Atomicity is declared, not assumed.** :data:`IMPORT_MODES`:

* ``all_or_nothing`` (the default) — one transaction. Any invalid row, or any
  write-time conflict, and **nothing** is created.
* ``per_row`` — each row in its own savepoint. A duplicate-email race on one row
  does not discard the rest of the batch.

Per-row savepoints are used in **both** modes, for different reasons: in
``per_row`` they preserve the surviving rows, and in ``all_or_nothing`` they
preserve the *diagnosis* — an ``IntegrityError`` marks the transaction unusable,
so without a savepoint the service could not name the row that collided before
rolling back.

**Idempotency** is the platform's own: the commit endpoint carries
``@idempotent``, whose command identity is
``(idempotency_key, actor, method, path, body_hash)``. A replay with the same key
and body returns the first response rather than importing twice; the same key
with a different body is a 409. Absent a key, a replayed ``all_or_nothing``
import fails closed — every row is ``EMAIL_EXISTS`` and nothing is written — so a
double-submit still cannot produce duplicate accounts.
"""

from __future__ import annotations

import logging
import re
import secrets
from dataclasses import dataclass
from typing import Any, Optional

from django.db import DatabaseError, IntegrityError, transaction
from django.utils import timezone

from apps.accounts.user_directory_service import (
    IMPORT_MAX_ROWS,
    IMPORT_ROW_FIELDS,
    SUPPORTED_ROLES,
    UserScopeDenied,
    email_fingerprint,
    role_level,
    split_full_name,
)

logger = logging.getLogger(__name__)

#: One transaction for the whole batch: an invalid or conflicting row means
#: nothing is created. The default, because a partially-imported staff intake is
#: harder to reconcile than a rejected one.
IMPORT_MODE_ALL_OR_NOTHING = "all_or_nothing"

#: Each row in its own savepoint: valid rows land, conflicting rows are reported.
IMPORT_MODE_PER_ROW = "per_row"

IMPORT_MODES: tuple[str, ...] = (IMPORT_MODE_ALL_OR_NOTHING, IMPORT_MODE_PER_ROW)
DEFAULT_IMPORT_MODE = IMPORT_MODE_ALL_OR_NOTHING

#: Audit action for an import batch. Preserved verbatim from the April 2026
#: hardening work — an existing operational query reads it.
ACTION_USER_BATCH_IMPORT = "user_batch_import"

#: Audit action for a preview. A preview writes no account but it *does* read the
#: directory in bulk and disclose which addresses already exist, so it is a
#: recorded read.
ACTION_USER_IMPORT_PREVIEWED = "user_batch_import_previewed"

#: Minimum generated password length when a row supplies none.
_GENERATED_PASSWORD_BYTES = 12

_EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")

#: Stable row-error codes. The operator downloads these, so they are part of the
#: contract rather than prose: a code can be filtered, counted, and fixed in bulk.
ERROR_UNSUPPORTED_FIELD = "UNSUPPORTED_FIELD"
ERROR_MISSING_FIELD = "MISSING_FIELD"
ERROR_INVALID_EMAIL = "INVALID_EMAIL"
ERROR_UNSUPPORTED_ROLE = "UNSUPPORTED_ROLE"
ERROR_ROLE_ABOVE_ACTOR = "ROLE_ABOVE_ACTOR"
ERROR_DUPLICATE_IN_BATCH = "DUPLICATE_IN_BATCH"
ERROR_EMAIL_EXISTS = "EMAIL_EXISTS"
ERROR_WRITE_CONFLICT = "WRITE_CONFLICT"
ERROR_ROW_NOT_AN_OBJECT = "ROW_NOT_AN_OBJECT"
ERROR_PASSWORD_TOO_SHORT = "PASSWORD_TOO_SHORT"

ROW_ERROR_CODES: frozenset[str] = frozenset(
    {
        ERROR_UNSUPPORTED_FIELD,
        ERROR_MISSING_FIELD,
        ERROR_INVALID_EMAIL,
        ERROR_UNSUPPORTED_ROLE,
        ERROR_ROLE_ABOVE_ACTOR,
        ERROR_DUPLICATE_IN_BATCH,
        ERROR_EMAIL_EXISTS,
        ERROR_WRITE_CONFLICT,
        ERROR_ROW_NOT_AN_OBJECT,
        ERROR_PASSWORD_TOO_SHORT,
    }
)


class UserImportRejected(Exception):
    """The *request* is unacceptable, independent of any row.

    Distinct from a row error on purpose: a batch that is too large, names an
    unknown mode, or names no institution has nothing to preview, so there is
    nothing row-shaped to report.
    """

    def __init__(self, code: str, message: str, *, data: Optional[dict] = None) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.data = data or {}


@dataclass(frozen=True)
class ImportRow:
    """One validated row, ready to write."""

    index: int
    email: str
    first_name: str
    last_name: str
    phone: str
    role: str
    password: str
    supplied_password: bool

    @property
    def email_hash(self) -> str:
        return email_fingerprint(self.email)

    def as_preview(self) -> dict[str, Any]:
        """What the operator sees before committing.

        The password is never echoed — not even to say what it is. ``password``
        here is a *boolean* about provenance, because "we will generate one" and
        "you supplied one" are the only two facts the operator needs and the
        value itself has no business travelling back to a browser.
        """
        return {
            "index": self.index,
            "email": self.email,
            "first_name": self.first_name,
            "last_name": self.last_name,
            "full_name": " ".join(part for part in (self.first_name, self.last_name) if part),
            "phone": self.phone,
            "role": self.role,
            "password_supplied": self.supplied_password,
            "will_receive_generated_password": not self.supplied_password,
        }


@dataclass(frozen=True)
class RowError:
    """One row-level failure, addressed by the row number the operator sees."""

    index: Optional[int]
    code: str
    message: str
    field: Optional[str] = None
    email: str = ""

    def as_payload(self) -> dict[str, Any]:
        return {
            "index": self.index,
            "row": self.index,
            "code": self.code,
            "field": self.field,
            "message": self.message,
            "email": self.email,
        }

    def as_audit(self) -> dict[str, Any]:
        """The audit-safe projection: a code and a fingerprint, never an address."""
        return {
            "index": self.index,
            "code": self.code,
            "field": self.field,
            "email_hash": email_fingerprint(self.email) if self.email else None,
        }


@dataclass(frozen=True)
class ImportPlan:
    """The result of validating one import request — written by nobody yet."""

    mode: str
    institution_id: str
    rows: tuple[ImportRow, ...] = ()
    errors: tuple[RowError, ...] = ()
    submitted_count: int = 0

    @property
    def would_commit(self) -> bool:
        """Whether :meth:`UserImportService.commit` would write anything.

        In ``all_or_nothing`` a single row error means no. That answer is
        available *before* the operator commits, which is the whole point of the
        preview.
        """
        if not self.rows:
            return False
        if self.mode == IMPORT_MODE_ALL_OR_NOTHING and self.errors:
            return False
        return True

    def as_payload(self) -> dict[str, Any]:
        return {
            "mode": self.mode,
            "institution_id": self.institution_id,
            "submitted_count": self.submitted_count,
            "valid_count": len(self.rows),
            "error_count": len(self.errors),
            "would_commit": self.would_commit,
            "rows": [row.as_preview() for row in self.rows],
            "errors": [error.as_payload() for error in self.errors],
            "row_limit": IMPORT_MAX_ROWS,
        }


@dataclass(frozen=True)
class ImportResult:
    """What a commit actually did."""

    plan: ImportPlan
    committed: bool
    created_ids: tuple[str, ...] = ()
    errors: tuple[RowError, ...] = ()
    rolled_back_reason: Optional[str] = None

    def as_payload(self) -> dict[str, Any]:
        return {
            "mode": self.plan.mode,
            "institution_id": self.plan.institution_id,
            "committed": self.committed,
            "submitted_count": self.plan.submitted_count,
            # ``created`` is the number of accounts that exist because of this
            # request. On a rolled-back batch it is 0 — not "the number we got
            # through before it failed", which is what the pre-9.3 response
            # reported and what made a partial import look like a success.
            "created": len(self.created_ids),
            "created_ids": list(self.created_ids),
            "failed": len(self.errors),
            "errors": [error.as_payload() for error in self.errors],
            "rolled_back_reason": self.rolled_back_reason,
            "row_limit": IMPORT_MAX_ROWS,
        }


class _AbortBatch(Exception):
    """Internal: roll the outer transaction back in ``all_or_nothing`` mode."""


class UserImportService:
    """Validate, preview, and apply a tenant-bound user import (R6.4)."""

    # ------------------------------------------------------------------
    # Request-level validation
    # ------------------------------------------------------------------

    @staticmethod
    def resolve_mode(raw: Any) -> str:
        """Validate the declared atomicity mode.

        An unrecognised mode is rejected rather than defaulted: the caller
        expressed an intent about a bulk write and the platform does not get to
        substitute a different one.
        """
        mode = str(raw or "").strip().lower() or DEFAULT_IMPORT_MODE
        if mode not in IMPORT_MODES:
            raise UserImportRejected(
                "INVALID_IMPORT_MODE",
                "Unknown import mode.",
                data={"supported_modes": list(IMPORT_MODES)},
            )
        return mode

    def resolve_institution(self, actor, institution_id: Any):
        """Resolve the school every imported account will be bound to (R6.4).

        The import is **tenant-bound**: an account created here is created *into*
        a school. This is a deliberate strengthening of the pre-9.3 contract,
        which accepted no institution at all — see the evidence README. A
        platform-global account with no tenant is still creatable, through the
        single-user create command, where the decision is visible one account at
        a time rather than a hundred at once.

        Scope precedes lookup: the id is resolved against the actor's visible
        institutions before it reaches any write, and an out-of-scope id raises
        :class:`UserScopeDenied` (a masked 404) rather than a 403 that would
        confirm the school exists.

        The per-role invite ceiling is **not** decided here. It is decided per
        row in :meth:`plan`, through ``AdminCapabilityService.can_invite_staff``,
        so a file that slips one ``super_admin`` row into ninety-nine students
        fails on *that row* instead of being admitted because the first row
        looked harmless.
        """
        from apps.catalog.services import AdminCapabilityService

        requested = str(institution_id or "").strip()
        if not requested:
            raise UserImportRejected(
                "INSTITUTION_REQUIRED",
                "Choose the school these accounts belong to. Imported accounts are created into a school so they have access on their first sign-in.",
            )

        try:
            institution = (
                AdminCapabilityService()
                .visible_institution_queryset(actor)
                .filter(pk=requested)
                .first()
            )
        except Exception:
            raise UserScopeDenied("institution", requested)
        if institution is None:
            raise UserScopeDenied("institution", requested)
        return institution

    # ------------------------------------------------------------------
    # Row validation (the single validator, shared by preview and commit)
    # ------------------------------------------------------------------

    def plan(
        self,
        actor,
        payload: Any,
        *,
        institution,
        mode: str,
    ) -> ImportPlan:
        """Validate every row without writing anything (R6.4).

        Row numbers are **1-based and stable**: index 1 is the first data row of
        the operator's file. The pre-9.3 response reported a zero-based index of
        the *filtered* list (and ``None`` for a write-time failure), which did
        not identify a line in anything the operator could open.
        """
        from apps.accounts.models import Profile
        from apps.catalog.services import AdminCapabilityService

        if not isinstance(payload, list):
            raise UserImportRejected(
                "INVALID_FORMAT", "Expected a list of rows to import."
            )
        if not payload:
            raise UserImportRejected("EMPTY_IMPORT", "There are no rows to import.")
        if len(payload) > IMPORT_MAX_ROWS:
            raise UserImportRejected(
                "BATCH_TOO_LARGE",
                f"An import may contain at most {IMPORT_MAX_ROWS} rows. Split the file and try again.",
                data={"submitted_count": len(payload), "row_limit": IMPORT_MAX_ROWS},
            )

        capability_service = AdminCapabilityService()
        actor_level = role_level(getattr(actor, "role", None))

        errors: list[RowError] = []
        rows: list[ImportRow] = []
        seen: dict[str, int] = {}

        candidate_emails: list[str] = []
        for raw in payload:
            if isinstance(raw, dict):
                candidate = str(raw.get("email") or "").strip().lower()
                if candidate:
                    candidate_emails.append(candidate)
        existing_emails = {
            str(value).lower()
            for value in Profile.objects.filter(
                email__in=candidate_emails
            ).values_list("email", flat=True)
        }

        for offset, raw in enumerate(payload):
            index = offset + 1

            if not isinstance(raw, dict):
                errors.append(
                    RowError(
                        index=index,
                        code=ERROR_ROW_NOT_AN_OBJECT,
                        message="This row is not a set of fields.",
                    )
                )
                continue

            unsupported = {str(key) for key in raw.keys()} - set(IMPORT_ROW_FIELDS)
            if unsupported:
                errors.append(
                    RowError(
                        index=index,
                        code=ERROR_UNSUPPORTED_FIELD,
                        field=", ".join(sorted(unsupported)),
                        message=(
                            "This row carries fields the import does not support: "
                            + ", ".join(sorted(unsupported))
                            + "."
                        ),
                        email=str(raw.get("email") or "").strip(),
                    )
                )
                continue

            email = str(raw.get("email") or "").strip().lower()
            if not email:
                errors.append(
                    RowError(
                        index=index,
                        code=ERROR_MISSING_FIELD,
                        field="email",
                        message="An email address is required.",
                    )
                )
                continue
            if not _EMAIL_RE.match(email) or len(email) > 255:
                errors.append(
                    RowError(
                        index=index,
                        code=ERROR_INVALID_EMAIL,
                        field="email",
                        message="This is not a valid email address.",
                        email=email,
                    )
                )
                continue

            first_name = str(raw.get("first_name") or "").strip()
            last_name = str(raw.get("last_name") or "").strip()
            if not first_name and not last_name:
                # The CSV template has always used a single ``full_name`` column.
                # Splitting it here, once, means the browser is not a second
                # implementation of a rule that decides what an account is called.
                first_name, last_name = split_full_name(raw.get("full_name"))
            if not first_name:
                errors.append(
                    RowError(
                        index=index,
                        code=ERROR_MISSING_FIELD,
                        field="first_name",
                        message="A name is required.",
                        email=email,
                    )
                )
                continue

            role = str(raw.get("role") or "").strip().lower()
            if not role:
                errors.append(
                    RowError(
                        index=index,
                        code=ERROR_MISSING_FIELD,
                        field="role",
                        message="A role is required.",
                        email=email,
                    )
                )
                continue
            if role not in SUPPORTED_ROLES:
                errors.append(
                    RowError(
                        index=index,
                        code=ERROR_UNSUPPORTED_ROLE,
                        field="role",
                        message=(
                            "'"
                            + role
                            + "' is not a role this platform issues. Supported roles: "
                            + ", ".join(SUPPORTED_ROLES)
                            + "."
                        ),
                        email=email,
                    )
                )
                continue

            # AUTH-04: the ceiling is the platform's, decided centrally, for
            # this school. Both halves matter — the hierarchy ceiling and the
            # per-institution invite capability — and neither is a role-string
            # comparison in this module.
            if role_level(role) > actor_level or not capability_service.can_invite_staff(
                actor, institution, role
            ):
                errors.append(
                    RowError(
                        index=index,
                        code=ERROR_ROLE_ABOVE_ACTOR,
                        field="role",
                        message="You cannot create an account with this role in this school.",
                        email=email,
                    )
                )
                continue

            password = str(raw.get("password") or "")
            supplied = bool(password)
            if supplied and len(password) < 6:
                errors.append(
                    RowError(
                        index=index,
                        code=ERROR_PASSWORD_TOO_SHORT,
                        field="password",
                        message="A supplied password must be at least 6 characters.",
                        email=email,
                    )
                )
                continue

            if email in seen:
                errors.append(
                    RowError(
                        index=index,
                        code=ERROR_DUPLICATE_IN_BATCH,
                        field="email",
                        message=f"This address also appears on row {seen[email]}.",
                        email=email,
                    )
                )
                continue

            if email in existing_emails:
                errors.append(
                    RowError(
                        index=index,
                        code=ERROR_EMAIL_EXISTS,
                        field="email",
                        message="An account with this address already exists.",
                        email=email,
                    )
                )
                continue

            seen[email] = index
            rows.append(
                ImportRow(
                    index=index,
                    email=email,
                    first_name=first_name,
                    last_name=last_name or first_name,
                    phone=str(raw.get("phone") or "").strip()[:20],
                    role=role,
                    password=password or secrets.token_urlsafe(_GENERATED_PASSWORD_BYTES),
                    supplied_password=supplied,
                )
            )

        return ImportPlan(
            mode=mode,
            institution_id=str(institution.pk),
            rows=tuple(rows),
            errors=tuple(errors),
            submitted_count=len(payload),
        )

    # ------------------------------------------------------------------
    # Commit
    # ------------------------------------------------------------------

    def commit(self, actor, plan: ImportPlan, *, request=None) -> ImportResult:
        """Apply ``plan`` under its declared mode, then audit the batch (R6.4)."""
        from apps.accounts.models import Profile
        from apps.accounts.services import hash_password
        from apps.catalog.models import UserInstitutionMembership

        errors: list[RowError] = list(plan.errors)

        if plan.mode == IMPORT_MODE_ALL_OR_NOTHING and plan.errors:
            # The preview already said this would not commit. Refusing here
            # rather than importing the valid subset is what "all or nothing"
            # means, and it is why the mode is declared by the caller.
            result = ImportResult(
                plan=plan,
                committed=False,
                created_ids=(),
                errors=tuple(errors),
                rolled_back_reason="INVALID_ROWS",
            )
            self._audit(actor, result, request=request)
            return result

        if not plan.rows:
            result = ImportResult(
                plan=plan,
                committed=False,
                created_ids=(),
                errors=tuple(errors),
                rolled_back_reason="NO_VALID_ROWS" if errors else "EMPTY",
            )
            self._audit(actor, result, request=request)
            return result

        created_ids: list[str] = []
        rolled_back_reason: Optional[str] = None
        actor_id = getattr(actor, "id", None) or getattr(actor, "pk", None)
        now = timezone.now()

        try:
            with transaction.atomic():
                for row in plan.rows:
                    try:
                        # A savepoint per row. In ``per_row`` mode it protects
                        # the surviving rows; in ``all_or_nothing`` it protects
                        # the *diagnosis*, because an IntegrityError leaves the
                        # transaction unusable and the service would otherwise
                        # be unable to name the row that collided.
                        with transaction.atomic():
                            profile = Profile.objects.create(
                                email=row.email,
                                password_hash=hash_password(row.password),
                                first_name=row.first_name,
                                last_name=row.last_name,
                                phone=row.phone,
                                role=row.role,
                                is_active=True,
                                created_at=now,
                                updated_at=now,
                            )
                            # The membership is part of the same unit as the
                            # account. ADM-04's output was accounts without one:
                            # a role string and no tenant scope, which is an
                            # account that can sign in and do nothing.
                            UserInstitutionMembership.objects.create(
                                user_id=profile.pk,
                                institution_id=plan.institution_id,
                                role=row.role,
                                is_active=True,
                                created_at=now,
                                created_by_id=actor_id,
                            )
                    except IntegrityError:
                        errors.append(
                            RowError(
                                index=row.index,
                                code=ERROR_EMAIL_EXISTS,
                                field="email",
                                message="An account with this address already exists.",
                                email=row.email,
                            )
                        )
                        if plan.mode == IMPORT_MODE_ALL_OR_NOTHING:
                            raise _AbortBatch("WRITE_CONFLICT")
                        continue
                    except DatabaseError:
                        logger.warning(
                            "User import row failed to write", exc_info=True
                        )
                        errors.append(
                            RowError(
                                index=row.index,
                                code=ERROR_WRITE_CONFLICT,
                                message="This row could not be saved. Try again.",
                                email=row.email,
                            )
                        )
                        if plan.mode == IMPORT_MODE_ALL_OR_NOTHING:
                            raise _AbortBatch("WRITE_CONFLICT")
                        continue
                    created_ids.append(str(profile.pk))
        except _AbortBatch as abort:
            created_ids = []
            rolled_back_reason = str(abort) or "WRITE_CONFLICT"

        result = ImportResult(
            plan=plan,
            committed=bool(created_ids),
            created_ids=tuple(created_ids),
            errors=tuple(errors),
            rolled_back_reason=rolled_back_reason,
        )
        self._audit(actor, result, request=request)
        return result

    # ------------------------------------------------------------------
    # Audit
    # ------------------------------------------------------------------

    @staticmethod
    def _audit(actor, result: ImportResult, *, request=None) -> None:
        """Record the batch as one command. Never raises.

        The action string ``user_batch_import`` is preserved from the April 2026
        hardening work. What changed is the payload: it used to record
        ``created_emails`` — a list of addresses, i.e. contact PII, in the audit
        trail. It now records **fingerprints**, plus the mode, the school, the
        outcome, and the per-row error codes. An operator investigating a batch
        needs to know which rows failed and why; they do not need the trail to
        hold the addresses, and the addresses cannot be un-persisted later.
        """
        from apps.catalog.tenant_audit_service import TenantAuditService

        try:
            TenantAuditService.record_event(
                action=ACTION_USER_BATCH_IMPORT,
                entity_type="profiles",
                actor_id=getattr(actor, "id", None) or getattr(actor, "pk", None),
                actor_role=getattr(actor, "role", None),
                institution_id=result.plan.institution_id,
                metadata={
                    "mode": result.plan.mode,
                    "committed": result.committed,
                    "submitted_count": result.plan.submitted_count,
                    "created_count": len(result.created_ids),
                    "skipped_count": len(result.errors),
                    "rolled_back_reason": result.rolled_back_reason,
                    "created_ids": list(result.created_ids),
                    "created_email_hashes": [row.email_hash for row in result.plan.rows]
                    if result.committed
                    else [],
                    "row_errors": [error.as_audit() for error in result.errors],
                },
                retention_category="security",
                request=request,
            )
        except Exception:  # pragma: no cover - audit must never block a write
            logger.warning("Failed to audit user batch import", exc_info=True)

    @staticmethod
    def audit_preview(actor, plan: ImportPlan, *, request=None) -> None:
        """Record a preview as a bulk read. Never raises."""
        from apps.catalog.tenant_audit_service import TenantAuditService

        try:
            TenantAuditService.record_event(
                action=ACTION_USER_IMPORT_PREVIEWED,
                entity_type="profiles",
                actor_id=getattr(actor, "id", None) or getattr(actor, "pk", None),
                actor_role=getattr(actor, "role", None),
                institution_id=plan.institution_id,
                metadata={
                    "mode": plan.mode,
                    "submitted_count": plan.submitted_count,
                    "valid_count": len(plan.rows),
                    "error_count": len(plan.errors),
                    "would_commit": plan.would_commit,
                    "row_error_codes": sorted(
                        {error.code for error in plan.errors}
                    ),
                },
                retention_category="security",
                request=request,
            )
        except Exception:  # pragma: no cover
            logger.warning("Failed to audit user import preview", exc_info=True)


__all__ = [
    "ACTION_USER_BATCH_IMPORT",
    "ACTION_USER_IMPORT_PREVIEWED",
    "DEFAULT_IMPORT_MODE",
    "ERROR_DUPLICATE_IN_BATCH",
    "ERROR_EMAIL_EXISTS",
    "ERROR_INVALID_EMAIL",
    "ERROR_MISSING_FIELD",
    "ERROR_PASSWORD_TOO_SHORT",
    "ERROR_ROLE_ABOVE_ACTOR",
    "ERROR_ROW_NOT_AN_OBJECT",
    "ERROR_UNSUPPORTED_FIELD",
    "ERROR_UNSUPPORTED_ROLE",
    "ERROR_WRITE_CONFLICT",
    "IMPORT_MODES",
    "IMPORT_MODE_ALL_OR_NOTHING",
    "IMPORT_MODE_PER_ROW",
    "ROW_ERROR_CODES",
    "ImportPlan",
    "ImportResult",
    "ImportRow",
    "RowError",
    "UserImportRejected",
    "UserImportService",
]
