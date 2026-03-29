"""Document Celery tasks — OCR text extraction.

Implements task 17.3.
Requirements: 6.3, 12.2
"""

import logging
import tempfile

from celery import shared_task

logger = logging.getLogger(__name__)


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
