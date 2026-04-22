"""Document Celery tasks — OCR text extraction and payment polling.

Implements task 17.3 (OCR) and task 7.1 (Lenco payment polling).
Requirements: 6.3, 12.1, 12.2, 12.3, 12.4, 12.5, 12.6
"""

import logging
import tempfile
from datetime import timedelta

from celery import shared_task
from django.core.cache import cache
from django.db import transaction
from django.utils import timezone

logger = logging.getLogger(__name__)


def _acquire_task_lock(task_name: str, timeout: int = 600) -> bool:
    return cache.add(f"celery_lock:{task_name}", "1", timeout=timeout)


def _release_task_lock(task_name: str):
    cache.delete(f"celery_lock:{task_name}")


@shared_task(bind=True, max_retries=0, soft_time_limit=300, time_limit=360)
def poll_pending_payments_task(self):
    """Every 10 minutes: query pending payments 5min–24hr old, verify via Lenco API, max 50 per run.
    Also expires payments pending > 24 hours.

    Requirements: 8.1–8.3, 12.1, 12.2, 12.3, 12.4, 12.5, 12.6
    """
    if not _acquire_task_lock("poll_pending_payments_task"):
        logger.info("poll_pending_payments_task: skipped (already running)")
        return
    try:
        from apps.documents.models import Payment
        from apps.documents.payment_service import PaymentService

        now = timezone.now()
        five_minutes_ago = now - timedelta(minutes=5)
        twenty_four_hours_ago = now - timedelta(hours=24)

        # --- Expire payments pending > 24 hours (Req 8.1, 8.2, 8.3) ---
        expired_payments = list(
            Payment.objects.filter(
                status='pending',
                created_at__lt=twenty_four_hours_ago,
            )[:50]
        )
        expired_count = 0
        for payment in expired_payments:
            try:
                with transaction.atomic():
                    # Re-fetch with lock to prevent race with concurrent webhook
                    locked_payment = (
                        Payment.objects.select_for_update()
                        .filter(id=payment.id, status='pending')
                        .first()
                    )
                    if locked_payment is None:
                        # Status already changed (e.g., webhook marked successful)
                        continue
                    locked_payment.status = 'expired'
                    locked_payment.updated_at = now
                    locked_payment.save(update_fields=['status', 'updated_at'])
                expired_count += 1
                logger.info("Payment %s expired (pending > 24h)", payment.id)

                # Notify student via CommunicationService
                try:
                    from apps.applications.models import Application
                    from apps.common.communication_service import CommunicationService

                    app = Application.objects.filter(id=payment.application_id).first()
                    if app:
                        CommunicationService.send("payment_expired", app)
                except Exception:
                    logger.exception("Failed to notify student about expired payment %s", payment.id)
            except Exception:
                logger.exception("Failed to expire payment %s", payment.id)

        if expired_count:
            logger.info("poll_pending_payments_task: expired %d payments", expired_count)

        # --- Verify payments 5min–24hr old via Lenco API ---
        pending_payments = Payment.objects.filter(
            status='pending',
            created_at__lt=five_minutes_ago,
            created_at__gt=twenty_four_hours_ago,
        )[:50]

        count = len(pending_payments)
        logger.info("poll_pending_payments_task: found %d pending payments to verify", count)

        if count == 0:
            return

        service = PaymentService()

        failures = 0
        for payment in pending_payments:
            try:
                logger.info(
                    "Verifying pending payment %s (ref=%s, created=%s)",
                    payment.id,
                    payment.transaction_reference,
                    payment.created_at,
                )
                result = service.verify_payment(payment.id)
                logger.info(
                    "Verification result for payment %s: status=%s error=%s",
                    payment.id,
                    result.status,
                    result.error,
                )
            except Exception:
                logger.exception(
                    "Failed to verify payment %s during polling", payment.id
                )
                failures += 1

        if failures > 0 and failures == count:
            # All verifications failed — likely Lenco API outage
            import sentry_sdk
            msg = f"Payment polling: all {failures} verifications failed. Possible Lenco API outage."
            logger.error(msg)
            sentry_sdk.capture_message(msg, level="error")
    finally:
        _release_task_lock("poll_pending_payments_task")

@shared_task(bind=True, max_retries=3, default_retry_delay=60, soft_time_limit=120, time_limit=180)
def extract_document_text_task(self, document_id):
    """Run pytesseract OCR on an uploaded document and store extracted text.

    Downloads the file from S3/R2, extracts text using AI vision (Vercel AI Gateway),
    and saves the extracted text to the ApplicationDocument record.
    Falls back to pytesseract if AI is unavailable.

    Retry delays: 60s, 120s, 240s (exponential backoff).
    """
    from apps.documents.models import ApplicationDocument

    try:
        document = ApplicationDocument.objects.get(id=document_id)
    except ApplicationDocument.DoesNotExist:
        logger.error("Document %s not found", document_id)
        return

    if document.extracted_text:
        logger.info("Document %s already has extracted text, skipping", document_id)
        return

    try:
        from apps.common.storage import MediaStorage

        storage = MediaStorage()

        # Download file
        with tempfile.NamedTemporaryFile(suffix=_get_suffix(document.file_key)) as tmp:
            file_obj = storage.open(document.file_key, "rb")
            file_bytes = file_obj.read()
            tmp.write(file_bytes)
            tmp.flush()
            file_obj.close()

            extracted_text = None

            # Try AI vision first (Vercel AI Gateway)
            try:
                from apps.common.ai_service import extract_text_from_image, analyze_document

                mime = "image/jpeg"
                if document.file_key.lower().endswith(".png"):
                    mime = "image/png"
                elif document.file_key.lower().endswith(".pdf"):
                    mime = "application/pdf"

                extracted_text = extract_text_from_image(file_bytes, mime)

                # If we got text, also try structured analysis
                if extracted_text:
                    doc_type = "result_slip" if "slip" in (document.document_type or "").lower() else "identity"
                    analysis = analyze_document(extracted_text, doc_type)
                    if analysis:
                        meta = document.metadata or {}
                        meta["ai_analysis"] = analysis
                        document.metadata = meta

            except Exception:
                logger.info("AI vision unavailable, falling back to Tesseract for document %s", document_id)

            # Fallback to Tesseract if AI didn't work
            if not extracted_text:
                try:
                    import pytesseract
                    from PIL import Image

                    if document.file_key.lower().endswith(".pdf"):
                        try:
                            from pdf2image import convert_from_path
                            images = convert_from_path(tmp.name)
                            text_parts = [pytesseract.image_to_string(img) for img in images]
                            extracted_text = "\n".join(text_parts)
                        except ImportError:
                            extracted_text = pytesseract.image_to_string(tmp.name)
                    else:
                        image = Image.open(tmp.name)
                        extracted_text = pytesseract.image_to_string(image)
                except Exception:
                    logger.warning("Tesseract fallback also failed for document %s", document_id)

        if extracted_text:
            document.extracted_text = extracted_text.strip()
        document.save()
        logger.info("OCR completed for document %s (%d chars)", document_id, len(document.extracted_text or ""))

    except Exception as exc:
        logger.warning(
            "OCR failed for document %s (attempt %d/%d): %s",
            document_id,
            self.request.retries + 1,
            self.max_retries + 1,
            str(exc),
        )

        if self.request.retries >= self.max_retries:
            document.verification_status = "ocr_failed"
            document.save()
            logger.error("OCR permanently failed for document %s", document_id)
            return

        # Exponential backoff: 60s, 120s, 240s
        backoff = 60 * (2 ** self.request.retries)
        raise self.retry(exc=exc, countdown=backoff)


def _get_suffix(file_key):
    """Extract file extension from the S3 key."""
    if "." in file_key:
        return "." + file_key.rsplit(".", 1)[-1]
    return ".bin"


@shared_task(bind=True, max_retries=0, soft_time_limit=300, time_limit=360)
def deferred_payment_reminder_task(self):
    """Daily 11:00 UTC: remind students with deferred payments older than 3 days."""
    if not _acquire_task_lock("deferred_payment_reminder_task"):
        logger.info("deferred_payment_reminder_task: skipped (already running)")
        return
    try:
        from apps.applications.models import Application
        from apps.common.communication_service import CommunicationService

        cutoff = timezone.now() - timedelta(days=3)
        apps = list(
            Application.objects.filter(
                payment_status='deferred',
                updated_at__lt=cutoff,
            )[:100]
        )

        sent = 0
        for app in apps:
            try:
                CommunicationService.send('deferred_payment_reminder', app)
                sent += 1
            except Exception:
                logger.exception("Failed to send deferred payment reminder for app %s", app.id)

        logger.info("deferred_payment_reminder_task: sent %d reminders", sent)
        return {"sent": sent}
    finally:
        _release_task_lock("deferred_payment_reminder_task")


@shared_task(bind=True, max_retries=0, soft_time_limit=300, time_limit=360)
def document_verification_sla_task(self):
    """Daily 08:00 UTC: find documents pending verification beyond SLA threshold.

    Notifies admins for documents exceeding the SLA threshold (default 5 days).
    Escalates at 2x threshold by sending alert email to ERROR_ALERT_EMAIL.

    Implements task 11.1.
    Requirements: 7.1–7.5
    """
    if not _acquire_task_lock("document_verification_sla_task"):
        logger.info("document_verification_sla_task: skipped (already running)")
        return
    try:
        from django.conf import settings

        from apps.accounts.models import Profile
        from apps.common.models import Setting
        from apps.common.outbox import create_notification, queue_email
        from apps.documents.models import ApplicationDocument

        # Read configurable SLA threshold
        sla_days = 5
        try:
            setting = Setting.objects.filter(key="document_verification_sla_days").first()
            if setting and setting.value is not None:
                sla_days = int(setting.value)
        except Exception:
            logger.exception("Failed to read document_verification_sla_days setting")

        now = timezone.now()
        sla_cutoff = now - timedelta(days=sla_days)
        escalation_cutoff = now - timedelta(days=sla_days * 2)

        # Find documents pending beyond SLA threshold
        overdue_docs = list(
            ApplicationDocument.objects.filter(
                verification_status="pending",
                created_at__lt=sla_cutoff,
            ).select_related("application")[:100]
        )

        if not overdue_docs:
            logger.info("document_verification_sla_task: no overdue documents found")
            return {"notified": 0, "escalated": 0}

        # Split into standard overdue and escalation-level
        standard_docs = []
        escalation_docs = []
        for doc in overdue_docs:
            age_days = (now - doc.created_at).days if doc.created_at else 0
            if doc.created_at and doc.created_at < escalation_cutoff:
                escalation_docs.append((doc, age_days))
            else:
                standard_docs.append((doc, age_days))

        # Build document list for notification
        doc_list_html = "".join(
            f"<li>{doc.document_type} (App: {doc.application_id}) — {age} days pending</li>"
            for doc, age in overdue_docs_with_age(overdue_docs, now)
        )

        # Notify all admins
        admins = list(Profile.objects.filter(role__in=["admin", "super_admin"]))
        notified = 0
        for admin in admins:
            try:
                create_notification(
                    user_id=admin.id,
                    title="Documents Pending Verification Beyond SLA",
                    message=f"{len(overdue_docs)} document(s) have exceeded the {sla_days}-day verification SLA.",
                    type="warning",
                    priority="high",
                )
                notified += 1
            except Exception:
                logger.exception("Failed to notify admin %s about SLA breach", admin.id)

        # Send summary email to admins
        if overdue_docs:
            try:
                email_body = (
                    f"<p>The following {len(overdue_docs)} document(s) have been pending "
                    f"verification beyond the {sla_days}-day SLA threshold:</p>"
                    f"<ul>{doc_list_html}</ul>"
                )
                for admin in admins:
                    queue_email(
                        recipient_email=admin.email,
                        subject=f"ALERT: {len(overdue_docs)} Documents Pending Verification",
                        body=email_body,
                    )
            except Exception:
                logger.exception("Failed to send SLA breach email")

        # Escalation at 2x threshold
        escalated = 0
        if escalation_docs:
            try:
                escalation_list = "".join(
                    f"<li>{doc.document_type} (App: {doc.application_id}) — {age} days pending</li>"
                    for doc, age in escalation_docs
                )
                escalation_body = (
                    f"<p><strong>ESCALATION:</strong> The following {len(escalation_docs)} document(s) "
                    f"have been pending verification for more than {sla_days * 2} days:</p>"
                    f"<ul>{escalation_list}</ul>"
                )
                queue_email(
                    recipient_email=getattr(settings, "ERROR_ALERT_EMAIL", ""),
                    subject=f"ESCALATION: Documents pending verification for {sla_days * 2}+ days",
                    body=escalation_body,
                )
                escalated = len(escalation_docs)
            except Exception:
                logger.exception("Failed to send escalation email")

        logger.info(
            "document_verification_sla_task: %d overdue, %d admins notified, %d escalated",
            len(overdue_docs), notified, escalated,
        )
        return {"notified": notified, "escalated": escalated}
    finally:
        _release_task_lock("document_verification_sla_task")


def overdue_docs_with_age(docs, now):
    """Yield (doc, age_days) tuples."""
    for doc in docs:
        age = (now - doc.created_at).days if doc.created_at else 0
        yield doc, age
