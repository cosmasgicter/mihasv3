// Re-export from unified template system
export { generateApplicationSlip, generateAcceptanceLetter, generatePaymentReceipt } from './pdfTemplates.js';

// Legacy export for backwards compatibility
import { generateApplicationSlip as _generateApplicationSlip } from './pdfTemplates.js';

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

// Legacy function - redirects to unified system
export async function generateApplicationSlipLegacy(data) {
  if (!data || !data.application_number || !data.public_tracking_code) {
    throw new Error('Missing application data for slip generation');
  }

  let pdfDoc, qrImage;
  try {
    pdfDoc = await PDFDocument.create();
    pdfDoc.setTitle(`Application Slip - ${safeText(data.application_number, 'Unknown')}`);
    pdfDoc.setAuthor('MIHAS Admissions');
    pdfDoc.setSubject('Official application confirmation slip');
    pdfDoc.setProducer('MIHAS Admissions Portal');

    const page = pdfDoc.addPage([595.28, 841.89]); // A4 size in points
    const { width, height } = page.getSize();
    const margin = 50;

    const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Modern color palette matching email template
    const primaryBlue = rgb(14 / 255, 165 / 255, 233 / 255); // #0ea5e9 - sky-500
    const darkGray = rgb(17 / 255, 24 / 255, 39 / 255); // #111827 - gray-900
    const mediumGray = rgb(75 / 255, 85 / 255, 99 / 255); // #4b5563 - gray-600
    const lightGray = rgb(249 / 255, 250 / 255, 251 / 255); // #f9fafb - gray-50
    const borderGray = rgb(229 / 255, 231 / 255, 235 / 255); // #e5e7eb - gray-200
    const white = rgb(1, 1, 1);

    // Embed logos from local files or fallback to CDN
    let katcLogo, mihasLogo;
    try {
      const fs = await import('fs');
      const path = await import('path');
      const katcPath = path.join(process.cwd(), 'public/images/logos/katc-logo.png');
      const mihasPath = path.join(process.cwd(), 'public/images/logos/mihas-logo.png');
      
      if (fs.existsSync(katcPath) && fs.existsSync(mihasPath)) {
        const katcLogoBytes = fs.readFileSync(katcPath);
        const mihasLogoBytes = fs.readFileSync(mihasPath);
        katcLogo = await pdfDoc.embedPng(katcLogoBytes);
        mihasLogo = await pdfDoc.embedPng(mihasLogoBytes);
      } else {
        throw new Error('Local logos not found');
      }
    } catch (localError) {
      // Fallback to CDN with timeout
      const fetchWithTimeout = (url, timeout = 5000) => {
        return Promise.race([
          fetch(url),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Logo fetch timeout')), timeout))
        ]);
      };
      
      const [katcLogoRes, mihasLogoRes] = await Promise.all([
        fetchWithTimeout('https://tuaringp.sirv.com/Images/katclogo-removebg-preview.png'),
        fetchWithTimeout('https://tuaringp.sirv.com/Images/download-removebg-preview.png')
      ]);
      
      const katcLogoBytes = await katcLogoRes.arrayBuffer();
      const mihasLogoBytes = await mihasLogoRes.arrayBuffer();
      katcLogo = await pdfDoc.embedPng(katcLogoBytes);
      mihasLogo = await pdfDoc.embedPng(mihasLogoBytes);
    }

    // Clean header banner matching email style
    page.drawRectangle({
      x: 0,
      y: height - 140,
      width,
      height: 140,
      color: primaryBlue
    });

    // Clean logo presentation
    const logoHeight = 70;
    const katcLogoWidth = (katcLogo.width / katcLogo.height) * logoHeight;
    const mihasLogoWidth = (mihasLogo.width / mihasLogo.height) * logoHeight;

    page.drawImage(katcLogo, {
      x: margin,
      y: height - 120,
      width: katcLogoWidth,
      height: logoHeight
    });

    page.drawImage(mihasLogo, {
      x: width - margin - mihasLogoWidth,
      y: height - 120,
      width: mihasLogoWidth,
      height: logoHeight
    });

    // Clean centered title
    page.drawText('Application received', {
      x: width / 2 - 100,
      y: height - 75,
      size: 28,
      font: boldFont,
      color: white
    });

    page.drawText('Official Application Slip', {
      x: width / 2 - 75,
      y: height - 100,
      size: 14,
      font: regularFont,
      color: white
    });

    let cursorY = height - 170;

    const sectionHeading = (title) => {
      page.drawText(title, {
        x: margin,
        y: cursorY,
        size: 14,
        font: boldFont,
        color: darkGray
      });
      cursorY -= 8;
      page.drawLine({
        start: { x: margin, y: cursorY },
        end: { x: width - margin, y: cursorY },
        thickness: 1,
        color: borderGray
      });
      cursorY -= 20;
    };

    // Table-style field rendering matching email template
    const drawTableRow = (label, value, isEven = false) => {
      const rowHeight = 32;
      const labelWidth = 200;
      
      // Label cell (gray background)
      page.drawRectangle({
        x: margin,
        y: cursorY - rowHeight,
        width: labelWidth,
        height: rowHeight,
        color: lightGray,
        borderColor: borderGray,
        borderWidth: 0.5
      });
      
      page.drawText(label, {
        x: margin + 12,
        y: cursorY - 20,
        size: 11,
        font: boldFont,
        color: rgb(31 / 255, 41 / 255, 55 / 255)
      });
      
      // Value cell (white background)
      page.drawRectangle({
        x: margin + labelWidth,
        y: cursorY - rowHeight,
        width: width - margin * 2 - labelWidth,
        height: rowHeight,
        color: white,
        borderColor: borderGray,
        borderWidth: 0.5
      });
      
      page.drawText(value, {
        x: margin + labelWidth + 12,
        y: cursorY - 20,
        size: 11,
        font: regularFont,
        color: darkGray
      });
      
      cursorY -= rowHeight;
    };

    // Main content in table format
    page.drawText('Thank you for submitting your application to MIHAS. We have received the', {
      x: margin,
      y: cursorY,
      size: 11,
      font: regularFont,
      color: mediumGray
    });
    cursorY -= 14;
    page.drawText('details below and will notify you once they have been reviewed.', {
      x: margin,
      y: cursorY,
      size: 11,
      font: regularFont,
      color: mediumGray
    });
    cursorY -= 30;

    // Application details table
    drawTableRow('Application number', safeText(data.application_number));
    drawTableRow('Tracking code', safeText(data.public_tracking_code));
    drawTableRow('Programme', safeText(data.program_name, 'Not specified'));
    drawTableRow('Submission date', formatDateTime(data.submitted_at));
    drawTableRow('Payment status', formatStatusLabel(data.payment_status, 'Pending Review'));
    
    cursorY -= 20;
    
    // Additional information
    sectionHeading('Applicant Information');
    drawTableRow('Full name', safeText(data.full_name, 'Not provided'));
    drawTableRow('Email', safeText(data.email, 'Not provided'));
    drawTableRow('Phone', safeText(data.phone, 'Not provided'));
    
    cursorY -= 20;
    
    sectionHeading('Status & Timeline');
    drawTableRow('Current status', formatStatusLabel(data.status, 'Under Review'));
    drawTableRow('Intake', safeText(data.intake_name, 'Not specified'));
    drawTableRow('Institution', safeText(data.institution, 'Not specified'));
    drawTableRow('Last updated', formatDateTime(data.updated_at));

    cursorY -= 20;
    
    // Info box matching email style
    page.drawText('Keep this information for your records. You can use your tracking code to', {
      x: margin,
      y: cursorY,
      size: 10,
      font: regularFont,
      color: mediumGray
    });
    cursorY -= 14;
    page.drawText('check the status of your application at any time.', {
      x: margin,
      y: cursorY,
      size: 10,
      font: regularFont,
      color: mediumGray
    });

    // Footer matching email style
    page.drawRectangle({
      x: 0,
      y: 0,
      width,
      height: 50,
      color: lightGray
    });
    
    const generatedAt = new Date();
    page.drawText(`© ${generatedAt.getFullYear()} MIHAS. All rights reserved.`, {
      x: width / 2 - 90,
      y: 25,
      size: 9,
      font: regularFont,
      color: mediumGray
    });
    
    page.drawText(`Generated: ${formatDateTime(generatedAt.toISOString())}`, {
      x: width / 2 - 80,
      y: 12,
      size: 8,
      font: regularFont,
      color: mediumGray
    });

    const trackingUrl = buildTrackingUrl(data.public_tracking_code);

    const qrDataUrl = await QRCode.toDataURL(trackingUrl, {
      margin: 1,
      width: 240,
      color: {
        dark: '#111827',
        light: '#FFFFFF'
      }
    });

    qrImage = await pdfDoc.embedPng(Buffer.from(qrDataUrl.split(',')[1], 'base64'));
    const qrSize = 120;
    
    // QR code with clean border
    page.drawRectangle({
      x: width - margin - qrSize - 8,
      y: margin + 8,
      width: qrSize + 16,
      height: qrSize + 40,
      color: white,
      borderColor: borderGray,
      borderWidth: 1
    });
    
    page.drawImage(qrImage, {
      x: width - margin - qrSize,
      y: margin + 40,
      width: qrSize,
      height: qrSize
    });

    page.drawText('Scan to track application', {
      x: width - margin - qrSize + 5,
      y: margin + 20,
      size: 9,
      font: regularFont,
      color: mediumGray
    });

    const pdfBytes = await pdfDoc.save();
    const buffer = Buffer.from(pdfBytes);
    
    // Cleanup
    pdfDoc = null;
    qrImage = null;
    
    return buffer;
  } catch (error) {
    console.error('Failed to generate application slip:', error.message);
    pdfDoc = null;
    qrImage = null;
    throw error;
  }
}

// Default export uses unified system
export default { generateApplicationSlip: _generateApplicationSlip };