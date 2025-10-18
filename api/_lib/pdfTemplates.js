import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import QRCode from 'qrcode';

// Unified color palette matching email templates
const COLORS = {
  primaryBlue: rgb(14 / 255, 165 / 255, 233 / 255), // #0ea5e9
  darkGray: rgb(17 / 255, 24 / 255, 39 / 255), // #111827
  mediumGray: rgb(75 / 255, 85 / 255, 99 / 255), // #4b5563
  lightGray: rgb(249 / 255, 250 / 255, 251 / 255), // #f9fafb
  borderGray: rgb(229 / 255, 231 / 255, 235 / 255), // #e5e7eb
  white: rgb(1, 1, 1),
  successGreen: rgb(34 / 255, 197 / 255, 94 / 255), // #22c55e
  warningAmber: rgb(245 / 255, 158 / 255, 11 / 255) // #f59e0b
};

// Utility functions
function safeText(value, fallback = 'Not provided') {
  if (!value) return fallback;
  const cleaned = String(value).replace(/\s+/g, ' ').trim();
  return cleaned.length > 0 ? cleaned : fallback;
}

function formatStatusLabel(value, fallback = 'Unknown') {
  const sanitized = safeText(value, fallback);
  if (sanitized === fallback) return fallback;
  return sanitized.split(/[_-]/).map(part => part ? part.charAt(0).toUpperCase() + part.slice(1) : part).join(' ');
}

function formatDateTime(value) {
  if (!value) return 'Not available';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Not available';
  const datePart = parsed.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const timePart = parsed.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  return `${datePart} ${timePart}`;
}

// Base PDF setup
async function createBasePDF(title) {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(title);
  pdfDoc.setAuthor('MIHAS Admissions');
  pdfDoc.setProducer('MIHAS Admissions Portal');
  return pdfDoc;
}

// Common header
async function drawHeader(page, pdfDoc, title, subtitle) {
  const { width, height } = page.getSize();
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // Header banner
  page.drawRectangle({ x: 0, y: height - 140, width, height: 140, color: COLORS.primaryBlue });

  // Load logos
  let katcLogo, mihasLogo;
  try {
    const fs = await import('fs');
    const path = await import('path');
    const katcPath = path.join(process.cwd(), 'public/images/logos/katc-logo.png');
    const mihasPath = path.join(process.cwd(), 'public/images/logos/mihas-logo.png');
    
    if (fs.existsSync(katcPath) && fs.existsSync(mihasPath)) {
      katcLogo = await pdfDoc.embedPng(fs.readFileSync(katcPath));
      mihasLogo = await pdfDoc.embedPng(fs.readFileSync(mihasPath));
    } else {
      throw new Error('Local logos not found');
    }
  } catch {
    const [katcRes, mihasRes] = await Promise.all([
      fetch('https://tuaringp.sirv.com/Images/katclogo-removebg-preview.png'),
      fetch('https://tuaringp.sirv.com/Images/download-removebg-preview.png')
    ]);
    katcLogo = await pdfDoc.embedPng(await katcRes.arrayBuffer());
    mihasLogo = await pdfDoc.embedPng(await mihasRes.arrayBuffer());
  }

  const logoHeight = 70;
  const margin = 50;
  const katcLogoWidth = (katcLogo.width / katcLogo.height) * logoHeight;
  const mihasLogoWidth = (mihasLogo.width / mihasLogo.height) * logoHeight;

  page.drawImage(katcLogo, { x: margin, y: height - 120, width: katcLogoWidth, height: logoHeight });
  page.drawImage(mihasLogo, { x: width - margin - mihasLogoWidth, y: height - 120, width: mihasLogoWidth, height: logoHeight });

  page.drawText(title, { x: width / 2 - (title.length * 5), y: height - 75, size: 28, font: boldFont, color: COLORS.white });
  page.drawText(subtitle, { x: width / 2 - (subtitle.length * 3.5), y: height - 100, size: 14, font: regularFont, color: COLORS.white });

  return { boldFont, regularFont, margin, width, height };
}

// Common footer
function drawFooter(page, regularFont, margin, width) {
  page.drawRectangle({ x: 0, y: 0, width, height: 50, color: COLORS.lightGray });
  const year = new Date().getFullYear();
  page.drawText(`© ${year} MIHAS. All rights reserved.`, { x: width / 2 - 90, y: 25, size: 9, font: regularFont, color: COLORS.mediumGray });
  page.drawText(`Generated: ${formatDateTime(new Date().toISOString())}`, { x: width / 2 - 80, y: 12, size: 8, font: regularFont, color: COLORS.mediumGray });
}

// Table row renderer
function drawTableRow(page, regularFont, boldFont, label, value, cursorY, margin, width) {
  const rowHeight = 32;
  const labelWidth = 200;
  
  page.drawRectangle({ x: margin, y: cursorY - rowHeight, width: labelWidth, height: rowHeight, color: COLORS.lightGray, borderColor: COLORS.borderGray, borderWidth: 0.5 });
  page.drawText(label, { x: margin + 12, y: cursorY - 20, size: 11, font: boldFont, color: rgb(31 / 255, 41 / 255, 55 / 255) });
  
  page.drawRectangle({ x: margin + labelWidth, y: cursorY - rowHeight, width: width - margin * 2 - labelWidth, height: rowHeight, color: COLORS.white, borderColor: COLORS.borderGray, borderWidth: 0.5 });
  page.drawText(value, { x: margin + labelWidth + 12, y: cursorY - 20, size: 11, font: regularFont, color: COLORS.darkGray });
  
  return cursorY - rowHeight;
}

// Application Slip
export async function generateApplicationSlip(data) {
  const pdfDoc = await createBasePDF(`Application Slip - ${safeText(data.application_number)}`);
  const page = pdfDoc.addPage([595.28, 841.89]);
  
  const { boldFont, regularFont, margin, width, height } = await drawHeader(page, pdfDoc, 'Application received', 'Official Application Slip');
  
  let cursorY = height - 170;
  
  page.drawText('Thank you for submitting your application to MIHAS. We have received the', { x: margin, y: cursorY, size: 11, font: regularFont, color: COLORS.mediumGray });
  cursorY -= 14;
  page.drawText('details below and will notify you once they have been reviewed.', { x: margin, y: cursorY, size: 11, font: regularFont, color: COLORS.mediumGray });
  cursorY -= 30;

  cursorY = drawTableRow(page, regularFont, boldFont, 'Application number', safeText(data.application_number), cursorY, margin, width);
  cursorY = drawTableRow(page, regularFont, boldFont, 'Tracking code', safeText(data.public_tracking_code), cursorY, margin, width);
  cursorY = drawTableRow(page, regularFont, boldFont, 'Programme', safeText(data.program_name, 'Not specified'), cursorY, margin, width);
  cursorY = drawTableRow(page, regularFont, boldFont, 'Submission date', formatDateTime(data.submitted_at), cursorY, margin, width);
  cursorY = drawTableRow(page, regularFont, boldFont, 'Payment status', formatStatusLabel(data.payment_status, 'Pending Review'), cursorY, margin, width);
  
  cursorY -= 20;
  page.drawText('Applicant Information', { x: margin, y: cursorY, size: 14, font: boldFont, color: COLORS.darkGray });
  cursorY -= 8;
  page.drawLine({ start: { x: margin, y: cursorY }, end: { x: width - margin, y: cursorY }, thickness: 1, color: COLORS.borderGray });
  cursorY -= 20;
  
  cursorY = drawTableRow(page, regularFont, boldFont, 'Full name', safeText(data.full_name), cursorY, margin, width);
  cursorY = drawTableRow(page, regularFont, boldFont, 'Email', safeText(data.email), cursorY, margin, width);
  cursorY = drawTableRow(page, regularFont, boldFont, 'Phone', safeText(data.phone), cursorY, margin, width);
  
  cursorY -= 20;
  page.drawText('Keep this information for your records. You can use your tracking code to', { x: margin, y: cursorY, size: 10, font: regularFont, color: COLORS.mediumGray });
  cursorY -= 14;
  page.drawText('check the status of your application at any time.', { x: margin, y: cursorY, size: 10, font: regularFont, color: COLORS.mediumGray });

  // QR Code
  const trackingUrl = `${process.env.VITE_APP_BASE_URL || '***REMOVED***'}/track-application?code=${encodeURIComponent(data.public_tracking_code)}`;
  const qrDataUrl = await QRCode.toDataURL(trackingUrl, { margin: 1, width: 240, color: { dark: '#111827', light: '#FFFFFF' } });
  const qrImage = await pdfDoc.embedPng(Buffer.from(qrDataUrl.split(',')[1], 'base64'));
  const qrSize = 120;
  
  page.drawRectangle({ x: width - margin - qrSize - 8, y: margin + 8, width: qrSize + 16, height: qrSize + 40, color: COLORS.white, borderColor: COLORS.borderGray, borderWidth: 1 });
  page.drawImage(qrImage, { x: width - margin - qrSize, y: margin + 40, width: qrSize, height: qrSize });
  page.drawText('Scan to track application', { x: width - margin - qrSize + 5, y: margin + 20, size: 9, font: regularFont, color: COLORS.mediumGray });

  drawFooter(page, regularFont, margin, width);
  
  return Buffer.from(await pdfDoc.save());
}

// Acceptance Letter
export async function generateAcceptanceLetter(data) {
  const pdfDoc = await createBasePDF(`Acceptance Letter - ${safeText(data.application_number)}`);
  const page = pdfDoc.addPage([595.28, 841.89]);
  
  const { boldFont, regularFont, margin, width, height } = await drawHeader(page, pdfDoc, 'Congratulations!', 'Acceptance Letter');
  
  let cursorY = height - 180;
  
  page.drawText(`Dear ${safeText(data.full_name)},`, { x: margin, y: cursorY, size: 12, font: regularFont, color: COLORS.darkGray });
  cursorY -= 30;
  
  page.drawText('We are pleased to inform you that your application has been approved!', { x: margin, y: cursorY, size: 11, font: regularFont, color: COLORS.darkGray });
  cursorY -= 40;

  cursorY = drawTableRow(page, regularFont, boldFont, 'Application number', safeText(data.application_number), cursorY, margin, width);
  cursorY = drawTableRow(page, regularFont, boldFont, 'Programme', safeText(data.program_name), cursorY, margin, width);
  cursorY = drawTableRow(page, regularFont, boldFont, 'Intake', safeText(data.intake_name), cursorY, margin, width);
  cursorY = drawTableRow(page, regularFont, boldFont, 'Institution', safeText(data.institution), cursorY, margin, width);
  
  cursorY -= 30;
  page.drawText('Welcome to the MIHAS-KATC family! We look forward to supporting your', { x: margin, y: cursorY, size: 11, font: regularFont, color: COLORS.mediumGray });
  cursorY -= 14;
  page.drawText('academic and professional growth.', { x: margin, y: cursorY, size: 11, font: regularFont, color: COLORS.mediumGray });
  
  cursorY -= 30;
  page.drawText('Next Steps:', { x: margin, y: cursorY, size: 12, font: boldFont, color: COLORS.darkGray });
  cursorY -= 20;
  const steps = ['1. Check your email for enrollment instructions', '2. Prepare required enrollment documents', '3. Complete registration process as instructed'];
  steps.forEach(step => {
    page.drawText(step, { x: margin + 10, y: cursorY, size: 10, font: regularFont, color: COLORS.mediumGray });
    cursorY -= 16;
  });

  drawFooter(page, regularFont, margin, width);
  
  return Buffer.from(await pdfDoc.save());
}

// Payment Receipt
export async function generatePaymentReceipt(data) {
  const pdfDoc = await createBasePDF(`Payment Receipt - ${safeText(data.application_number)}`);
  const page = pdfDoc.addPage([595.28, 841.89]);
  
  const { boldFont, regularFont, margin, width, height } = await drawHeader(page, pdfDoc, 'Payment Receipt', 'Official Receipt');
  
  let cursorY = height - 180;
  
  page.drawText(`Receipt No: ${safeText(data.application_number)}-${Date.now()}`, { x: margin, y: cursorY, size: 11, font: boldFont, color: COLORS.darkGray });
  cursorY -= 14;
  page.drawText(`Date: ${formatDateTime(new Date().toISOString())}`, { x: margin, y: cursorY, size: 11, font: regularFont, color: COLORS.mediumGray });
  cursorY -= 30;

  page.drawText('Student Details', { x: margin, y: cursorY, size: 14, font: boldFont, color: COLORS.darkGray });
  cursorY -= 8;
  page.drawLine({ start: { x: margin, y: cursorY }, end: { x: width - margin, y: cursorY }, thickness: 1, color: COLORS.borderGray });
  cursorY -= 20;
  
  cursorY = drawTableRow(page, regularFont, boldFont, 'Name', safeText(data.full_name), cursorY, margin, width);
  cursorY = drawTableRow(page, regularFont, boldFont, 'Application number', safeText(data.application_number), cursorY, margin, width);
  cursorY = drawTableRow(page, regularFont, boldFont, 'Programme', safeText(data.program_name), cursorY, margin, width);
  
  cursorY -= 20;
  page.drawText('Payment Details', { x: margin, y: cursorY, size: 14, font: boldFont, color: COLORS.darkGray });
  cursorY -= 8;
  page.drawLine({ start: { x: margin, y: cursorY }, end: { x: width - margin, y: cursorY }, thickness: 1, color: COLORS.borderGray });
  cursorY -= 20;
  
  cursorY = drawTableRow(page, regularFont, boldFont, 'Application fee', `K${data.application_fee || '0.00'}`, cursorY, margin, width);
  cursorY = drawTableRow(page, regularFont, boldFont, 'Amount paid', `K${data.amount || '0.00'}`, cursorY, margin, width);
  cursorY = drawTableRow(page, regularFont, boldFont, 'Payment status', formatStatusLabel(data.payment_status), cursorY, margin, width);

  drawFooter(page, regularFont, margin, width);
  
  return Buffer.from(await pdfDoc.save());
}
