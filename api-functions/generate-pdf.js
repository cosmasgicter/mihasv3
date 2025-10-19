import { supabaseAdminClient } from '../api/_lib/supabaseClient.js'
import { generateAcceptanceLetter, generatePaymentReceipt } from '../api/_lib/pdfTemplates.js'
import { logger } from './utils/logger.js'

const supabase = supabaseAdminClient

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  try {
    const { applicationId, documentType } = JSON.parse(event.body)

    // Fetch application
    const { data: application, error: fetchError } = await supabase
      .from('applications')
      .select('*')
      .eq('id', applicationId)
      .single()

    if (fetchError || !application) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Application not found' })
      }
    }

    // Generate PDF using unified template system
    const documentData = {
      application_number: application.application_number,
      full_name: application.full_name,
      email: application.email,
      phone: application.phone,
      program_name: application.program,
      intake_name: application.intake,
      institution: application.institution,
      payment_status: application.payment_status,
      application_fee: application.application_fee,
      amount: application.amount,
      submitted_at: application.submitted_at
    };
    
    const pdfBuffer = documentType === 'acceptance_letter'
      ? await generateAcceptanceLetter(documentData)
      : await generatePaymentReceipt(documentData)

    // Upload to Supabase Storage
    const fileName = `${documentType}-${application.application_number}-${Date.now()}.pdf`
    const filePath = `${application.user_id}/${applicationId}/${documentType}/${fileName}`

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('app_docs')
      .upload(filePath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true
      })

    if (uploadError) {
      throw new Error(uploadError.message)
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('app_docs')
      .getPublicUrl(filePath)

    // Update document record
    await supabase
      .from('application_documents')
      .update({ file_url: urlData.publicUrl })
      .eq('application_id', applicationId)
      .eq('document_type', documentType)

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        url: urlData.publicUrl,
        path: filePath
      })
    }
  } catch (error) {
    logger.error('PDF generation error:', error)
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    }
  }
}
