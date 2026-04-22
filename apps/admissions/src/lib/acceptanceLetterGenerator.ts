// Dynamic import
import QRCode from 'qrcode'
import { formatDate } from './utils'

// Brand constants
const NAVY = { r: 26, g: 54, b: 93 } // #1a365d
const MARGIN = 20
const GREY_TEXT = { r: 107, g: 114, b: 128 }
const GOLD = { r: 187, g: 139, b: 64 }
const SOFT_SURFACE = { r: 244, g: 248, b: 252 }

interface AcceptanceLetterData {
  applicationNumber: string
  studentName: string
  program: string
  institution: string
  intake: string
  approvedDate: string
  startDate?: string
  conditional?: boolean
  conditions?: Array<{ description: string; deadline?: string }>
}

function getFullInstitutionName(code: string): string {
  const names: Record<string, string> = {
    KATC: 'Kalulushi Training Centre',
    MIHAS: 'Mukuba Institute of Health and Allied Sciences',
  }
  return names[code] || code
}

export async function generateAcceptanceLetter(data: AcceptanceLetterData): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const contentWidth = pageWidth - MARGIN * 2
  const institutionName = getFullInstitutionName(data.institution)
  const isConditional = data.conditional && data.conditions?.length

  const ensureSpace = (required: number) => {
    if (y + required <= pageHeight - 28) return
    doc.addPage()
    doc.setFillColor(SOFT_SURFACE.r, SOFT_SURFACE.g, SOFT_SURFACE.b)
    doc.rect(0, 0, pageWidth, pageHeight, 'F')
    y = 24
  }

  doc.setFillColor(SOFT_SURFACE.r, SOFT_SURFACE.g, SOFT_SURFACE.b)
  doc.rect(0, 0, pageWidth, pageHeight, 'F')

  // --- Header band ---
  doc.setFillColor(NAVY.r, NAVY.g, NAVY.b)
  doc.rect(0, 0, pageWidth, 48, 'F')
  doc.setFillColor(GOLD.r, GOLD.g, GOLD.b)
  doc.rect(0, 48, pageWidth, 3, 'F')

  doc.setTextColor(255, 255, 255)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text('MIHAS OFFICIAL LETTER', MARGIN, 12)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text(institutionName, pageWidth / 2, 24, { align: 'center' })

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text('Private Bag E10, Kitwe, Zambia', pageWidth / 2, 31, { align: 'center' })

  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text(
    isConditional ? 'Conditional Letter of Acceptance' : 'Letter of Acceptance',
    pageWidth / 2,
    42,
    { align: 'center' },
  )

  // --- Date line ---
  let y = 62
  doc.setTextColor(0, 0, 0)
  doc.setFillColor(255, 255, 255)
  doc.roundedRect(MARGIN, y - 6, contentWidth, 18, 4, 4, 'F')
  doc.setDrawColor(223, 231, 239)
  doc.roundedRect(MARGIN, y - 6, contentWidth, 18, 4, 4)
  doc.setFontSize(10)
  doc.setTextColor(GREY_TEXT.r, GREY_TEXT.g, GREY_TEXT.b)
  doc.text('REFERENCE', MARGIN + 4, y)
  doc.text('ISSUED', pageWidth - MARGIN - 36, y)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(NAVY.r, NAVY.g, NAVY.b)
  doc.text(data.applicationNumber, MARGIN + 4, y + 5)
  doc.text(formatDate(data.approvedDate), pageWidth - MARGIN - 4, y + 5, { align: 'right' })

  // --- Divider ---
  y += 24

  // --- Salutation ---
  y += 10
  doc.setFontSize(12)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(NAVY.r, NAVY.g, NAVY.b)
  doc.text(`Dear ${data.studentName},`, MARGIN, y)

  // --- Congratulations ---
  y += 10
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(GOLD.r, GOLD.g, GOLD.b)
  doc.text('CONGRATULATIONS', pageWidth / 2, y, { align: 'center' })

  // --- Body ---
  y += 10
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(12)
  doc.setTextColor(20, 34, 54)

  const introText = isConditional
    ? `We are pleased to inform you that your application (${data.applicationNumber}) has been conditionally approved for admission to the ${data.program} programme for the ${data.intake} intake.`
    : `We are pleased to inform you that your application (${data.applicationNumber}) has been approved for admission to the ${data.program} programme for the ${data.intake} intake.`

  const introLines = doc.splitTextToSize(introText, contentWidth)
  doc.text(introLines, MARGIN, y)
  y += introLines.length * 6 + 4

  // --- Programme Details section ---
  ensureSpace(48)
  doc.setFillColor(255, 255, 255)
  doc.roundedRect(MARGIN, y - 2, contentWidth, 38, 5, 5, 'F')
  doc.setDrawColor(223, 231, 239)
  doc.roundedRect(MARGIN, y - 2, contentWidth, 38, 5, 5)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(NAVY.r, NAVY.g, NAVY.b)
  doc.text('Programme Details', MARGIN + 5, y + 6)
  y += 14

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  const details: [string, string][] = [
    ['Programme:', data.program],
    ['Intake:', data.intake],
    ['Application No:', data.applicationNumber],
    ...(data.startDate ? [['Start Date:', formatDate(data.startDate)] as [string, string]] : []),
  ]
  details.forEach(([label, value]) => {
    doc.setFont('helvetica', 'bold')
    doc.text(label, MARGIN + 5, y)
    doc.setFont('helvetica', 'normal')
    doc.text(value, MARGIN + 50, y)
    y += 7
  })
  y += 4

  // --- Conditions section (conditional only) ---
  if (isConditional && data.conditions) {
    ensureSpace(48)
    y += 4
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(180, 60, 20)
    doc.text('Conditions of Admission', MARGIN, y)
    doc.setTextColor(0, 0, 0)
    y += 2
    doc.setDrawColor(200, 200, 200)
    doc.line(MARGIN, y, pageWidth - MARGIN, y)
    y += 6

    doc.setFontSize(11)
    doc.setFont('helvetica', 'normal')
    const condNote = 'Your admission is subject to the following conditions being met:'
    doc.text(condNote, MARGIN, y)
    y += 8

    data.conditions.forEach((cond, i) => {
      ensureSpace(18)
      doc.setFont('helvetica', 'bold')
      const prefix = `${i + 1}. `
      doc.text(prefix, MARGIN + 2, y)
      doc.setFont('helvetica', 'normal')
      const condLines = doc.splitTextToSize(cond.description, contentWidth - 12)
      doc.text(condLines, MARGIN + 10, y)
      y += condLines.length * 6
      if (cond.deadline) {
        doc.setFontSize(10)
        doc.setTextColor(GREY_TEXT.r, GREY_TEXT.g, GREY_TEXT.b)
        doc.text(`Deadline: ${formatDate(cond.deadline)}`, MARGIN + 10, y)
        doc.setTextColor(0, 0, 0)
        doc.setFontSize(11)
        y += 6
      }
      y += 2
    })

    y += 2
    doc.setFontSize(10)
    doc.setTextColor(180, 60, 20)
    const warning = 'Failure to meet these conditions by the stated deadlines may result in withdrawal of this offer.'
    const warnLines = doc.splitTextToSize(warning, contentWidth)
    doc.text(warnLines, MARGIN, y)
    doc.setTextColor(0, 0, 0)
    y += warnLines.length * 5 + 4
  }

  // --- Next Steps ---
  ensureSpace(52)
  y += 4
  doc.setFillColor(255, 255, 255)
  doc.roundedRect(MARGIN, y - 2, contentWidth, 38, 5, 5, 'F')
  doc.setDrawColor(223, 231, 239)
  doc.roundedRect(MARGIN, y - 2, contentWidth, 38, 5, 5)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(NAVY.r, NAVY.g, NAVY.b)
  doc.text('Next Steps', MARGIN + 5, y + 6)
  y += 14

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  const steps = [
    'Confirm your acceptance within 14 days of receiving this letter.',
    'Complete all registration requirements before the start date.',
    'Ensure all fees are paid according to the payment schedule.',
    'Attend the orientation programme on the specified date.',
  ]
  steps.forEach((step, i) => {
    const stepLines = doc.splitTextToSize(`${i + 1}. ${step}`, contentWidth - 10)
    doc.text(stepLines, MARGIN + 5, y)
    y += stepLines.length * 6 + 1
  })

  // --- Closing ---
  ensureSpace(44)
  y += 6
  doc.setFontSize(12)
  doc.setTextColor(20, 34, 54)
  doc.text('We look forward to welcoming you to our institution.', MARGIN, y)
  y += 12
  doc.text('Sincerely,', MARGIN, y)
  y += 14
  doc.setFont('helvetica', 'bold')
  doc.text('Admissions Office', MARGIN, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(institutionName, MARGIN, y + 5)

  // --- QR Code ---
  const qrData = JSON.stringify({
    type: isConditional ? 'conditional_acceptance' : 'acceptance_letter',
    app_no: data.applicationNumber,
    student: data.studentName,
    institution: data.institution,
    program: data.program,
    approved: data.approvedDate,
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
