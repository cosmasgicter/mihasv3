import { supabaseAdminClient, getUserFromRequest } from '../../_lib/supabaseClient.js';
import { generateApplicationSlip } from '../../_lib/applicationSlip.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

export async function onRequest(context) {
  const { request } = context;
  
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { applicationIds } = await request.json();
    if (!Array.isArray(applicationIds) || applicationIds.length === 0) {
      return new Response(JSON.stringify({ error: 'Application IDs array required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (applicationIds.length > 50) {
      return new Response(JSON.stringify({ error: 'Maximum 50 applications per batch' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { data: applications, error: fetchError } = await supabaseAdminClient
      .from('applications')
      .select(`
        *,
        programs:program_id(name),
        intakes:intake_id(name),
        user_profiles:user_id(full_name, email, phone)
      `)
      .in('id', applicationIds)
      .eq('user_id', user.id);

    if (fetchError) {
      return new Response(JSON.stringify({ 
        error: 'Failed to fetch applications',
        message: fetchError.message 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const results = [];
    const errors = [];
    const concurrency = 5;

    for (let i = 0; i < applications.length; i += concurrency) {
      const batch = applications.slice(i, i + concurrency);
      
      const batchResults = await Promise.allSettled(
        batch.map(async (application) => {
          const slipData = {
            application_number: application.application_number,
            public_tracking_code: application.public_tracking_code,
            status: application.status,
            payment_status: application.payment_status,
            submitted_at: application.submitted_at,
            updated_at: application.updated_at,
            program_name: application.programs?.name,
            intake_name: application.intakes?.name,
            institution: application.institution,
            full_name: application.user_profiles?.full_name,
            email: application.user_profiles?.email,
            phone: application.user_profiles?.phone,
            nationality: application.nationality,
            admin_feedback: application.admin_feedback
          };

          const pdfBuffer = await generateApplicationSlip(slipData);
          const fileName = `${user.id}/${application.application_number}/${Date.now()}-slip.pdf`;
          
          const { data: uploadData, error: uploadError } = await supabaseAdminClient.storage
            .from('app_docs')
            .upload(fileName, pdfBuffer, {
              contentType: 'application/pdf',
              upsert: true
            });

          if (uploadError) throw uploadError;

          const { data: publicUrl } = supabaseAdminClient.storage
            .from('app_docs')
            .getPublicUrl(uploadData.path);

          await supabaseAdminClient
            .from('application_documents')
            .upsert({
              application_id: application.id,
              document_type: 'application_slip',
              document_name: `Application Slip - ${application.application_number}.pdf`,
              file_url: publicUrl.publicUrl,
              system_generated: true,
              updated_at: new Date().toISOString()
            }, {
              onConflict: 'application_id,document_type'
            });

          return {
            applicationId: application.id,
            applicationNumber: application.application_number,
            slipUrl: publicUrl.publicUrl
          };
        })
      );

      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          errors.push({
            applicationId: batch[index].id,
            applicationNumber: batch[index].application_number,
            error: result.reason.message
          });
        }
      });
    }

    return new Response(JSON.stringify({ 
      success: true,
      generated: results.length,
      failed: errors.length,
      results,
      errors
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Batch slip generation error:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to generate batch slips',
      message: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
