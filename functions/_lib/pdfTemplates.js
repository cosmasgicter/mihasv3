import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import QRCode from 'qrcode';

const COLORS = {
  primaryBlue: [14, 165, 233],
  darkGray: [17, 24, 39],
  mediumGray: [75, 85, 99],
  lightGray: [249, 250, 251],
  borderGray: [229, 231, 235],
  white: [255, 255, 255],
  successGreen: [34, 197, 94],
  warningAmber: [245, 158, 11]
};

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

async function addHeader(doc, title, subtitle) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  
  doc.setFillColor(...COLORS.primaryBlue);
  doc.rect(0, 0, pageWidth, 40, 'F');
  
  doc.setTextColor(...COLORS.white);
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.text(title, pageWidth / 2, 18, { align: 'center' });
  
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text(subtitle, pageWidth / 2, 30, { align: 'center' });
}

function addFooter(doc) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  
  doc.setFillColor(...COLORS.lightGray);
  doc.rect(0, pageHeight - 15, pageWidth, 15, 'F');
  
  doc.setTextColor(...COLORS.mediumGray);
  doc.setFontSize(8);
  const year = new Date().getFullYear();
  doc.text(`© ${year} MIHAS. All rights reserved.`, pageWidth / 2, pageHeight - 8, { align: 'center' });
  doc.text(`Generated: ${formatDateTime(new Date().toISOString())}`, pageWidth / 2, pageHeight - 3, { align: 'center' });
}

export async function generateApplicationSlip(data) {
  const doc = new jsPDF();
  
  await addHeader(doc, 'Application received', 'Official Application Slip');
  
  doc.setTextColor(...COLORS.mediumGray);
  doc.setFontSize(10);
  doc.text('Thank you for submitting your application to MIHAS. We have received the', 14, 50);
  doc.text('details below and will notify you once they have been reviewed.', 14, 56);
  
  doc.autoTable({
    startY: 65,
    head: [],
    body: [
      ['Application number', safeText(data.application_number)],
      ['Tracking code', safeText(data.public_tracking_code)],
      ['Programme', safeText(data.program_name, 'Not specified')],
      ['Submission date', formatDateTime(data.submitted_at)],
      ['Payment status', formatStatusLabel(data.payment_status, 'Pending Review')]
    ],
    theme: 'grid',
    headStyles: { fillColor: COLORS.lightGray, textColor: COLORS.darkGray },
    bodyStyles: { textColor: COLORS.darkGray },
    columnStyles: {
      0: { fillColor: COLORS.lightGray, fontStyle: 'bold', cellWidth: 60 },
      1: { cellWidth: 'auto' }
    }
  });
  
  let finalY = doc.lastAutoTable.finalY + 10;
  
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.darkGray);
  doc.text('Applicant Information', 14, finalY);
  
  doc.autoTable({
    startY: finalY + 5,
    head: [],
    body: [
      ['Full name', safeText(data.full_name)],
      ['Email', safeText(data.email)],
      ['Phone', safeText(data.phone)]
    ],
    theme: 'grid',
    columnStyles: {
      0: { fillColor: COLORS.lightGray, fontStyle: 'bold', cellWidth: 60 },
      1: { cellWidth: 'auto' }
    }
  });
  
  finalY = doc.lastAutoTable.finalY + 10;
  
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.mediumGray);
  doc.text('Keep this information for your records. You can use your tracking code to', 14, finalY);
  doc.text('check the status of your application at any time.', 14, finalY + 5);
  
  const trackingUrl = `${process.env.VITE_APP_BASE_URL || 'https://mihasv3.pages.dev'}/track-application?code=${encodeURIComponent(data.public_tracking_code)}`;
  const qrDataUrl = await QRCode.toDataURL(trackingUrl, { margin: 1, width: 240 });
  doc.addImage(qrDataUrl, 'PNG', 150, finalY + 10, 40, 40);
  
  doc.setFontSize(8);
  doc.text('Scan to track', 160, finalY + 55, { align: 'center' });
  
  addFooter(doc);
  
  return Buffer.from(doc.output('arraybuffer'));
}

export async function generateAcceptanceLetter(data) {
  const doc = new jsPDF();
  
  await addHeader(doc, 'Congratulations!', 'Acceptance Letter');
  
  doc.setTextColor(...COLORS.darkGray);
  doc.setFontSize(11);
  doc.text(`Dear ${safeText(data.full_name)},`, 14, 50);
  doc.text('We are pleased to inform you that your application has been approved!', 14, 60);
  
  doc.autoTable({
    startY: 70,
    head: [],
    body: [
      ['Application number', safeText(data.application_number)],
      ['Programme', safeText(data.program_name)],
      ['Intake', safeText(data.intake_name)],
      ['Institution', safeText(data.institution)]
    ],
    theme: 'grid',
    columnStyles: {
      0: { fillColor: COLORS.lightGray, fontStyle: 'bold', cellWidth: 60 },
      1: { cellWidth: 'auto' }
    }
  });
  
  let finalY = doc.lastAutoTable.finalY + 15;
  
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.mediumGray);
  doc.text('Welcome to the MIHAS-KATC family! We look forward to supporting your', 14, finalY);
  doc.text('academic and professional growth.', 14, finalY + 5);
  
  finalY += 15;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.darkGray);
  doc.text('Next Steps:', 14, finalY);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const steps = [
    '1. Check your email for enrollment instructions',
    '2. Prepare required enrollment documents',
    '3. Complete registration process as instructed'
  ];
  steps.forEach((step, i) => {
    doc.text(step, 20, finalY + 8 + (i * 6));
  });
  
  addFooter(doc);
  
  return Buffer.from(doc.output('arraybuffer'));
}

export async function generatePaymentReceipt(data) {
  const doc = new jsPDF();
  
  await addHeader(doc, 'Payment Receipt', 'Official Receipt');
  
  doc.setTextColor(...COLORS.darkGray);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(`Receipt No: ${safeText(data.application_number)}-${Date.now()}`, 14, 50);
  doc.setFont('helvetica', 'normal');
  doc.text(`Date: ${formatDateTime(new Date().toISOString())}`, 14, 56);
  
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Student Details', 14, 66);
  
  doc.autoTable({
    startY: 70,
    head: [],
    body: [
      ['Name', safeText(data.full_name)],
      ['Application number', safeText(data.application_number)],
      ['Programme', safeText(data.program_name)]
    ],
    theme: 'grid',
    columnStyles: {
      0: { fillColor: COLORS.lightGray, fontStyle: 'bold', cellWidth: 60 },
      1: { cellWidth: 'auto' }
    }
  });
  
  let finalY = doc.lastAutoTable.finalY + 10;
  
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Payment Details', 14, finalY);
  
  doc.autoTable({
    startY: finalY + 4,
    head: [],
    body: [
      ['Application fee', `K${data.application_fee || '0.00'}`],
      ['Amount paid', `K${data.amount || '0.00'}`],
      ['Payment status', formatStatusLabel(data.payment_status)]
    ],
    theme: 'grid',
    columnStyles: {
      0: { fillColor: COLORS.lightGray, fontStyle: 'bold', cellWidth: 60 },
      1: { cellWidth: 'auto' }
    }
  });
  
  addFooter(doc);
  
  return Buffer.from(doc.output('arraybuffer'));
}
