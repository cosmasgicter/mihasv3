// Dynamic import for jsPDF
import QRCode from 'qrcode'
import { formatDate } from './utils'

// Brand constants
const NAVY = { r: 26, g: 54, b: 93 } // #1a365d
const MARGIN = 20
const GREY_TEXT = { r: 107, g: 114, b: 128 }

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
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const institutionName = getFullInstitutionName(data.institution)

  // --- Header band ---
  doc.setFillColor(NAVY.r, NAVY.g, NAVY.b)
  doc.rect(0, 0, pageWidth, 42, 'F')

  doc.setTextColor(255, 255, 255)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text(institutionName, pageWidth / 2, 16, { align: 'center' })

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text('Private Bag E10, Kitwe, Zambia', pageWidth / 2, 24, { align: 'center' })

  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('PAYMENT RECEIPT', pageWidth / 2, 35, { align: 'center' })

  // --- Receipt meta ---
  let y = 52
  doc.setTextColor(0, 0, 0)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text(`Receipt No: ${data.receiptNumber}`, MARGIN, y)
  doc.setFont('helvetica', 'normal')
  doc.text(`Date: ${formatDate(data.verifiedDate)}`, pageWidth - MARGIN, y, { align: 'right' })

  // --- Divider ---
  y += 5
  doc.setDrawColor(NAVY.r, NAVY.g, NAVY.b)
  doc.setLineWidth(0.4)
  doc.line(MARGIN, y, pageWidth - MARGIN, y)

  // --- Student Information ---
  y += 10
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
  const studentFields = [
    ['Name:', data.studentName],
    ['Email:', data.email],
    ['Phone:', data.phone],
    ['Application No:', data.applicationNumber],
    ['Programme:', data.program],
  ]
  studentFields.forEach(([label, value]) => {
    doc.setFont('helvetica', 'bold')
    doc.text(label, MARGIN, y)
    doc.setFont('helvetica', 'normal')
    doc.text(value, MARGIN + 42, y)
    y += 7
  })

  // --- Payment Details ---
  y += 6
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
    doc.setFont('helvetica', 'bold')
    doc.text(label, MARGIN, y)
    doc.setFont('helvetica', 'normal')
    doc.text(value, MARGIN + 42, y)
    y += 7
  })

  // --- Status badge ---
  y += 8
  doc.setFillColor(34, 120, 74)
  doc.roundedRect(MARGIN, y - 5, pageWidth - MARGIN * 2, 14, 2, 2, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('PAYMENT VERIFIED ✓', pageWidth / 2, y + 3, { align: 'center' })

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
  const qrY = pageHeight - 48
  doc.addImage(qrDataUrl, 'PNG', pageWidth - 48, qrY, 28, 28)
  doc.setFontSize(7)
  doc.setTextColor(GREY_TEXT.r, GREY_TEXT.g, GREY_TEXT.b)
  doc.text('Scan to verify', pageWidth - 34, qrY + 31, { align: 'center' })

  // --- Footer ---
  const footerY = pageHeight - 14
  doc.setDrawColor(NAVY.r, NAVY.g, NAVY.b)
  doc.setLineWidth(0.3)
  doc.line(MARGIN, footerY - 4, pageWidth - MARGIN, footerY - 4)

  doc.setFontSize(8)
  doc.setTextColor(GREY_TEXT.r, GREY_TEXT.g, GREY_TEXT.b)
  doc.text('This is a computer-generated document. No signature is required.', MARGIN, footerY)
  doc.text(`Generated: ${formatDate(new Date().toISOString())}`, pageWidth / 2, footerY, { align: 'center' })
  doc.text('Page 1 of 1', pageWidth - MARGIN, footerY, { align: 'right' })

  return doc.output('blob')
}

export function generateReceiptNumber(): string {
  const timestamp = Date.now().toString(36).toUpperCase()
  const random = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `RCP-${timestamp}-${random}`
}
