import type { ApplicationSlipData } from './applicationSlip.types'
import { importWithChunkRecovery } from '@/lib/lazyImportRecovery'
import { formatTimestamp } from './dateFormat'
import { sanitizeForLog } from './security'

// Brand constants
const NAVY = { r: 26, g: 54, b: 93 } // #1a365d
const MARGIN = 20
const GREY_TEXT = { r: 107, g: 114, b: 128 }
const GOLD = { r: 187, g: 139, b: 64 }
const SOFT_SURFACE = { r: 244, g: 248, b: 252 }

function safeText(value: string | null | undefined, fallback = 'Not provided'): string {
  if (!value) return fallback
  const cleaned = value.replace(/\s+/g, ' ').trim()
  return cleaned.length > 0 ? cleaned : fallback
}

function formatStatusLabel(value: string | null | undefined, fallback = 'Unknown'): string {
  const sanitized = safeText(value, fallback)
  if (sanitized === fallback) return fallback
  return sanitized
    .split(/[_-]/)
    .map(part => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(' ')
}

function formatDateTime(value?: string | null): string {
  if (!value) return 'Not available'
  return formatTimestamp(value)
}

function getFullInstitutionName(code: string | null | undefined): string {
  const names: Record<string, string> = {
    KATC: 'Kalulushi Training Centre',
    MIHAS: 'Mukuba Institute of Health and Allied Sciences',
  }
  return names[code || ''] || code || 'MIHAS'
}

export async function generateApplicationSlip(data: ApplicationSlipData): Promise<Blob> {
  if (!data || !data.application_number || !data.public_tracking_code) {
    throw new Error('Missing application data for slip generation')
  }

  try {
    const [{ default: QRCode }, { jsPDF }, autoTable] = await Promise.all([
      importWithChunkRecovery(() => import('qrcode'), {
        guardKey: 'wizard-slip-qrcode',
        recoveryMessage: 'A newer version of the slip generator is loading. Please wait a moment and try again.',
      }),
      importWithChunkRecovery(() => import('jspdf'), {
        guardKey: 'wizard-slip-jspdf',
        recoveryMessage: 'A newer version of the slip generator is loading. Please wait a moment and try again.',
      }),
      importWithChunkRecovery(() => import('jspdf-autotable').then((mod) => mod.default), {
        guardKey: 'wizard-slip-autotable',
        recoveryMessage: 'A newer version of the slip generator is loading. Please wait a moment and try again.',
      }),
    ])
    const doc = new jsPDF() as InstanceType<typeof jsPDF> & { lastAutoTable?: { finalY: number } }
    const institutionName = getFullInstitutionName(data.institution)
    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()

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
    doc.text('MIHAS APPLICATION RECORD', MARGIN, 12)
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.text(institutionName, pageWidth / 2, 24, { align: 'center' })

    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text('Private Bag E10, Kitwe, Zambia', pageWidth / 2, 31, { align: 'center' })

    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text('Application Slip', pageWidth / 2, 42, { align: 'center' })

    // --- Date & ref ---
    doc.setTextColor(0, 0, 0)
    doc.setFontSize(10)
    doc.setFillColor(255, 255, 255)
    doc.roundedRect(MARGIN, 56, pageWidth - MARGIN * 2, 18, 4, 4, 'F')
    doc.setDrawColor(223, 231, 239)
    doc.roundedRect(MARGIN, 56, pageWidth - MARGIN * 2, 18, 4, 4)
    doc.setTextColor(GREY_TEXT.r, GREY_TEXT.g, GREY_TEXT.b)
    doc.text('TRACKING CODE', MARGIN + 4, 63)
    doc.text('SUBMITTED', pageWidth - MARGIN - 26, 63, { align: 'right' })
    doc.setTextColor(NAVY.r, NAVY.g, NAVY.b)
    doc.setFont('helvetica', 'bold')
    doc.text(safeText(data.public_tracking_code), MARGIN + 4, 69)
    doc.text(formatDateTime(data.submitted_at), pageWidth - MARGIN - 4, 69, { align: 'right' })

    // --- Divider ---
    let y = 84
    doc.setFontSize(10)
    doc.setTextColor(GREY_TEXT.r, GREY_TEXT.g, GREY_TEXT.b)
    const intro = doc.splitTextToSize(
      'Thank you for submitting your application. This slip confirms that your details are now recorded in the MIHAS admissions platform.',
      pageWidth - MARGIN * 2,
    )
    doc.text(intro, MARGIN, y)

    // --- Application Details table ---
    y += intro.length * 5 + 8
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(NAVY.r, NAVY.g, NAVY.b)
    doc.text('APPLICATION DETAILS', MARGIN, y)

    autoTable(doc, {
      startY: y + 4,
      head: [],
      body: [
        ['Application Number', safeText(data.application_number)],
        ['Tracking Code', safeText(data.public_tracking_code)],
        ['Programme', safeText(data.program_name, 'Not specified')],
        ['Intake', safeText(data.intake_name, 'Not specified')],
        ['Institution', institutionName],
        ['Application Status', formatStatusLabel(data.status, 'Pending')],
        ['Payment Status', formatStatusLabel(data.payment_status, 'Pending Payment')],
      ],
      theme: 'grid',
      styles: { fontSize: 10, lineColor: [223, 231, 239], lineWidth: 0.2, cellPadding: 4 },
      headStyles: { fillColor: [NAVY.r, NAVY.g, NAVY.b] },
      bodyStyles: { textColor: [17, 24, 39] },
      columnStyles: {
        0: { fillColor: [248, 251, 255], fontStyle: 'bold', cellWidth: 55 },
        1: { cellWidth: 'auto' },
      },
    })

    let finalY = (doc.lastAutoTable?.finalY ?? 0) + 10

    // --- Applicant Information table ---
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(NAVY.r, NAVY.g, NAVY.b)
    doc.text('APPLICANT INFORMATION', MARGIN, finalY)

    autoTable(doc, {
      startY: finalY + 4,
      head: [],
      body: [
        ['Full Name', safeText(data.full_name)],
        ['Email', safeText(data.email)],
        ['Phone', safeText(data.phone)],
        ['Nationality', safeText(data.nationality, 'Not provided')],
      ],
      theme: 'grid',
      styles: { fontSize: 10, lineColor: [223, 231, 239], lineWidth: 0.2, cellPadding: 4 },
      bodyStyles: { textColor: [17, 24, 39] },
      columnStyles: {
        0: { fillColor: [248, 251, 255], fontStyle: 'bold', cellWidth: 55 },
        1: { cellWidth: 'auto' },
      },
    })

    finalY = (doc.lastAutoTable?.finalY ?? 0) + 10

    // --- Important Notice ---
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(NAVY.r, NAVY.g, NAVY.b)
    doc.text('IMPORTANT NOTICE', MARGIN, finalY)

    finalY += 6
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(GREY_TEXT.r, GREY_TEXT.g, GREY_TEXT.b)
    const notices = [
      '• Keep this slip in a safe place for future reference',
      '• Use your tracking code when checking status online',
      '• You will be notified by email once a decision is made',
      '• Contact admissions@mihas.edu.zm if any of your details change',
    ]
    notices.forEach((notice) => {
      doc.text(notice, MARGIN, finalY)
      finalY += 6
    })

    // --- QR Code ---
    const qrData = JSON.stringify({
      type: 'application_slip',
      app_no: data.application_number,
      tracking: data.public_tracking_code,
      institution: data.institution,
      program: data.program_name,
      student: data.full_name,
    })
    const qrDataUrl = await QRCode.toDataURL(qrData, { margin: 1, width: 240, errorCorrectionLevel: 'M' })
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
    doc.text(`Generated: ${formatDateTime(new Date().toISOString())}`, pageWidth / 2, footerY, { align: 'center' })
    doc.text('Page 1 of 1', pageWidth - MARGIN, footerY, { align: 'right' })

    return new Blob([doc.output('blob')], { type: 'application/pdf' })
  } catch (error) {
    console.error(
      'Failed to generate application slip:',
      sanitizeForLog(error instanceof Error ? error.message : String(error)),
    )
    throw error
  }
}
