/**
 * Notification Consent Management API Endpoint
 * Handles opt-in/opt-out requests with audit trail
 * Implements Requirements 6.2: Implement opt-in/opt-out functionality with audit trail
 */

import { supabaseAdminClient } from '../_lib/supabaseClient.js';
import { 
  updateChannelConsent, 
  getUserPreferences,
  isChannelEnabled,
  getPreferenceAuditTrail
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
    source: request.headers.get('x-source') || 'web'
  };
}

/**
 * Validate user authentication (optional for some consent operations)
 */
async function validateUser(request, required = true) {
  const authHeader = request.headers.get('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    if (required) {
      throw new Error('Missing or invalid authorization header');
    }
    return null;
  }

  const token = authHeader.substring(7);
  const { data: { user }, error } = await supabaseAdminClient.auth.getUser(token);
  
  if (error || !user) {
    if (required) {
      throw new Error('Invalid or expired token');
    }
    return null;
  }

  return user;
}

/**
 * Handle POST requests - update consent
 */
async function handlePost(request) {
  try {
    const body = await request.json();
    const metadata = getRequestMetadata(request);
    
    const { 
      user_id, 
      channel, 
      action, 
      reason, 
      source,
      email // For email-based consent (unsubscribe links)
    } = body;

    // Validate required fields
    if (!channel || !action) {
      throw new Error('Channel and action are required');
    }

    if (!['opt_in', 'opt_out'].includes(action)) {
      throw new Error('Action must be either "opt_in" or "opt_out"');
    }

    let userId = user_id;

    // If user_id not provided, try to get from auth or email
    if (!userId) {
      if (email) {
        // Look up user by email for unsubscribe links
        const { data: profile } = await supabaseAdminClient
          .from('profiles')
          .select('id')
          .eq('email', email)
          .single();
        
        if (profile) {
          userId = profile.id;
        } else {
          throw new Error('User not found with provided email');
        }
      } else {
        // Try to get from authentication
        const user = await validateUser(request, true);
        userId = user.id;
      }
    }

    if (!userId) {
      throw new Error('User ID is required');
    }

    // Update consent with audit trail
    const result = await updateChannelConsent(userId, channel, action, {
      ...metadata,
      source: source || metadata.source,
      reason: reason || `User ${action} via ${metadata.source}`,
      email_context: email ? { unsubscribe_email: email } : undefined
    });

    return new Response(JSON.stringify({
      success: true,
      message: `Successfully ${action === 'opt_in' ? 'opted in to' : 'opted out of'} ${channel} notifications`,
      preferences: result
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error updating consent:', error);
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
 * Handle GET requests - check consent status
 */
async function handleGet(request) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get('user_id');
    const channel = url.searchParams.get('channel');
    const email = url.searchParams.get('email');

    let targetUserId = userId;

    // If user_id not provided, try to get from auth or email
    if (!targetUserId) {
      if (email) {
        // Look up user by email
        const { data: profile } = await supabaseAdminClient
          .from('profiles')
          .select('id')
          .eq('email', email)
          .single();
        
        if (profile) {
          targetUserId = profile.id;
        } else {
          throw new Error('User not found with provided email');
        }
      } else {
        // Try to get from authentication
        const user = await validateUser(request, true);
        targetUserId = user.id;
      }
    }

    if (!targetUserId) {
      throw new Error('User ID is required');
    }

    if (channel) {
      // Check specific channel
      const isEnabled = await isChannelEnabled(targetUserId, channel);
      
      return new Response(JSON.stringify({
        success: true,
        user_id: targetUserId,
        channel,
        enabled: isEnabled,
        status: isEnabled ? 'opted_in' : 'opted_out'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } else {
      // Get all preferences
      const preferences = await getUserPreferences(targetUserId);
      
      return new Response(JSON.stringify({
        success: true,
        user_id: targetUserId,
        preferences: {
          email: preferences.email_enabled,
          sms: preferences.sms_enabled,
          whatsapp: preferences.whatsapp_enabled,
          push: preferences.push_enabled,
          in_app: preferences.in_app_enabled
        }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

  } catch (error) {
    console.error('Error checking consent:', error);
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
 * Handle PUT requests - bulk consent update
 */
async function handlePut(request) {
  try {
    const body = await request.json();
    const metadata = getRequestMetadata(request);
    
    const { 
      user_id, 
      consents, // Object with channel: boolean pairs
      reason,
      source,
      email
    } = body;

    if (!consents || typeof consents !== 'object') {
      throw new Error('Consents object is required');
    }

    let userId = user_id;

    // If user_id not provided, try to get from auth or email
    if (!userId) {
      if (email) {
        const { data: profile } = await supabaseAdminClient
          .from('profiles')
          .select('id')
          .eq('email', email)
          .single();
        
        if (profile) {
          userId = profile.id;
        } else {
          throw new Error('User not found with provided email');
        }
      } else {
        const user = await validateUser(request, true);
        userId = user.id;
      }
    }

    if (!userId) {
      throw new Error('User ID is required');
    }

    // Update each consent individually for proper audit trail
    const results = {};
    const errors = [];

    for (const [channel, enabled] of Object.entries(consents)) {
      try {
        const action = enabled ? 'opt_in' : 'opt_out';
        const result = await updateChannelConsent(userId, channel, action, {
          ...metadata,
          source: source || metadata.source,
          reason: reason || `Bulk consent update: ${action} for ${channel}`,
          bulk_operation: true
        });
        
        results[channel] = {
          success: true,
          enabled,
          updated_at: result.updated_at
        };
      } catch (error) {
        errors.push({ channel, error: error.message });
        results[channel] = {
          success: false,
          error: error.message
        };
      }
    }

    const hasErrors = errors.length > 0;

    return new Response(JSON.stringify({
      success: !hasErrors,
      message: hasErrors ? 'Some consent updates failed' : 'All consent updates successful',
      results,
      errors: hasErrors ? errors : undefined
    }), {
      status: hasErrors ? 207 : 200, // 207 Multi-Status for partial success
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error updating bulk consent:', error);
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
 * Handle DELETE requests - revoke all consents
 */
async function handleDelete(request) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get('user_id');
    const email = url.searchParams.get('email');
    const reason = url.searchParams.get('reason') || 'User requested consent revocation';

    let targetUserId = userId;

    // If user_id not provided, try to get from auth or email
    if (!targetUserId) {
      if (email) {
        const { data: profile } = await supabaseAdminClient
          .from('profiles')
          .select('id')
          .eq('email', email)
          .single();
        
        if (profile) {
          targetUserId = profile.id;
        } else {
          throw new Error('User not found with provided email');
        }
      } else {
        const user = await validateUser(request, true);
        targetUserId = user.id;
      }
    }

    if (!targetUserId) {
      throw new Error('User ID is required');
    }

    const metadata = getRequestMetadata(request);

    // Opt out of all channels
    const channels = ['email', 'sms', 'whatsapp', 'push', 'in_app'];
    const results = {};

    for (const channel of channels) {
      try {
        const result = await updateChannelConsent(targetUserId, channel, 'opt_out', {
          ...metadata,
          reason: `${reason} - ${channel}`,
          revoke_all_operation: true
        });
        
        results[channel] = { success: true, revoked_at: result.updated_at };
      } catch (error) {
        results[channel] = { success: false, error: error.message };
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'All consents revoked successfully',
      user_id: targetUserId,
      results
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error revoking consents:', error);
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
 * Main handler function
 */
export default async function handler(request) {
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Source',
        'Access-Control-Max-Age': '86400'
      }
    });
  }

  try {
    // Route to appropriate handler
    switch (request.method) {
      case 'GET':
        return await handleGet(request);
      case 'POST':
        return await handlePost(request);
      case 'PUT':
        return await handlePut(request);
      case 'DELETE':
        return await handleDelete(request);
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
    console.error('Consent management error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Internal server error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}