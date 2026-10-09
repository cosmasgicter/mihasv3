"""Tenant observability audit service (multi-tenant Beanola, task 26.1).

Single entry point for the non-PII tenant Audit_Events required by
Requirement 13:

* assignment decisions / failures (``assignment.decided`` /
  ``assignment.failed``) — R13.1, R13.3;
* tenant configuration create/update/deactivate across institutions, domains,
  assets, templates, required documents, memberships, and access grants
  (``tenant.<resource>.<verb>``) — R13.1;
* asset uploads (``tenant.asset.uploaded``) — R13.1;
* official-document generation (``official_document.generated``) — R13.1;
* access-scope denials (``scope.denied``) — R13.1.

Like :class:`apps.documents.payment_audit_service.PaymentAuditService`
(ADR-003 "reuse ``audit_logs``"), every event is a row in the existing
``audit_logs`` table — no new table. The redaction rules are **reused** from
``PaymentAuditService._redact_pii`` so the platform has exactly one place that
decides how a phone/NRC/passport/document-body is masked (R13.4). Audit-writer
failures never propagate: a transient ``audit_logs`` issue must not abort an
assignment, a config write, or a document render.

Requirements: R13.1, R13.2, R13.3, R13.4, R13.5.
"""

from __future__ import annotations

import logging
from typing import Any, Optional
from uuid import UUID

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Action vocabulary
# ---------------------------------------------------------------------------

#: Assignment routing decision succeeded.
ACTION_ASSIGNMENT_DECIDED = "assignment.decided"
#: Assignment routing failed (``NO_ELIGIBLE_OFFERING``) — the operational
#: coverage-gap signal (R13.3). Carries canonical program + intake + residency.
ACTION_ASSIGNMENT_FAILED = "assignment.failed"

#: Official document generated successfully (the render-failure counterpart
#: ``official_document_render_failed`` is emitted by ``pdf_generation``).
ACTION_OFFICIAL_DOCUMENT_GENERATED = "official_document.generated"

#: Official-document generation enqueued (R16.3). Emitted when a render task is
#: queued (or the brokerless derived-pending fallback is returned) so the queued
#: stage is observable alongside generated/failed/downloaded/emailed.
ACTION_OFFICIAL_DOCUMENT_QUEUED = "official_document.queued"

#: Official document downloaded by an admin or student (R16.3). The actor role
#: is recorded; never the applicant's PII.
ACTION_OFFICIAL_DOCUMENT_DOWNLOADED = "official_document.downloaded"

#: Official-document details emailed to a recipient (R16.3). The recipient email
#: address is applicant contact PII and is therefore NEVER recorded — only the
#: application/institution ids and document type.
ACTION_OFFICIAL_DOCUMENT_EMAILED = "official_document.emailed"

#: A non-super-admin actor's out-of-scope read was masked as not-found.
ACTION_SCOPE_DENIED = "scope.denied"

#: An application review decision was made (status transition by an admin),
#: e.g. ``submitted → under_review``, ``→ approved``, ``→ rejected`` (R10.5).
ACTION_REVIEW_DECIDED = "application.review_decided"

#: A document verification decision was made by an admin (R10.5). The new
#: verification status is recorded in the payload (``verified`` / ``rejected``).
ACTION_DOCUMENT_VERIFICATION_DECIDED = "document.verification_decided"

#: A payment verification decision occurred (R10.5) — either a provider verify
#: call (``PaymentVerifyView``) or an admin payment-status review decision. The
#: outcome status + stable code are recorded; never applicant PII.
ACTION_PAYMENT_VERIFICATION_DECIDED = "payment.verification_decided"

#: A settlement report was exported (admissions-v2 task 8.4, R6.5/R8.4). An
#: export is a bulk read of a tenant's money record, so it is a recorded command:
#: who exported, for which institution scope, with which filters, how many rows,
#: and what the actor's capabilities withheld — never the rows themselves.
ACTION_SETTLEMENT_EXPORTED = "settlement.exported"

#: A fee-administration report was exported (admissions-v2 task 8.4, R6.5/R7.3).
#: Same contract as :data:`ACTION_SETTLEMENT_EXPORTED`.
ACTION_FEE_EXPORTED = "fee.exported"

#: The applications roster was exported (admissions-v2 task 9.1, R6.5/R8.1). Same
#: contract as :data:`ACTION_SETTLEMENT_EXPORTED`: the roster is applicant data,
#: so a bulk read of it records the actor, the institution scope, the applied
#: filters, the row count against the ceiling, and what redaction withheld —
#: never a row. Registered here rather than in the view so the platform has one
#: export vocabulary instead of one per surface.
ACTION_APPLICATION_EXPORTED = "application.exported"

#: A student amendment request was approved or rejected (admissions-v2 task 9.4,
#: R8.3/R8.4, R10.5). An approved amendment rewrites an answer a decision is made
#: on, so who decided it, for which school, on which field, and with what bounded
#: reason is recorded. The amended **value** is not: it is applicant PII, and the
#: application row already holds it.
ACTION_AMENDMENT_REVIEW_DECIDED = "amendment.review_decided"

#: A student requested an amendment and the platform resolved who to notify
#: (admissions-v2 task 9.5, R13.10, finding AUTH-06). The event records the
#: capability the recipients had to hold, how many were resolved for the
#: application's own institution, and — when that is zero — *why*. A tenant
#: notification with no authorized recipient is an operational gap, and this is
#: where it is visible. The amended value never travels; nor does a recipient's
#: name or email address (ids only).
ACTION_AMENDMENT_REQUESTED = "amendment.requested"

#: A tenant audit feed was exported (admissions-v2 task 9.5, R6.5/R6.6). Same
#: contract as :data:`ACTION_SETTLEMENT_EXPORTED`: the actor, the institution the
#: feed was scoped to, the applied filters, and the row count against the ceiling
#: — never the events themselves. Exporting the audit trail is itself an audited
#: act, so the export appears in the feed it exported.
ACTION_AUDIT_EXPORTED = "audit.exported"

#: An offer condition was verified, waived, or reopened (admissions-v2 task 9.4,
#: R8.3/R8.4, R10.5). A waived mandatory condition is the difference between a
#: conditional and an unconditional place, so the transition and its bounded
#: reason are auditable for the school that owns the application.
ACTION_CONDITION_VERIFICATION_DECIDED = "condition.verification_decided"

#: A bulk review decision was applied (admissions-v2 task 9.4, R8.3/R8.4). A bulk
#: command is one authorised act over many applications, so it records the actor,
#: the institution scope, the target status, and the **count** — the affected ids
#: are recorded, but no applicant field is.
ACTION_REVIEW_BULK_DECIDED = "application.review_bulk_decided"

#: A public tracking lookup was answered (admissions-v2 task 10.5, R13.12 /
#: R17.2, findings STU-22 / TEN-10). Design §12: "Attempts are rate-limited and
#: audited without logging the raw token." The event records the **outcome** — a
#: disclosure, or which class of refusal — and, when a disclosure happened, whose
#: application and school it was. It never records the submitted code, any part of
#: it, or a hash of it: a stored digest of a live tracking secret would be a
#: credential in the audit trail, and an audit trail is read by more people than a
#: credential store should be.
ACTION_TRACKING_ATTEMPTED = "application.tracking_attempted"

#: An application owner issued (or re-issued) their public tracking link
#: (admissions-v2 task 10.5, R13.12). Issuing revokes the previous secret, so this
#: is the record of a credential rotation. The plaintext is never recorded.
ACTION_TRACKING_LINK_ISSUED = "application.tracking_link_issued"

#: Free-text reason/notes recorded on an Audit_Event are bounded to this many
#: characters. Admin-authored notes are not value-scanned by the key-based PII
#: redactor, so the length cap limits how much free text can ever be persisted.
_MAX_REASON_LENGTH = 1000


def _bounded_reason(value: Any) -> Optional[str]:
    """Return a length-bounded reason string or ``None`` (never raises)."""
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    return text[:_MAX_REASON_LENGTH]

#: Prefix shared by every tenant configuration-change action. The verb is one
#: of ``created`` / ``updated`` / ``deactivated`` and ``<resource>`` is the
#: tenant child type (``institution``, ``domain``, ``asset``, ``template``,
#: ``required_document``, ``membership``, ``grant``).
TENANT_CONFIG_ACTION_PREFIX = "tenant."

#: Action prefixes/values surfaced by the Super_Admin operational-review view
#: (R13.2): recent tenant configuration changes + routing failures.
OBSERVABILITY_CONFIG_PREFIX = TENANT_CONFIG_ACTION_PREFIX
OBSERVABILITY_ROUTING_FAILURE_ACTION = ACTION_ASSIGNMENT_FAILED

#: Actions promoted to the 365-day ``security`` retention window. A scope
#: denial is a potential cross-tenant probe; a deactivation removes access.
_SECURITY_RETENTION_ACTIONS: frozenset[str] = frozenset({ACTION_SCOPE_DENIED})
_SECURITY_RETENTION_SUFFIX = ".deactivated"


def _coerce_uuid(value: Any) -> Optional[UUID]:
    """Return ``value`` as a ``UUID`` or ``None`` (never raises)."""
    if value is None:
        return None
    if isinstance(value, UUID):
        return value
    try:
        return UUID(str(value))
    except (TypeError, ValueError):
        return None


def _uuid_str(value: Any) -> Optional[str]:
    coerced = _coerce_uuid(value)
    return str(coerced) if coerced is not None else None


class TenantAuditService:
    """Thin, never-raising writer over ``audit_logs`` for tenant observability.

    Every method is a ``@staticmethod`` — callers use the class as a namespace
    and never instantiate it (mirrors :class:`PaymentAuditService`).
    """

    # ------------------------------------------------------------------
    # Generic writer
    # ------------------------------------------------------------------

    @staticmethod
    def record_event(
        *,
        action: str,
        entity_type: str,
        entity_id: Optional[Any] = None,
        actor_id: Optional[Any] = None,
        actor_role: Optional[str] = None,
        institution_id: Optional[Any] = None,
        metadata: Optional[dict] = None,
        retention_category: str = "standard",
        request: Optional[Any] = None,
    ) -> None:
        """Persist one tenant Audit_Event row. Never raises.

        ``institution_id`` is always recorded inside ``changes`` (when valid)
        so per-institution scoping (R13.5) can filter on it regardless of which
        id ``entity_id`` carries. The payload is recursively redacted before
        persistence using the shared payment redactor (R13.4).
        """
        try:
            from apps.common.models import AuditLog
        except Exception:
            logger.warning(
                "TenantAuditService could not import AuditLog; skipping %s",
                action,
                exc_info=True,
            )
            return

        meta: dict[str, Any] = dict(metadata or {})
        if actor_role and "actor_role" not in meta:
            meta["actor_role"] = actor_role
        institution_str = _uuid_str(institution_id)
        if institution_str and "institution_id" not in meta:
            meta["institution_id"] = institution_str
        # R10.7: record the correlation id (set by ``RequestIDMiddleware``) so
        # an Audit_Event can be tied back to the originating request/log line.
        if request is not None and "request_id" not in meta:
            request_id = getattr(request, "request_id", None)
            if request_id:
                meta["request_id"] = str(request_id)

        redacted = TenantAuditService._redact(meta)

        effective_retention = retention_category
        if action in _SECURITY_RETENTION_ACTIONS or action.endswith(
            _SECURITY_RETENTION_SUFFIX
        ):
            effective_retention = "security"

        ip_hash, ua_hash = TenantAuditService._hash_request_network(request)

        try:
            AuditLog.objects.create(
                entity_type=entity_type[:50],
                entity_id=_coerce_uuid(entity_id),
                action=action[:50],
                actor_id=_coerce_uuid(actor_id),
                changes=redacted,
                ip_address=ip_hash,
                user_agent=ua_hash,
                retention_category=effective_retention,
            )
        except Exception:
            logger.warning(
                "Failed to emit tenant audit event %s (entity_type=%s)",
                action,
                entity_type,
                exc_info=True,
            )

    # ------------------------------------------------------------------
    # Assignment routing (R13.1, R13.3)
    # ------------------------------------------------------------------

    @staticmethod
    def record_assignment_decided(
        *,
        program_id: Any,
        intake_id: Any,
        offering_id: Any,
        institution_id: Any,
        country: Optional[str] = None,
        nationality: Optional[str] = None,
        white_label_institution_id: Optional[Any] = None,
        domain_host: Optional[str] = None,
        decision: Optional[dict] = None,
        application_id: Optional[Any] = None,
        actor_id: Optional[Any] = None,
        actor_role: Optional[str] = None,
        source: Optional[str] = None,
        request: Optional[Any] = None,
    ) -> None:
        """Record a successful assignment decision (R13.1).

        ``country`` / ``nationality`` are residency *inputs*, not PII — they
        carry no full phone/NRC/passport, only the routing dimensions an
        operator needs to understand the decision.
        """
        TenantAuditService.record_event(
            action=ACTION_ASSIGNMENT_DECIDED,
            entity_type="assignment",
            entity_id=application_id,
            actor_id=actor_id,
            actor_role=actor_role,
            institution_id=institution_id,
            metadata={
                "canonical_program_id": _uuid_str(program_id),
                "intake_id": _uuid_str(intake_id),
                "program_offering_id": _uuid_str(offering_id),
                "institution_id": _uuid_str(institution_id),
                "white_label_institution_id": _uuid_str(white_label_institution_id),
                "domain_host": domain_host or None,
                "decision": decision or {},
                "country": country or None,
                "nationality": nationality or None,
                "source": source,
                "outcome": "decided",
            },
            request=request,
        )

    @staticmethod
    def record_assignment_failed(
        *,
        program_id: Any,
        intake_id: Any,
        country: Optional[str] = None,
        nationality: Optional[str] = None,
        white_label_institution_id: Optional[Any] = None,
        code: str = "NO_ELIGIBLE_OFFERING",
        application_id: Optional[Any] = None,
        actor_id: Optional[Any] = None,
        actor_role: Optional[str] = None,
        source: Optional[str] = None,
        request: Optional[Any] = None,
    ) -> None:
        """Record a routing failure with full coverage-gap inputs (R13.3).

        The canonical program, intake, and residency inputs are recorded so an
        operator can see exactly which program/intake/residency combination has
        no eligible offering and close the gap.
        """
        TenantAuditService.record_event(
            action=ACTION_ASSIGNMENT_FAILED,
            entity_type="assignment",
            entity_id=application_id,
            actor_id=actor_id,
            actor_role=actor_role,
            institution_id=white_label_institution_id,
            metadata={
                "canonical_program_id": _uuid_str(program_id),
                "intake_id": _uuid_str(intake_id),
                "white_label_institution_id": _uuid_str(white_label_institution_id),
                "country": country or None,
                "nationality": nationality or None,
                "code": code,
                "source": source,
                "outcome": "failed",
            },
            request=request,
        )

    # ------------------------------------------------------------------
    # Tenant configuration changes (R13.1)
    # ------------------------------------------------------------------

    @staticmethod
    def record_config_change(
        *,
        resource: str,
        verb: str,
        entity_id: Any,
        institution_id: Any,
        actor_id: Optional[Any] = None,
        actor_role: Optional[str] = None,
        metadata: Optional[dict] = None,
        request: Optional[Any] = None,
    ) -> None:
        """Record a tenant configuration change (R13.1).

        ``resource`` is the tenant child type (``institution``, ``domain``,
        ``asset``, ``template``, ``required_document``, ``membership``,
        ``grant``); ``verb`` is ``created`` / ``updated`` / ``deactivated``.
        """
        action = f"{TENANT_CONFIG_ACTION_PREFIX}{resource}.{verb}"
        TenantAuditService.record_event(
            action=action,
            entity_type=f"institution_{resource}" if resource != "institution" else "institution",
            entity_id=entity_id,
            actor_id=actor_id,
            actor_role=actor_role,
            institution_id=institution_id,
            metadata=metadata,
            request=request,
        )

    # ------------------------------------------------------------------
    # Asset upload (R13.1)
    # ------------------------------------------------------------------

    @staticmethod
    def record_asset_upload(
        *,
        asset_id: Any,
        institution_id: Any,
        asset_type: str,
        version: Optional[int] = None,
        mime_type: Optional[str] = None,
        checksum_sha256: Optional[str] = None,
        actor_id: Optional[Any] = None,
        actor_role: Optional[str] = None,
        request: Optional[Any] = None,
    ) -> None:
        """Record an institution asset upload (R13.1).

        The SHA-256 checksum is a non-PII content fingerprint (not the file
        bytes), so it is safe to retain for provenance.
        """
        TenantAuditService.record_event(
            action="tenant.asset.uploaded",
            entity_type="institution_asset",
            entity_id=asset_id,
            actor_id=actor_id,
            actor_role=actor_role,
            institution_id=institution_id,
            metadata={
                "asset_type": asset_type,
                "version": version,
                "mime_type": mime_type,
                "checksum_sha256": checksum_sha256,
            },
            request=request,
        )

    # ------------------------------------------------------------------
    # Official document generation (R13.1)
    # ------------------------------------------------------------------

    @staticmethod
    def record_official_document_generated(
        *,
        application_id: Any,
        institution_id: Any,
        document_type: str,
        template_id: Optional[Any] = None,
        template_version: Optional[int] = None,
        request: Optional[Any] = None,
    ) -> None:
        """Record a successful official-document generation (R13.1)."""
        TenantAuditService.record_event(
            action=ACTION_OFFICIAL_DOCUMENT_GENERATED,
            entity_type="application_document",
            entity_id=application_id,
            actor_id=None,  # system-generated background render
            institution_id=institution_id,
            metadata={
                "document_type": document_type,
                "template_id": _uuid_str(template_id),
                "template_version": template_version,
            },
            request=request,
        )

    @staticmethod
    def record_official_document_queued(
        *,
        application_id: Any,
        institution_id: Any,
        document_type: str,
        task_id: Optional[str] = None,
        actor_id: Optional[Any] = None,
        actor_role: Optional[str] = None,
        request: Optional[Any] = None,
    ) -> None:
        """Record an official-document generation enqueue (R16.3).

        Emitted when a render task is enqueued (or the brokerless
        derived-pending fallback is returned). Carries only the application +
        institution ids, the document type, and an opaque Celery ``task_id`` —
        never applicant PII, credentials, or document content.
        """
        TenantAuditService.record_event(
            action=ACTION_OFFICIAL_DOCUMENT_QUEUED,
            entity_type="application_document",
            entity_id=application_id,
            actor_id=actor_id,
            actor_role=actor_role,
            institution_id=institution_id,
            metadata={
                "document_type": document_type,
                "task_id": str(task_id) if task_id else None,
            },
            request=request,
        )

    @staticmethod
    def record_official_document_downloaded(
        *,
        document_id: Any,
        application_id: Any,
        institution_id: Any,
        document_type: str,
        actor_id: Optional[Any] = None,
        actor_role: Optional[str] = None,
        request: Optional[Any] = None,
    ) -> None:
        """Record an official-document download by an admin or student (R16.3).

        The actor *role* (``student`` / ``admin`` / ``reviewer`` /
        ``super_admin``) is recorded so an operator can tell who pulled the
        document, but NEVER the applicant's name, NRC/passport, phone, email, or
        address, the file bytes, or the storage key/URL — only the document,
        application, and institution ids plus the document type.
        """
        TenantAuditService.record_event(
            action=ACTION_OFFICIAL_DOCUMENT_DOWNLOADED,
            entity_type="application_document",
            entity_id=document_id,
            actor_id=actor_id,
            actor_role=actor_role,
            institution_id=institution_id,
            metadata={
                "document_id": _uuid_str(document_id),
                "application_id": _uuid_str(application_id),
                "document_type": document_type,
            },
            request=request,
        )

    @staticmethod
    def record_official_document_emailed(
        *,
        application_id: Any,
        institution_id: Any,
        document_type: str,
        actor_id: Optional[Any] = None,
        actor_role: Optional[str] = None,
        request: Optional[Any] = None,
    ) -> None:
        """Record that official-document details were emailed (R16.3).

        The recipient email address is applicant contact PII and is therefore
        NEVER recorded — neither as a value nor under an ``email`` key (the
        shared redactor would mask it, but the payload omits it entirely). Only
        the application + institution ids and the document type are stored.
        """
        TenantAuditService.record_event(
            action=ACTION_OFFICIAL_DOCUMENT_EMAILED,
            entity_type="application_document",
            entity_id=application_id,
            actor_id=actor_id,
            actor_role=actor_role,
            institution_id=institution_id,
            metadata={
                "document_type": document_type,
            },
            request=request,
        )

    # ------------------------------------------------------------------
    # Public tracking (R13.12, R17.2 — admissions-v2 task 10.5)
    # ------------------------------------------------------------------

    @staticmethod
    def record_public_tracking_attempt(
        *,
        outcome: str,
        application_id: Optional[Any] = None,
        institution_id: Optional[Any] = None,
        host_bound: bool = False,
        request: Optional[Any] = None,
    ) -> None:
        """Record one public tracking lookup (design §12).

        ``outcome`` is the view's own stable classification — ``disclosed``,
        ``not_found``, ``host_mismatch``, ``secret_required``, ``invalid_format``
        or ``rate_limited``. Nothing derived from the submitted code travels:
        no plaintext, no prefix, no selector, no digest.

        The caller is unauthenticated, so there is no actor id to record. The IP
        and user agent arrive through the shared SHA-256 redactor in
        :meth:`record_event`, which is what makes a repeated probe from one
        client visible without storing anyone's address.
        """
        TenantAuditService.record_event(
            action=ACTION_TRACKING_ATTEMPTED,
            entity_type="application",
            entity_id=application_id,
            actor_id=None,
            institution_id=institution_id,
            metadata={
                "outcome": outcome,
                # Whether a trusted tenant host constrained the answer, so an
                # operator can tell a neutral-portal read from a white-label one.
                "host_bound": bool(host_bound),
            },
            # A run of failures on an unauthenticated endpoint is a probe, and a
            # probe is worth keeping for the 365-day window rather than 90.
            retention_category="standard" if outcome == "disclosed" else "security",
            request=request,
        )

    @staticmethod
    def record_tracking_link_issued(
        *,
        application_id: Any,
        institution_id: Optional[Any] = None,
        actor_id: Optional[Any] = None,
        actor_role: Optional[str] = None,
        replaced_previous: bool = False,
        request: Optional[Any] = None,
    ) -> None:
        """Record a tracking-link issue/rotation (R13.12).

        ``replaced_previous`` says whether this issue revoked a live secret — the
        difference between a first link and a rotation. The plaintext code, the
        selector, and the stored digest are all absent by construction.
        """
        TenantAuditService.record_event(
            action=ACTION_TRACKING_LINK_ISSUED,
            entity_type="application",
            entity_id=application_id,
            actor_id=actor_id,
            actor_role=actor_role,
            institution_id=institution_id,
            metadata={"replaced_previous": bool(replaced_previous)},
            request=request,
        )

    # ------------------------------------------------------------------
    # Access-scope denials (R13.1)
    # ------------------------------------------------------------------

    @staticmethod
    def record_scope_denied(
        *,
        resource_type: str,
        resource_id: Any,
        actor_id: Optional[Any] = None,
        actor_role: Optional[str] = None,
        request: Optional[Any] = None,
    ) -> None:
        """Record a masked out-of-scope read (R13.1).

        Emitted where an out-of-scope record lookup is returned as not-found so
        operators can detect cross-tenant probing. Only the requested id +
        resource type are recorded — never the target record's contents.
        """
        TenantAuditService.record_event(
            action=ACTION_SCOPE_DENIED,
            entity_type=resource_type[:50],
            entity_id=resource_id,
            actor_id=actor_id,
            actor_role=actor_role,
            metadata={"resource_type": resource_type},
            retention_category="security",
            request=request,
        )

    # ------------------------------------------------------------------
    # Review / document-verify / payment-verify decisions (R10.5)
    # ------------------------------------------------------------------

    @staticmethod
    def record_review_decision(
        *,
        application_id: Any,
        institution_id: Any,
        new_status: str,
        old_status: Optional[str] = None,
        actor_id: Optional[Any] = None,
        actor_role: Optional[str] = None,
        reason: Optional[str] = None,
        request: Optional[Any] = None,
    ) -> None:
        """Record an application review decision (R10.5).

        Carries the institution scope plus the status transition so a tenant
        admin can audit review activity for their own school. The free-text
        ``reason``/notes is length-bounded; applicant PII is never recorded as
        a structured field (only the ids, role, status, and bounded reason).
        """
        TenantAuditService.record_event(
            action=ACTION_REVIEW_DECIDED,
            entity_type="application",
            entity_id=application_id,
            actor_id=actor_id,
            actor_role=actor_role,
            institution_id=institution_id,
            metadata={
                "object_type": "application",
                "application_id": _uuid_str(application_id),
                "old_status": old_status,
                "new_status": new_status,
                "status": new_status,
                "reason": _bounded_reason(reason),
            },
            request=request,
        )

    @staticmethod
    def record_amendment_review(
        *,
        amendment_id: Any,
        application_id: Any,
        institution_id: Any,
        outcome_status: str,
        field_name: Optional[str] = None,
        actor_id: Optional[Any] = None,
        actor_role: Optional[str] = None,
        reason: Optional[str] = None,
        request: Optional[Any] = None,
    ) -> None:
        """Record an amendment review decision (task 9.4, R8.3/R8.4, R10.5).

        The field **name** is recorded; the amended **value** is not. A phone
        number or an address is applicant PII, and the application row already
        holds the applied value — repeating it in the audit trail would put PII in
        the one place that must not carry it.
        """
        TenantAuditService.record_event(
            action=ACTION_AMENDMENT_REVIEW_DECIDED,
            entity_type="application_amendment",
            entity_id=amendment_id,
            actor_id=actor_id,
            actor_role=actor_role,
            institution_id=institution_id,
            metadata={
                "object_type": "application_amendment",
                "amendment_id": _uuid_str(amendment_id),
                "application_id": _uuid_str(application_id),
                "field_name": field_name,
                "new_status": outcome_status,
                "status": outcome_status,
                "reason": _bounded_reason(reason),
            },
            request=request,
        )

    @staticmethod
    def record_condition_verification(
        *,
        condition_id: Any,
        application_id: Any,
        institution_id: Any,
        outcome_status: str,
        old_status: Optional[str] = None,
        condition_type: Optional[str] = None,
        actor_id: Optional[Any] = None,
        actor_role: Optional[str] = None,
        reason: Optional[str] = None,
        request: Optional[Any] = None,
    ) -> None:
        """Record an offer-condition verification decision (task 9.4, R8.3/R8.4)."""
        TenantAuditService.record_event(
            action=ACTION_CONDITION_VERIFICATION_DECIDED,
            entity_type="application_condition",
            entity_id=condition_id,
            actor_id=actor_id,
            actor_role=actor_role,
            institution_id=institution_id,
            metadata={
                "object_type": "application_condition",
                "condition_id": _uuid_str(condition_id),
                "application_id": _uuid_str(application_id),
                "condition_type": condition_type,
                "old_status": old_status,
                "new_status": outcome_status,
                "status": outcome_status,
                "reason": _bounded_reason(reason),
            },
            request=request,
        )

    @staticmethod
    def record_bulk_review_decision(
        *,
        new_status: str,
        application_ids: Any,
        institution_ids: Any = (),
        actor_id: Optional[Any] = None,
        actor_role: Optional[str] = None,
        reason: Optional[str] = None,
        request: Optional[Any] = None,
    ) -> None:
        """Record a bulk review decision (task 9.4, R8.3/R8.4).

        One event for the whole command rather than one per application, because
        the *command* is what was authorised. The affected ids and the institution
        scope are recorded so a tenant admin can see their own school's share of
        it; no applicant field travels.
        """
        ids = [_uuid_str(value) for value in (application_ids or [])]
        scopes = [_uuid_str(value) for value in (institution_ids or []) if value]
        TenantAuditService.record_event(
            action=ACTION_REVIEW_BULK_DECIDED,
            entity_type="application",
            entity_id=None,
            actor_id=actor_id,
            actor_role=actor_role,
            # A bulk command may span several in-scope schools; the first is the
            # event's own scope and every one of them is listed in the payload so
            # the record is not silently narrower than the act.
            institution_id=scopes[0] if scopes else None,
            metadata={
                "object_type": "application",
                "new_status": new_status,
                "status": new_status,
                "application_ids": ids,
                "application_count": len(ids),
                "institution_ids": scopes,
                "reason": _bounded_reason(reason),
            },
            request=request,
        )

    @staticmethod
    def record_document_verification(
        *,
        document_id: Any,
        application_id: Any,
        institution_id: Any,
        new_status: str,
        old_status: Optional[str] = None,
        document_type: Optional[str] = None,
        actor_id: Optional[Any] = None,
        actor_role: Optional[str] = None,
        reason: Optional[str] = None,
        request: Optional[Any] = None,
    ) -> None:
        """Record an admin document verification decision (R10.5).

        Only the document/application/institution ids, the document type, the
        verification status transition, and a length-bounded reason are stored
        — never the document bytes, storage key, or applicant PII.
        """
        TenantAuditService.record_event(
            action=ACTION_DOCUMENT_VERIFICATION_DECIDED,
            entity_type="application_document",
            entity_id=document_id,
            actor_id=actor_id,
            actor_role=actor_role,
            institution_id=institution_id,
            metadata={
                "object_type": "application_document",
                "document_id": _uuid_str(document_id),
                "application_id": _uuid_str(application_id),
                "document_type": document_type,
                "old_status": old_status,
                "new_status": new_status,
                "status": new_status,
                "reason": _bounded_reason(reason),
            },
            request=request,
        )

    @staticmethod
    def record_payment_verification(
        *,
        payment_id: Any,
        institution_id: Any,
        outcome_status: str,
        application_id: Optional[Any] = None,
        outcome_code: Optional[str] = None,
        actor_id: Optional[Any] = None,
        actor_role: Optional[str] = None,
        reason: Optional[str] = None,
        request: Optional[Any] = None,
    ) -> None:
        """Record a payment verification decision (R10.5).

        Emitted for both a provider verify call and an admin payment-status
        review decision. Carries the institution scope so a tenant admin can
        audit payment-verify activity for their own school. Only the payment +
        application + institution ids, the resolved outcome status, an optional
        stable ``outcome_code``, and a length-bounded reason are stored — never
        the amount, phone, MSISDN, or any applicant PII.
        """
        TenantAuditService.record_event(
            action=ACTION_PAYMENT_VERIFICATION_DECIDED,
            entity_type="payment",
            entity_id=payment_id,
            actor_id=actor_id,
            actor_role=actor_role,
            institution_id=institution_id,
            metadata={
                "object_type": "payment",
                "payment_id": _uuid_str(payment_id),
                "application_id": _uuid_str(application_id),
                "status": outcome_status,
                "code": outcome_code,
                "reason": _bounded_reason(reason),
            },
            request=request,
        )

    # ------------------------------------------------------------------
    # Bulk exports (R6.5 — admissions-v2 task 8.4)
    # ------------------------------------------------------------------

    @staticmethod
    def record_export(
        *,
        action: str,
        entity_type: str,
        institution_id: Optional[Any] = None,
        row_count: int = 0,
        row_limit: Optional[int] = None,
        export_format: str = "csv",
        filters: Optional[dict] = None,
        redaction: Optional[dict] = None,
        actor_id: Optional[Any] = None,
        actor_role: Optional[str] = None,
        request: Optional[Any] = None,
    ) -> None:
        """Record a bulk export as a command (R6.5).

        An export is a page-independent bulk read of tenant data, so the platform
        records the *decision* rather than the data: the actor, the institution
        scope, the applied filters, the row count against the ceiling, and which
        fields the actor's capabilities withheld. The exported rows themselves —
        and any applicant PII — are never written to the audit trail. Retained
        under the ``security`` window because a bulk export is exactly the event
        an operator needs to be able to look up months later.
        """
        TenantAuditService.record_event(
            action=action,
            entity_type=entity_type,
            entity_id=None,
            actor_id=actor_id,
            actor_role=actor_role,
            institution_id=institution_id,
            metadata={
                "object_type": entity_type,
                "format": export_format,
                "row_count": int(row_count or 0),
                "row_limit": row_limit,
                "page_independent": True,
                "filters": filters or {},
                "redaction": redaction or {},
            },
            retention_category="security",
            request=request,
        )

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _redact(value: Any) -> Any:
        """Recursively redact PII using the shared payment redactor (R13.4).

        Reusing ``PaymentAuditService._redact_pii`` keeps a single source of
        truth for how phone/NRC/passport/document-body fields are masked, so
        tenant payloads inherit the same guarantees the payment path enforces.
        """
        try:
            from apps.documents.payment_audit_service import PaymentAuditService

            return PaymentAuditService._redact_pii(value)
        except Exception:
            # Defensive: if the shared redactor is unavailable for any reason,
            # strip obviously sensitive top-level keys rather than persisting
            # raw values. Should never happen in a configured process.
            if isinstance(value, dict):
                return {
                    k: v
                    for k, v in value.items()
                    if not any(
                        marker in str(k).lower()
                        for marker in ("phone", "nrc", "passport", "msisdn", "mobile")
                    )
                }
            return value

    @staticmethod
    def _hash_request_network(
        request: Optional[Any],
    ) -> tuple[Optional[str], Optional[str]]:
        """Return ``(ip_hash, ua_hash)`` for ``request`` or ``(None, None)``."""
        if request is None:
            return None, None
        try:
            from apps.common.audit_network import (
                extract_client_ip,
                hash_network_value,
            )

            ip = extract_client_ip(request) or ""
            meta = getattr(request, "META", {}) or {}
            ua = meta.get("HTTP_USER_AGENT", "") or ""
            return (
                hash_network_value(ip) if ip else None,
                hash_network_value(ua) if ua else None,
            )
        except Exception:
            logger.warning(
                "Failed to extract request network context for tenant audit",
                exc_info=True,
            )
            return None, None


__all__ = [
    "TenantAuditService",
    "ACTION_ASSIGNMENT_DECIDED",
    "ACTION_ASSIGNMENT_FAILED",
    "ACTION_OFFICIAL_DOCUMENT_GENERATED",
    "ACTION_OFFICIAL_DOCUMENT_QUEUED",
    "ACTION_OFFICIAL_DOCUMENT_DOWNLOADED",
    "ACTION_OFFICIAL_DOCUMENT_EMAILED",
    "ACTION_SCOPE_DENIED",
    "ACTION_REVIEW_DECIDED",
    "ACTION_DOCUMENT_VERIFICATION_DECIDED",
    "ACTION_PAYMENT_VERIFICATION_DECIDED",
    "ACTION_APPLICATION_EXPORTED",
    "ACTION_SETTLEMENT_EXPORTED",
    "ACTION_FEE_EXPORTED",
    "ACTION_AUDIT_EXPORTED",
    "ACTION_AMENDMENT_REQUESTED",
    "ACTION_AMENDMENT_REVIEW_DECIDED",
    "ACTION_CONDITION_VERIFICATION_DECIDED",
    "ACTION_REVIEW_BULK_DECIDED",
    "TENANT_CONFIG_ACTION_PREFIX",
    "OBSERVABILITY_CONFIG_PREFIX",
    "OBSERVABILITY_ROUTING_FAILURE_ACTION",
]
