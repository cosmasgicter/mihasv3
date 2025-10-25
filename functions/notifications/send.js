import { supabaseAdminClient, getUserFromRequest } from '../_lib/supabaseClient.js';
import { sendEmail } from '../_lib/emailService.js';

export async function onRequestPost(context) {
  const { request } = context;
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
  
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  
  try {
    const authContext = await getUserFromRequest(request, { requireAdmin: true });
    if (authContext.error) {
      return new Response(JSON.stringify({ error: authContext.error }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    const body = await request.json();
    const { user_id, title, message, type, action_url } = body;
    
    if (!user_id || !title || !message) {
      return new Response(JSON.stringify({ error: 'user_id, title, and message are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Check for duplicates in last 60 seconds
    const { data: dedupHash } = await supabaseAdminClient.rpc('generate_notification_dedup_hash', {
      p_user_id: user_id,
      p_title: title,
      p_message: message,
      p_type: type || 'info'
    });
    
    if (dedupHash) {
      const { data: existing } = await supabaseAdminClient
        .from('notifications')
        .select('id')
        .eq('user_id', user_id)
        .eq('dedup_hash', dedupHash)
        .gte('created_at', new Date(Date.now() - 60000).toISOString())
        .limit(1)
        .maybeSingle();
      
      if (existing) {
        return new Response(JSON.stringify({ success: true, duplicate_prevented: true }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }
    
    const { data, error } = await supabaseAdminClient
      .from('notifications')
      .insert({
        user_id,
        title,
        message,
        type: type || 'info',
        action_url,
        is_read: false,
        dedup_hash: dedupHash
      })
      .select()
      .single();
    
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Send email notification
    let emailResult = null;
    try {
      const { data: profile } = await supabaseAdminClient
        .from('profiles')
        .select('email, full_name')
        .eq('id', user_id)
        .single();
      
      if (profile?.email) {
        const emailHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">${title}</h2>
            <p style="font-size: 16px; line-height: 1.6; color: #374151;">${message}</p>
            ${action_url ? `<p style="margin-top: 20px;"><a href="${action_url}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">View Details</a></p>` : ''}
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
            <p style="font-size: 14px; color: #6b7280;">MIHAS - Mukuba Institute of Health and Allied Sciences</p>
          </div>
        `;
        
        emailResult = await sendEmail({
          to: profile.email,
          subject: title,
          html: emailHtml,
          env: context.env
        });
      }
    } catch (emailError) {
      console.error('Email send error:', emailError);
    }
    
    return new Response(JSON.stringify({ 
      success: true, 
      notification: data,
      email_sent: emailResult?.success || false
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
