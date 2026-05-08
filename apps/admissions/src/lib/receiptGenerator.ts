// Dynamic import for jsPDF
import QRCode from 'qrcode'
import { formatDate } from './utils'
import {
  drawPdfFooters,
  drawPdfQrCode,
  ensurePdfSpace,
  fillPageBackground,
  type PdfDocument,
} from './pdfLayout'

// Brand constants
const NAVY = { r: 26, g: 54, b: 93 } // #1a365d
const MARGIN = 20
const GREY_TEXT = { r: 107, g: 114, b: 128 }
const GOLD = { r: 187, g: 139, b: 64 }
const SOFT_SURFACE = { r: 244, g: 248, b: 252 }

interface ReceiptData {
  receiptNumber: string
  applicationNumber: string
  studentName: string
  email: string
  phone: string
  program: string
  institution: string
  amount: number
  paymentMethod: string
  paymentReference?: string
  paymentDate: string
  verifiedDate: string
  verifiedBy: string
}

function getFullInstitutionName(code: string): string {
  const names: Record<string, string> = {
    KATC: 'Kalulushi Training Centre',
    MIHAS: 'Mukuba Institute of Health and Allied Sciences',
  }
  return names[code] || code
}

export async function generatePaymentReceipt(data: ReceiptData): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF() as PdfDocument
  const pageWidth = doc.internal.pageSize.getWidth()
  const institutionName = getFullInstitutionName(data.institution)
  const contentWidth = pageWidth - MARGIN * 2
  let y = 60

  const ensureSpace = (required: number) => {
    y = ensurePdfSpace(doc, y, required, { background: SOFT_SURFACE })
  }

  fillPageBackground(doc, SOFT_SURFACE)

  // --- Header band ---
  doc.setFillColor(NAVY.r, NAVY.g, NAVY.b)
  doc.rect(0, 0, pageWidth, 48, 'F')
  doc.setFillColor(GOLD.r, GOLD.g, GOLD.b)
  doc.rect(0, 48, pageWidth, 3, 'F')

  doc.setTextColor(255, 255, 255)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text('MIHAS FINANCE OFFICE', MARGIN, 12)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text(institutionName, pageWidth / 2, 24, { align: 'center' })

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text('Private Bag E10, Kitwe, Zambia', pageWidth / 2, 31, { align: 'center' })

  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('PAYMENT RECEIPT', pageWidth / 2, 42, { align: 'center' })

  // --- Receipt meta ---
  doc.setTextColor(0, 0, 0)
  doc.setFillColor(255, 255, 255)
  doc.roundedRect(MARGIN, y - 4, contentWidth, 20, 4, 4, 'F')
  doc.setDrawColor(223, 231, 239)
  doc.roundedRect(MARGIN, y - 4, contentWidth, 20, 4, 4)
  doc.setFontSize(10)
  doc.setTextColor(GREY_TEXT.r, GREY_TEXT.g, GREY_TEXT.b)
  doc.text('RECEIPT NUMBER', MARGIN + 4, y + 2)
  doc.text('ISSUED', pageWidth - MARGIN - 4, y + 2, { align: 'right' })
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(NAVY.r, NAVY.g, NAVY.b)
  doc.text(data.receiptNumber, MARGIN + 4, y + 9)
  doc.text(formatDate(data.verifiedDate), pageWidth - MARGIN - 4, y + 9, { align: 'right' })

  // --- Student Information ---
  y += 30
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(NAVY.r, NAVY.g, NAVY.b)
  doc.text('STUDENT INFORMATION', MARGIN, y)
  y += 2
  doc.setDrawColor(200, 200, 200)
  doc.setLineWidth(0.2)
  doc.line(MARGIN, y, pageWidth - MARGIN, y)
  y += 7

  doc.setTextColor(0, 0, 0)
  doc.setFontSize(11)
  const studentFields: [string, string][] = [
    ['Name:', data.studentName],
    ['Email:', data.email],
    ['Phone:', data.phone],
    ['Application No:', data.applicationNumber],
    ['Programme:', data.program],
  ]
  studentFields.forEach(([label, value]) => {
    const valueLines = doc.splitTextToSize(value, contentWidth - 48)
    ensureSpace(Math.max(7, valueLines.length * 6))
    doc.setFont('helvetica', 'bold')
    doc.text(label, MARGIN, y)
    doc.setFont('helvetica', 'normal')
    doc.text(valueLines, MARGIN + 42, y)
    y += Math.max(7, valueLines.length * 6)
  })

  // --- Payment Details ---
  y += 6
  ensureSpace(50)
  doc.setFillColor(255, 255, 255)
  doc.roundedRect(pageWidth - MARGIN - 64, y - 18, 64, 24, 4, 4, 'F')
  doc.setDrawColor(223, 231, 239)
  doc.roundedRect(pageWidth - MARGIN - 64, y - 18, 64, 24, 4, 4)
  doc.setFontSize(9)
  doc.setTextColor(GREY_TEXT.r, GREY_TEXT.g, GREY_TEXT.b)
  doc.text('AMOUNT RECEIVED', pageWidth - MARGIN - 60, y - 9)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(NAVY.r, NAVY.g, NAVY.b)
  doc.text(`K${data.amount.toFixed(2)}`, pageWidth - MARGIN - 60, y - 1)

  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(NAVY.r, NAVY.g, NAVY.b)
  doc.text('PAYMENT DETAILS', MARGIN, y)
  y += 2
  doc.setDrawColor(200, 200, 200)
  doc.line(MARGIN, y, pageWidth - MARGIN, y)
  y += 7

  doc.setTextColor(0, 0, 0)
  doc.setFontSize(11)
  const paymentFields: [string, string][] = [
    ['Amount Paid:', `K${data.amount.toFixed(2)} ZMW`],
    ['Method:', data.paymentMethod],
    ...(data.paymentReference ? [['Reference:', data.paymentReference] as [string, string]] : []),
    ['Payment Date:', formatDate(data.paymentDate)],
    ['Verified Date:', formatDate(data.verifiedDate)],
    ['Verified By:', data.verifiedBy],
  ]
  paymentFields.forEach(([label, value]) => {
    const valueLines = doc.splitTextToSize(value, contentWidth - 48)
    ensureSpace(Math.max(7, valueLines.length * 6))
    doc.setFont('helvetica', 'bold')
    doc.text(label, MARGIN, y)
    doc.setFont('helvetica', 'normal')
    doc.text(valueLines, MARGIN + 42, y)
    y += Math.max(7, valueLines.length * 6)
  })

  // --- Status badge ---
  y += 8
  ensureSpace(24)
  doc.setFillColor(34, 120, 74)
  doc.roundedRect(MARGIN, y - 5, pageWidth - MARGIN * 2, 16, 3, 3, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('PAYMENT VERIFIED', pageWidth / 2, y + 4, { align: 'center' })

  // --- QR Code ---
  const qrData = JSON.stringify({
    type: 'payment_receipt',
    receipt_no: data.receiptNumber,
    app_no: data.applicationNumber,
    student: data.studentName,
    institution: data.institution,
    amount: data.amount,
    verified: data.verifiedDate,
  })
  const qrDataUrl = await QRCode.toDataURL(qrData, { margin: 1, width: 200, errorCorrectionLevel: 'M' })
  drawPdfQrCode(doc, qrDataUrl, y + 14, {
    background: SOFT_SURFACE,
    labelColor: GREY_TEXT,
  })

  drawPdfFooters(doc, {
    borderColor: NAVY,
    textColor: GREY_TEXT,
    generatedLabel: `Generated: ${formatDate(new Date().toISOString())}`,
  })

  return doc.output('blob')
}
