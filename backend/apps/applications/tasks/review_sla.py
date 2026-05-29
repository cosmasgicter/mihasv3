"""Review SLA reminder task."""

import logging
from datetime import timedelta

from celery import shared_task
from django.utils import timezone

from ._locks import acquire_task_lock, release_task_lock

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=0, soft_time_limit=300, time_limit=360)
def review_sla_reminder_task(self):
    """Notify admins about applications exceeding the review SLA threshold.

    Runs daily at 07:00 UTC. Finds submitted/under_review applications
    older than the SLA threshold (default 5 days, configurable via
    SystemSetting key 'review_sla_days') and notifies all admin users.
    Requirements: 4.6-4.8
    """
    if not acquire_task_lock("review_sla_reminder_task"):
        logger.info("review_sla_reminder_task: skipped (already running)")
        return
    try:
        from apps.accounts.models import Profile
        from apps.applications.models import Application
        from apps.common.models import Notification, Setting
        from apps.common.outbox import create_notification, queue_email

        logger.info("review_sla_reminder_task: starting")
        sla_days = 5
        try:
            setting = Setting.objects.filter(key="review_sla_days").first()
            if setting and setting.value is not None:
                sla_days = int(setting.value)
        except (ValueError, TypeError):
            pass

        now = timezone.now()
        sla_cutoff = now - timedelta(days=sla_days)

        overdue_apps = Application.objects.filter(
            status__in=["submitted", "under_review"],
            submitted_at__lt=sla_cutoff,
        ).order_by("submitted_at")

        if not overdue_apps.exists():
            return {"overdue_count": 0, "admins_notified": 0}

        overdue_count = overdue_apps.count()

        app_summaries = []
        for app in overdue_apps[:50]:
            days_overdue = (now - app.submitted_at).days if app.submitted_at else 0
            app_summaries.append(
                f"{app.application_number} — {app.full_name} "
                f"({app.program}, {app.status}) — {days_overdue} days"
            )

        summary_text = "\n".join(app_summaries)
        summary_html = "<br>".join(app_summaries)
        if overdue_count > 50:
            summary_text += f"\n... and {overdue_count - 50} more."
            summary_html += f"<br>... and {overdue_count - 50} more."

        admins = Profile.objects.filter(
            role__in=["admin", "super_admin"],
            is_active=True,
        )

        admins_notified = 0
        dedup_date = now.strftime("%Y-%m-%d")

        for admin in admins:
            dedup_key = f"review_sla_{admin.id}_{dedup_date}"
            already_sent = Notification.objects.filter(
                idempotency_key=dedup_key,
            ).exists()
            if already_sent:
                continue

            try:
                create_notification(
                    user_id=admin.id,
                    title=f"Review SLA Alert: {overdue_count} Application(s) Overdue",
                    message=(
                        f"{overdue_count} application(s) have exceeded the "
                        f"{sla_days}-day review SLA threshold:\n{summary_text}"
                    ),
                    type="warning",
                    priority="high",
                    action_url="/admin/applications?status=submitted,under_review",
                    idempotency_key=dedup_key,
                )

                queue_email(
                    recipient_email=admin.email,
                    subject=f"ALERT: {overdue_count} Applications Pending Review Beyond SLA",
                    body=(
                        f"<p>The following applications have exceeded the "
                        f"{sla_days}-day review SLA threshold:</p>"
                        f"<p>{summary_html}</p>"
                        f"<p>Please prioritize these reviews.</p>"
                    ),
                )
                admins_notified += 1
            except Exception:
                logger.exception(
                    "Failed to send SLA reminder to admin %s", admin.id
                )

        if admins_notified:
            logger.info(
                "review_sla_reminder_task: notified %d admins about %d overdue applications",
                admins_notified,
                overdue_count,
            )
        return {"overdue_count": overdue_count, "admins_notified": admins_notified}
    finally:
        release_task_lock("review_sla_reminder_task")
