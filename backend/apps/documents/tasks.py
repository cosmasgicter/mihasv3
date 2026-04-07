"""Document Celery tasks — OCR text extraction and payment polling.

Implements task 17.3 (OCR) and task 7.1 (Lenco payment polling).
Requirements: 6.3, 12.1, 12.2, 12.3, 12.4, 12.5, 12.6
"""

import logging
import tempfile
from datetime import timedelta

from celery import shared_task
from django.utils import timezone

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=0)
def poll_pending_payments_task(self):
    """Every 10 minutes: query pending payments 5min–24hr old, verify via Lenco API, max 50 per run.

    Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6
    """
    from apps.documents.models import Payment
    from apps.documents.payment_service import PaymentService

    now = timezone.now()
    five_minutes_ago = now - timedelta(minutes=5)
    twenty_four_hours_ago = now - timedelta(hours=24)

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


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
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
