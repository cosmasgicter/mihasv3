"""Core payment service mixin: _transition (ADR-007 sole writer) and helpers."""

from __future__ import annotations

import logging
from typing import Optional
from uuid import UUID

from django.db import IntegrityError
from django.utils import timezone

from apps.documents.fee_resolver import FeeResolver
from apps.documents.models import Payment
from apps.documents.payment_constants import (
    ALLOWED_TRANSITIONS,
    CanonicalStatus,
    PAYMENT_TO_APP_MAP,
    TransitionSource,
)
from apps.documents.payment_helpers import (
    _forward_only_enabled,
    _generate_receipt_number,
    _sanitize_lenco_response,
)
from apps.documents.payment_types import (
    TransitionResult,
)

logger = logging.getLogger(__name__)


class PaymentCoreMixin:
    """Core mixin: __init__, _transition (sole status writer), and internal helpers."""

    def __init__(self) -> None:
        self._fee_resolver = FeeResolver()

    def _transition(
        self,
        payment: Payment,
        target_status: CanonicalStatus,
        *,
        source: TransitionSource,
        actor: Optional[UUID],
        reason: Optional[str] = None,
        provider_data: Optional[dict] = None,
    ) -> TransitionResult:
        """Sole mutation entry point for ``payments.status`` (ADR-007)."""
        from django.db import transaction

        # LEGACY: when the hardening flag is disabled, delegate to the
        # pre-hardening mutator for verify/webhook/reconciliation sources.
        if not _forward_only_enabled():
            if target_status in ("successful", "failed") and source in (
                "verify",
                "webhook",
                "reconciliation",
            ):
                try:
                    self._update_payment_status(
                        payment, target_status, provider_data or {}
                    )
                    payment.refresh_from_db()
                except Payment.DoesNotExist:  # pragma: no cover - defensive
                    pass
                return TransitionResult(
                    payment_id=payment.id,
                    status=payment.status,  # type: ignore[arg-type]
                    risk_flag=None,
                )
            # Fall through to the hardened path for anything the legacy
            # mutator does not understand (force_approved, expired, etc.).

        with transaction.atomic():
            locked = (
                Payment.objects.select_for_update().get(pk=payment.pk)
            )
            from_status = locked.status or ""

            # Idempotent replay: same status from provider sources is a no-op.
            if from_status == target_status and source in {"webhook", "verify", "reconciliation"}:
                return TransitionResult(
                    payment_id=locked.id,
                    status=from_status,  # type: ignore[arg-type]
                    risk_flag=None,
                )

            # --- Step 2: transition validation ---
            allowed_sources = ALLOWED_TRANSITIONS.get(
                (from_status, target_status), set()
            )
            is_allowed = source in allowed_sources
            if not is_allowed and source == "super_admin_correction":
                is_allowed = True

            if not is_allowed:
                self._emit_audit(
                    "payment.transition_blocked",
                    locked,
                    actor,
                    {
                        "source": source,
                        "from_status": from_status,
                        "target_status": target_status,
                        "reason": reason,
                    },
                )
                logger.info(
                    "Blocked transition %s → %s for payment %s (source=%s)",
                    from_status,
                    target_status,
                    locked.id,
                    source,
                )
                return TransitionResult(
                    payment_id=locked.id,
                    status=from_status,  # type: ignore[arg-type]
                    risk_flag=None,
                )

            # --- Step 3: integrity gate for successful transitions ---
            if target_status == "successful":
                risk_flag = self._run_integrity_gate(
                    locked, provider_data or {}, actor=actor
                )
                if risk_flag is not None:
                    return TransitionResult(
                        payment_id=locked.id,
                        status=locked.status,  # type: ignore[arg-type]
                        risk_flag=risk_flag,
                    )

            # --- Step 4: persist status change ---
            locked.status = target_status
            locked.updated_at = timezone.now()

            if provider_data:
                meta = locked.metadata or {}
                meta["lenco_response"] = _sanitize_lenco_response(provider_data)
                if provider_data.get("lencoReference"):
                    locked.lenco_reference = provider_data["lencoReference"]
                if provider_data.get("type"):
                    locked.payment_method = provider_data["type"]
                locked.metadata = meta
                locked.save(
                    update_fields=[
                        "status",
                        "metadata",
                        "lenco_reference",
                        "payment_method",
                        "updated_at",
                    ]
                )
            else:
                locked.save(update_fields=["status", "updated_at"])

            # --- Step 5: sync Application.payment_status (ADR-1) ---
            app_status = PAYMENT_TO_APP_MAP.get(target_status)
            if app_status and locked.application_id:
                self._update_application_payment_status(
                    locked.application_id, app_status
                )

            # --- Step 6: idempotent receipt for terminal success states ---
            if target_status in ("successful", "force_approved"):
                try:
                    self._generate_receipt_idempotent(locked)
                except Exception:  # pragma: no cover - defensive
                    logger.exception(
                        "Receipt generation failed for payment %s — "
                        "status change still committed",
                        locked.id,
                    )

            # --- Step 7: audit the transition ---
            self._emit_audit(
                f"payment.{target_status}"
                if target_status in ("force_approved",)
                else "payment.transitioned",
                locked,
                actor,
                {
                    "source": source,
                    "from_status": from_status,
                    "target_status": target_status,
                    "reason": reason,
                    "lenco_reference": locked.lenco_reference,
                    **(
                        {"actor_role": provider_data["actor_role"]}
                        if target_status == "force_approved"
                        and provider_data
                        and provider_data.get("actor_role")
                        else {}
                    ),
                },
            )

            return TransitionResult(
                payment_id=locked.id,
                status=target_status,
                risk_flag=None,
            )

    def _run_integrity_gate(
        self,
        payment: Payment,
        provider_data: dict,
        *,
        actor: Optional[UUID],
    ) -> Optional[str]:
        """Run the 4-check integrity gate for ``successful`` transitions.

        Returns the risk-flag type when a check fails (and records the flag
        + audit entry); returns ``None`` when all checks pass.
        """
        from apps.documents.payment_state_machine import check_integrity_gate

        meta = payment.metadata or {}
        snapshot = meta.get("snapshot") or {}

        result = check_integrity_gate(
            provider_data=provider_data,
            payment_amount=payment.amount,
            payment_currency=payment.currency,
            payment_id=payment.id,
            snapshot=snapshot,
        )
        if result is not None:
            risk_type, details = result
            self._append_risk_flag(
                payment,
                risk_type=risk_type,
                details=details,
                actor=actor,
            )
            return risk_type
        return None

    def _append_risk_flag(
        self,
        payment: Payment,
        *,
        risk_type: str,
        details: dict,
        actor: Optional[UUID],
    ) -> None:
        """Append a structured risk flag and emit the matching audit event.

        Unlike ``_record_payment_risk`` this helper also emits the
        ``payment.risk_flag`` audit entry for governance-grade querying.
        Safe to call inside the outer ``atomic()`` block of ``_transition``.
        """
        self._record_payment_risk(
            payment,
            risk_type=risk_type,
            details=details,
        )
        self._emit_audit(
            "payment.risk_flag",
            payment,
            actor,
            {
                "risk_flag_type": risk_type,
                "details": details,
            },
        )

    def _emit_audit(
        self,
        event_type: str,
        payment: Payment,
        actor: Optional[UUID],
        metadata: dict,
        retention_category: str = "standard",
    ) -> None:
        """Write a payment audit row via ``PaymentAuditService``."""
        from apps.documents.payment_audit_service import PaymentAuditService

        PaymentAuditService.record_payment_event(
            action=event_type,
            payment_id=getattr(payment, "id", None),
            application_id=getattr(payment, "application_id", None),
            actor_id=actor,
            actor_role=None,
            metadata=metadata,
            retention_category=retention_category,
            request=None,
        )

    def _generate_receipt_idempotent(self, payment: Payment) -> str:
        """Allocate a receipt number for ``payment`` if one is not set.

        Returns existing ``receipt_number`` when present. Otherwise generates
        a 12-char base32 string, retries up to 3 times on collision.
        """
        if payment.receipt_number:
            return payment.receipt_number

        last_error: Optional[Exception] = None
        for attempt in range(3):
            candidate = _generate_receipt_number()
            payment.receipt_number = candidate
            try:
                payment.save(update_fields=["receipt_number"])
            except IntegrityError as exc:
                last_error = exc
                payment.receipt_number = None
                logger.info(
                    "Receipt number collision for payment %s (attempt %s); retrying",
                    payment.id,
                    attempt + 1,
                )
                continue

            self._emit_audit(
                "payment.receipt.generated",
                payment,
                None,
                {
                    "receipt_number": candidate,
                    "attempts": attempt + 1,
                },
            )
            logger.info(
                "Receipt %s generated for payment %s", candidate, payment.id
            )
            return candidate

        # 3 consecutive collisions -> re-raise so the transaction rolls back
        # loudly rather than silently leaving the payment without a
        # receipt. In practice 60 bits of entropy makes this unreachable.
        raise last_error if last_error else RuntimeError(
            "Failed to generate a unique receipt number after 3 attempts"
        )

    def _record_payment_risk(
        self,
        payment: Payment,
        *,
        risk_type: str,
        details: dict,
    ) -> None:
        """Persist a structured risk flag while leaving status unchanged."""
        meta = payment.metadata or {}
        risks = list(meta.get("risk_flags") or [])
        risks.append(
            {
                "type": risk_type,
                "details": details,
                "recorded_at": timezone.now().isoformat(),
            }
        )
        meta["risk_flags"] = risks
        payment.metadata = meta
        payment.updated_at = timezone.now()
        payment.save(update_fields=["metadata", "updated_at"])

    def _update_application_payment_status(
        self, application_id: UUID, status: str
    ) -> None:
        """Sync ``application.payment_status`` when payment succeeds or fails."""
        from apps.applications.models import Application

        updated = Application.objects.filter(id=application_id).update(
            payment_status=status,
            updated_at=timezone.now(),
        )
        if updated:
            logger.info(
                "Application %s payment_status set to %s", application_id, status
            )
        else:
            logger.warning(
                "Application %s not found when updating payment_status", application_id
            )
