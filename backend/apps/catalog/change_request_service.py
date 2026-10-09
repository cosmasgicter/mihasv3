"""Durable tenant change-request workflow service (task 4.5).

Spec: ``.kiro/specs/admissions-v2-canonical-rebuild/`` task 4.5
Requirements: R5.4 (durable request with draft/submitted/approved/rejected/
              applied/cancelled semantics for a protected profile, program, or
              domain change), R5.5 (approval applies transactionally through the
              SAME canonical command a Platform_Admin uses, notifies relevant
              parties, and retains before/after audit data without secrets or
              unnecessary PII).
Findings: TEN-06 (profile/program/domain request-change render explanatory text
          but have no durable workflow).
Design: design.md §6.4 (TenantChangeRequest state machine + typed payloads +
        canonical-command apply with before/after versions), §5.2 (authority),
        §17 (durable committed outbox, "queued == a committed durable record").

This closes TEN-06 by making a protected tenant edit a **durable, reviewable
workflow** instead of the console's dead "request change" text. A Tenant_Admin
SUBMITS a typed request (they hold ``tenant.<kind>.request_change`` but not the
platform capability to mutate directly); a Platform_Admin reviews it and, on
approval, this service applies it **transactionally through the same canonical
configuration command** the platform uses directly
(:mod:`apps.catalog.canonical_config_commands`), recording redacted before/after
snapshots (R5.5). Every lifecycle command records a tenant Audit_Event and a
durable committed outbox row (design §17).

:class:`TenantChangeRequestStateMachine` is the single authority for permitted
transitions. Capability enforcement (``tenant.<kind>.request_change`` to submit /
cancel; the platform capability of the underlying canonical command to
approve/reject) is a separate policy applied by the API layer — this service
owns business state, not authorization (design §3).
"""

from __future__ import annotations

import logging
import uuid
from typing import Any, Optional

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError as DRFValidationError

from apps.catalog.canonical_config_commands import (
    apply_institution_profile_change,
    apply_program_offering_change,
    create_institution_domain,
)
from apps.catalog.models import Institution, Program, TenantChangeRequest
from apps.catalog.tenant_audit_service import TenantAuditService

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------


class ChangeRequestError(Exception):
    """A tenant change-request command failed.

    Carries a stable ``code`` the API layer maps to a V2 error envelope, plus
    optional ``fields`` for validation-shaped failures.
    """

    def __init__(
        self,
        message: str = "",
        *,
        code: Optional[str] = None,
        fields: Optional[dict] = None,
    ):
        super().__init__(message or code or "change_request_error")
        self.message = message or code or "change_request_error"
        self.code = code
        self.fields = fields or {}


# ---------------------------------------------------------------------------
# State machine (design §6.4)
# ---------------------------------------------------------------------------


class TenantChangeRequestStateMachine:
    """The single authority for permitted change-request transitions.

    Design §6.4::

        draft -> submitted -> approved -> applied
                          \\-> rejected
        draft/submitted -> cancelled

    ``applied``, ``rejected``, and ``cancelled`` are terminal. Approval performs
    ``submitted -> approved -> applied`` atomically in one transaction (R5.5), so
    ``approved`` is a transient in-transaction step rather than a resting state;
    it remains a first-class edge so a future deferred-apply policy needs no
    machine change.
    """

    DRAFT = TenantChangeRequest.STATUS_DRAFT
    SUBMITTED = TenantChangeRequest.STATUS_SUBMITTED
    APPROVED = TenantChangeRequest.STATUS_APPROVED
    APPLIED = TenantChangeRequest.STATUS_APPLIED
    REJECTED = TenantChangeRequest.STATUS_REJECTED
    CANCELLED = TenantChangeRequest.STATUS_CANCELLED

    ALLOWED_TRANSITIONS: frozenset[tuple[str, str]] = frozenset(
        {
            (DRAFT, SUBMITTED),
            (SUBMITTED, APPROVED),
            (APPROVED, APPLIED),
            (SUBMITTED, REJECTED),
            (DRAFT, CANCELLED),
            (SUBMITTED, CANCELLED),
        }
    )

    @classmethod
    def can_transition(cls, from_status: str, to_status: str) -> bool:
        """Whether ``from_status -> to_status`` is one of the allowed transitions."""
        return (from_status, to_status) in cls.ALLOWED_TRANSITIONS

    @classmethod
    def allowed_targets(cls, from_status: str) -> frozenset[str]:
        """The set of statuses reachable from ``from_status`` in one transition."""
        return frozenset(
            target for source, target in cls.ALLOWED_TRANSITIONS if source == from_status
        )

    @classmethod
    def is_terminal(cls, status: str) -> bool:
        return not cls.allowed_targets(status)


# ---------------------------------------------------------------------------
# Typed payloads (design §6.4)
# ---------------------------------------------------------------------------

#: Institution profile fields a Tenant_Admin may request to change. Excludes
#: identity/lifecycle fields the platform controls (``code``, ``slug``,
#: ``is_active``) — a tenant requests branding/contact/description edits, not a
#: rename of the canonical identity or a self-service (de)activation.
PROFILE_REQUESTABLE_FIELDS: frozenset[str] = frozenset(
    {
        "name",
        "full_name",
        "brand_name",
        "description",
        "type",
        "address",
        "phone",
        "email",
        "website",
        "support_email",
        "admissions_email",
        "primary_color",
        "secondary_color",
        "accreditation_status",
    }
)

_VALID_KINDS = frozenset(
    {
        TenantChangeRequest.KIND_PROFILE,
        TenantChangeRequest.KIND_PROGRAM,
        TenantChangeRequest.KIND_DOMAIN,
    }
)

#: Free-text note bound (mirrors the audit reason cap).
_MAX_NOTE_LENGTH = 1000


def _redact(value: Any) -> Any:
    """Redact a snapshot through the shared audit redactor (R5.5).

    Reuses :meth:`TenantAuditService._redact` so before/after snapshots stored on
    the request row are masked by the single platform redactor — never raw
    secrets / unnecessary PII. Never raises.
    """
    try:
        return TenantAuditService._redact(value)
    except Exception:  # pragma: no cover - redaction must never block a write
        return {}


def _bounded_note(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()[:_MAX_NOTE_LENGTH]


class TenantChangeRequestService:
    """Durable tenant change-request workflow commands (R5.4, R5.5).

    Every mutating command persists its state change, records a tenant
    Audit_Event, and commits a durable outbox row in the same transaction so the
    request lifecycle is auditable and notifications survive a broker outage
    (design §17). Approval additionally applies the change through the canonical
    configuration command in the same transaction (R5.5).
    """

    # ------------------------------------------------------------------
    # Payload validation (typed by change kind — design §6.4)
    # ------------------------------------------------------------------

    def validate_payload(self, change_kind: str, payload: Any, institution) -> dict:
        """Validate + normalise a typed change-request payload.

        Returns the normalised payload dict. Raises :class:`ChangeRequestError`
        (``INVALID_PAYLOAD``) on a bad shape. This is the submit-time check; the
        canonical command re-validates the concrete fields at apply time
        (design §6.4 "revalidated at application time").
        """
        if change_kind not in _VALID_KINDS:
            raise ChangeRequestError(
                "Unknown change kind.", code="INVALID_PAYLOAD", fields={"change_kind": ["unknown"]}
            )
        if not isinstance(payload, dict):
            raise ChangeRequestError(
                "The change payload must be an object.", code="INVALID_PAYLOAD"
            )

        if change_kind == TenantChangeRequest.KIND_PROFILE:
            fields = payload.get("fields")
            if not isinstance(fields, dict) or not fields:
                raise ChangeRequestError(
                    "A profile change must include a non-empty 'fields' object.",
                    code="INVALID_PAYLOAD",
                    fields={"fields": ["required"]},
                )
            unknown = sorted(set(fields) - PROFILE_REQUESTABLE_FIELDS)
            if unknown:
                raise ChangeRequestError(
                    f"These profile fields cannot be requested: {', '.join(unknown)}.",
                    code="INVALID_PAYLOAD",
                    fields={"fields": [f"unsupported: {', '.join(unknown)}"]},
                )
            return {"fields": {k: fields[k] for k in fields}}

        if change_kind == TenantChangeRequest.KIND_PROGRAM:
            program_id = payload.get("program_id")
            fields = payload.get("fields")
            if not program_id:
                raise ChangeRequestError(
                    "A program change must reference a 'program_id'.",
                    code="INVALID_PAYLOAD",
                    fields={"program_id": ["required"]},
                )
            if not isinstance(fields, dict) or not fields:
                raise ChangeRequestError(
                    "A program change must include a non-empty 'fields' object.",
                    code="INVALID_PAYLOAD",
                    fields={"fields": ["required"]},
                )
            # The target program must exist AND belong to this tenant — reject a
            # cross-tenant program id at submit time (no cross-tenant leakage).
            if not Program.objects.filter(
                id=program_id, institution_id=institution.id
            ).exists():
                raise ChangeRequestError(
                    "That program does not belong to this institution.",
                    code="INVALID_PAYLOAD",
                    fields={"program_id": ["not found for this institution"]},
                )
            return {"program_id": str(program_id), "fields": {k: fields[k] for k in fields}}

        # KIND_DOMAIN
        hostname = payload.get("hostname")
        if not hostname or not str(hostname).strip():
            raise ChangeRequestError(
                "A domain change must include a 'hostname'.",
                code="INVALID_PAYLOAD",
                fields={"hostname": ["required"]},
            )
        return {"hostname": str(hostname).strip().lower()}

    # ------------------------------------------------------------------
    # create / submit (R5.4)
    # ------------------------------------------------------------------

    def create(
        self,
        *,
        institution,
        change_kind: str,
        payload: dict,
        requested_by_id: Any = None,
        note: str = "",
        submit: bool = True,
        idempotency_key: Optional[str] = None,
        request: Any = None,
    ) -> TenantChangeRequest:
        """Create a durable change request (R5.4).

        Idempotent on ``idempotency_key`` (a retried submit returns the same
        request). Validates the typed payload, creates the row in ``draft``, and
        — when ``submit`` is true (the default; a tenant "requests" = submits) —
        transitions it to ``submitted`` and notifies platform reviewers.
        """
        if idempotency_key:
            existing = TenantChangeRequest.objects.filter(
                idempotency_key=idempotency_key
            ).first()
            if existing is not None:
                return existing

        normalised = self.validate_payload(change_kind, payload, institution)
        target_object_id = normalised.get("program_id") if change_kind == TenantChangeRequest.KIND_PROGRAM else None
        now = timezone.now()

        with transaction.atomic():
            change_request = TenantChangeRequest.objects.create(
                id=uuid.uuid4(),
                institution_id=institution.id,
                change_kind=change_kind,
                status=TenantChangeRequest.STATUS_DRAFT,
                payload=normalised,
                target_object_id=target_object_id,
                review_note=_bounded_note(note) or None,
                requested_by_id=requested_by_id,
                created_at=now,
                updated_at=now,
                idempotency_key=idempotency_key,
            )
            self._record_event(
                change_request,
                event_type="tenant.change_request.created",
                actor_id=requested_by_id,
                request=request,
            )
            if submit:
                self._transition(change_request, TenantChangeRequest.STATUS_SUBMITTED)
                change_request.submitted_at = now
                change_request.save(update_fields=["status", "submitted_at", "updated_at"])
                self._record_event(
                    change_request,
                    event_type="tenant.change_request.submitted",
                    actor_id=requested_by_id,
                    request=request,
                    channel_note="platform_review",
                )

        return change_request

    def submit(self, change_request: TenantChangeRequest, *, actor_id=None, request=None) -> TenantChangeRequest:
        """Transition a draft to submitted (R5.4)."""
        with transaction.atomic():
            self._transition(change_request, TenantChangeRequest.STATUS_SUBMITTED)
            change_request.submitted_at = timezone.now()
            change_request.save(update_fields=["status", "submitted_at", "updated_at"])
            self._record_event(
                change_request,
                event_type="tenant.change_request.submitted",
                actor_id=actor_id,
                request=request,
                channel_note="platform_review",
            )
        return change_request

    # ------------------------------------------------------------------
    # cancel (R5.4) — draft/submitted -> cancelled
    # ------------------------------------------------------------------

    def cancel(self, change_request: TenantChangeRequest, *, actor_id=None, note: str = "", request=None) -> TenantChangeRequest:
        """Cancel a draft/submitted request (R5.4)."""
        with transaction.atomic():
            self._transition(change_request, TenantChangeRequest.STATUS_CANCELLED)
            if note:
                change_request.review_note = _bounded_note(note)
            change_request.save(update_fields=["status", "review_note", "updated_at"])
            self._record_event(
                change_request,
                event_type="tenant.change_request.cancelled",
                actor_id=actor_id,
                request=request,
            )
        return change_request

    # ------------------------------------------------------------------
    # reject (R5.4) — submitted -> rejected
    # ------------------------------------------------------------------

    def reject(self, change_request: TenantChangeRequest, *, reviewer_id=None, note: str = "", request=None) -> TenantChangeRequest:
        """Reject a submitted request (R5.4)."""
        now = timezone.now()
        with transaction.atomic():
            self._transition(change_request, TenantChangeRequest.STATUS_REJECTED)
            change_request.reviewed_by_id = reviewer_id
            change_request.reviewed_at = now
            change_request.review_note = _bounded_note(note) or "Rejected by a platform administrator."
            change_request.save(
                update_fields=["status", "reviewed_by_id", "reviewed_at", "review_note", "updated_at"]
            )
            self._record_event(
                change_request,
                event_type="tenant.change_request.rejected",
                actor_id=reviewer_id,
                request=request,
                channel_note="tenant_notify",
            )
        return change_request

    # ------------------------------------------------------------------
    # approve (R5.5) — submitted -> approved -> applied, transactionally, via the
    # SAME canonical command a Platform_Admin uses directly.
    # ------------------------------------------------------------------

    def approve(self, change_request: TenantChangeRequest, *, reviewer_id=None, note: str = "", request=None) -> TenantChangeRequest:
        """Approve and apply a submitted request transactionally (R5.5).

        Performs ``submitted -> approved -> applied`` in one transaction, applying
        the change through the canonical configuration command and recording
        redacted before/after snapshots. If the canonical command rejects the
        payload at apply time (revalidation) or a conflict occurs, the whole
        transaction rolls back and the request stays ``submitted``; the failure
        reason is recorded on ``last_error`` in a separate write.
        """
        if change_request.status != TenantChangeRequest.STATUS_SUBMITTED:
            raise ChangeRequestError(
                "Only a submitted change request can be approved.",
                code="CHANGE_REQUEST_INVALID_STATE",
            )
        now = timezone.now()
        try:
            with transaction.atomic():
                # submitted -> approved (records reviewer decision).
                self._transition(change_request, TenantChangeRequest.STATUS_APPROVED)
                change_request.reviewed_by_id = reviewer_id
                change_request.reviewed_at = now
                if note:
                    change_request.review_note = _bounded_note(note)

                before, after, target_object_id, config_version = self._apply_canonical(
                    change_request, request=request
                )

                # approved -> applied (records before/after versions).
                self._transition(change_request, TenantChangeRequest.STATUS_APPLIED)
                change_request.before_data = _redact(before)
                change_request.after_data = _redact(after)
                if target_object_id is not None:
                    change_request.target_object_id = target_object_id
                change_request.configuration_version = config_version
                change_request.applied_at = now
                change_request.last_error = None
                change_request.save(
                    update_fields=[
                        "status",
                        "reviewed_by_id",
                        "reviewed_at",
                        "review_note",
                        "before_data",
                        "after_data",
                        "target_object_id",
                        "configuration_version",
                        "applied_at",
                        "last_error",
                        "updated_at",
                    ]
                )
                self._record_event(
                    change_request,
                    event_type="tenant.change_request.applied",
                    actor_id=reviewer_id,
                    request=request,
                    channel_note="tenant_notify",
                    extra={
                        "before": change_request.before_data,
                        "after": change_request.after_data,
                        "configuration_version": config_version,
                    },
                )
        except (DRFValidationError, DjangoValidationError, IntegrityError, ValueError) as exc:
            # Apply-time revalidation / conflict: the transaction rolled back so
            # the request is unchanged (still submitted). Record the reason
            # out-of-band (best effort) so operators can see why it failed.
            self._record_apply_failure(change_request, exc)
            code = "HOSTNAME_CONFLICT" if isinstance(exc, IntegrityError) else "CHANGE_REQUEST_APPLY_FAILED"
            raise ChangeRequestError(
                "The change could not be applied; it was returned to submitted.",
                code=code,
            ) from exc
        return change_request

    # ------------------------------------------------------------------
    # Canonical apply dispatch (R5.5) — the SAME command the platform uses.
    # ------------------------------------------------------------------

    def _apply_canonical(self, change_request: TenantChangeRequest, *, request):
        """Dispatch to the canonical command for the change kind. Returns
        ``(before, after, target_object_id, configuration_version)``.
        """
        kind = change_request.change_kind
        payload = change_request.payload or {}
        institution_id = change_request.institution_id

        if kind == TenantChangeRequest.KIND_PROFILE:
            institution = Institution.objects.get(id=institution_id)
            fields = dict(payload.get("fields") or {})
            before = {k: getattr(institution, k, None) for k in fields}
            institution = apply_institution_profile_change(institution, fields, request=request)
            after = {k: getattr(institution, k, None) for k in fields}
            return before, after, None, change_request.configuration_version + 1

        if kind == TenantChangeRequest.KIND_PROGRAM:
            program = Program.objects.get(
                id=payload.get("program_id"), institution_id=institution_id
            )
            fields = dict(payload.get("fields") or {})
            before = {k: getattr(program, k, None) for k in fields}
            program = apply_program_offering_change(program, fields, request=request)
            after = {k: getattr(program, k, None) for k in fields}
            return before, after, program.id, change_request.configuration_version + 1

        # KIND_DOMAIN — create the requested custom domain through the canonical
        # domain-create command (pending_dns + durable verification job).
        domain, dns_record = create_institution_domain(
            institution_id,
            {"hostname": payload.get("hostname")},
            request=request,
            created_by_id=change_request.requested_by_id,
        )
        before: dict[str, Any] = {}
        after = {
            "domain_id": str(domain.id),
            "hostname": domain.hostname,
            "status": domain.status,
            "dns_record": dns_record,
        }
        return before, after, domain.id, change_request.configuration_version + 1

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _transition(self, change_request: TenantChangeRequest, to_status: str) -> None:
        """Assert + set a state-machine transition (design §6.4)."""
        if not TenantChangeRequestStateMachine.can_transition(change_request.status, to_status):
            raise ChangeRequestError(
                f"Cannot move a {change_request.status} change request to {to_status}.",
                code="CHANGE_REQUEST_INVALID_STATE",
            )
        change_request.status = to_status
        change_request.updated_at = timezone.now()

    def _record_apply_failure(self, change_request: TenantChangeRequest, exc: Exception) -> None:
        """Best-effort record of an apply-time failure reason (never raises)."""
        try:
            reason = _bounded_note(getattr(exc, "detail", None) or str(exc)) or "apply failed"
            TenantChangeRequest.objects.filter(id=change_request.id).update(
                last_error=reason, updated_at=timezone.now()
            )
            change_request.last_error = reason
        except Exception:  # pragma: no cover
            logger.warning("Failed to record change-request apply failure", exc_info=True)

    def _record_event(
        self,
        change_request: TenantChangeRequest,
        *,
        event_type: str,
        actor_id: Any = None,
        request: Any = None,
        channel_note: Optional[str] = None,
        extra: Optional[dict] = None,
    ) -> None:
        """Record a tenant Audit_Event and a durable committed outbox row.

        Both are best-effort with respect to the audit/outbox infrastructure (a
        transient failure there must never abort the state change), but they are
        written inside the caller's transaction so, on success, the durable
        outbox record commits atomically with the state change (design §17). The
        outbox row is the durable "notify relevant parties" signal (R5.5) a
        downstream relay consumes — platform reviewers on submit, the tenant on
        applied/rejected.
        """
        institution_id = change_request.institution_id
        metadata = {
            "change_request_id": str(change_request.id),
            "institution_id": str(institution_id),
            "change_kind": change_request.change_kind,
            "status": change_request.status,
        }
        if channel_note:
            metadata["notify"] = channel_note
        if extra:
            metadata.update(extra)

        try:
            TenantAuditService.record_event(
                action=event_type,
                entity_type="tenant_change_request",
                entity_id=change_request.id,
                actor_id=actor_id,
                institution_id=institution_id,
                metadata=metadata,
                request=request,
            )
        except Exception:  # pragma: no cover - audit must never block a write
            logger.warning("Failed to record change-request audit %s", event_type, exc_info=True)

        try:
            from apps.common.models import OutboxEvent

            now = timezone.now()
            OutboxEvent.objects.create(
                id=uuid.uuid4(),
                event_type=event_type,
                channel="tenant",
                aggregate_type="tenant_change_request",
                aggregate_id=change_request.id,
                payload=metadata,
                status="published",
                target_table="tenant_change_requests",
                target_id=change_request.id,
                created_at=now,
                processed_at=now,
            )
        except Exception:  # pragma: no cover - outbox must never block a write
            logger.warning("Failed to record change-request outbox %s", event_type, exc_info=True)


__all__ = [
    "ChangeRequestError",
    "TenantChangeRequestStateMachine",
    "TenantChangeRequestService",
    "PROFILE_REQUESTABLE_FIELDS",
]
