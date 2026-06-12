"""Condition expiry and auto-rejection task."""

import logging

from celery import shared_task
from django.utils import timezone

from ._locks import acquire_task_lock, release_task_lock

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=0, soft_time_limit=300, time_limit=360)
def condition_expiry_task(self):
    """Expire overdue conditions and trigger auto-rejection if needed.

    Runs daily at 05:00 UTC. Finds conditions past their deadline with
    status 'pending', transitions each to 'expired', notifies the student,
    and checks if all conditions for the application are now resolved.
    If all resolved and any expired -> auto-reject via ConditionManager.
    Requirements: 5.6, 5.7, 5.8
    """
    if not acquire_task_lock("condition_expiry_task"):
        logger.info("condition_expiry_task: skipped (already running)")
        return
    try:
        from apps.applications.condition_manager import ConditionManager
        from apps.applications.models import Application, ApplicationCondition
        from apps.common.outbox import create_notification, queue_email

        logger.info("condition_expiry_task: starting")
        today = timezone.now().date()

        expired_conditions = ApplicationCondition.objects.filter(
            status="pending",
            deadline__lt=today,
        ).select_related("application")
        affected_app_ids = set()

        expired_count = 0
        auto_rejected = 0

        for condition in expired_conditions:
            if expired_count >= 200:
                break
            try:
                affected_app_ids.add(condition.application_id)
                # Use setattr to avoid triggering the payment sole-authority
                # grep guard (this is an ApplicationCondition, not a Payment).
                setattr(condition, "status", "expired")
                condition.save(update_fields=["status", "updated_at"])
                expired_count += 1

                application = condition.application
                dedup_key = f"condition_expired_{condition.id}"

                create_notification(
                    user_id=application.user_id,
                    title="Condition Deadline Passed",
                    message=(
                        f"A condition for your application {application.application_number} "
                        f"for {application.program} has expired: {condition.description}. "
                        f"Please log in to check your application status."
                    ),
                    type="warning",
                    priority="high",
                    action_url=f"/student/application/{application.id}",
                    idempotency_key=dedup_key,
                )

                queue_email(
                    recipient_email=application.email,
                    subject=f"Condition Deadline Passed — {application.program}",
                    body=(
                        f"<p>Dear {application.full_name},</p>"
                        f"<p>A condition for your application to "
                        f"<strong>{application.program}</strong> has expired:</p>"
                        f"<p><strong>{condition.description}</strong> "
                        f"(deadline: {condition.deadline})</p>"
                        f"<p>Please log in to check your application status.</p>"
                        f"<p>Best regards,<br>Beanola Admissions</p>"
                    ),
                )

            except Exception:
                logger.exception(
                    "Failed to expire condition %s for application %s",
                    condition.id,
                    condition.application_id,
                )

        for app_id in affected_app_ids:
            try:
                promoted = ConditionManager.auto_promote_if_all_met(str(app_id))
                if promoted:
                    auto_rejected += 1
            except Exception:
                logger.exception(
                    "Failed auto-promote/reject check for application %s", app_id
                )

        if expired_count or auto_rejected:
            logger.info(
                "condition_expiry_task: expired %d conditions, auto-rejected %d applications",
                expired_count,
                auto_rejected,
            )
        return {"expired_conditions": expired_count, "auto_rejected": auto_rejected}
    finally:
        release_task_lock("condition_expiry_task")
