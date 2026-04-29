"""Conditional admission management.

Handles assigning conditions to applications, verifying conditions,
checking resolution status, and auto-promoting or rejecting based on
condition outcomes.

Requirements: 5.1–5.5, 5.8, 5.11
"""

import logging

from django.db import transaction
from django.utils import timezone

from apps.applications.models import Application, ApplicationCondition
from apps.applications.services import transition_application_status

logger = logging.getLogger(__name__)

# Statuses from which conditional approval is allowed (Req 5.1).
CONDITIONALLY_APPROVABLE_STATUSES = {"under_review", "waitlisted"}

# Valid condition types (Req 5.2).
VALID_CONDITION_TYPES = {"document", "payment", "academic", "other"}

# Terminal condition statuses — a condition is resolved when in one of these.
TERMINAL_CONDITION_STATUSES = {"met", "waived", "expired"}

# Statuses that count as successfully resolved (for auto-promotion).
SUCCESSFUL_CONDITION_STATUSES = {"met", "waived"}


class ConditionError(Exception):
    """Raised when a condition operation fails validation."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


class ConditionManager:
    """Orchestrates conditional admission lifecycle."""

    @staticmethod
    def assign_conditions(
        application_id: str,
        conditions: list[dict],
        admin_id: str,
    ) -> list[ApplicationCondition]:
        """Assign conditions to an application and transition to conditionally_approved.

        Steps:
        1. Validate application status is conditionally approvable (Req 5.1)
        2. Validate each condition has required fields (Req 5.2)
        3. Create ApplicationCondition rows (Req 5.3)
        4. Transition application to conditionally_approved (Req 5.1)
        5. Notify student with conditions list (Req 5.4)

        Args:
            application_id: UUID of the application.
            conditions: List of dicts with keys: description, deadline, condition_type.
            admin_id: UUID of the admin performing the action.

        Returns:
            List of created ApplicationCondition instances.

        Raises:
            ConditionError: If validation fails.
            Application.DoesNotExist: If application not found.
        """
        if not conditions:
            raise ConditionError(
                "NO_CONDITIONS_PROVIDED",
                "At least one condition must be provided.",
            )

        # Validate each condition dict
        for i, cond in enumerate(conditions):
            if not cond.get("description", "").strip():
                raise ConditionError(
                    "MISSING_DESCRIPTION",
                    f"Condition {i + 1} is missing a description.",
                )
            if not cond.get("deadline"):
                raise ConditionError(
                    "MISSING_DEADLINE",
                    f"Condition {i + 1} is missing a deadline.",
                )
            cond_type = cond.get("condition_type", "other")
            if cond_type not in VALID_CONDITION_TYPES:
                raise ConditionError(
                    "INVALID_CONDITION_TYPE",
                    f"Condition {i + 1} has invalid type '{cond_type}'. "
                    f"Valid types: {', '.join(sorted(VALID_CONDITION_TYPES))}.",
                )

        with transaction.atomic():
            application = Application.objects.select_for_update().get(id=application_id)

            # Status validation (Req 5.1)
            if application.status not in CONDITIONALLY_APPROVABLE_STATUSES:
                raise ConditionError(
                    "INVALID_STATUS_FOR_CONDITIONS",
                    f"Cannot assign conditions from status '{application.status}'. "
                    f"Allowed: {', '.join(sorted(CONDITIONALLY_APPROVABLE_STATUSES))}.",
                )

            # Create condition rows (Req 5.3)
            created_conditions = []
            for cond in conditions:
                condition = ApplicationCondition.objects.create(
                    application=application,
                    description=cond["description"].strip(),
                    condition_type=cond.get("condition_type", "other"),
                    deadline=cond["deadline"],
                    status="pending",
                )
                created_conditions.append(condition)

            # Transition to conditionally_approved (Req 5.1)
            transition_application_status(
                application=application,
                new_status="conditionally_approved",
                changed_by=admin_id,
                notes=f"Conditionally approved with {len(created_conditions)} condition(s).",
            )

        # Notify student (Req 5.4)
        _send_conditions_notification(application, created_conditions)

        logger.info(
            "Assigned %d conditions to app=%s by admin=%s",
            len(created_conditions),
            application_id,
            admin_id,
        )
        return created_conditions

    @staticmethod
    def verify_condition(
        condition_id: str,
        status: str,
        admin_id: str,
    ) -> ApplicationCondition:
        """Verify a condition as met or waived.

        Steps:
        1. Validate target status (Req 5.5)
        2. Update condition status, met_at, verified_by
        3. Check if all conditions resolved
        4. Auto-promote if all met/waived (Req 5.5)

        Args:
            condition_id: UUID of the condition.
            status: Target status — must be 'met' or 'waived'.
            admin_id: UUID of the admin verifying.

        Returns:
            The updated ApplicationCondition instance.

        Raises:
            ConditionError: If validation fails.
            ApplicationCondition.DoesNotExist: If condition not found.
        """
        if status not in ("met", "waived"):
            raise ConditionError(
                "INVALID_CONDITION_STATUS",
                f"Condition status must be 'met' or 'waived', got '{status}'.",
            )

        with transaction.atomic():
            condition = (
                ApplicationCondition.objects.select_for_update().get(id=condition_id)
            )

            if condition.status != "pending":
                raise ConditionError(
                    "CONDITION_NOT_PENDING",
                    f"Condition is already '{condition.status}' — only pending conditions can be verified.",
                )

            condition.status = status
            condition.met_at = timezone.now()
            condition.verified_by_id = admin_id
            condition.updated_at = timezone.now()
            condition.save(update_fields=["status", "met_at", "verified_by", "updated_at"])

        logger.info(
            "Condition %s verified as '%s' by admin=%s",
            condition_id,
            status,
            admin_id,
        )

        # Notify student about individual condition verification
        try:
            from apps.common.communication_service import CommunicationService
            application = Application.objects.get(id=condition.application_id)
            CommunicationService.send('condition_verified', application, {
                'condition_name': condition.description,
                'condition_status': status,
            })
        except Exception:
            logger.exception("Failed to send condition_verified notification for condition=%s", condition_id)

        # Check if all conditions are now resolved and auto-promote (Req 5.5)
        ConditionManager.auto_promote_if_all_met(str(condition.application_id))

        return condition

    @staticmethod
    def check_all_conditions_resolved(application_id: str) -> bool:
        """Check if all conditions for an application have a terminal status.

        A condition is resolved when its status is met, waived, or expired.

        Args:
            application_id: UUID of the application.

        Returns:
            True if all conditions are in a terminal status, False otherwise.
        """
        conditions = ApplicationCondition.objects.filter(
            application_id=application_id,
        )

        if not conditions.exists():
            return True

        unresolved = conditions.exclude(status__in=TERMINAL_CONDITION_STATUSES).count()
        return unresolved == 0

    @staticmethod
    def auto_promote_if_all_met(application_id: str) -> bool:
        """Auto-promote or reject based on condition outcomes.

        If all conditions are met/waived → transition to approved (Req 5.5).
        If all conditions resolved and any expired → transition to rejected (Req 5.8).

        Args:
            application_id: UUID of the application.

        Returns:
            True if a transition was performed, False otherwise.
        """
        if not ConditionManager.check_all_conditions_resolved(application_id):
            return False

        conditions = ApplicationCondition.objects.filter(
            application_id=application_id,
        )

        if not conditions.exists():
            return False

        # Check the application is still conditionally_approved
        try:
            application = Application.objects.get(id=application_id)
        except Application.DoesNotExist:
            return False

        if application.status != "conditionally_approved":
            return False

        has_expired = conditions.filter(status="expired").exists()

        if has_expired:
            # At least one condition expired → reject (Req 5.8)
            expired_descriptions = list(
                conditions.filter(status="expired").values_list("description", flat=True)
            )
            notes = (
                f"Rejected: condition(s) not met by deadline — "
                f"{', '.join(expired_descriptions)}"
            )

            with transaction.atomic():
                locked_app = Application.objects.select_for_update().get(id=application_id)
                if locked_app.status != "conditionally_approved":
                    return False

                transition_application_status(
                    application=locked_app,
                    new_status="rejected",
                    changed_by="system",
                    notes=notes,
                )

            # Notify student of auto-rejection due to expired conditions
            try:
                from apps.common.communication_service import CommunicationService
                CommunicationService.send('application_rejected', locked_app, {'admin_feedback': 'Application rejected due to expired conditions.'})
            except Exception:
                logger.exception("Failed to send auto-rejection notification for app=%s", application_id)

            logger.info(
                "Auto-rejected app=%s due to expired conditions: %s",
                application_id,
                expired_descriptions,
            )
            return True
        else:
            # All conditions met/waived → approve (Req 5.5)
            with transaction.atomic():
                locked_app = Application.objects.select_for_update().get(id=application_id)
                if locked_app.status != "conditionally_approved":
                    return False

                transition_application_status(
                    application=locked_app,
                    new_status="approved",
                    changed_by="system",
                    notes="All conditions met/waived — auto-promoted to approved.",
                )

            _send_approval_notification(locked_app)

            logger.info(
                "Auto-promoted app=%s to approved — all conditions met/waived.",
                application_id,
            )
            return True


def _send_conditions_notification(
    application: Application,
    conditions: list[ApplicationCondition],
) -> None:
    """Create a Notification and dispatch email for condition assignment (Req 5.4)."""
    try:
        from apps.common.outbox import create_notification, queue_email

        conditions_text = "\n".join(
            f"- {c.description} (due: {c.deadline}, type: {c.condition_type})"
            for c in conditions
        )

        create_notification(
            user_id=application.user_id,
            title="Conditional Admission — Action Required",
            message=(
                f"Your application {application.application_number} for "
                f"{application.program} ({application.intake}) has been "
                f"conditionally approved. You must meet the following conditions:\n"
                f"{conditions_text}"
            ),
            type="warning",
            priority="high",
            action_url=f"/student/application/{application.id}",
        )

        conditions_html = "".join(
            f"<li><strong>{c.description}</strong> — due by {c.deadline} "
            f"(type: {c.condition_type})</li>"
            for c in conditions
        )

        email_body = (
            f"<p>Dear {application.full_name},</p>"
            f"<p>Your application for <strong>{application.program}</strong> "
            f"({application.intake}) has been conditionally approved. "
            f"You must meet the following conditions:</p>"
            f"<ul>{conditions_html}</ul>"
            f"<p>Please log in for details and deadlines.</p>"
            f"<p>Best regards,<br>MIHAS Admissions</p>"
        )

        queue_email(
            recipient_email=application.email,
            subject=f"Conditional Admission — Action Required ({application.program})",
            body=email_body,
        )
    except Exception:
        logger.exception(
            "Failed to send conditions notification for application %s",
            application.id,
        )


def _send_approval_notification(application: Application) -> None:
    """Create a Notification and dispatch email for auto-approval after conditions met."""
    try:
        from apps.common.outbox import create_notification, queue_email

        create_notification(
            user_id=application.user_id,
            title="Application Approved!",
            message=(
                f"All conditions for your application "
                f"{application.application_number} for {application.program} "
                f"({application.intake}) have been met. "
                f"Your application is now fully approved. "
                f"Please log in to confirm your enrollment."
            ),
            type="success",
            priority="high",
            action_url=f"/student/application/{application.id}",
        )

        email_body = (
            f"<p>Dear {application.full_name},</p>"
            f"<p>Congratulations! All conditions for your application "
            f"<strong>{application.application_number}</strong> for "
            f"<strong>{application.program}</strong> ({application.intake}) "
            f"have been met.</p>"
            f"<p>Your application is now <strong>fully approved</strong>. "
            f"Please log in to confirm your enrollment.</p>"
            f"<p>Best regards,<br>MIHAS Admissions</p>"
        )

        queue_email(
            recipient_email=application.email,
            subject=f"Application Approved — {application.program}",
            body=email_body,
        )
    except Exception:
        logger.exception(
            "Failed to send approval notification for application %s",
            application.id,
        )
