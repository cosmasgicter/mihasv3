"""Document Celery tasks — OCR text extraction and payment polling.

Implements task 17.3 (OCR) and task 7.1 (Lenco payment polling).
Requirements: 6.3, 12.1, 12.2, 12.3, 12.4, 12.5, 12.6
"""

import logging
import tempfile
from datetime import timedelta

from celery import shared_task
from django.db import transaction
from django.utils import timezone

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=0, soft_time_limit=300, time_limit=360)
def poll_pending_payments_task(self):
    """Every 10 minutes: query pending payments 5min–24hr old, verify via Lenco API, max 50 per run.
    Also expires payments pending > 24 hours.

    Requirements: 8.1–8.3, 12.1, 12.2, 12.3, 12.4, 12.5, 12.6
    """
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
        from django.conf import settings
        from django.core.cache import cache
        cache_key = "alert:payment_poll_all_failed"
        if cache.add(cache_key, "1", timeout=900):  # 15-min throttle
            from apps.common.models import ErrorLog, EmailQueue
            from apps.common.tasks import send_email_task
            msg = f"Payment polling: all {failures} verifications failed. Possible Lenco API outage."
            ErrorLog.objects.create(source="celery", level="error", message=msg)
            email = EmailQueue.objects.create(
                recipient_email=settings.ERROR_ALERT_EMAIL,
                subject="[ALERT] Payment verification failures",
                body=f"<p>{msg}</p>",
                status="pending",
            )
            send_email_task.delay(str(email.id))


@shared_task(bind=True, max_retries=3, default_retry_delay=60, soft_time_limit=120, time_limit=180)
def extract_document_text_task(self, document_id):
    """Run pytesseract OCR on an uploaded document and store extracted text.

    Downloads the file from S3/R2, runs OCR via pytesseract, and saves
    the extracted text to the ApplicationDocument record.

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
        import pytesseract
        from PIL import Image

        from apps.common.storage import MediaStorage

        storage = MediaStorage()

        # Download file to a temp location.
        with tempfile.NamedTemporaryFile(suffix=_get_suffix(document.file_key)) as tmp:
            file_obj = storage.open(document.file_key, "rb")
            tmp.write(file_obj.read())
            tmp.flush()
            file_obj.close()

            # Run OCR — pytesseract handles PDF and image formats.
            if document.file_key.lower().endswith(".pdf"):
                # For PDFs, use pdf_to_string if available, otherwise
                # convert pages to images first.
                try:
                    from pdf2image import convert_from_path

                    images = convert_from_path(tmp.name)
                    text_parts = [pytesseract.image_to_string(img) for img in images]
                    extracted_text = "\n".join(text_parts)
                except ImportError:
                    logger.warning("pdf2image not available, attempting direct OCR on PDF")
                    extracted_text = pytesseract.image_to_string(tmp.name)
            else:
                image = Image.open(tmp.name)
                extracted_text = pytesseract.image_to_string(image)

        document.extracted_text = extracted_text.strip()
        document.save()
        logger.info("OCR completed for document %s (%d chars)", document_id, len(document.extracted_text))

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
def document_verification_sla_task(self):
    """Daily 08:00 UTC: find documents pending verification beyond SLA threshold.

    Notifies admins for documents exceeding the SLA threshold (default 5 days).
    Escalates at 2x threshold by sending alert email to ERROR_ALERT_EMAIL.

    Implements task 11.1.
    Requirements: 7.1–7.5
    """
    from django.conf import settings

    from apps.accounts.models import Profile
    from apps.common.models import EmailQueue, Notification, Setting
    from apps.common.tasks import send_email_task
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
            Notification.objects.create(
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
                email = EmailQueue.objects.create(
                    recipient_email=admin.email,
                    subject=f"ALERT: {len(overdue_docs)} Documents Pending Verification",
                    body=email_body,
                    status="pending",
                )
                send_email_task.delay(str(email.id))
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
            email = EmailQueue.objects.create(
                recipient_email=getattr(settings, "ERROR_ALERT_EMAIL", "***REMOVED***"),
                subject=f"ESCALATION: Documents pending verification for {sla_days * 2}+ days",
                body=escalation_body,
                status="pending",
            )
            send_email_task.delay(str(email.id))
            escalated = len(escalation_docs)
        except Exception:
            logger.exception("Failed to send escalation email")

    logger.info(
        "document_verification_sla_task: %d overdue, %d admins notified, %d escalated",
        len(overdue_docs), notified, escalated,
    )
    return {"notified": notified, "escalated": escalated}


def overdue_docs_with_age(docs, now):
    """Yield (doc, age_days) tuples."""
    for doc in docs:
        age = (now - doc.created_at).days if doc.created_at else 0
        yield doc, age
