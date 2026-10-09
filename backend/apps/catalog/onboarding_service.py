"""Durable, resumable tenant onboarding workflow service (task 4.1).

Spec: ``.kiro/specs/admissions-v2-canonical-rebuild/`` task 4.1
Requirements: R4.1-R4.6
Findings: TEN-01, TEN-02
Design: design.md §6.1 (TenantOnboarding aggregate + state machine),
        §6.2 (readiness invariants / blockers), §17 (durable committed outbox).

This module makes tenant onboarding a **server-owned, durable, resumable
workflow** instead of the fragile client multi-call orchestration described in
TEN-01/TEN-02. The old ``TenantOnboardingWizard`` created a global admin with
no institution, misread the response shape, could stop before membership
creation, and marked the institution active on create. The workflow here:

* creates the institution **inactive** and a durable ``TenantOnboarding`` row in
  one atomic operation — a failure leaves **no orphan institution** (R4.1, R4.4);
* is **idempotent** on ``begin`` via an idempotency key, so a retried create
  returns the same workflow rather than a second orphan tenant (R4.1);
* records each configuration step as an **idempotent** command that bumps the
  configuration version only on a material change (R4.2);
* answers a **live-derived blocker query** from the canonical readiness tables
  (R4.5);
* gates **activation** on an empty blocker set, re-evaluated under a row lock,
  and only then flips ``institutions.is_active`` true and emits one audited
  event (R4.6);
* records a tenant Audit_Event **and** a durable committed outbox row for every
  lifecycle command (design §17).

The :class:`OnboardingStateMachine` is the single authority for permitted state
transitions (design §6.1). Capability enforcement (``platform.tenant.*``) is a
separate policy applied by the API layer — this service owns business state, not
authorization (design §3).
"""

from __future__ import annotations

import logging
import uuid
from typing import Any, Optional

from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.catalog.models import Institution, TenantOnboarding
from apps.catalog.tenant_readiness import build_tenant_readiness, launch_blockers

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------


class OnboardingError(Exception):
    """A tenant onboarding command failed.

    Carries a stable ``code`` (e.g. ``ONBOARDING_BLOCKED``, ``INVALID_STATE``,
    ``UNKNOWN_STEP``, ``INSTITUTION_CONFLICT``) the API layer maps to a V2 error
    envelope, plus optional machine-readable ``blockers`` for the blocked-
    activation case so the caller can render the outstanding readiness items.
    """

    def __init__(
        self,
        message: str = "",
        *,
        code: Optional[str] = None,
        blockers: Optional[list] = None,
    ):
        super().__init__(message or code or "onboarding_error")
        self.message = message or code or "onboarding_error"
        self.code = code
        self.blockers = blockers or []


# ---------------------------------------------------------------------------
# State machine (design §6.1)
# ---------------------------------------------------------------------------


class OnboardingStateMachine:
    """The single authority for permitted onboarding state transitions.

    Design §6.1::

        draft -> in_review -> active -> suspended -> active
                           \\-> rejected
        draft/in_review -> cancelled

    ``active`` may only move to ``suspended`` (a re-activation is expressed as
    ``suspended -> active``); an already-active onboarding is re-activated by an
    idempotent no-op in :meth:`TenantOnboardingService.activate`, not by an
    ``active -> active`` transition. ``rejected`` and ``cancelled`` are terminal.
    """

    DRAFT = TenantOnboarding.STATE_DRAFT
    IN_REVIEW = TenantOnboarding.STATE_IN_REVIEW
    ACTIVE = TenantOnboarding.STATE_ACTIVE
    REJECTED = TenantOnboarding.STATE_REJECTED
    CANCELLED = TenantOnboarding.STATE_CANCELLED
    SUSPENDED = TenantOnboarding.STATE_SUSPENDED

    _TRANSITIONS: dict[str, frozenset[str]] = {
        DRAFT: frozenset({IN_REVIEW, ACTIVE, CANCELLED}),
        IN_REVIEW: frozenset({ACTIVE, REJECTED, CANCELLED}),
        ACTIVE: frozenset({SUSPENDED}),
        SUSPENDED: frozenset({ACTIVE}),
        REJECTED: frozenset(),
        CANCELLED: frozenset(),
    }

    @classmethod
    def allowed_targets(cls, state: str) -> frozenset[str]:
        """Return the set of states reachable from ``state`` (empty if terminal)."""
        return cls._TRANSITIONS.get(state, frozenset())

    @classmethod
    def can_transition(cls, src: str, dst: str) -> bool:
        """Whether ``src -> dst`` is a permitted transition."""
        return dst in cls.allowed_targets(src)

    @classmethod
    def is_terminal(cls, state: str) -> bool:
        return not cls.allowed_targets(state)


# ---------------------------------------------------------------------------
# Configuration steps (design §6.2)
# ---------------------------------------------------------------------------

#: Ordered canonical onboarding configuration steps. ``current_step`` walks
#: this list for resume UX; ``record_step`` only accepts one of these keys.
ONBOARDING_STEPS: tuple[str, ...] = (
    "profile",
    "branding",
    "support",
    "domain",
    "document_profile",
    "required_documents",
    "offering",
    "intake",
    "fee",
    "administrator",
    "routing",
)

#: Institution columns the ``begin`` profile payload may populate. ``is_active``
#: is deliberately excluded — the institution is always created inactive (R4.1).
_INSTITUTION_PROFILE_FIELDS: frozenset[str] = frozenset(
    {
        "name",
        "code",
        "slug",
        "full_name",
        "description",
        "type",
        "address",
        "phone",
        "email",
        "website",
        "brand_name",
        "primary_color",
        "secondary_color",
        "support_email",
        "admissions_email",
        "accreditation_status",
    }
)

#: States in which configuration steps may still be recorded (pre-launch).
_STEP_EDITABLE_STATES: frozenset[str] = frozenset(
    {OnboardingStateMachine.DRAFT, OnboardingStateMachine.IN_REVIEW}
)


class TenantOnboardingService:
    """Durable resumable tenant onboarding workflow commands (R4.1-R4.6).

    Every mutating command persists its state change, records a tenant
    Audit_Event, and commits a durable outbox row in the same transaction so a
    partially-configured tenant can always be resumed, cancelled, or compensated
    without leaving a partially-authoritative active tenant behind.
    """

    # ------------------------------------------------------------------
    # begin — create the inactive institution + durable workflow (R4.1, R4.4)
    # ------------------------------------------------------------------

    def begin(
        self,
        *,
        profile: dict,
        created_by_id: Any = None,
        idempotency_key: Optional[str] = None,
        request: Any = None,
    ) -> TenantOnboarding:
        """Begin onboarding: create the inactive institution + draft workflow.

        Idempotent on ``idempotency_key`` (a retried begin returns the same
        onboarding). The institution and workflow are one atomic operation, so a
        failure (e.g. a duplicate institution code) compensates fully and leaves
        no orphan institution (R4.4). The institution is created **inactive**
        regardless of any ``is_active`` in ``profile`` (R4.1, TEN-02).
        """
        if idempotency_key:
            existing = TenantOnboarding.objects.filter(
                idempotency_key=idempotency_key
            ).first()
            if existing is not None:
                return existing

        institution_kwargs = {
            key: value
            for key, value in (profile or {}).items()
            if key in _INSTITUTION_PROFILE_FIELDS
        }
        if not institution_kwargs.get("name") or not institution_kwargs.get("code"):
            raise OnboardingError(
                "A tenant name and code are required to begin onboarding.",
                code="VALIDATION_ERROR",
            )
        now = timezone.now()
        # The institution is ALWAYS created inactive; only the audited
        # activation command flips is_active true (R4.1, TEN-02).
        institution_kwargs["is_active"] = False
        institution_kwargs.setdefault("created_at", now)
        institution_kwargs.setdefault("updated_at", now)

        try:
            with transaction.atomic():
                institution = Institution.objects.create(
                    id=uuid.uuid4(), **institution_kwargs
                )
                onboarding = TenantOnboarding.objects.create(
                    id=uuid.uuid4(),
                    institution=institution,
                    state=OnboardingStateMachine.DRAFT,
                    current_step=self._first_pending_step({}),
                    configuration_version=1,
                    steps={},
                    blockers=[],
                    idempotency_key=idempotency_key,
                    created_by_id=created_by_id,
                    created_at=now,
                    updated_at=now,
                )
                self._emit_event(
                    onboarding,
                    event_type="tenant.onboarding.begun",
                    actor_id=created_by_id,
                    request=request,
                    extra={"code": institution.code},
                )
        except IntegrityError as exc:
            # transaction.atomic already rolled back the institution + workflow,
            # so no orphan institution remains (R4.4). Surface a stable error.
            logger.info("Tenant onboarding begin failed (integrity): %s", exc)
            raise OnboardingError(
                "A tenant with these details already exists.",
                code="INSTITUTION_CONFLICT",
            ) from exc
        return onboarding

    # ------------------------------------------------------------------
    # record_step — idempotent configuration step command (R4.2)
    # ------------------------------------------------------------------

    def record_step(
        self,
        onboarding: TenantOnboarding,
        step: str,
        *,
        actor_id: Any = None,
        data: Optional[dict] = None,
        request: Any = None,
    ) -> TenantOnboarding:
        """Mark a configuration ``step`` complete (idempotent).

        Bumps ``configuration_version`` only on a material change; an identical
        replay is a no-op (R4.2). Rejected for an unknown step or once the tenant
        has launched (state is no longer draft/in_review).
        """
        onboarding.refresh_from_db()
        if onboarding.state not in _STEP_EDITABLE_STATES:
            raise OnboardingError(
                "Configuration steps can only be recorded before the tenant is launched.",
                code="ONBOARDING_NOT_EDITABLE",
            )
        if step not in ONBOARDING_STEPS:
            raise OnboardingError(
                f"Unknown onboarding step: {step!r}.",
                code="UNKNOWN_STEP",
            )

        payload = dict(data or {})
        existing = (onboarding.steps or {}).get(step)
        if (
            isinstance(existing, dict)
            and existing.get("completed") is True
            and (existing.get("data") or {}) == payload
        ):
            # Idempotent replay: identical completed step, no version bump.
            return onboarding

        now = timezone.now()
        with transaction.atomic():
            steps = dict(onboarding.steps or {})
            steps[step] = {
                "completed": True,
                "data": payload,
                "recorded_at": now.isoformat(),
                "recorded_by": str(actor_id) if actor_id is not None else None,
            }
            onboarding.steps = steps
            onboarding.current_step = step
            onboarding.configuration_version = (
                onboarding.configuration_version or 1
            ) + 1
            onboarding.updated_at = now
            onboarding.save(
                update_fields=[
                    "steps",
                    "current_step",
                    "configuration_version",
                    "updated_at",
                ]
            )
            self._emit_event(
                onboarding,
                event_type="tenant.onboarding.step_recorded",
                actor_id=actor_id,
                request=request,
                extra={"step": step},
            )
        return onboarding

    # ------------------------------------------------------------------
    # blockers — derived from live canonical data (R4.5)
    # ------------------------------------------------------------------

    def get_blockers(self, institution_id) -> list[dict]:
        """Return the outstanding blocking readiness items for a tenant (R4.5).

        Empty exactly when the tenant is launch-ready. Derived live from the
        canonical readiness tables so it can never drift from what actually
        powers routing/documents/staff scope.
        """
        return launch_blockers(institution_id)

    def get_readiness(self, institution_id) -> dict:
        """Return the full launch-readiness aggregate (R4.5)."""
        return build_tenant_readiness(institution_id)

    # ------------------------------------------------------------------
    # activate — locked, re-evaluated, audited, blocker-gated (R4.6)
    # ------------------------------------------------------------------

    def activate(
        self,
        onboarding: TenantOnboarding,
        *,
        actor_id: Any = None,
        request: Any = None,
    ) -> TenantOnboarding:
        """Activate the tenant if launch-ready (R4.6).

        Idempotent when already active. Locks the institution, re-evaluates
        blockers under the lock, and only then transitions the workflow to
        ``active`` and flips ``institutions.is_active`` true. A non-empty blocker
        set prevents activation with a stable ``ONBOARDING_BLOCKED`` error, leaves
        the state unchanged and the institution inactive, and records the blocker
        snapshot for the resume UI.
        """
        onboarding.refresh_from_db()
        if onboarding.state == OnboardingStateMachine.ACTIVE:
            return onboarding  # idempotent retry
        if not OnboardingStateMachine.can_transition(
            onboarding.state, OnboardingStateMachine.ACTIVE
        ):
            raise OnboardingError(
                f"Cannot activate a tenant from state {onboarding.state!r}.",
                code="INVALID_STATE",
            )
        return self._transition_to_active(
            onboarding,
            actor_id=actor_id,
            event_type="tenant.onboarding.activated",
            request=request,
        )

    # ------------------------------------------------------------------
    # lifecycle transitions (R4.4, R4.6)
    # ------------------------------------------------------------------

    def submit_for_review(
        self,
        onboarding: TenantOnboarding,
        *,
        actor_id: Any = None,
        request: Any = None,
    ) -> TenantOnboarding:
        """Move a draft onboarding into review (draft -> in_review)."""
        return self._simple_transition(
            onboarding,
            target=OnboardingStateMachine.IN_REVIEW,
            event_type="tenant.onboarding.submitted",
            actor_id=actor_id,
            request=request,
        )

    def reject(
        self,
        onboarding: TenantOnboarding,
        *,
        actor_id: Any = None,
        reason: str = "",
        request: Any = None,
    ) -> TenantOnboarding:
        """Reject an in-review onboarding (in_review -> rejected). Terminal."""
        return self._simple_transition(
            onboarding,
            target=OnboardingStateMachine.REJECTED,
            event_type="tenant.onboarding.rejected",
            actor_id=actor_id,
            reason=reason,
            request=request,
        )

    def cancel(
        self,
        onboarding: TenantOnboarding,
        *,
        actor_id: Any = None,
        reason: str = "",
        request: Any = None,
    ) -> TenantOnboarding:
        """Cancel a draft/in-review onboarding (-> cancelled). Terminal."""
        return self._simple_transition(
            onboarding,
            target=OnboardingStateMachine.CANCELLED,
            event_type="tenant.onboarding.cancelled",
            actor_id=actor_id,
            reason=reason,
            request=request,
        )

    def suspend(
        self,
        onboarding: TenantOnboarding,
        *,
        actor_id: Any = None,
        reason: str = "",
        request: Any = None,
    ) -> TenantOnboarding:
        """Suspend an active tenant (active -> suspended).

        Stops new applications by deactivating the institution, without deleting
        existing student access or historical documents (design §6.1).
        """
        onboarding.refresh_from_db()
        if not OnboardingStateMachine.can_transition(
            onboarding.state, OnboardingStateMachine.SUSPENDED
        ):
            raise OnboardingError(
                f"Cannot suspend a tenant from state {onboarding.state!r}.",
                code="INVALID_STATE",
            )
        now = timezone.now()
        with transaction.atomic():
            institution = Institution.objects.select_for_update().get(
                id=onboarding.institution_id
            )
            institution.is_active = False
            institution.updated_at = now
            institution.save(update_fields=["is_active", "updated_at"])
            onboarding.state = OnboardingStateMachine.SUSPENDED
            onboarding.last_error = None
            onboarding.updated_at = now
            onboarding.save(update_fields=["state", "last_error", "updated_at"])
            self._emit_event(
                onboarding,
                event_type="tenant.onboarding.suspended",
                actor_id=actor_id,
                request=request,
                extra={"reason": (reason or "")[:1000]},
            )
        return onboarding

    def resume(
        self,
        onboarding: TenantOnboarding,
        *,
        actor_id: Any = None,
        request: Any = None,
    ) -> TenantOnboarding:
        """Resume a suspended tenant (suspended -> active).

        Re-evaluates readiness under the lock and fails closed if the tenant is
        no longer launch-ready, so a suspended tenant that lost a blocking
        prerequisite cannot silently return to active (R4.6).
        """
        onboarding.refresh_from_db()
        if onboarding.state == OnboardingStateMachine.ACTIVE:
            return onboarding  # idempotent retry
        if not OnboardingStateMachine.can_transition(
            onboarding.state, OnboardingStateMachine.ACTIVE
        ):
            raise OnboardingError(
                f"Cannot resume a tenant from state {onboarding.state!r}.",
                code="INVALID_STATE",
            )
        return self._transition_to_active(
            onboarding,
            actor_id=actor_id,
            event_type="tenant.onboarding.resumed",
            request=request,
        )

    # ------------------------------------------------------------------
    # internal helpers
    # ------------------------------------------------------------------

    def _transition_to_active(
        self,
        onboarding: TenantOnboarding,
        *,
        actor_id: Any,
        event_type: str,
        request: Any = None,
    ) -> TenantOnboarding:
        """Shared blocker-gated activation for ``activate`` and ``resume``.

        Locks the institution row, re-evaluates blockers under the lock, and
        either activates (institution active + workflow active + audited/outbox
        event) or records the blocker snapshot and raises ``ONBOARDING_BLOCKED``
        without mutating state.
        """
        now = timezone.now()
        blocked: Optional[list] = None
        with transaction.atomic():
            institution = Institution.objects.select_for_update().get(
                id=onboarding.institution_id
            )
            blockers = self.get_blockers(institution.id)
            if blockers:
                # Do not mutate inside the atomic block; persist the snapshot and
                # raise outside so the blocker cache survives (R4.6).
                blocked = blockers
            else:
                institution.is_active = True
                institution.updated_at = now
                institution.save(update_fields=["is_active", "updated_at"])
                onboarding.state = OnboardingStateMachine.ACTIVE
                onboarding.activated_at = now
                onboarding.blockers = []
                onboarding.last_error = None
                onboarding.updated_at = now
                onboarding.save(
                    update_fields=[
                        "state",
                        "activated_at",
                        "blockers",
                        "last_error",
                        "updated_at",
                    ]
                )
                self._emit_event(
                    onboarding,
                    event_type=event_type,
                    actor_id=actor_id,
                    request=request,
                )

        if blocked is not None:
            onboarding.blockers = blocked
            onboarding.last_error = "ONBOARDING_BLOCKED"
            onboarding.updated_at = timezone.now()
            onboarding.save(update_fields=["blockers", "last_error", "updated_at"])
            raise OnboardingError(
                "The tenant is not launch-ready; resolve the outstanding blockers.",
                code="ONBOARDING_BLOCKED",
                blockers=blocked,
            )
        return onboarding

    def _simple_transition(
        self,
        onboarding: TenantOnboarding,
        *,
        target: str,
        event_type: str,
        actor_id: Any,
        reason: str = "",
        request: Any = None,
    ) -> TenantOnboarding:
        """Apply a non-activation state transition with audit + outbox."""
        onboarding.refresh_from_db()
        if not OnboardingStateMachine.can_transition(onboarding.state, target):
            raise OnboardingError(
                f"Cannot transition a tenant from {onboarding.state!r} to {target!r}.",
                code="INVALID_STATE",
            )
        now = timezone.now()
        with transaction.atomic():
            onboarding.state = target
            if reason:
                onboarding.last_error = reason[:1000]
            onboarding.updated_at = now
            onboarding.save(update_fields=["state", "last_error", "updated_at"])
            self._emit_event(
                onboarding,
                event_type=event_type,
                actor_id=actor_id,
                request=request,
                extra={"reason": (reason or "")[:1000]} if reason else None,
            )
        return onboarding

    @staticmethod
    def _first_pending_step(steps: dict) -> str:
        """Return the first configuration step not yet marked complete."""
        completed = {
            key
            for key, value in (steps or {}).items()
            if isinstance(value, dict) and value.get("completed") is True
        }
        for step in ONBOARDING_STEPS:
            if step not in completed:
                return step
        return ONBOARDING_STEPS[-1]

    def _emit_event(
        self,
        onboarding: TenantOnboarding,
        *,
        event_type: str,
        actor_id: Any = None,
        request: Any = None,
        extra: Optional[dict] = None,
    ) -> None:
        """Record a tenant Audit_Event and a durable committed outbox row.

        Both are best-effort with respect to the *audit/outbox* infrastructure
        (a transient failure there must never abort a state change), but they are
        written inside the caller's transaction so, on success, the durable
        outbox record commits atomically with the state change (design §17). The
        outbox row is the durable "this lifecycle event happened" signal that a
        downstream relay (ops notification, cache refresh) can consume.
        """
        institution_id = onboarding.institution_id
        # Audit — TenantAuditService never raises.
        try:
            from apps.catalog.tenant_audit_service import TenantAuditService

            TenantAuditService.record_event(
                action=event_type,
                entity_type="tenant_onboarding",
                entity_id=onboarding.id,
                actor_id=actor_id,
                institution_id=institution_id,
                metadata={
                    "onboarding_id": str(onboarding.id),
                    "institution_id": str(institution_id),
                    "state": onboarding.state,
                    "configuration_version": onboarding.configuration_version,
                    **(extra or {}),
                },
                request=request,
            )
        except Exception:  # pragma: no cover - audit must never block a write
            logger.warning(
                "Failed to record onboarding audit event %s", event_type, exc_info=True
            )

        # Outbox — durable committed side-effect signal (design §17).
        try:
            from apps.common.models import OutboxEvent

            now = timezone.now()
            OutboxEvent.objects.create(
                id=uuid.uuid4(),
                event_type=event_type,
                channel="tenant",
                aggregate_type="tenant_onboarding",
                aggregate_id=onboarding.id,
                payload={
                    "onboarding_id": str(onboarding.id),
                    "institution_id": str(institution_id),
                    "state": onboarding.state,
                    "configuration_version": onboarding.configuration_version,
                    **(extra or {}),
                },
                status="published",
                target_table="tenant_onboarding",
                target_id=onboarding.id,
                created_at=now,
                processed_at=now,
            )
        except Exception:  # pragma: no cover - outbox must never block a write
            logger.warning(
                "Failed to record onboarding outbox event %s",
                event_type,
                exc_info=True,
            )


__all__ = [
    "OnboardingError",
    "OnboardingStateMachine",
    "TenantOnboardingService",
    "ONBOARDING_STEPS",
]
