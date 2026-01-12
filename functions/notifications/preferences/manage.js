/**
 * Notification Preferences Management Endpoint
 * Handles user notification preferences and consent tracking
 */

import { supabaseAdminClient, getUserFromRequest } from '../../_lib/supabaseClient.js';

export async function onRequest(context) {
  const { request } = context;
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
  
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  
  try {
    // Authentication required
    const authContext = await getUserFromRequest(request);
    if (authContext.error) {
      return new Response(JSON.stringify({ error: authContext.error }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    const userId = authContext.user.id;
    
    switch (request.method) {
      case 'GET':
        return await handleGetPreferences(userId, corsHeaders);
      case 'POST':
      case 'PUT':
        return await handleUpdatePreferences(request, userId, corsHeaders);
      default:
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
          status: 405,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
    
  } catch (error) {
    console.error('Notification preferences error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Get user's notification preferences
 */
async function handleGetPreferences(userId, corsHeaders) {
  try {
    const { data: preferences, error } = await supabaseAdminClient
      .from('user_notification_preferences')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Return defaults if no preferences found
    const defaultPreferences = {
      user_id: userId,
      email_enabled: true,
      sms_enabled: false,
      whatsapp_enabled: false,
      push_enabled: true,
      in_app_enabled: true,
      quiet_hours_start: '22:00',
      quiet_hours_end: '08:00',
      timezone: 'Africa/Lusaka'
    };
    
    return new Response(JSON.stringify({
      success: true,
      preferences: preferences || defaultPreferences
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Update user's notification preferences
 */
async function handleUpdatePreferences(request, userId, corsHeaders) {
  try {
    const body = await request.json();
    const {
      email_enabled,
      sms_enabled,
      whatsapp_enabled,
      push_enabled,
      in_app_enabled,
      quiet_hours_start,
      quiet_hours_end,
      timezone
    } = body;
    
    // Prepare update data with consent timestamps
    const updateData = {
      user_id: userId
    };
    
    const now = new Date().toISOString();
    
    // Track consent changes
    if (typeof email_enabled === 'boolean') {
      updateData.email_enabled = email_enabled;
      if (email_enabled) {
        updateData.email_consent_at = now;
      }
    }
    
    if (typeof sms_enabled === 'boolean') {
      updateData.sms_enabled = sms_enabled;
      if (sms_enabled) {
        updateData.sms_consent_at = now;
      }
    }
    
    if (typeof whatsapp_enabled === 'boolean') {
      updateData.whatsapp_enabled = whatsapp_enabled;
      if (whatsapp_enabled) {
        updateData.whatsapp_consent_at = now;
      }
    }
    
    if (typeof push_enabled === 'boolean') {
      updateData.push_enabled = push_enabled;
      if (push_enabled) {
        updateData.push_consent_at = now;
      }
    }
    
    if (typeof in_app_enabled === 'boolean') {
      updateData.in_app_enabled = in_app_enabled;
    }
    
    // Update other preferences
    if (quiet_hours_start) {
      updateData.quiet_hours_start = quiet_hours_start;
    }
    
    if (quiet_hours_end) {
      updateData.quiet_hours_end = quiet_hours_end;
    }
    
    if (timezone) {
      updateData.timezone = timezone;
    }
    
    // Upsert preferences
    const { data, error } = await supabaseAdminClient
      .from('user_notification_preferences')
      .upsert(updateData, {
        onConflict: 'user_id'
      })
      .select()
      .single();
    
    if (error) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: error.message 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    return new Response(JSON.stringify({
      success: true,
      preferences: data
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Handle consent withdrawal (GDPR compliance)
 */
export async function onRequestDelete(context) {
  const { request } = context;
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
  
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  
  try {
    const authContext = await getUserFromRequest(request);
    if (authContext.error) {
      return new Response(JSON.stringify({ error: authContext.error }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    const userId = authContext.user.id;
    const url = new URL(request.url);
    const channel = url.searchParams.get('channel');
    
    if (!channel || !['email', 'sms', 'whatsapp', 'push'].includes(channel)) {
      return new Response(JSON.stringify({ 
        error: 'Valid channel parameter required (email, sms, whatsapp, push)' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Withdraw consent for specific channel
    const updateData = {
      [`${channel}_enabled`]: false
    };
    
    // Clear consent timestamp
    updateData[`${channel}_consent_at`] = null;
    
    const { error } = await supabaseAdminClient
      .from('user_notification_preferences')
      .upsert({
        user_id: userId,
        ...updateData
      }, {
        onConflict: 'user_id'
      });
    
    if (error) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: error.message 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // If withdrawing push consent, also deactivate push subscriptions
    if (channel === 'push') {
      await supabaseAdminClient
        .from('push_subscriptions')
        .update({ is_active: false })
        .eq('user_id', userId);
    }
    
    return new Response(JSON.stringify({
      success: true,
      message: `Consent withdrawn for ${channel} notifications`
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Consent withdrawal error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}