"""Waitlist cascade task."""

import logging
import uuid as uuid_mod

from celery import shared_task
from django.utils import timezone

from ._locks import acquire_task_lock, release_task_lock

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=0, soft_time_limit=300, time_limit=360)
def waitlist_cascade_task(self):
    """Cascade waitlisted applications to the next intake.

    Runs daily at 10:00 UTC. Finds intakes past end_date with waitlisted
    applications, creates draft applications for the next intake pre-populated
    with student data, and notifies students.

    Side effects are batched (system-performance-hardening R6.4): the cascade
    notifications and emails are collected across all closed intakes and
    written with one ``create_notifications_bulk`` / ``queue_emails_bulk`` call
    each, instead of a per-row insert (plus OutboxEvent) per application. The
    new draft ``Application`` rows stay per-row because each needs a unique
    ``application_number`` and a per-row duplicate guard.

    Requirements: 15.3-15.6
    """
    if not acquire_task_lock("waitlist_cascade_task"):
        logger.info("waitlist_cascade_task: skipped (already running)")
        return
    try:
        from apps.applications.models import Application
        from apps.catalog.models import Intake
        from apps.common.models import Setting
        from apps.common.outbox import create_notifications_bulk, queue_emails_bulk

        now = timezone.now().date()

        policy = "unrestricted"
        try:
            setting = Setting.objects.filter(key="multi_intake_policy").first()
            if setting and setting.value:
                policy = str(setting.value)
        except Exception:
            logger.debug("Could not read multi_intake_policy setting, using default=%s", policy, exc_info=True)

        if policy != "waitlist_cascade":
            return {"policy": policy, "cascaded": 0}

        logger.info("waitlist_cascade_task: starting (policy=%s)", policy)

        cascaded_count = 0
        # Side effects are batched (system-performance-hardening R6.4): every
        # cascade notification/email is collected across all closed intakes and
        # flushed with a single bulk insert each, instead of one INSERT (plus
        # one OutboxEvent INSERT) per cascaded application. The new draft
        # Application rows are still created per-row because each needs a unique
        # application_number and a per-row duplicate check, which are not safe
        # to collapse into a single bulk_create.
        notification_specs = []
        email_specs = []

        closed_intakes = Intake.objects.filter(
            end_date__lt=now,
            is_active=True,
        )[:20]

        for intake in closed_intakes:
            waitlisted_apps = list(Application.objects.filter(
                intake=intake.name,
                status="waitlisted",
            )[:100])

            if not waitlisted_apps:
                continue

            next_intake = Intake.objects.filter(
                start_date__gt=intake.end_date,
                is_active=True,
            ).order_by("start_date").first()

            if not next_intake:
                continue

            for app in waitlisted_apps:
                try:
                    existing = Application.objects.filter(
                        user_id=app.user_id,
                        program=app.program,
                        intake=next_intake.name,
                    ).exists()

                    if existing:
                        continue

                    new_app_number = f"APP-{now.strftime('%Y%m%d')}-{uuid_mod.uuid4().hex[:8].upper()}"

                    Application.objects.create(
                        application_number=new_app_number,
                        user_id=app.user_id,
                        full_name=app.full_name,
                        nrc_number=app.nrc_number,
                        passport_number=app.passport_number,
                        date_of_birth=app.date_of_birth,
                        sex=app.sex,
                        phone=app.phone,
                        email=app.email,
                        residence_town=app.residence_town,
                        nationality=app.nationality,
                        address_line_1=app.address_line_1,
                        address_line_2=app.address_line_2,
                        postal_code=app.postal_code,
                        next_of_kin_name=app.next_of_kin_name,
                        next_of_kin_phone=app.next_of_kin_phone,
                        program=app.program,
                        intake=next_intake.name,
                        institution=app.institution,
                        status="draft",
                        country=app.country,
                        created_at=timezone.now(),
                        updated_at=timezone.now(),
                    )

                    # Collect side effects for a single bulk flush per table
                    # (R6.4). Building the spec cannot raise (pure string
                    # formatting), so unlike the previous per-row helper calls
                    # there is no notify-specific try/except here; a bulk-insert
                    # failure is handled once at flush time below.
                    notification_specs.append(
                        {
                            "user_id": app.user_id,
                            "title": "Application Carried Forward",
                            "message": (
                                f"Your application for {app.program} ({intake.name}) was not promoted from the waitlist. "
                                f"We've carried your application forward to {next_intake.name}. "
                                f"Please review and submit."
                            ),
                            "type": "info",
                            "priority": "normal",
                        }
                    )
                    email_specs.append(
                        {
                            "recipient_email": app.email,
                            "subject": f"Application Carried Forward — {app.program}",
                            "body": (
                                f"<p>Dear {app.full_name},</p>"
                                f"<p>Your application for <strong>{app.program}</strong> ({intake.name}) "
                                f"was not promoted from the waitlist.</p>"
                                f"<p>We've carried your application forward to <strong>{next_intake.name}</strong>. "
                                f"Please log in to review and submit your new application.</p>"
                                f"<p>Best regards,<br>Beanola Admissions</p>"
                            ),
                        }
                    )

                    cascaded_count += 1
                except Exception:
                    logger.exception("Failed to cascade app=%s to next intake", app.id)

        # One bulk insert per table for every cascaded application's
        # notification + email (identical content to the per-row path).
        if notification_specs:
            try:
                create_notifications_bulk(notification_specs)
            except Exception:
                logger.exception("waitlist_cascade_task: bulk notification insert failed")
        if email_specs:
            try:
                queue_emails_bulk(email_specs)
            except Exception:
                logger.exception("waitlist_cascade_task: bulk email insert failed")

        logger.info("waitlist_cascade_task: cascaded %d applications", cascaded_count)
        return {"cascaded": cascaded_count}
    finally:
        release_task_lock("waitlist_cascade_task")
