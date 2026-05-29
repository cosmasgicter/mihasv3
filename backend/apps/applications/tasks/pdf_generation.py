"""PDF generation tasks (acceptance letter, finance receipt)."""

import io
import logging
import uuid

from celery import shared_task
from django.utils import timezone

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def generate_acceptance_letter_task(self, application_id):
    """Generate acceptance letter PDF, store in R2, create ApplicationDocument.

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

        pdf_buffer = _generate_acceptance_letter_pdf(application)

        storage = MediaStorage()
        filename = f"acceptance-letters/{application_id}/{uuid.uuid4().hex}.pdf"
        stored_name = storage.save(filename, pdf_buffer)
        file_url = storage.url(stored_name)

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

        backoff = 60 * (2 ** self.request.retries)
        raise self.retry(exc=exc, countdown=backoff)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def generate_finance_receipt_task(self, application_id):
    """Generate finance receipt PDF, store in R2, create ApplicationDocument.

    Retry delays: 60s, 120s, 240s (exponential backoff).
    """
    from apps.applications.models import Application
    from apps.documents.models import ApplicationDocument, Payment
    from apps.documents.payment_constants import RECEIPT_ELIGIBLE_STATUSES

    try:
        application = Application.objects.get(id=application_id)
    except Application.DoesNotExist:
        logger.error("Application %s not found", application_id)
        return

    try:
        from apps.common.storage import MediaStorage

        payment = Payment.objects.filter(
            application_id=application.id, status__in=RECEIPT_ELIGIBLE_STATUSES
        ).first()

        pdf_buffer = _generate_finance_receipt_pdf(application, payment)

        storage = MediaStorage()
        filename = f"finance-receipts/{application_id}/{uuid.uuid4().hex}.pdf"
        stored_name = storage.save(filename, pdf_buffer)
        file_url = storage.url(stored_name)

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

    c.setFont("Helvetica-Bold", 18)
    c.drawCentredString(width / 2, height - 3 * cm, "ACCEPTANCE LETTER")

    c.setFont("Helvetica", 12)
    c.drawCentredString(width / 2, height - 4.2 * cm, application.institution)

    c.setFont("Helvetica", 10)
    c.drawString(2 * cm, height - 6 * cm, f"Date: {timezone.now().strftime('%d %B %Y')}")

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

    c.setFont("Helvetica-Bold", 18)
    c.drawCentredString(width / 2, height - 3 * cm, "FINANCE RECEIPT")

    c.setFont("Helvetica", 12)
    c.drawCentredString(width / 2, height - 4.2 * cm, application.institution)

    c.setFont("Helvetica", 10)
    c.drawString(2 * cm, height - 6 * cm, f"Date: {timezone.now().strftime('%d %B %Y')}")

    y = height - 7.5 * cm
    c.setFont("Helvetica", 11)
    details = [
        f"Application Number: {application.application_number}",
        f"Applicant Name: {application.full_name}",
        f"Program: {application.program}",
    ]

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

    y -= 1 * cm
    c.setFont("Helvetica", 10)
    c.drawString(2 * cm, y, "This is a system-generated receipt.")
    y -= 0.5 * cm
    c.drawString(2 * cm, y, "For queries, contact the finance office.")

    c.showPage()
    c.save()
    buffer.seek(0)
    return buffer
