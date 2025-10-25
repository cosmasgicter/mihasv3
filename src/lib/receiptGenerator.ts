import { jsPDF } from 'jspdf'
import QRCode from 'qrcode'
import { formatDate } from './utils'

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
    'KATC': 'Kalulushi Training Centre',
    'MIHAS': 'Mukuba Institute of Health and Allied Sciences'
  };
  return names[code] || code;
}

export async function generatePaymentReceipt(data: ReceiptData): Promise<Blob> {
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()
  const institutionName = getFullInstitutionName(data.institution)
  
  // Header
  doc.setFillColor(14, 165, 233)
  doc.rect(0, 0, pageWidth, 40, 'F')
  
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text('PAYMENT RECEIPT', pageWidth / 2, 15, { align: 'center' })
  
  doc.setFontSize(13)
  doc.setFont('helvetica', 'normal')
  doc.text(institutionName, pageWidth / 2, 28, { align: 'center' })
  
  doc.setTextColor(0, 0, 0)
  
  // Receipt Number
  doc.setFontSize(10)
  doc.text(`Receipt No: ${data.receiptNumber}`, 20, 50)
  doc.text(`Date: ${formatDate(data.verifiedDate)}`, pageWidth - 70, 50)
  
  // Line
  doc.setLineWidth(0.5)
  doc.line(20, 55, pageWidth - 20, 55)
  
  // Student Details
  let y = 65
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('STUDENT INFORMATION', 20, y)
  
  y += 8
  doc.setFont('helvetica', 'normal')
  doc.text(`Name: ${data.studentName}`, 20, y)
  y += 6
  doc.text(`Email: ${data.email}`, 20, y)
  y += 6
  doc.text(`Phone: ${data.phone}`, 20, y)
  y += 6
  doc.text(`Application No: ${data.applicationNumber}`, 20, y)
  y += 6
  doc.text(`Program: ${data.program}`, 20, y)
  
  // Payment Details
  y += 12
  doc.setFont('helvetica', 'bold')
  doc.text('PAYMENT DETAILS', 20, y)
  
  y += 8
  doc.setFont('helvetica', 'normal')
  doc.text(`Amount Paid: K${data.amount.toFixed(2)} ZMW`, 20, y)
  y += 6
  doc.text(`Payment Method: ${data.paymentMethod}`, 20, y)
  y += 6
  if (data.paymentReference) {
    doc.text(`Reference: ${data.paymentReference}`, 20, y)
    y += 6
  }
  doc.text(`Payment Date: ${formatDate(data.paymentDate)}`, 20, y)
  y += 6
  doc.text(`Verified Date: ${formatDate(data.verifiedDate)}`, 20, y)
  
  // Status Box
  y += 15
  doc.setFillColor(34, 197, 94)
  doc.rect(20, y - 5, pageWidth - 40, 12, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.text('PAYMENT VERIFIED', pageWidth / 2, y + 2, { align: 'center' })
  doc.setTextColor(0, 0, 0)
  
  // QR Code for verification
  const qrData = JSON.stringify({
    type: 'payment_receipt',
    receipt_no: data.receiptNumber,
    app_no: data.applicationNumber,
    student: data.studentName,
    institution: data.institution,
    amount: data.amount,
    verified: data.verifiedDate
  });
  const qrDataUrl = await QRCode.toDataURL(qrData, { margin: 1, width: 200, errorCorrectionLevel: 'M' });
  
  // Footer
  y = doc.internal.pageSize.getHeight() - 50
  doc.addImage(qrDataUrl, 'PNG', pageWidth - 45, y, 30, 30);
  
  doc.setFontSize(7)
  doc.setTextColor(107, 114, 128)
  doc.text('Scan to verify', pageWidth - 30, y + 33, { align: 'center' })
  
  doc.setFontSize(9)
  doc.setFont('helvetica', 'italic')
  doc.text('This is an official payment receipt.', pageWidth / 2, y + 5, { align: 'center' })
  doc.text('For inquiries, contact admissions@mihas.edu.zm', pageWidth / 2, y + 10, { align: 'center' })
  
  doc.setFontSize(8)
  doc.text(`Verified by: ${data.verifiedBy}`, 20, y + 20)
  doc.text(`Generated: ${formatDate(new Date().toISOString())}`, 20, y + 25)
  
  return doc.output('blob')
}

export function generateReceiptNumber(): string {
  const timestamp = Date.now().toString(36).toUpperCase()
  const random = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `RCP-${timestamp}-${random}`
}
