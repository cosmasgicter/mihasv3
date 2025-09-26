import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import QRCode from 'qrcode';

function safeText(value, fallback = 'Not provided') {
  if (!value) return fallback;
  const cleaned = String(value).replace(/\s+/g, ' ').trim();
  return cleaned.length > 0 ? cleaned : fallback;
}

function formatStatusLabel(value, fallback = 'Unknown') {
  const sanitized = safeText(value, fallback);
  if (sanitized === fallback) {
    return fallback;
  }

  return sanitized
    .split(/[_-]/)
    .map(part => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(' ');
}

function formatDateTime(value) {
  if (!value) return 'Not available';

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Not available';
  }

  const datePart = parsed.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  const timePart = parsed.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit'
  });

  return `${datePart} ${timePart}`;
}

function buildTrackingUrl(code) {
  const baseUrl = process.env.VITE_APP_BASE_URL || '***REMOVED***';
  return `${baseUrl}/track-application?code=${encodeURIComponent(code)}`;
}

export async function generateApplicationSlip(data) {
  if (!data || !data.application_number || !data.public_tracking_code) {
    throw new Error('Missing application data for slip generation');
  }

  try {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.setTitle(`Application Slip - ${safeText(data.application_number, 'Unknown')}`);
    pdfDoc.setAuthor('MIHAS Admissions');
    pdfDoc.setSubject('Official application confirmation slip');
    pdfDoc.setProducer('MIHAS Admissions Portal');

    const page = pdfDoc.addPage([595.28, 841.89]); // A4 size in points
    const { width, height } = page.getSize();
    const margin = 48;

    const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const brandColor = rgb(71 / 255, 43 / 255, 181 / 255);
    const accentColor = rgb(236 / 255, 233 / 255, 252 / 255);

    // Header banner
    page.drawRectangle({
      x: 0,
      y: height - 140,
      width,
      height: 140,
      color: brandColor
    });

    page.drawText('MIHAS Admissions', {
      x: margin,
      y: height - 80,
      size: 28,
      font: boldFont,
      color: rgb(1, 1, 1)
    });

    page.drawText('Official Application Slip', {
      x: margin,
      y: height - 110,
      size: 16,
      font: regularFont,
      color: rgb(1, 1, 1)
    });

    let cursorY = height - 170;

    const sectionHeading = (title) => {
      page.drawText(title, {
        x: margin,
        y: cursorY,
        size: 14,
        font: boldFont,
        color: brandColor
      });
      cursorY -= 20;
      page.drawLine({
        start: { x: margin, y: cursorY },
        end: { x: width - margin, y: cursorY },
        thickness: 1,
        color: brandColor
      });
      cursorY -= 16;
    };

    const drawField = (label, value) => {
      page.drawText(label, {
        x: margin,
        y: cursorY,
        size: 11,
        font: boldFont,
        color: rgb(55 / 255, 65 / 255, 81 / 255)
      });
      cursorY -= 14;
      page.drawText(value, {
        x: margin,
        y: cursorY,
        size: 11,
        font: regularFont,
        color: rgb(31 / 255, 41 / 255, 55 / 255)
      });
      cursorY -= 18;
    };

    sectionHeading('Applicant Details');
    drawField('Applicant Name', safeText(data.full_name, 'Not provided'));
    drawField('Email', safeText(data.email, 'Not provided'));
    drawField('Phone', safeText(data.phone, 'Not provided'));

    sectionHeading('Application Summary');
    drawField('Application Number', safeText(data.application_number));
    drawField('Tracking Code', safeText(data.public_tracking_code));
    drawField('Program', safeText(data.program_name, 'Not specified'));
    drawField('Intake', safeText(data.intake_name, 'Not specified'));
    drawField('Institution', safeText(data.institution, 'Not specified'));

    sectionHeading('Status & Timeline');
    drawField('Current Status', formatStatusLabel(data.status, 'Unknown'));
    drawField('Payment Status', formatStatusLabel(data.payment_status, 'Pending Review'));
    drawField('Submitted At', formatDateTime(data.submitted_at));
    drawField('Last Updated', formatDateTime(data.updated_at));

    const statusBoxHeight = 70;
    const statusBoxY = cursorY - statusBoxHeight;
    page.drawRectangle({
      x: margin,
      y: statusBoxY,
      width: width - margin * 2 - 140,
      height: statusBoxHeight,
      color: accentColor,
      borderColor: brandColor,
      borderWidth: 1
    });

    page.drawText('Next Steps', {
      x: margin + 16,
      y: statusBoxY + statusBoxHeight - 24,
      size: 12,
      font: boldFont,
      color: brandColor
    });

    const nextSteps = 'Our admissions team will contact you with further updates.';
    page.drawText(nextSteps, {
      x: margin + 16,
      y: statusBoxY + statusBoxHeight - 40,
      size: 10,
      font: regularFont,
      maxWidth: width - margin * 2 - 172,
      lineHeight: 12,
      color: rgb(55 / 255, 65 / 255, 81 / 255)
    });

    cursorY = statusBoxY - 30;

    const generatedAt = new Date();
    drawField('Slip Generated On', formatDateTime(generatedAt.toISOString()));

    const trackingUrl = buildTrackingUrl(data.public_tracking_code);

    const qrDataUrl = await QRCode.toDataURL(trackingUrl, {
      margin: 1,
      width: 240,
      color: {
        dark: '#231F54',
        light: '#FFFFFF'
      }
    });

    const qrImage = await pdfDoc.embedPng(Buffer.from(qrDataUrl.split(',')[1], 'base64'));
    const qrSize = 140;
    page.drawImage(qrImage, {
      x: width - margin - qrSize,
      y: margin + 20,
      width: qrSize,
      height: qrSize
    });

    page.drawText('Scan to track your application', {
      x: width - margin - qrSize,
      y: margin + 10,
      size: 10,
      font: regularFont,
      color: rgb(55 / 255, 65 / 255, 81 / 255)
    });

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  } catch (error) {
    console.error('Failed to generate application slip:', error.message);
    throw error;
  }
}