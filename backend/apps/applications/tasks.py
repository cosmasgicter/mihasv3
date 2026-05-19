"""Application Celery tasks — PDF generation, interview automation, reminders, expiry, conditions,
enrollment confirmation, and waitlist cascade.

Implements task 8.1 (PDF generation), task 3.3 (interview tasks), task 6.1 (expiry tasks),
task 7.3 (condition expiry), task 14.3 (enrollment expiry), task 19.2 (waitlist cascade).
Requirements: 2.8, 2.12, 4.1–4.3, 4.6–4.9, 5.3, 5.6, 5.7, 5.8, 10.6–10.8, 10.10, 15.3–15.6
"""

import io
import logging
import uuid
from datetime import timedelta

from celery import shared_task
from django.core.cache import cache
from django.utils import timezone

logger = logging.getLogger(__name__)


def _acquire_task_lock(task_name: str, timeout: int = 600) -> bool:
    return cache.add(f"celery_lock:{task_name}", "1", timeout=timeout)


def _release_task_lock(task_name: str):
    cache.delete(f"celery_lock:{task_name}")


@shared_task(bind=True, max_retries=0)
def interview_auto_complete_task(self):
    """Auto-complete interviews whose scheduled_at is in the past.

    Runs every 2 hours. Finds interviews with status 'scheduled' and
    scheduled_at in the past, transitions them to 'completed'.
    Requirement: 2.8
    """
    if not _acquire_task_lock("interview_auto_complete_task"):
        logger.info("interview_auto_complete_task: skipped (already running)")
        return
    try:
        from apps.applications.models import ApplicationInterview

        now = timezone.now()
        past_interviews = ApplicationInterview.objects.filter(
            status="scheduled",
            scheduled_at__lt=now,
        )

        count = past_interviews.update(
            status="completed",
            updated_at=now,
        )

        if count:
            logger.info(
                "interview_auto_complete_task: transitioned %d past interviews to completed",
                count,
            )
        return {"completed": count}
    finally:
        _release_task_lock("interview_auto_complete_task")


@shared_task(bind=True, max_retries=0)
def interview_reminder_task(self):
    """Send reminder notifications for upcoming interviews.

    Runs every hour. Finds interviews scheduled within the next 24 hours
    with status 'scheduled', sends a reminder notification to the student.
    Deduplicated: skips if a reminder notification for this interview was
    already created in the last 24 hours.
    Requirement: 2.12
    """
    if not _acquire_task_lock("interview_reminder_task"):
        logger.info("interview_reminder_task: skipped (already running)")
        return
    try:
        from apps.applications.models import ApplicationInterview
        from apps.common.models import Notification
        from apps.common.outbox import create_notification, queue_email

        now = timezone.now()
        window_end = now + timedelta(hours=24)
        dedup_cutoff = now - timedelta(hours=24)

        upcoming = ApplicationInterview.objects.filter(
            status="scheduled",
            scheduled_at__gt=now,
            scheduled_at__lte=window_end,
        ).select_related("application")

        sent = 0
        for interview in upcoming:
            # Deduplication: check if a reminder notification was already sent
            # for this interview in the last 24 hours using the idempotency_key.
            dedup_key = f"interview_reminder_{interview.id}"
            already_sent = Notification.objects.filter(
                idempotency_key=dedup_key,
                created_at__gte=dedup_cutoff,
            ).exists()
            if already_sent:
                continue

            application = interview.application
            mode_display = interview.mode.replace("_", " ").title()
            scheduled_display = interview.scheduled_at.strftime("%B %d, %Y at %I:%M %p")

            title = "Interview Reminder"
            message = (
                f"Reminder: Your interview for {application.program} is "
                f"scheduled for {scheduled_display}. Mode: {mode_display}."
            )

            try:
                create_notification(
                    user_id=application.user_id,
                    title=title,
                    message=message,
                    type="info",
                    priority="normal",
                    action_url=f"/student/application/{application.id}",
                    idempotency_key=dedup_key,
                )

                location_display = interview.location or "See notes"
                email_body = (
                    f"<p>Dear {application.full_name},</p>"
                    f"<p>{message}</p>"
                    f"<p><strong>Date:</strong> {scheduled_display}<br>"
                    f"<strong>Mode:</strong> {mode_display}<br>"
                    f"<strong>Location:</strong> {location_display}</p>"
                    f"<p>Best regards,<br>MIHAS Admissions</p>"
                )

                queue_email(
                    recipient_email=application.email,
                    subject=f"Reminder: Interview Tomorrow — {application.program}",
                    body=email_body,
                )
                sent += 1
            except Exception:
                logger.exception(
                    "Failed to send interview reminder for interview %s",
                    interview.id,
                )

        if sent:
            logger.info(
                "interview_reminder_task: sent %d interview reminders", sent
            )
        return {"reminders_sent": sent}
    finally:
        _release_task_lock("interview_reminder_task")


@shared_task(bind=True, max_retries=0)
def draft_expiry_reminder_task(self):
    """Send reminders for stale drafts and expire drafts older than 30 days.

    Runs daily at 06:00 UTC.
    - Drafts with no updates in 7+ days: send reminder notification + email.
    - Drafts 27–30 days old: include urgency indicator ("Your draft will expire in X days").
    - Drafts 30+ days old: transition to 'expired' status and notify student.
    Requirements: 4.1–4.3, 4.9
    """
    if not _acquire_task_lock("draft_expiry_reminder_task"):
        logger.info("draft_expiry_reminder_task: skipped (already running)")
        return
    try:
        from apps.applications.models import Application
        from apps.applications.services import (
            SYSTEM_ACTOR_ID,
            transition_application_status,
        )
        from apps.common.models import Notification
        from apps.common.outbox import create_notification, queue_email

        now = timezone.now()
        seven_days_ago = now - timedelta(days=7)
        thirty_days_ago = now - timedelta(days=30)

        # Find all stale drafts (updated_at older than 7 days)
        stale_drafts = Application.objects.filter(
            status="draft",
            updated_at__lt=seven_days_ago,
        )

        reminders_sent = 0
        expired_count = 0

        for app in stale_drafts:
            days_since_update = (now - app.updated_at).days

            if days_since_update >= 30:
                # Expire the draft
                try:
                    transition_application_status(
                        application=app,
                        new_status="expired",
                        changed_by=SYSTEM_ACTOR_ID,
                        notes="Draft expired after 30 days of inactivity.",
                        ip_address="",
                        user_agent="celery/draft_expiry_reminder_task",
                    )

                    dedup_key = f"draft_expired_{app.id}"
                    create_notification(
                        user_id=app.user_id,
                        title="Application Draft Expired",
                        message=(
                            f"Your draft application for {app.program} ({app.intake}) "
                            f"has expired after 30 days of inactivity. "
                            f"You may start a new application at any time."
                        ),
                        type="warning",
                        priority="high",
                        action_url="/student/dashboard",
                        idempotency_key=dedup_key,
                    )

                    queue_email(
                        recipient_email=app.email,
                        subject="Application Draft Expired",
                        body=(
                            f"<p>Dear {app.full_name},</p>"
                            f"<p>Your draft application for <strong>{app.program}</strong> "
                            f"({app.intake}) has expired after 30 days of inactivity.</p>"
                            f"<p>You may start a new application at any time.</p>"
                            f"<p>Best regards,<br>MIHAS Admissions</p>"
                        ),
                    )
                    expired_count += 1
                except Exception:
                    logger.exception(
                        "Failed to expire draft application %s", app.id
                    )
            else:
                # Send reminder
                dedup_key = f"draft_reminder_{app.id}_{now.strftime('%Y-%m-%d')}"
                already_sent = Notification.objects.filter(
                    idempotency_key=dedup_key,
                ).exists()
                if already_sent:
                    continue

                # Urgency indicator for drafts 27–30 days old
                days_until_expiry = 30 - days_since_update
                if days_until_expiry <= 3:
                    urgency_msg = (
                        f" Your draft will expire in {days_until_expiry} "
                        f"day{'s' if days_until_expiry != 1 else ''}."
                    )
                else:
                    urgency_msg = ""

                try:
                    message = (
                        f"Your draft application for {app.program} ({app.intake}) "
                        f"has not been updated in {days_since_update} days. "
                        f"Please log in to complete and submit your application.{urgency_msg}"
                    )

                    create_notification(
                        user_id=app.user_id,
                        title="Complete Your Application Draft",
                        message=message,
                        type="info",
                        priority="high" if days_until_expiry <= 3 else "normal",
                        action_url=f"/student/application/{app.id}",
                        idempotency_key=dedup_key,
                    )

                    email_subject = "Your Application Draft Will Expire Soon" if days_until_expiry <= 3 else "Reminder: Complete Your Application"
                    queue_email(
                        recipient_email=app.email,
                        subject=email_subject,
                        body=(
                            f"<p>Dear {app.full_name},</p>"
                            f"<p>{message}</p>"
                            f"<p>Best regards,<br>MIHAS Admissions</p>"
                        ),
                    )
                    reminders_sent += 1
                except Exception:
                    logger.exception(
                        "Failed to send draft reminder for application %s", app.id
                    )

        if reminders_sent or expired_count:
            logger.info(
                "draft_expiry_reminder_task: sent %d reminders, expired %d drafts",
                reminders_sent,
                expired_count,
            )
        return {"reminders_sent": reminders_sent, "expired": expired_count}
    finally:
        _release_task_lock("draft_expiry_reminder_task")

@shared_task(bind=True, max_retries=0)
def review_sla_reminder_task(self):
    """Notify admins about applications exceeding the review SLA threshold.

    Runs daily at 07:00 UTC. Finds submitted/under_review applications
    older than the SLA threshold (default 5 days, configurable via
    SystemSetting key 'review_sla_days') and notifies all admin users.
    Requirements: 4.6–4.8
    """
    if not _acquire_task_lock("review_sla_reminder_task"):
        logger.info("review_sla_reminder_task: skipped (already running)")
        return
    try:
        from apps.accounts.models import Profile
        from apps.applications.models import Application
        from apps.common.models import Notification, Setting
        from apps.common.outbox import create_notification, queue_email

        # Read configurable SLA threshold
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

        # Build summary of overdue applications
        app_summaries = []
        for app in overdue_apps[:50]:  # Cap at 50 to keep notification manageable
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

        # Notify all admin and super_admin users
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
        _release_task_lock("review_sla_reminder_task")

@shared_task(bind=True, max_retries=0)
def condition_expiry_task(self):
    """Expire overdue conditions and trigger auto-rejection if needed.

    Runs daily at 05:00 UTC. Finds conditions past their deadline with
    status 'pending', transitions each to 'expired', notifies the student,
    and checks if all conditions for the application are now resolved.
    If all resolved and any expired → auto-reject via ConditionManager.
    Requirements: 5.6, 5.7, 5.8
    """
    if not _acquire_task_lock("condition_expiry_task"):
        logger.info("condition_expiry_task: skipped (already running)")
        return
    try:
        from apps.applications.condition_manager import ConditionManager
        from apps.applications.models import Application, ApplicationCondition
        from apps.common.outbox import create_notification, queue_email

        today = timezone.now().date()

        expired_conditions = ApplicationCondition.objects.filter(
            status="pending",
            deadline__lt=today,
        ).select_related("application")
        affected_app_ids = set(
            expired_conditions.values_list("application_id", flat=True)
        )

        expired_count = 0
        auto_rejected = 0

        for condition in expired_conditions:
            try:
                condition.status = "expired"
                condition.save(update_fields=["status", "updated_at"])
                expired_count += 1

                # Notify student about the expired condition (Req 5.7)
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
                        f"<p>Best regards,<br>MIHAS Admissions</p>"
                    ),
                )

            except Exception:
                logger.exception(
                    "Failed to expire condition %s for application %s",
                    condition.id,
                    condition.application_id,
                )

        # After expiring conditions, check each affected application for
        # auto-rejection (Req 5.8): all conditions resolved + any expired → reject.
        for app_id in affected_app_ids:
            try:
                promoted = ConditionManager.auto_promote_if_all_met(str(app_id))
                if promoted:
                    # auto_promote_if_all_met handles rejection when expired exist
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
        _release_task_lock("condition_expiry_task")

@shared_task(bind=True, max_retries=0)
def enrollment_confirmation_expiry_task(self):
    """Expire approved applications past their enrollment confirmation deadline.

    Runs daily at 09:00 UTC. Finds approved/conditionally_approved applications
    past their enrollment_confirmation_deadline, transitions to enrollment_expired,
    decrements enrollment, and triggers waitlist promotion.

    Also sends reminders 3 days before deadline.

    Requirements: 10.6–10.8, 10.10
    """
    if not _acquire_task_lock("enrollment_confirmation_expiry_task"):
        logger.info("enrollment_confirmation_expiry_task: skipped (already running)")
        return
    try:
        from apps.applications.enrollment_service import EnrollmentService
        from apps.applications.intake_enforcer import IntakeEnforcer
        from apps.applications.models import Application
        from apps.applications.services import (
            SYSTEM_ACTOR_ID,
            transition_application_status,
        )
        from apps.applications.waitlist_manager import WaitlistManager

        now = timezone.now()
        expired_count = 0
        reminder_count = 0

        # --- Expire past-deadline applications ---
        expired_apps = Application.objects.filter(
            status__in=["approved", "conditionally_approved"],
            enrollment_confirmation_deadline__isnull=False,
            enrollment_confirmation_deadline__lt=now,
        )

        for app in expired_apps:
            try:
                transition_application_status(
                    application=app,
                    new_status="enrollment_expired",
                    changed_by=SYSTEM_ACTOR_ID,
                    notes="Enrollment confirmation deadline passed.",
                )
                IntakeEnforcer.decrement_enrollment(app.intake, app.program)

                # Send notification
                try:
                    from apps.common.communication_service import CommunicationService
                    CommunicationService.send("enrollment_expired", app)
                except Exception:
                    logger.exception("Failed to send enrollment expiry notification for app=%s", app.id)

                # Trigger waitlist promotion (Req 10.7, 3.7)
                try:
                    WaitlistManager.promote_next(app.program, app.intake)
                except Exception:
                    logger.exception("Failed to trigger waitlist promotion after enrollment expiry for app=%s", app.id)

                expired_count += 1
            except Exception:
                logger.exception("Failed to expire enrollment for app=%s", app.id)

        # --- Send reminders 3 days before deadline (Req 10.10) ---
        reminder_threshold = now + timedelta(days=3)
        reminder_apps = Application.objects.filter(
            status__in=["approved", "conditionally_approved"],
            enrollment_confirmation_deadline__isnull=False,
            enrollment_confirmation_deadline__gt=now,
            enrollment_confirmation_deadline__lte=reminder_threshold,
        )

        for app in reminder_apps:
            try:
                from apps.common.models import Notification

                # Deduplicate: skip if reminder already sent in last 24 hours
                recent_reminder = Notification.objects.filter(
                    user_id=app.user_id,
                    title__icontains="Confirm Your Enrollment",
                    created_at__gte=now - timedelta(hours=24),
                ).exists()

                if not recent_reminder:
                    from apps.common.communication_service import CommunicationService

                    days_left = (app.enrollment_confirmation_deadline - now).days
                    CommunicationService.send(
                        "enrollment_confirmation_reminder",
                        app,
                        {"deadline_date": str(app.enrollment_confirmation_deadline.date()), "days_until_expiry": str(days_left)},
                    )
                    reminder_count += 1
            except Exception:
                logger.exception("Failed to send enrollment reminder for app=%s", app.id)

        if expired_count or reminder_count:
            logger.info(
                "enrollment_confirmation_expiry_task: expired %d, reminders %d",
                expired_count, reminder_count,
            )
        return {"expired": expired_count, "reminders": reminder_count}
    finally:
        _release_task_lock("enrollment_confirmation_expiry_task")

@shared_task(bind=True, max_retries=0)
def waitlist_cascade_task(self):
    """Cascade waitlisted applications to the next intake.

    Runs daily at 10:00 UTC. Finds intakes past end_date with waitlisted
    applications, creates draft applications for the next intake pre-populated
    with student data, and notifies students.

    Requirements: 15.3–15.6
    """
    if not _acquire_task_lock("waitlist_cascade_task"):
        logger.info("waitlist_cascade_task: skipped (already running)")
        return
    try:
        from apps.applications.models import Application
        from apps.catalog.models import Intake
        from apps.common.models import Setting

        now = timezone.now().date()

        # Check multi_intake_policy
        policy = "unrestricted"
        try:
            setting = Setting.objects.filter(key="multi_intake_policy").first()
            if setting and setting.value:
                policy = str(setting.value)
        except Exception:
            pass

        if policy != "waitlist_cascade":
            return {"policy": policy, "cascaded": 0}

        cascaded_count = 0

        # Find intakes past end_date
        closed_intakes = Intake.objects.filter(
            end_date__lt=now,
            is_active=True,
        )

        for intake in closed_intakes:
            # Find waitlisted applications for this intake
            waitlisted_apps = Application.objects.filter(
                intake=intake.name,
                status="waitlisted",
            )

            if not waitlisted_apps.exists():
                continue

            # Find next available intake for the same programs
            next_intake = Intake.objects.filter(
                start_date__gt=intake.end_date,
                is_active=True,
            ).order_by("start_date").first()

            if not next_intake:
                continue

            for app in waitlisted_apps:
                try:
                    # Check if student already has an application for next intake
                    existing = Application.objects.filter(
                        user_id=app.user_id,
                        program=app.program,
                        intake=next_intake.name,
                    ).exists()

                    if existing:
                        continue

                    # Create draft application pre-populated with student data
                    import uuid as uuid_mod
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

                    # Notify student (Req 15.4)
                    try:
                        from apps.common.outbox import create_notification, queue_email

                        create_notification(
                            user_id=app.user_id,
                            title="Application Carried Forward",
                            message=(
                                f"Your application for {app.program} ({intake.name}) was not promoted from the waitlist. "
                                f"We've carried your application forward to {next_intake.name}. "
                                f"Please review and submit."
                            ),
                            type="info",
                            priority="normal",
                        )

                        email_body = (
                            f"<p>Dear {app.full_name},</p>"
                            f"<p>Your application for <strong>{app.program}</strong> ({intake.name}) "
                            f"was not promoted from the waitlist.</p>"
                            f"<p>We've carried your application forward to <strong>{next_intake.name}</strong>. "
                            f"Please log in to review and submit your new application.</p>"
                            f"<p>Best regards,<br>MIHAS Admissions</p>"
                        )

                        queue_email(
                            recipient_email=app.email,
                            subject=f"Application Carried Forward — {app.program}",
                            body=email_body,
                        )
                    except Exception:
                        logger.exception("Failed to notify student for cascade app=%s", app.id)

                    cascaded_count += 1
                except Exception:
                    logger.exception("Failed to cascade app=%s to next intake", app.id)

        logger.info("waitlist_cascade_task: cascaded %d applications", cascaded_count)
        return {"cascaded": cascaded_count}
    finally:
        _release_task_lock("waitlist_cascade_task")

@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def generate_acceptance_letter_task(self, application_id):
    """Generate acceptance letter PDF, store in R2, create ApplicationDocument.

    Downloads application details, renders a single-page PDF via reportlab,
    uploads to R2 via MediaStorage, and creates an ApplicationDocument record.

    Retry delays: 60s, 120s, 240s (exponential backoff).
    """
    from apps.applications.models import Application
    from apps.documents.models import ApplicationDocument

    try:
        application = Application.objects.get(id=application_id)
    except Application.DoesNotExist:
        logger.error("Application %s not found", application_id)
        return

    try:
        from apps.common.storage import MediaStorage

        # Generate PDF
        pdf_buffer = _generate_acceptance_letter_pdf(application)

        # Upload to R2
        storage = MediaStorage()
        filename = f"acceptance-letters/{application_id}/{uuid.uuid4().hex}.pdf"
        stored_name = storage.save(filename, pdf_buffer)
        file_url = storage.url(stored_name)

        # Create ApplicationDocument record
        ApplicationDocument.objects.create(
            application=application,
            document_type="acceptance_letter",
            document_name=f"Acceptance Letter - {application.full_name}.pdf",
            file_url=file_url,
            file_size=pdf_buffer.getbuffer().nbytes,
            mime_type="application/pdf",
            system_generated=True,
            verification_status="verified",
            uploaded_at=timezone.now(),
        )

        logger.info(
            "Acceptance letter generated for application %s", application_id
        )

    except Exception as exc:
        logger.warning(
            "Acceptance letter generation failed for application %s (attempt %d/%d): %s",
            application_id,
            self.request.retries + 1,
            self.max_retries + 1,
            str(exc),
        )

        if self.request.retries >= self.max_retries:
            logger.error(
                "Acceptance letter generation permanently failed for application %s",
                application_id,
            )
            return

        # Exponential backoff: 60s, 120s, 240s
        backoff = 60 * (2 ** self.request.retries)
        raise self.retry(exc=exc, countdown=backoff)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def generate_finance_receipt_task(self, application_id):
    """Generate finance receipt PDF, store in R2, create ApplicationDocument.

    Downloads application and payment details, renders a single-page PDF via
    reportlab, uploads to R2 via MediaStorage, and creates an ApplicationDocument record.

    Retry delays: 60s, 120s, 240s (exponential backoff).
    """
    from apps.applications.models import Application
    from apps.documents.models import ApplicationDocument, Payment

    try:
        application = Application.objects.get(id=application_id)
    except Application.DoesNotExist:
        logger.error("Application %s not found", application_id)
        return

    try:
        from apps.common.storage import MediaStorage

        # Get the verified payment for receipt details
        payment = Payment.objects.filter(
            application_id=application.id, status__in=("successful", "force_approved")
        ).first()

        # Generate PDF
        pdf_buffer = _generate_finance_receipt_pdf(application, payment)

        # Upload to R2
        storage = MediaStorage()
        filename = f"finance-receipts/{application_id}/{uuid.uuid4().hex}.pdf"
        stored_name = storage.save(filename, pdf_buffer)
        file_url = storage.url(stored_name)

        # Create ApplicationDocument record
        ApplicationDocument.objects.create(
            application=application,
            document_type="finance_receipt",
            document_name=f"Finance Receipt - {application.full_name}.pdf",
            file_url=file_url,
            file_size=pdf_buffer.getbuffer().nbytes,
            mime_type="application/pdf",
            system_generated=True,
            verification_status="verified",
            uploaded_at=timezone.now(),
        )

        logger.info(
            "Finance receipt generated for application %s", application_id
        )

    except Exception as exc:
        logger.warning(
            "Finance receipt generation failed for application %s (attempt %d/%d): %s",
            application_id,
            self.request.retries + 1,
            self.max_retries + 1,
            str(exc),
        )

        if self.request.retries >= self.max_retries:
            logger.error(
                "Finance receipt generation permanently failed for application %s",
                application_id,
            )
            return

        # Exponential backoff: 60s, 120s, 240s
        backoff = 60 * (2 ** self.request.retries)
        raise self.retry(exc=exc, countdown=backoff)


def _generate_acceptance_letter_pdf(application):
    """Render a simple single-page acceptance letter PDF using reportlab."""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import cm
    from reportlab.pdfgen import canvas

    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4

    # Header
    c.setFont("Helvetica-Bold", 18)
    c.drawCentredString(width / 2, height - 3 * cm, "ACCEPTANCE LETTER")

    # Institution line
    c.setFont("Helvetica", 12)
    c.drawCentredString(width / 2, height - 4.2 * cm, application.institution)

    # Date
    c.setFont("Helvetica", 10)
    c.drawString(2 * cm, height - 6 * cm, f"Date: {timezone.now().strftime('%d %B %Y')}")

    # Application details
    y = height - 7.5 * cm
    c.setFont("Helvetica", 11)
    details = [
        f"Application Number: {application.application_number}",
        f"Applicant Name: {application.full_name}",
        f"Program: {application.program}",
        f"Intake: {application.intake}",
        f"Status: {application.status.title()}",
    ]
    for line in details:
        c.drawString(2 * cm, y, line)
        y -= 0.7 * cm

    # Body text
    y -= 1 * cm
    c.setFont("Helvetica", 11)
    body_lines = [
        f"Dear {application.full_name},",
        "",
        "We are pleased to inform you that your application has been accepted.",
        f"You have been offered a place in the {application.program} program",
        f"for the {application.intake} intake at {application.institution}.",
        "",
        "Please ensure all required documents are submitted and fees are paid",
        "before the commencement of the academic session.",
        "",
        "Congratulations and welcome!",
    ]
    for line in body_lines:
        c.drawString(2 * cm, y, line)
        y -= 0.6 * cm

    c.showPage()
    c.save()
    buffer.seek(0)
    return buffer


def _generate_finance_receipt_pdf(application, payment):
    """Render a simple single-page finance receipt PDF using reportlab."""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import cm
    from reportlab.pdfgen import canvas

    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4

    # Header
    c.setFont("Helvetica-Bold", 18)
    c.drawCentredString(width / 2, height - 3 * cm, "FINANCE RECEIPT")

    # Institution line
    c.setFont("Helvetica", 12)
    c.drawCentredString(width / 2, height - 4.2 * cm, application.institution)

    # Date
    c.setFont("Helvetica", 10)
    c.drawString(2 * cm, height - 6 * cm, f"Date: {timezone.now().strftime('%d %B %Y')}")

    # Application details
    y = height - 7.5 * cm
    c.setFont("Helvetica", 11)
    details = [
        f"Application Number: {application.application_number}",
        f"Applicant Name: {application.full_name}",
        f"Program: {application.program}",
    ]

    # Payment details (if available)
    if payment:
        details.extend([
            f"Amount Paid: {payment.amount} {payment.currency}",
            f"Payment Method: {payment.payment_method or 'N/A'}",
            f"Transaction Reference: {payment.transaction_reference or 'N/A'}",
            f"Receipt Number: {payment.receipt_number or 'N/A'}",
            f"Payment Date: {payment.verified_at.strftime('%d %B %Y') if payment.verified_at else 'N/A'}",
        ])
    else:
        details.append("Payment: Details not available")

    for line in details:
        c.drawString(2 * cm, y, line)
        y -= 0.7 * cm

    # Footer note
    y -= 1 * cm
    c.setFont("Helvetica", 10)
    c.drawString(2 * cm, y, "This is a system-generated receipt.")
    y -= 0.5 * cm
    c.drawString(2 * cm, y, "For queries, contact the finance office.")

    c.showPage()
    c.save()
    buffer.seek(0)
    return buffer
