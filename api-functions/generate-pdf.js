import { jsPDF } from 'jspdf'
import { supabaseAdminClient } from '../../api/_lib/supabaseClient.js'

const supabase = supabaseAdminClient

function generateAcceptanceLetter(application) {
  const doc = new jsPDF()
  
  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.text('ACCEPTANCE LETTER', 105, 30, { align: 'center' })
  
  doc.setFontSize(12)
  doc.setFont('helvetica', 'normal')
  const institutionName = application.institution === 'KATC' 
    ? 'Kalulushi Training Centre'
    : 'Mukuba Institute of Health and Allied Sciences'
  doc.text(institutionName, 105, 40, { align: 'center' })
  
  doc.setFontSize(10)
  doc.text(`Date: ${new Date().toLocaleDateString()}`, 20, 60)
  doc.text(`Application Number: ${application.application_number}`, 20, 70)
  
  doc.setFontSize(11)
  doc.text(`Dear ${application.full_name},`, 20, 90)
  
  const bodyText = [
    'We are pleased to inform you that your application has been approved.',
    '',
    `Program: ${application.program}`,
    `Intake: ${application.intake}`,
    '',
    'Congratulations on your acceptance!',
    '',
    'Sincerely,',
    'Admissions Office'
  ]
  
  let yPos = 100
  bodyText.forEach(line => {
    doc.text(line, 20, yPos)
    yPos += 7
  })
  
  doc.setFontSize(8)
  doc.text('This is a system-generated document.', 105, 280, { align: 'center' })
  
  return doc.output('arraybuffer')
}

function generateFinanceReceipt(application) {
  const doc = new jsPDF()
  
  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.text('PAYMENT RECEIPT', 105, 30, { align: 'center' })
  
  doc.setFontSize(10)
  doc.text(`Receipt No: ${application.application_number}-${Date.now()}`, 20, 50)
  doc.text(`Date: ${new Date().toLocaleDateString()}`, 20, 57)
  
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text('Student Details', 20, 75)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(`Name: ${application.full_name}`, 20, 85)
  doc.text(`Application Number: ${application.application_number}`, 20, 92)
  doc.text(`Program: ${application.program}`, 20, 99)
  
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text('Payment Details', 20, 115)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(`Application Fee: K${application.application_fee}`, 20, 125)
  doc.text(`Amount Paid: K${application.amount || 0}`, 20, 132)
  
  doc.setFontSize(8)
  doc.text('This is a system-generated receipt.', 105, 280, { align: 'center' })
  
  return doc.output('arraybuffer')
}

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

    // Generate PDF
    const pdfBuffer = documentType === 'acceptance_letter'
      ? generateAcceptanceLetter(application)
      : generateFinanceReceipt(application)

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
    console.error('PDF generation error:', error)
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    }
  }
}
