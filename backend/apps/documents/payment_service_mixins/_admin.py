"""Payment admin mixin: review_application_payment, force_approve, super_admin_correct, expire_stale."""

from __future__ import annotations

import logging
from datetime import timedelta
from decimal import Decimal
from typing import Optional
from uuid import UUID

from django.utils import timezone

from apps.documents.models import Payment
from apps.documents.payment_constants import (
    CanonicalStatus,
)
from apps.documents.payment_helpers import (
    _review_application_payment_impl,
)
from apps.documents.payment_types import (
    TransitionResult,
)

logger = logging.getLogger(__name__)


class PaymentAdminMixin:
    """Mixin for admin payment operations."""

    def review_application_payment(
        self,
        *,
        application_id: UUID,
        payment_status: str,
        reviewed_by_id: str,
        notes: str = "",
    ) -> "Application":
        """Apply an admin payment review against the canonical payment record.

        Creates a synthetic payment record if none exists and admin is
        force-approving. Keeps application summary state aligned with the
        payment ledger.
        """
        return _review_application_payment_impl(
            self,
            application_id=application_id,
            payment_status=payment_status,
            reviewed_by_id=reviewed_by_id,
            notes=notes,
        )

    def force_approve(
        self,
        application_id: UUID,
        actor_id: UUID,
        actor_role: str,
        reason: str,
    ) -> TransitionResult:
        """Admin-driven ``force_approved`` transition (reason >= 10 chars required)."""
        from django.db import transaction

        from apps.applications.models import Application

        if not reason or len(reason.strip()) < 10:
            raise ValueError("OVERRIDE_REASON_REQUIRED")

        with transaction.atomic():
            try:
                application = (
                    Application.objects.select_for_update()
                    .get(id=application_id)
                )
            except Application.DoesNotExist:
                raise

            # R2.1 / R2.2: never reverse a successful payment via admin override.
            already_successful = (
                Payment.objects.filter(
                    application_id=application_id, status="successful",
                ).exists()
            )
            if already_successful:
                raise ValueError("CANNOT_REVERSE_SUCCESSFUL_PAYMENT")

            payment = (
                Payment.objects.select_for_update()
                .filter(application_id=application_id)
                .order_by("-created_at")
                .first()
            )

            now = timezone.now()
            if payment is None:
                # Create a placeholder pending row for _transition.
                payment = Payment.objects.create(
                    application_id=application_id,
                    user_id=application.user_id,
                    amount=Decimal("0"),
                    currency="ZMW",
                    status="pending",
                    transaction_reference="",
                    payment_method="admin_override",
                    metadata={
                        "admin_override_placeholder": True,
                    },
                    created_at=now,
                    updated_at=now,
                )
            elif payment.status in ("failed", "expired", "force_approved"):
                if payment.status == "force_approved":
                    raise ValueError("CANNOT_REVERSE_SUCCESSFUL_PAYMENT")
                raise ValueError("PAYMENT_ALREADY_TERMINAL")

            # Write override metadata BEFORE the transition.
            meta = payment.metadata or {}
            meta["override"] = True
            meta["reviewed_by"] = str(actor_id)
            meta["reviewed_at"] = now.isoformat()
            meta["reason"] = reason
            meta["actor_role"] = actor_role
            payment.metadata = meta
            payment.updated_at = now
            payment.save(update_fields=["metadata", "updated_at"])

            result = self._transition(
                payment,
                "force_approved",
                source="admin_override",
                actor=actor_id,
                reason=reason,
                provider_data={
                    "override": True,
                    "actor_role": actor_role,
                    "reviewed_at": now.isoformat(),
                },
            )

            # ``_transition`` emits the canonical audit for this target state.

            return result

    def super_admin_correct(
        self,
        *,
        payment_id: UUID,
        target_status: CanonicalStatus,
        actor_id: UUID,
        reason: str,
    ) -> TransitionResult:
        """Super-admin correction: move a Payment to any canonical status."""
        valid_statuses: tuple[str, ...] = (
            "pending",
            "deferred",
            "successful",
            "failed",
            "expired",
            "force_approved",
        )

        if not reason or len(reason.strip()) < 10:
            raise ValueError("OVERRIDE_REASON_REQUIRED")

        if target_status not in valid_statuses:
            raise ValueError("INVALID_TARGET_STATUS")

        try:
            payment = Payment.objects.get(id=payment_id)
        except Payment.DoesNotExist:
            raise ValueError("PAYMENT_NOT_FOUND")

        # Emit security-grade audit row BEFORE the mutation.
        self._emit_audit(
            "payment.super_admin_corrected",
            payment,
            actor_id,
            {
                "actor_role": "super_admin",
                "target_status": target_status,
                "from_status": payment.status or "",
                "reason": reason,
                "application_id": (
                    str(payment.application_id)
                    if payment.application_id is not None
                    else None
                ),
            },
        )

        return self._transition(
            payment,
            target_status,
            source="super_admin_correction",
            actor=actor_id,
            reason=reason,
        )

    def expire_stale(
        self, older_than_hours: int = 24, batch_cap: int = 50
    ) -> int:
        """Reconcile stale ``pending`` payments to ``expired`` via ``_transition``."""
        cutoff = timezone.now() - timedelta(hours=older_than_hours)
        candidates = list(
            Payment.objects.filter(
                status="pending", created_at__lt=cutoff,
            ).order_by("created_at")[:batch_cap]
        )

        expired = 0
        for payment in candidates:
            try:
                result = self._transition(
                    payment,
                    "expired",
                    source="reconciliation",
                    actor=None,
                )
                if result.status == "expired":
                    expired += 1
                    # Emit the dedicated expired-by-reconciliation audit
                    # on top of the generic ``payment.transitioned`` one.
                    self._emit_audit(
                        "payment.expired_by_reconciliation",
                        payment,
                        None,
                        {
                            "older_than_hours": older_than_hours,
                            "created_at": payment.created_at.isoformat(),
                        },
                    )
            except Exception:
                logger.exception(
                    "expire_stale: failed to expire payment %s — continuing",
                    payment.id,
                )

        logger.info(
            "expire_stale: processed %d/%d candidates, expired=%d",
            len(candidates), batch_cap, expired,
        )
        return expired
