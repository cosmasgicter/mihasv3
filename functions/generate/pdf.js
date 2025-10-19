import { supabaseAdminClient } from '../_lib/supabaseClient.js'
import { generateAcceptanceLetter, generatePaymentReceipt } from '../_lib/pdfTemplates.js'
import { logger } from '../_lib/logger.js'

const supabase = supabaseAdminClient

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      }
    });
  }
  
  try {
    // Get query params
    const queryStringParameters = Object.fromEntries(url.searchParams);
    
    // Get body for POST/PUT
    let body = null;
    if (request.method === 'POST' || request.method === 'PUT') {
      const contentType = request.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        body = await request.json();
      } else {
        body = await request.text();
      }
    }
    
    // Get headers
    const headers = Object.fromEntries(request.headers);
    
    // Create event-like object for compatibility
    const event = {
      httpMethod: request.method,
      body: typeof body === 'string' ? body : JSON.stringify(body),
      headers,
      queryStringParameters
    };

  if (event.httpMethod !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
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
      return new Response(JSON.stringify({ error: 'Application not found' }), {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
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

    return new Response(JSON.stringify({
      success: true,
      url: urlData.publicUrl,
      path: filePath
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (error) {
    logger.error('PDF generation error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  } catch (error) {
    logger.error('Function error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
