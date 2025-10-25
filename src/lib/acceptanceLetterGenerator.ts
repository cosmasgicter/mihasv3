import { jsPDF } from 'jspdf'
import QRCode from 'qrcode'
import { formatDate } from './utils'

interface AcceptanceLetterData {
  applicationNumber: string
  studentName: string
  program: string
  institution: string
  intake: string
  approvedDate: string
  startDate?: string
}

function getFullInstitutionName(code: string): string {
  const names: Record<string, string> = {
    'KATC': 'Kalulushi Training Centre',
    'MIHAS': 'Mukuba Institute of Health and Allied Sciences'
  };
  return names[code] || code;
}

export async function generateAcceptanceLetter(data: AcceptanceLetterData): Promise<Blob> {
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()
  const institutionName = getFullInstitutionName(data.institution)
  
  // Header
  doc.setFillColor(14, 165, 233)
  doc.rect(0, 0, pageWidth, 40, 'F')
  
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text(institutionName, pageWidth / 2, 15, { align: 'center' })
  
  doc.setFontSize(14)
  doc.setFont('helvetica', 'normal')
  doc.text('Letter of Acceptance', pageWidth / 2, 28, { align: 'center' })
  
  // Date
  let y = 55
  doc.setTextColor(0, 0, 0)
  doc.setFontSize(10)
  doc.text(`Date: ${formatDate(data.approvedDate)}`, pageWidth - 20, y, { align: 'right' })
  
  // Salutation
  y = 65
  doc.setFontSize(11)
  doc.text(`Dear ${data.studentName},`, 20, y)
  
  // Body
  y += 10
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('CONGRATULATIONS!', pageWidth / 2, y, { align: 'center' })
  
  y += 10
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  
  const bodyText = [
    `We are pleased to inform you that your application (${data.applicationNumber}) has been`,
    `approved for admission to the ${data.program} program.`,
    '',
    `Your admission is for the ${data.intake} intake.`,
    '',
    'This letter confirms your acceptance into our institution. Please note the following:',
    '',
    '1. You must confirm your acceptance within 14 days of receiving this letter.',
    '2. Complete all registration requirements before the start date.',
    '3. Ensure all fees are paid according to the payment schedule.',
    '4. Attend the orientation program on the specified date.',
    '',
    'We look forward to welcoming you to our institution.',
  ]
  
  bodyText.forEach(line => {
    doc.text(line, 20, y, { maxWidth: pageWidth - 40 })
    y += 6
  })
  
  // Signature
  y += 10
  doc.text('Sincerely,', 20, y)
  y += 15
  doc.setFont('helvetica', 'bold')
  doc.text('Admissions Office', 20, y)
  doc.setFont('helvetica', 'normal')
  doc.text(data.institution, 20, y + 5)
  
  // QR Code for verification
  const qrData = JSON.stringify({
    type: 'acceptance_letter',
    app_no: data.applicationNumber,
    student: data.studentName,
    institution: data.institution,
    program: data.program,
    approved: data.approvedDate
  });
  const qrDataUrl = await QRCode.toDataURL(qrData, { margin: 1, width: 200, errorCorrectionLevel: 'M' });
  const footerY = doc.internal.pageSize.getHeight() - 45
  doc.addImage(qrDataUrl, 'PNG', pageWidth - 45, footerY - 5, 30, 30);
  
  doc.setFontSize(7)
  doc.setTextColor(107, 114, 128)
  doc.text('Scan to verify', pageWidth - 30, footerY + 28, { align: 'center' })
  
  // Footer
  doc.setFillColor(249, 250, 251)
  doc.rect(0, footerY + 30, pageWidth, 20, 'F')
  
  doc.setFontSize(8)
  doc.text('This is an official acceptance letter.', pageWidth / 2, footerY + 38, { align: 'center' })
  doc.text(`Application No: ${data.applicationNumber}`, pageWidth / 2, footerY + 43, { align: 'center' })
  
  return doc.output('blob')
}
