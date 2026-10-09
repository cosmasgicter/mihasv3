"""Condition deadline reminders (task 10.2, R13.9, finding STU-16).

The platform used to say nothing about a condition deadline until
``condition_expiry_task`` reported that it had **passed** — and a passed condition
auto-rejects the application. So the first message a student ever received about a
deadline was the one that cost them their place.

This sweep chases the deadline *before* it lands, in the windows
:data:`~apps.applications.condition_evidence_service.CONDITION_REMINDER_WINDOWS`
declares (7, 3 and 1 days out). Three properties are deliberate:

* **only conditions the student owes.** ``pending`` and ``changes_required``
  (:data:`CONDITION_STUDENT_OWED_STATES`). An ``evidence_submitted`` condition is
  waiting on the *school*, and chasing a student for something they already sent
  is worse than saying nothing.
* **one reminder per window per condition**, keyed through
  ``Notification.idempotency_key`` — so the reminder needs no new column to
  remember what it has sent, and running the sweep twice in a day sends nothing
  twice.
* **through the one delivery gate.** ``deliver_message`` with the mandatory
  ``application_updates`` category (task 10.1): a missed condition deadline
  forfeits a place, so this is transactional, not an optional notification, and
  the delivery decision lands in the durable communications history (R13.4).
"""

import logging

from celery import shared_task
from django.utils import timezone

from ._locks import acquire_task_lock, release_task_lock

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=0, soft_time_limit=300, time_limit=360)
def condition_reminder_task(self):
    """Remind students about condition deadlines that are close.

    Runs daily. Bounded per run like every other sweep in this package.
    Requirements: R13.9.
    """
    if not acquire_task_lock("condition_reminder_task"):
        logger.info("condition_reminder_task: skipped (already running)")
        return
    try:
        from apps.applications import condition_evidence_service as conditions

        logger.info("condition_reminder_task: starting")
        sent = 0
        skipped = 0

        today = timezone.now().date()
        for condition in conditions.conditions_due_for_reminder():
            try:
                days_remaining = (condition.deadline - today).days
                window = conditions.reminder_window_for(days_remaining)
                if window is None:
                    skipped += 1
                    continue
                if conditions.already_reminded(condition.id, window):
                    skipped += 1
                    continue
                if conditions.send_condition_reminder(condition, window=window):
                    sent += 1
            except Exception:
                logger.exception(
                    "Failed to send condition reminder for condition %s",
                    getattr(condition, "id", None),
                )

        if sent or skipped:
            logger.info(
                "condition_reminder_task: sent %d reminders, skipped %d already-reminded",
                sent,
                skipped,
            )
        return {"reminders_sent": sent, "skipped": skipped}
    finally:
        release_task_lock("condition_reminder_task")
