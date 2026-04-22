"""Fee waiver service.

Handles admin-initiated fee waivers and discount computation.

Requirements: 12.1–12.6
"""

import logging
from decimal import Decimal

from apps.documents.models import FeeWaiver

logger = logging.getLogger(__name__)

VALID_WAIVER_TYPES = {"full", "partial", "scholarship"}
VALID_REASON_CODES = {
    "staff_child", "returning_student", "orphan",
    "scholarship", "financial_hardship", "admin_discretion",
}


class FeeWaiverError(Exception):
    """Raised when a fee waiver operation fails validation."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


class FeeWaiverService:
    """Orchestrates fee waiver granting and effective fee computation."""

    @staticmethod
    def grant_waiver(
        application_id: str,
        waiver_type: str,
        reason_code: str,
        discount_percentage: int,
        admin_id: str,
        notes: str = "",
    ) -> FeeWaiver:
        """Grant a fee waiver for an application.

        Args:
            application_id: UUID of the application.
            waiver_type: One of 'full', 'partial', 'scholarship'.
            reason_code: One of the valid reason codes.
            discount_percentage: 0–100 discount percentage.
            admin_id: UUID of the admin granting the waiver.
            notes: Optional notes.

        Returns:
            The created FeeWaiver instance.

        Raises:
            FeeWaiverError: If validation fails.
        """
        if waiver_type not in VALID_WAIVER_TYPES:
            raise FeeWaiverError(
                "INVALID_WAIVER_TYPE",
                f"waiver_type must be one of: {', '.join(sorted(VALID_WAIVER_TYPES))}.",
            )

        if reason_code not in VALID_REASON_CODES:
            raise FeeWaiverError(
                "INVALID_REASON_CODE",
                f"reason_code must be one of: {', '.join(sorted(VALID_REASON_CODES))}.",
            )

        if not (0 <= discount_percentage <= 100):
            raise FeeWaiverError(
                "INVALID_DISCOUNT",
                "discount_percentage must be between 0 and 100.",
            )

        from apps.applications.models import Application, ApplicationStatusHistory

        application = Application.objects.get(id=application_id)

        # Create waiver
        waiver = FeeWaiver.objects.create(
            application_id=application_id,
            waiver_type=waiver_type,
            reason_code=reason_code,
            discount_percentage=discount_percentage,
            approved_by_id=admin_id,
            notes=notes,
        )

        # If full waiver, set payment_status to force_approved (Req 12.3)
        if waiver_type == "full" or discount_percentage == 100:
            application.payment_status = "force_approved"
            application.save(update_fields=["payment_status"])

        # Record in history (Req 12.6)
        ApplicationStatusHistory.objects.create(
            application=application,
            status=application.status,
            old_status=application.status,
            new_status=application.status,
            changed_by_id=admin_id,
            notes=f"Fee waiver granted: {waiver_type} ({reason_code}), {discount_percentage}% discount.",
        )

        logger.info(
            "Fee waiver granted: app=%s type=%s reason=%s discount=%d%% by=%s",
            application_id, waiver_type, reason_code, discount_percentage, admin_id,
        )

        # Notify student of fee waiver
        try:
            from apps.common.communication_service import CommunicationService
            CommunicationService.send('fee_waiver_granted', application)
        except Exception:
            logger.exception("Failed to send fee waiver notification for app=%s", application_id)

        return waiver

    @staticmethod
    def get_effective_fee(application_id: str, base_fee: Decimal) -> Decimal:
        """Compute the effective fee after applying any active waiver.

        Args:
            application_id: UUID of the application.
            base_fee: The original fee amount.

        Returns:
            The discounted fee amount.
        """
        waiver = FeeWaiver.objects.filter(
            application_id=application_id,
        ).order_by("-created_at").first()

        if not waiver:
            return base_fee

        if waiver.waiver_type == "full" or waiver.discount_percentage == 100:
            return Decimal("0.00")

        discount = Decimal(waiver.discount_percentage) / Decimal("100")
        return (base_fee * (Decimal("1") - discount)).quantize(Decimal("0.01"))
