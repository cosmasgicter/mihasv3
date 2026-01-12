/**
 * Notification Preferences API Endpoint
 * Handles getting and updating user notification preferences
 * Implements Requirements 6.2: Respect user consent settings for each notification channel
 */

import { supabaseAdminClient } from '../_lib/supabaseClient.js';
import { 
  getUserPreferences, 
  updateChannelConsent, 
  updateMultipleChannelPreferences,
  updateQuietHours,
  getPreferenceAuditTrail,
  exportUserPreferences
} from '../_lib/notificationPreferenceManager.js';

/**
 * Extract request metadata for audit trail
 */
function getRequestMetadata(request) {
  return {
    ip_address: request.headers.get('cf-connecting-ip') || 
                request.headers.get('x-forwarded-for') || 
                request.headers.get('x-real-ip'),
    user_agent: request.headers.get('user-agent'),
    source: 'web'
  };
}

/**
 * Validate user authentication
 */
async function validateUser(request) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing or invalid authorization header');
  }

  const token = authHeader.substring(7);
  const { data: { user }, error } = await supabaseAdminClient.auth.getUser(token);
  
  if (error || !user) {
    throw new Error('Invalid or expired token');
  }

  return user;
}

/**
 * Handle GET requests - fetch user preferences
 */
async function handleGet(request, user) {
  try {
    const url = new URL(request.url);
    const includeAudit = url.searchParams.get('include_audit') === 'true';
    const auditLimit = parseInt(url.searchParams.get('audit_limit')) || 50;

    const preferences = await getUserPreferences(user.id);
    
    const response = {
      success: true,
      preferences
    };

    if (includeAudit) {
      response.audit_trail = await getPreferenceAuditTrail(user.id, auditLimit);
    }

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error fetching preferences:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Handle POST requests - update preferences
 */
async function handlePost(request, user) {
  try {
    const body = await request.json();
    const metadata = getRequestMetadata(request);

    // Handle different types of updates
    if (body.action === 'update_channel') {
      // Single channel update
      const { channel, enabled, reason } = body;
      
      if (!channel) {
        throw new Error('Channel is required for channel updates');
      }

      const action = enabled ? 'opt_in' : 'opt_out';
      const result = await updateChannelConsent(user.id, channel, action, {
        ...metadata,
        reason: reason || `User ${action} for ${channel}`
      });

      return new Response(JSON.stringify({
        success: true,
        preferences: result
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (body.action === 'update_multiple_channels') {
      // Multiple channel updates
      const { channels, reason } = body;
      
      if (!channels || typeof channels !== 'object') {
        throw new Error('Channels object is required for multiple channel updates');
      }

      const result = await updateMultipleChannelPreferences(user.id, channels, {
        ...metadata,
        reason: reason || 'Bulk channel preference update'
      });

      return new Response(JSON.stringify({
        success: true,
        preferences: result
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (body.action === 'update_quiet_hours') {
      // Quiet hours update
      const { quiet_hours_start, quiet_hours_end, timezone, reason } = body;

      const result = await updateQuietHours(
        user.id, 
        quiet_hours_start, 
        quiet_hours_end, 
        timezone, 
        {
          ...metadata,
          reason: reason || 'Quiet hours preference update'
        }
      );

      return new Response(JSON.stringify({
        success: true,
        preferences: result
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Default: treat as bulk preference update
    const { 
      email_enabled, 
      sms_enabled, 
      whatsapp_enabled, 
      push_enabled, 
      in_app_enabled,
      quiet_hours_start,
      quiet_hours_end,
      timezone,
      reason 
    } = body;

    // Update channel preferences if provided
    const channelUpdates = {};
    if (email_enabled !== undefined) channelUpdates.email = email_enabled;
    if (sms_enabled !== undefined) channelUpdates.sms = sms_enabled;
    if (whatsapp_enabled !== undefined) channelUpdates.whatsapp = whatsapp_enabled;
    if (push_enabled !== undefined) channelUpdates.push = push_enabled;
    if (in_app_enabled !== undefined) channelUpdates.in_app = in_app_enabled;

    let result;

    if (Object.keys(channelUpdates).length > 0) {
      result = await updateMultipleChannelPreferences(user.id, channelUpdates, {
        ...metadata,
        reason: reason || 'Preference update'
      });
    }

    // Update quiet hours if provided
    if (quiet_hours_start !== undefined || quiet_hours_end !== undefined || timezone !== undefined) {
      result = await updateQuietHours(
        user.id, 
        quiet_hours_start, 
        quiet_hours_end, 
        timezone, 
        {
          ...metadata,
          reason: reason || 'Quiet hours update'
        }
      );
    }

    // If no updates were made, just return current preferences
    if (!result) {
      result = await getUserPreferences(user.id);
    }

    return new Response(JSON.stringify({
      success: true,
      preferences: result
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error updating preferences:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Handle PUT requests - export preferences
 */
async function handlePut(request, user) {
  try {
    const exportData = await exportUserPreferences(user.id);

    return new Response(JSON.stringify({
      success: true,
      export_data: exportData
    }), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="notification-preferences-${user.id}.json"`
      }
    });
  } catch (error) {
    console.error('Error exporting preferences:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Main handler function
 */
export default async function handler(request) {
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400'
      }
    });
  }

  try {
    // Validate authentication
    const user = await validateUser(request);

    // Route to appropriate handler
    switch (request.method) {
      case 'GET':
        return await handleGet(request, user);
      case 'POST':
        return await handlePost(request, user);
      case 'PUT':
        return await handlePut(request, user);
      default:
        return new Response(JSON.stringify({
          success: false,
          error: 'Method not allowed'
        }), {
          status: 405,
          headers: { 'Content-Type': 'application/json' }
        });
    }
  } catch (error) {
    console.error('Authentication error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Unauthorized'
    }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}