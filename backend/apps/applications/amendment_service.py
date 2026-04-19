"""Application amendment service.

Handles student-initiated amendments to submitted applications
and admin review of those amendments.

Requirements: 14.1–14.8
"""

import logging

from django.utils import timezone

from apps.applications.models import Application, ApplicationAmendment, ApplicationStatusHistory

logger = logging.getLogger(__name__)

# Statuses from which amendments are allowed (Req 14.3)
AMENDABLE_STATUSES = {"submitted", "under_review", "waitlisted"}

# Fields that can be amended (Req 14.4)
AMENDABLE_FIELDS = {
    "phone", "email", "address_line_1", "address_line_2",
    "residence_town", "next_of_kin_name", "next_of_kin_phone",
}

# Maximum pending amendments per application (Req 14.9)
MAX_PENDING_AMENDMENTS = 3


class AmendmentError(Exception):
    """Raised when an amendment operation fails validation."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


class AmendmentService:
    """Orchestrates application amendment requests and reviews."""

    @staticmethod
    def request_amendment(
        application_id: str,
        field_name: str,
        new_value: str,
        reason: str,
        user_id: str,
    ) -> ApplicationAmendment:
        """Request an amendment to a submitted application.

        Args:
            application_id: UUID of the application.
            field_name: The field to amend.
            new_value: The new value for the field.
            reason: Reason for the amendment.
            user_id: UUID of the student requesting.

        Returns:
            The created ApplicationAmendment instance.

        Raises:
            AmendmentError: If validation fails.
        """
        application = Application.objects.get(id=application_id)

        # Validate status (Req 14.3)
        if application.status not in AMENDABLE_STATUSES:
            raise AmendmentError(
                "INVALID_STATUS_FOR_AMENDMENT",
                f"Amendments are only allowed from statuses: {', '.join(sorted(AMENDABLE_STATUSES))}.",
            )

        # Validate field is amendable (Req 14.4, 14.5)
        if field_name not in AMENDABLE_FIELDS:
            raise AmendmentError(
                "FIELD_NOT_AMENDABLE",
                f"Field '{field_name}' is not amendable. Amendable fields: {', '.join(sorted(AMENDABLE_FIELDS))}.",
            )

        # Check pending count (Req 14.9)
        pending_count = ApplicationAmendment.objects.filter(
            application_id=application_id,
            status="pending",
        ).count()

        if pending_count >= MAX_PENDING_AMENDMENTS:
            raise AmendmentError(
                "MAX_PENDING_AMENDMENTS",
                f"Maximum of {MAX_PENDING_AMENDMENTS} pending amendments allowed per application.",
            )

        # Get old value
        old_value = str(getattr(application, field_name, "") or "")

        # Create amendment
        amendment = ApplicationAmendment.objects.create(
            application_id=application_id,
            field_name=field_name,
            old_value=old_value,
            new_value=new_value,
            reason=reason,
            status="pending",
        )

        # Notify admins (Req 14.6)
        _notify_admins_of_amendment(application, amendment)

        logger.info(
            "Amendment requested: app=%s field=%s by=%s",
            application_id, field_name, user_id,
        )

        return amendment

    @staticmethod
    def review_amendment(
        amendment_id: str,
        status: str,
        admin_id: str,
    ) -> ApplicationAmendment:
        """Review (approve/reject) an amendment.

        Args:
            amendment_id: UUID of the amendment.
            status: 'approved' or 'rejected'.
            admin_id: UUID of the admin reviewing.

        Returns:
            The updated ApplicationAmendment instance.

        Raises:
            AmendmentError: If validation fails.
        """
        try:
            amendment = ApplicationAmendment.objects.get(id=amendment_id)
        except ApplicationAmendment.DoesNotExist:
            raise AmendmentError("AMENDMENT_NOT_FOUND", "Amendment not found.")

        if amendment.status != "pending":
            raise AmendmentError(
                "AMENDMENT_ALREADY_REVIEWED",
                f"Amendment has already been {amendment.status}.",
            )

        amendment.status = status
        amendment.reviewed_by_id = admin_id
        amendment.reviewed_at = timezone.now()
        amendment.save(update_fields=["status", "reviewed_by", "reviewed_at"])

        # If approved, apply the field change (Req 14.8)
        if status == "approved":
            application = Application.objects.get(id=amendment.application_id)
            setattr(application, amendment.field_name, amendment.new_value)
            application.save(update_fields=[amendment.field_name])

            # Record in history
            ApplicationStatusHistory.objects.create(
                application=application,
                status=application.status,
                old_status=application.status,
                new_status=application.status,
                changed_by_id=admin_id,
                notes=(
                    f"Amendment approved: {amendment.field_name} changed "
                    f"from '{amendment.old_value}' to '{amendment.new_value}'."
                ),
            )

        logger.info(
            "Amendment reviewed: id=%s status=%s by=%s",
            amendment_id, status, admin_id,
        )

        # Notify student of amendment review result
        try:
            from apps.common.communication_service import CommunicationService
            application = Application.objects.get(id=amendment.application_id)
            CommunicationService.send('amendment_reviewed', application, {'amendment_status': status, 'field_name': amendment.field_name})
        except Exception:
            logger.exception("Failed to send amendment review notification for amendment=%s", amendment_id)

        return amendment


def _notify_admins_of_amendment(application: Application, amendment: ApplicationAmendment) -> None:
    """Notify admin users about a new amendment request."""
    try:
        from apps.accounts.models import Profile
        from apps.common.models import Notification

        admins = Profile.objects.filter(role__in=["admin", "super_admin"], is_active=True)
        for admin in admins:
            Notification.objects.create(
                user_id=admin.id,
                title="Amendment Request",
                message=(
                    f"Student {application.full_name} has requested an amendment "
                    f"to field '{amendment.field_name}' on application {application.application_number}."
                ),
                type="info",
                priority="normal",
                action_url=f"/admin/applications/{application.id}",
            )
    except Exception:
        logger.exception(
            "Failed to notify admins of amendment for app=%s", application.id,
        )
