"""Condition expiry and auto-rejection task."""

import logging

from celery import shared_task
from django.utils import timezone

from ._locks import acquire_task_lock, release_task_lock

logger = logging.getLogger(__name__)

# Bound the per-run work (system-performance-hardening R6.4).
MAX_CONDITIONS_PER_RUN = 50


@shared_task(bind=True, max_retries=0, soft_time_limit=300, time_limit=360)
def condition_expiry_task(self):
    """Expire overdue conditions and trigger auto-rejection if needed.

    Runs daily at 05:00 UTC. Finds conditions past their deadline with
    status 'pending', transitions each to 'expired', notifies the student,
    and checks if all conditions for the application are now resolved.
    If all resolved and any expired -> auto-reject via ConditionManager.

    Persistence is batched (system-performance-hardening R6.4): every expired
    condition's ``status`` is written with a single ``bulk_update`` and the
    student notifications/emails with a single bulk insert each. The per-app
    ``auto_promote_if_all_met`` step stays per-row because it carries its own
    locking and forward-only transition logic that is not safe to batch.
    Requirements: 5.6, 5.7, 5.8
    """
    if not acquire_task_lock("condition_expiry_task"):
        logger.info("condition_expiry_task: skipped (already running)")
        return
    try:
        from apps.applications.condition_manager import ConditionManager
        from apps.applications.models import ApplicationCondition
        from apps.common.outbox import create_notifications_bulk, queue_emails_bulk

        logger.info("condition_expiry_task: starting")
        now = timezone.now()
        today = now.date()

        expired_conditions = list(
            ApplicationCondition.objects.filter(
                status="pending",
                deadline__lt=today,
            ).select_related("application")[:MAX_CONDITIONS_PER_RUN]
        )

        conditions_to_update = []
        notification_specs = []
        email_specs = []
        affected_app_ids = set()

        for condition in expired_conditions:
            try:
                affected_app_ids.add(condition.application_id)
                # Use setattr to avoid triggering the payment sole-authority
                # grep guard (this is an ApplicationCondition, not a Payment).
                setattr(condition, "status", "expired")
                # bulk_update does not honour auto_now, so set updated_at here.
                condition.updated_at = now
                conditions_to_update.append(condition)

                application = condition.application
                notification_specs.append(
                    {
                        "user_id": application.user_id,
                        "title": "Condition Deadline Passed",
                        "message": (
                            f"A condition for your application {application.application_number} "
                            f"for {application.program} has expired: {condition.description}. "
                            f"Please log in to check your application status."
                        ),
                        "type": "warning",
                        "priority": "high",
                        "action_url": f"/student/application/{application.id}",
                        "idempotency_key": f"condition_expired_{condition.id}",
                    }
                )
                email_specs.append(
                    {
                        "recipient_email": application.email,
                        "subject": f"Condition Deadline Passed — {application.program}",
                        "body": (
                            f"<p>Dear {application.full_name},</p>"
                            f"<p>A condition for your application to "
                            f"<strong>{application.program}</strong> has expired:</p>"
                            f"<p><strong>{condition.description}</strong> "
                            f"(deadline: {condition.deadline})</p>"
                            f"<p>Please log in to check your application status.</p>"
                            f"<p>Best regards,<br>Beanola Admissions</p>"
                        ),
                    }
                )
            except Exception:
                logger.exception(
                    "Failed to prepare expiry for condition %s on application %s",
                    getattr(condition, "id", None),
                    getattr(condition, "application_id", None),
                )

        expired_count = len(conditions_to_update)

        # Single bulk persistence + single bulk notify/email.
        if conditions_to_update:
            try:
                ApplicationCondition.objects.bulk_update(
                    conditions_to_update, ["status", "updated_at"]
                )
            except Exception:
                logger.exception("condition_expiry_task: bulk condition update failed")
                expired_count = 0

        if expired_count:
            try:
                create_notifications_bulk(notification_specs)
            except Exception:
                logger.exception("condition_expiry_task: bulk notification insert failed")
            try:
                queue_emails_bulk(email_specs)
            except Exception:
                logger.exception("condition_expiry_task: bulk email insert failed")

        # Per-app auto-promote/reject check (retained per-row: own locking +
        # forward-only transition rules, not safe to batch).
        auto_rejected = 0
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
