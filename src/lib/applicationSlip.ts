import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import QRCode from 'qrcode'

import { getApiBaseUrl } from './apiConfig'
import { formatDate } from './utils'
import { sanitizeForLog } from './security'
import { supabase } from './supabase'

export interface PublicApplicationStatus {
  public_tracking_code: string
  application_number: string
  status: string
  payment_status: string | null
  submitted_at: string | null
  updated_at: string | null
  program_name: string | null
  intake_name: string | null
  institution: string | null
  full_name: string | null
  email: string | null
  phone: string | null
  admin_feedback?: string | null
  admin_feedback_date?: string | null
}

export type ApplicationSlipData = PublicApplicationStatus & { email: string; userId?: string }

export interface PersistSlipResult {
  success: boolean
  path?: string
  publicUrl?: string
  documentId?: string
  error?: string
}

function safeText(value: string | null | undefined, fallback = 'Not provided'): string {
  if (!value) return fallback
  const cleaned = value.replace(/\s+/g, ' ').trim()
  return cleaned.length > 0 ? cleaned : fallback
}

function formatStatusLabel(value: string | null | undefined, fallback = 'Unknown'): string {
  const sanitized = safeText(value, fallback)
  if (sanitized === fallback) {
    return fallback
  }

  return sanitized
    .split(/[_-]/)
    .map(part => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(' ')
}

function formatDateTime(value?: string | null): string {
  if (!value) return 'Not available'

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return 'Not available'
  }

  const datePart = formatDate(parsed)
  const timePart = parsed.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit'
  })

  return `${datePart} ${timePart}`
}

function decodeBase64(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1] || dataUrl

  const globalAtob = typeof atob === 'function' ? atob : undefined
  if (globalAtob) {
    const binary = globalAtob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes
  }

  if (typeof Buffer !== 'undefined') {
    return Uint8Array.from(Buffer.from(base64, 'base64'))
  }

  throw new Error('Unable to decode base64 content in the current environment')
}

function buildTrackingUrl(code: string): string {
  const baseUrl = getApiBaseUrl().replace(/\/$/, '')
  return `${baseUrl}/track-application?code=${encodeURIComponent(code)}`
}

export async function generateApplicationSlip(data: ApplicationSlipData): Promise<Blob> {
  if (!data || !data.application_number || !data.public_tracking_code) {
    throw new Error('Missing application data for slip generation')
  }

  try {
    const pdfDoc = await PDFDocument.create()
    pdfDoc.setTitle(`Application Slip - ${safeText(data.application_number, 'Unknown')}`)
    pdfDoc.setAuthor('MIHAS Admissions')
    pdfDoc.setSubject('Official application confirmation slip')
    pdfDoc.setProducer('MIHAS Admissions Portal')

    const page = pdfDoc.addPage([595.28, 841.89]) // A4 size in points
    const { width, height } = page.getSize()
    const margin = 48

    const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

    const brandColor = rgb(71 / 255, 43 / 255, 181 / 255)
    const accentColor = rgb(236 / 255, 233 / 255, 252 / 255)

    // Header banner
    page.drawRectangle({
      x: 0,
      y: height - 140,
      width,
      height: 140,
      color: brandColor
    })

    page.drawText('MIHAS Admissions', {
      x: margin,
      y: height - 80,
      size: 28,
      font: boldFont,
      color: rgb(1, 1, 1)
    })

    page.drawText('Official Application Slip', {
      x: margin,
      y: height - 110,
      size: 16,
      font: regularFont,
      color: rgb(1, 1, 1)
    })

    let cursorY = height - 170

    const sectionHeading = (title: string) => {
      page.drawText(title, {
        x: margin,
        y: cursorY,
        size: 14,
        font: boldFont,
        color: brandColor
      })
      cursorY -= 20
      page.drawLine({
        start: { x: margin, y: cursorY },
        end: { x: width - margin, y: cursorY },
        thickness: 1,
        color: brandColor
      })
      cursorY -= 16
    }

    const drawField = (label: string, value: string) => {
      page.drawText(label, {
        x: margin,
        y: cursorY,
        size: 11,
        font: boldFont,
        color: rgb(55 / 255, 65 / 255, 81 / 255)
      })
      cursorY -= 14
      page.drawText(value, {
        x: margin,
        y: cursorY,
        size: 11,
        font: regularFont,
        color: rgb(31 / 255, 41 / 255, 55 / 255)
      })
      cursorY -= 18
    }

    sectionHeading('Applicant Details')
    drawField('Applicant Name', safeText(data.full_name, 'Not provided'))
    drawField('Email', safeText(data.email, 'Not provided'))
    drawField('Phone', safeText(data.phone, 'Not provided'))

    sectionHeading('Application Summary')
    drawField('Application Number', safeText(data.application_number))
    drawField('Tracking Code', safeText(data.public_tracking_code))
    drawField('Program', safeText(data.program_name, 'Not specified'))
    drawField('Intake', safeText(data.intake_name, 'Not specified'))
    drawField('Institution', safeText(data.institution, 'Not specified'))

    sectionHeading('Status & Timeline')
    drawField('Current Status', formatStatusLabel(data.status, 'Unknown'))
    drawField('Payment Status', formatStatusLabel(data.payment_status, 'Pending Review'))
    drawField('Submitted At', formatDateTime(data.submitted_at))
    drawField('Last Updated', formatDateTime(data.updated_at))

    const statusBoxHeight = 70
    const statusBoxY = cursorY - statusBoxHeight
    page.drawRectangle({
      x: margin,
      y: statusBoxY,
      width: width - margin * 2 - 140,
      height: statusBoxHeight,
      color: accentColor,
      borderColor: brandColor,
      borderWidth: 1
    })

    page.drawText('Next Steps', {
      x: margin + 16,
      y: statusBoxY + statusBoxHeight - 24,
      size: 12,
      font: boldFont,
      color: brandColor
    })

    const nextSteps = safeText(data.admin_feedback, 'Our admissions team will contact you with further updates.').slice(0, 500)
    page.drawText(nextSteps, {
      x: margin + 16,
      y: statusBoxY + statusBoxHeight - 40,
      size: 10,
      font: regularFont,
      maxWidth: width - margin * 2 - 172,
      lineHeight: 12,
      color: rgb(55 / 255, 65 / 255, 81 / 255)
    })

    cursorY = statusBoxY - 30

    const generatedAt = new Date()
    drawField('Slip Generated On', formatDateTime(generatedAt.toISOString()))

    const trackingUrl = buildTrackingUrl(data.public_tracking_code)

    const qrDataUrl = await QRCode.toDataURL(trackingUrl, {
      margin: 1,
      width: 240,
      color: {
        dark: '#231F54',
        light: '#FFFFFF'
      }
    })

    const qrImage = await pdfDoc.embedPng(decodeBase64(qrDataUrl))
    const qrSize = 140
    page.drawImage(qrImage, {
      x: width - margin - qrSize,
      y: margin + 20,
      width: qrSize,
      height: qrSize
    })

    page.drawText('Scan to track your application', {
      x: width - margin - qrSize,
      y: margin + 10,
      size: 10,
      font: regularFont,
      color: rgb(55 / 255, 65 / 255, 81 / 255)
    })

    page.drawRectangle({
      x: width - margin - qrSize - 12,
      y: margin + qrSize + 24,
      width: qrSize + 24,
      height: 32,
      color: accentColor,
      borderColor: brandColor,
      borderWidth: 1
    })

    page.drawText('Tracking Link', {
      x: width - margin - qrSize - 4,
      y: margin + qrSize + 45,
      size: 10,
      font: boldFont,
      color: brandColor
    })

    page.drawText(trackingUrl, {
      x: width - margin - qrSize - 4,
      y: margin + qrSize + 30,
      size: 9,
      font: regularFont,
      color: rgb(55 / 255, 65 / 255, 81 / 255),
      maxWidth: qrSize + 16
    })

    const pdfBytes = await pdfDoc.save()
    return new Blob([pdfBytes], { type: 'application/pdf' })
  } catch (error) {
    console.error('Failed to generate application slip:', sanitizeForLog(error instanceof Error ? error.message : String(error)))
    throw error
  }
}

export async function persistSlip(applicationNumber: string, blob: Blob, userId?: string): Promise<PersistSlipResult> {
  const trimmedNumber = (applicationNumber || '').trim()
  if (!trimmedNumber) {
    return { success: false, error: 'Application number is required to persist slip' }
  }

  try {
    const sanitizedNumber = trimmedNumber.replace(/[^a-zA-Z0-9_-]/g, '-') || 'application'
    const timestamp = Date.now()
    
    // Build path based on user ID for bucket policy compliance
    // When userId is available, use user-specific path: userId/applicationNumber/file
    // When no userId, use public path: public/applicationNumber/file (requires different bucket or policy)
    const path = userId 
      ? `${userId}/${sanitizedNumber}/${timestamp}-application-slip.pdf`
      : `public/${sanitizedNumber}/${timestamp}-application-slip.pdf`

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('app_docs')
      .upload(path, blob, {
        contentType: 'application/pdf',
        upsert: true
      })

    if (uploadError || !uploadData) {
      console.error('Application slip upload failed:', sanitizeForLog(uploadError?.message || 'Unknown error'))
      
      // If upload failed and we don't have a userId, it might be due to RLS policy
      // In this case, we'll still return success but without storage persistence
      if (!userId && uploadError?.message?.includes('policy')) {
        console.warn('Storage policy prevented upload for public slip, continuing without persistence')
        return {
          success: true,
          path: undefined,
          publicUrl: undefined,
          documentId: undefined,
          error: 'Slip generated but not stored due to access restrictions'
        }
      }
      
      return {
        success: false,
        error: uploadError?.message || 'Failed to upload application slip'
      }
    }

    const { data: urlData } = supabase.storage
      .from('app_docs')
      .getPublicUrl(uploadData.path)

    const publicUrl = urlData?.publicUrl
    let documentId: string | undefined

    try {
      const { data: application, error: applicationLookupError } = await supabase
        .from('applications_new')
        .select('id')
        .eq('application_number', trimmedNumber)
        .maybeSingle()

      if (applicationLookupError) {
        console.warn('Unable to find application for slip persistence:', sanitizeForLog(applicationLookupError.message))
      } else if (application?.id) {
        const documentPayload = {
          application_id: application.id,
          document_type: 'application_slip',
          document_name: `Application Slip - ${trimmedNumber}.pdf`,
          file_url: publicUrl || uploadData.path,
          system_generated: true
        }

        const { data: existingDocument, error: existingError } = await supabase
          .from('application_documents')
          .select('id')
          .eq('application_id', application.id)
          .eq('document_type', 'application_slip')
          .maybeSingle()

        if (existingError) {
          console.warn('Unable to check existing application slip document:', sanitizeForLog(existingError.message))
        }

        if (existingDocument?.id) {
          const { error: updateError } = await supabase
            .from('application_documents')
            .update({ ...documentPayload, updated_at: new Date().toISOString() })
            .eq('id', existingDocument.id)

          if (updateError) {
            console.warn('Failed to update application slip document record:', sanitizeForLog(updateError.message))
          } else {
            documentId = existingDocument.id
          }
        } else {
          const { data: insertData, error: insertError } = await supabase
            .from('application_documents')
            .insert(documentPayload)
            .select('id')
            .maybeSingle()

          if (insertError) {
            console.warn('Failed to insert application slip document record:', sanitizeForLog(insertError.message))
          } else {
            documentId = insertData?.id
          }
        }
      }
    } catch (dbError) {
      console.error('Unexpected database error while persisting application slip:', sanitizeForLog(dbError instanceof Error ? dbError.message : String(dbError)))
    }

    return {
      success: true,
      path: uploadData.path,
      publicUrl,
      documentId
    }
  } catch (error) {
    console.error('Unexpected error while persisting application slip:', sanitizeForLog(error instanceof Error ? error.message : String(error)))
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to persist application slip'
    }
  }
}
