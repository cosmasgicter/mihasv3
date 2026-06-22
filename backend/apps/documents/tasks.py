"""Document Celery tasks - OCR text extraction and payment polling.

Implements task 17.3 (OCR) and task 7.1 (Lenco payment polling).
Requirements: 6.3, 12.1, 12.2, 12.3, 12.4, 12.5, 12.6
"""

import logging
import tempfile
from datetime import timedelta

from celery import shared_task
from celery.exceptions import SoftTimeLimitExceeded
from django.core.cache import cache
from django.db import transaction
from django.utils import timezone

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Bounded payment-poll configuration (R6.1, R6.2, R6.5)
# ---------------------------------------------------------------------------
#
# These hard-cap the external work a single ``poll_pending_payments_task`` run
# may perform so one slow/flaky Lenco provider cannot block the single Celery
# worker. Each value is an upper bound; settings overrides are clamped to the
# requirement-mandated ceiling so a misconfiguration can only make the task
# *more* conservative, never less.
_POLL_MAX_PAYMENTS_PER_RUN = 10   # R6.1: verify at most 10 payments per run
_POLL_LENCO_TIMEOUT_SECONDS = 10  # R6.2: per external call timeout <= 10s
_POLL_LENCO_MAX_RETRIES = 2       # R6.2: at most 2 retries per external call

# Forward-only ``verify()`` error codes meaning the external call could not be
# completed (timeout/retry exhaustion or provider unreachable). These trigger a
# "skip without status transition" per R6.3 — a still-``pending`` provider
# response (``PAYMENT_PENDING``) or an integrity-gate block is NOT a transport
# failure and is counted as a processed payment.
_PROVIDER_UNAVAILABLE_CODES = frozenset({"PROVIDER_UNAVAILABLE"})


def _clamp(value, low, high, default):
    """Coerce ``value`` to an int within ``[low, high]``, else ``default``."""
    try:
        return max(low, min(high, int(value)))
    except (TypeError, ValueError):
        return default


def _acquire_task_lock(task_name: str, timeout: int = 600) -> bool:
    return cache.add(f"celery_lock:{task_name}", "1", timeout=timeout)


def _release_task_lock(task_name: str):
    cache.delete(f"celery_lock:{task_name}")


@shared_task(bind=True, max_retries=0, soft_time_limit=80, time_limit=90)
def poll_pending_payments_task(self):
    """Every 10 minutes: verify pending payments 5min–24hr old via Lenco, bounded.

    Bounded for worker safety (R6.1, R6.2, R6.5):
    - verifies at most ``_POLL_MAX_PAYMENTS_PER_RUN`` (10) payments per run
    - each external Lenco verification call uses a <=10s timeout and <=2 retries
    - on timeout/retry exhaustion the payment is skipped with NO status
      transition (forward-only rules preserved), the failure is recorded
      (metric + log), and the run continues with the remaining payments
    - ``soft_time_limit``/``time_limit`` (80s/90s) guarantee the run completes
      within 90s wall-clock so the single worker is never blocked longer.

    Expiry of payments pending > 24h is handled separately (and is batched by
    the expiry-task work, R6.4).

    Requirements: 6.1, 6.2, 6.3, 6.5
    """
    if not _acquire_task_lock("poll_pending_payments_task"):
        logger.info("poll_pending_payments_task: skipped (already running)")
        return
    try:
        from django.conf import settings

        from apps.documents.models import Payment
        from apps.documents import payment_metrics
        from apps.documents.payment_service import PaymentService

        forward_only = bool(getattr(settings, "PAYMENT_HARDENING_FORWARD_ONLY", False))
        service = PaymentService()

        # Bounded poll configuration (R6.1, R6.2). Overrides are clamped so a
        # misconfiguration can never exceed the requirement ceilings.
        poll_batch = _clamp(
            getattr(settings, "PAYMENT_POLL_BATCH_SIZE", _POLL_MAX_PAYMENTS_PER_RUN),
            1, _POLL_MAX_PAYMENTS_PER_RUN, _POLL_MAX_PAYMENTS_PER_RUN,
        )
        poll_timeout = _clamp(
            getattr(settings, "PAYMENT_POLL_LENCO_TIMEOUT", _POLL_LENCO_TIMEOUT_SECONDS),
            1, _POLL_LENCO_TIMEOUT_SECONDS, _POLL_LENCO_TIMEOUT_SECONDS,
        )
        poll_retries = _clamp(
            getattr(settings, "PAYMENT_POLL_LENCO_MAX_RETRIES", _POLL_LENCO_MAX_RETRIES),
            0, _POLL_LENCO_MAX_RETRIES, _POLL_LENCO_MAX_RETRIES,
        )

        def _record_poll_outcome(payment_id, *, failed, reason=None):
            """Record one payment's poll outcome (metric + log).

            On a transport failure the payment is skipped with NO status
            transition (R6.3); the caller has already left the payment
            untouched, so this only records the skip.
            """
            if failed:
                logger.warning(
                    "poll_pending_payments_task: skipping payment %s without status "
                    "transition (%s)",
                    payment_id, reason or "verification call failed",
                )
                payment_metrics.increment(
                    "payment.reconcile.processed", tags={"outcome": "failure"},
                )
            else:
                payment_metrics.increment(
                    "payment.reconcile.processed", tags={"outcome": "success"},
                )

        now = timezone.now()
        five_minutes_ago = now - timedelta(
            seconds=int(getattr(settings, "PAYMENT_RECONCILE_MIN_AGE_SECONDS", 300))
        )
        twenty_four_hours_ago = now - timedelta(hours=24)

        # --- Hardened path: delegate expiry + verify to PaymentService ---
        if forward_only:
            try:
                expired_count = service.expire_stale(older_than_hours=24, batch_cap=50)
                if expired_count:
                    logger.info(
                        "poll_pending_payments_task: expired %d payments via PaymentService.expire_stale",
                        expired_count,
                    )
            except Exception:
                logger.exception("poll_pending_payments_task: expire_stale failed")

            pending_payments = list(
                Payment.objects.filter(
                    status='pending',
                    created_at__lt=five_minutes_ago,
                    created_at__gt=twenty_four_hours_ago,
                )[:poll_batch]
            )
            count = len(pending_payments)
            logger.info(
                "poll_pending_payments_task (forward_only): %d payments to verify (batch<=%d)",
                count, poll_batch,
            )
            if count == 0:
                return

            try:
                for payment in pending_payments:
                    try:
                        # Celery worker has no authenticated actor. Use the
                        # hardened verifier with actor_id=None so reconciliation
                        # follows the same state machine and integrity gates as
                        # student/admin verification. Bound the external call so
                        # one flaky provider cannot block the run (R6.2).
                        result = service.verify(
                            payment.id,
                            actor_id=None,
                            lenco_timeout=poll_timeout,
                            lenco_max_retries=poll_retries,
                        )
                        # A provider-unavailable result means the call exhausted
                        # its timeout/retries — skip without transition (R6.3).
                        _record_poll_outcome(
                            payment.id,
                            failed=result.error in _PROVIDER_UNAVAILABLE_CODES,
                            reason=result.error,
                        )
                    except SoftTimeLimitExceeded:
                        raise
                    except Exception:
                        logger.exception(
                            "Failed to verify payment %s during reconcile", payment.id
                        )
                        _record_poll_outcome(payment.id, failed=True, reason="exception")
            except SoftTimeLimitExceeded:
                logger.warning(
                    "poll_pending_payments_task (forward_only): soft time limit reached, "
                    "ending run early; remaining payments retry next run",
                )
            return

        # --- Legacy path: expire payments pending > 24 hours (Req 8.1, 8.2, 8.3) ---
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

                # Sync application payment_status
                service._update_application_payment_status(
                    payment.application_id, 'not_paid'
                )

                # Emit audit via service (ADR-007 compliance)
                service._emit_audit(
                    "payment.transitioned",
                    payment,
                    None,
                    {
                        "source": "reconciliation",
                        "from_status": "pending",
                        "target_status": "expired",
                        "reason": "pending > 24h",
                    },
                )

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

        # --- Verify payments 5min–24hr old via Lenco API (bounded, R6.1/6.2) ---
        pending_payments = Payment.objects.filter(
            status='pending',
            created_at__lt=five_minutes_ago,
            created_at__gt=twenty_four_hours_ago,
        )[:poll_batch]

        count = len(pending_payments)
        logger.info(
            "poll_pending_payments_task: found %d pending payments to verify (batch<=%d)",
            count, poll_batch,
        )

        if count == 0:
            return

        failures = 0
        try:
            for payment in pending_payments:
                try:
                    logger.info(
                        "Verifying pending payment %s (ref=%s, created=%s)",
                        payment.id,
                        payment.transaction_reference,
                        payment.created_at,
                    )
                    result = service.verify_payment(
                        payment.id,
                        lenco_timeout=poll_timeout,
                        lenco_max_retries=poll_retries,
                    )
                    logger.info(
                        "Verification result for payment %s: status=%s error=%s",
                        payment.id,
                        result.status,
                        result.error,
                    )
                    # An error left the payment un-transitioned: the external
                    # call could not yield a verdict (timeout/retry exhaustion
                    # or provider error) — skip without transition (R6.3).
                    failed = result.error is not None
                    if failed:
                        failures += 1
                    _record_poll_outcome(
                        payment.id, failed=failed, reason=result.error,
                    )
                except SoftTimeLimitExceeded:
                    raise
                except Exception:
                    logger.exception(
                        "Failed to verify payment %s during polling", payment.id
                    )
                    failures += 1
                    _record_poll_outcome(payment.id, failed=True, reason="exception")
        except SoftTimeLimitExceeded:
            logger.warning(
                "poll_pending_payments_task: soft time limit reached, ending run "
                "early; remaining payments retry next run",
            )

        if failures > 0 and failures == count:
            # All verifications failed - likely Lenco API outage
            import sentry_sdk
            msg = f"Payment polling: all {failures} verifications failed. Possible Lenco API outage."
            logger.error(msg)
            sentry_sdk.capture_message(msg, level="error")
    finally:
        _release_task_lock("poll_pending_payments_task")

@shared_task(bind=True, max_retries=3, default_retry_delay=60, soft_time_limit=120, time_limit=180)
def extract_document_text_task(self, document_id, force=False):
    """Run OCR on an uploaded document and store extracted text + AI analysis.

    Downloads the file from S3/R2, extracts text using AI vision,
    and saves results to the ApplicationDocument record.
    Falls back to pytesseract if AI is unavailable.
    """
    import json as _json
    from apps.documents.models import ApplicationDocument
    from apps.common.storage import get_document_storage_key

    try:
        document = ApplicationDocument.objects.get(id=document_id)
    except ApplicationDocument.DoesNotExist:
        logger.error("Document %s not found", document_id)
        return

    if document.extracted_text and not force:
        logger.info("Document %s already has extracted text, skipping", document_id)
        return

    if force:
        document.extracted_text = None
        document.verification_notes = None
        document.verification_status = None
        document.save(update_fields=["extracted_text", "verification_notes", "verification_status"])

    file_key = get_document_storage_key(document)
    if not file_key:
        logger.error("Document %s has no file URL", document_id)
        return

    # Mark as processing so the frontend can distinguish "in progress" from "not started"
    document.verification_status = "ocr_processing"
    document.save(update_fields=["verification_status"])

    try:
        from apps.common.storage import MediaStorage

        storage = MediaStorage()

        # Guard against oversized files (max 10MB for OCR)
        MAX_OCR_FILE_SIZE = 10 * 1024 * 1024
        try:
            file_obj = storage.open(file_key, "rb")
            file_bytes = file_obj.read(MAX_OCR_FILE_SIZE + 1)
            file_obj.close()
            if len(file_bytes) > MAX_OCR_FILE_SIZE:
                logger.warning("Document %s exceeds OCR size limit (%d bytes)", document_id, len(file_bytes))
                document.verification_status = "ocr_skipped"
                document.save(update_fields=["verification_status"])
                return
        except Exception:
            logger.exception("Failed to download document %s from storage", document_id)
            raise

        suffix = "." + file_key.rsplit(".", 1)[-1] if "." in file_key else ".tmp"
        with tempfile.NamedTemporaryFile(suffix=suffix) as tmp:
            tmp.write(file_bytes)
            tmp.flush()

            extracted_text = None
            ai_analysis = None

            # Try AI vision first
            try:
                from apps.common.ai_service import extract_text_from_image, analyze_document

                mime = "image/jpeg"
                if file_key.lower().endswith(".png"):
                    mime = "image/png"
                elif file_key.lower().endswith(".pdf"):
                    # Convert first page of PDF to image for vision models
                    try:
                        from pdf2image import convert_from_path
                        images = convert_from_path(tmp.name, first_page=1, last_page=1)
                        if images:
                            import io
                            buf = io.BytesIO()
                            images[0].save(buf, format="JPEG", quality=85)
                            file_bytes = buf.getvalue()
                            mime = "image/jpeg"
                    except ImportError:
                        logger.info("pdf2image not available, sending raw PDF to vision model")
                        mime = "application/pdf"

                extracted_text = extract_text_from_image(file_bytes, mime)

                if extracted_text:
                    doc_type = "result_slip" if "slip" in (document.document_type or "").lower() else "identity"
                    ai_analysis = analyze_document(extracted_text, doc_type)

            except Exception:
                logger.info("AI vision unavailable, falling back to Tesseract for document %s", document_id)

            # Fallback to Tesseract
            if not extracted_text:
                try:
                    import pytesseract
                    from PIL import Image

                    if file_key.lower().endswith(".pdf"):
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
        if ai_analysis:
            document.verification_notes = _json.dumps({"ai_analysis": ai_analysis})
            # Persist ECZ exam metadata when available. Strict validation:
            # exam_number must be 10 or 12 digits; year must be within the
            # last 10 years (defensive against AI hallucination).
            if isinstance(ai_analysis, dict):
                exam_number = ai_analysis.get("exam_number")
                if isinstance(exam_number, (str, int)):
                    digits = "".join(c for c in str(exam_number) if c.isdigit())
                    if len(digits) in (10, 12):
                        document.ecz_exam_number = digits
                exam_year = ai_analysis.get("year")
                if exam_year is not None:
                    try:
                        year_int = int(str(exam_year).strip())
                        current_year = timezone.now().year
                        if current_year - 10 <= year_int <= current_year + 1:
                            document.ecz_exam_year = year_int
                    except (ValueError, TypeError):
                        pass
        subjects = ai_analysis.get("subjects") if isinstance(ai_analysis, dict) else None
        if not extracted_text:
            document.verification_status = "ocr_no_text"
        elif document.document_type == "result_slip" and not subjects:
            document.verification_status = "ocr_no_grades"
            logger.info("OCR found text but no grade subjects for document %s", document_id)
        else:
            document.verification_status = "ocr_complete"
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
    """Daily 11:00 UTC: remind students with deferred payments older than 3 days.

    Bounded to at most 50 records per run (system-performance-hardening R6.4).
    The reminder itself is dispatched per-row through
    ``CommunicationService.send`` because it renders a per-application template
    (subject/body vary per recipient), which is not a single bulk insert.
    """
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
            )[:50]
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
