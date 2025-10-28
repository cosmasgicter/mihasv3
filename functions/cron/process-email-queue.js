import { supabaseAdminClient } from '../_lib/supabaseClient.js';
import { sendEmail } from '../_lib/emailService.js';

export async function onRequest(context) {
  const { env, request } = context;
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Cron-Key'
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Verify cron key
  const cronKey = request.headers.get('X-Cron-Key');
  if (env.CRON_SECRET_KEY && cronKey !== env.CRON_SECRET_KEY) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    // Fetch pending emails (limit to 50 per run to avoid timeouts)
    const { data: emails, error: fetchError } = await supabaseAdminClient
      .from('email_queue')
      .select('*')
      .eq('status', 'pending')
      .or(`scheduled_for.is.null,scheduled_for.lte.${new Date().toISOString()}`)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(50);

    if (fetchError) throw fetchError;

    if (!emails || emails.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No pending emails',
        processed: 0 
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const results = {
      total: emails.length,
      sent: 0,
      failed: 0,
      errors: []
    };

    // Process each email with rate limiting
    for (let i = 0; i < emails.length; i++) {
      const email = emails[i];
      
      // Add delay between emails to respect rate limits (2 requests/second = 500ms delay)
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 600)); // 600ms delay for safety
      }
      try {
        // Send email
        const result = await sendEmail({
          to: email.to_email,
          subject: email.subject,
          html: email.template,
          env
        });

        if (result.success) {
          // Mark as sent
          await supabaseAdminClient
            .from('email_queue')
            .update({
              status: 'sent',
              sent_at: new Date().toISOString(),
              error_message: null
            })
            .eq('id', email.id);
          
          results.sent++;
        } else {
          // Mark as failed
          await supabaseAdminClient
            .from('email_queue')
            .update({
              status: 'failed',
              error_message: result.error || 'Unknown error'
            })
            .eq('id', email.id);
          
          results.failed++;
          results.errors.push({ id: email.id, error: result.error });
        }
      } catch (error) {
        // Mark as failed
        await supabaseAdminClient
          .from('email_queue')
          .update({
            status: 'failed',
            error_message: error.message
          })
          .eq('id', email.id);
        
        results.failed++;
        results.errors.push({ id: email.id, error: error.message });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: `Processed ${results.total} emails`,
      results
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Email queue processing error:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
