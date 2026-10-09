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
    _generate_receipt_number,
    _parse_amount,
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
        """Sole mutation entry point for ``payments.status`` (ADR-007).

        There is exactly one path through this method. The pre-hardening
        mutator and the ``PAYMENT_HARDENING_FORWARD_ONLY`` fallback it hid
        behind were deleted in admissions-v2 task 8.2 after the parity matrix
        in ``tests/unit/test_payment_path_parity_8_2.py`` proved the two paths
        produced the same ledger.
        """
        from django.db import transaction

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
                # Provider settlement facts. ``fee``/``bearer`` start life as the
                # *quoted* values bound by task 8.1's ``_bind_fee_quote``; the
                # provider's own numbers supersede them once it reports, and the
                # failure reason is the only explanation an admin gets for a
                # declined collection. Captured here — in the sole writer — so
                # every source (verify, webhook, reconciliation) records the same
                # facts instead of each caller remembering to.
                provider_fee = _parse_amount(provider_data.get("fee"))
                if provider_fee is not None:
                    locked.fee = provider_fee
                if provider_data.get("bearer"):
                    locked.bearer = provider_data["bearer"]
                failure_reason = provider_data.get("reasonForFailure")
                if failure_reason and target_status == "failed":
                    locked.notes = str(failure_reason)[:500]
                locked.metadata = meta
                locked.save(
                    update_fields=[
                        "status",
                        "metadata",
                        "lenco_reference",
                        "payment_method",
                        "fee",
                        "bearer",
                        "notes",
                        "updated_at",
                    ]
                )
            else:
                locked.save(update_fields=["status", "updated_at"])

            logger.info(
                "Payment %s transitioned to %s (lenco_ref=%s)",
                locked.id,
                target_status,
                locked.lenco_reference,
            )

            # Business metric for completed collections. This lived in the
            # deleted pre-hardening mutator; it belongs with the transition that
            # completes a payment, so promoting the single path could not quietly
            # stop reporting revenue.
            if target_status == "successful":
                logger.info(
                    "business_metric",
                    extra={
                        "type": "business_metric",
                        "metric": "payment_completed",
                        "amount": str(locked.amount),
                        "currency": locked.currency or "ZMW",
                    },
                )

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
        """Recompute ``applications.payment_status`` from the payment ledger.

        ADR-001: this column is a projection, not a second source of truth. It is
        derived from **every** payment row the application holds, using the fixed
        precedence in ``APP_PAYMENT_STATUS_PRECEDENCE`` — not from whichever row
        happened to move last.

        That distinction is what makes the projection converge (R12.5): replaying
        a callback, re-running the reconciliation sweep, or receiving provider
        events out of order all recompute the same answer, so the summary cannot
        flap between ``verified`` and ``failed`` depending on arrival order. The
        derivation runs inside the caller's transaction, so it sees the row the
        transition just wrote.

        ``status`` is the projection of the row that triggered this call. It is
        used only as the fallback when the ledger cannot be read.
        """
        from apps.applications.models import Application
        from apps.documents.payment_constants import (
            derive_application_payment_status,
        )

        ledger_statuses: list[str] = []
        try:
            ledger_statuses = list(
                Payment.objects.filter(application_id=application_id).values_list(
                    "status", flat=True
                )
            )
        except Exception:  # pragma: no cover - defensive
            # The projection is a convenience read. If the ledger cannot be
            # re-read, fall back to the transitioned row's own projection rather
            # than abort the transition that has already been decided.
            logger.exception(
                "Could not re-read the payment ledger for application %s; "
                "projecting the transitioned row only",
                application_id,
            )

        derived = derive_application_payment_status(ledger_statuses) or status
        if not derived:
            return

        updated = Application.objects.filter(id=application_id).update(
            payment_status=derived,
            updated_at=timezone.now(),
        )
        if updated:
            if derived != status:
                logger.info(
                    "Application %s payment_status derived as %s from ledger %s "
                    "(transitioned row projected %s)",
                    application_id,
                    derived,
                    sorted(set(ledger_statuses)),
                    status,
                )
            else:
                logger.info(
                    "Application %s payment_status set to %s", application_id, derived
                )
        else:
            logger.warning(
                "Application %s not found when updating payment_status", application_id
            )
