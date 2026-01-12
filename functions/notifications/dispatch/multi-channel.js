/**
 * Multi-Channel Notification Dispatcher Endpoint
 * Handles notification dispatch across all supported channels with delivery tracking
 */

import { supabaseAdminClient, getUserFromRequest } from '../../_lib/supabaseClient.js';
import { dispatchNotification, getDeliveryStatus, retryFailedDeliveries } from '../../_lib/notificationDispatcher.js';

export async function onRequest(context) {
  const { request } = context;
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
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
    
    if (request.method === 'POST') {
      return await handleDispatch(context, authContext);
    } else if (request.method === 'GET') {
      return await handleGetStatus(context, authContext);
    }
    
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Multi-channel dispatcher error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Handle notification dispatch
 */
async function handleDispatch(context, authContext) {
  const { request } = context;
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };
  
  try {
    const body = await request.json();
    const {
      userId,
      templateName = 'default',
      variables = {},
      channels = ['email', 'push', 'in_app'],
      priority = 'normal'
    } = body;
    
    // Validate required fields
    if (!userId) {
      return new Response(JSON.stringify({ error: 'userId is required' }), {
        status: 400,
        headers: corsHeaders
      });
    }
    
    // Check permissions - users can only send to themselves, admins can send to anyone
    const isAdmin = authContext.user.role === 'admin' || authContext.user.role === 'super_admin';
    if (!isAdmin && userId !== authContext.user.id) {
      return new Response(JSON.stringify({ error: 'Insufficient permissions' }), {
        status: 403,
        headers: corsHeaders
      });
    }
    
    // Validate channels
    const validChannels = ['email', 'sms', 'whatsapp', 'push', 'in_app'];
    const invalidChannels = channels.filter(c => !validChannels.includes(c));
    if (invalidChannels.length > 0) {
      return new Response(JSON.stringify({ 
        error: `Invalid channels: ${invalidChannels.join(', ')}` 
      }), {
        status: 400,
        headers: corsHeaders
      });
    }
    
    // Dispatch notification
    const result = await dispatchNotification({
      userId,
      templateName,
      variables,
      channels,
      priority,
      env: context.env
    });
    
    if (!result.success) {
      return new Response(JSON.stringify({ error: result.error }), {
        status: 500,
        headers: corsHeaders
      });
    }
    
    return new Response(JSON.stringify({
      success: true,
      notification_id: result.notification_id,
      channels_attempted: channels,
      results: result.results
    }), {
      status: 200,
      headers: corsHeaders
    });
    
  } catch (error) {
    console.error('Dispatch error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: corsHeaders
    });
  }
}

/**
 * Handle delivery status requests
 */
async function handleGetStatus(context, authContext) {
  const url = new URL(context.request.url);
  const notificationId = url.searchParams.get('notification_id');
  const action = url.searchParams.get('action');
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };
  
  if (!notificationId) {
    return new Response(JSON.stringify({ error: 'notification_id is required' }), {
      status: 400,
      headers: corsHeaders
    });
  }
  
  try {
    // Verify user has access to this notification
    const { data: notification } = await supabaseAdminClient
      .from('notifications')
      .select('user_id')
      .eq('id', notificationId)
      .single();
    
    if (!notification) {
      return new Response(JSON.stringify({ error: 'Notification not found' }), {
        status: 404,
        headers: corsHeaders
      });
    }
    
    // Check permissions
    const isAdmin = authContext.user.role === 'admin' || authContext.user.role === 'super_admin';
    if (!isAdmin && notification.user_id !== authContext.user.id) {
      return new Response(JSON.stringify({ error: 'Insufficient permissions' }), {
        status: 403,
        headers: corsHeaders
      });
    }
    
    if (action === 'retry') {
      // Retry failed deliveries
      const retryResult = await retryFailedDeliveries(notificationId);
      return new Response(JSON.stringify(retryResult), {
        status: 200,
        headers: corsHeaders
      });
    } else {
      // Get delivery status
      const statusResult = await getDeliveryStatus(notificationId);
      return new Response(JSON.stringify(statusResult), {
        status: 200,
        headers: corsHeaders
      });
    }
    
  } catch (error) {
    console.error('Status check error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: corsHeaders
    });
  }
}

/**
 * Handle bulk notification dispatch (admin only)
 */
export async function onRequestPut(context) {
  const { request } = context;
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
  
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  
  try {
    // Admin authentication required
    const authContext = await getUserFromRequest(request, { requireAdmin: true });
    if (authContext.error) {
      return new Response(JSON.stringify({ error: authContext.error }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    const body = await request.json();
    const {
      userIds = [],
      templateName = 'default',
      variables = {},
      channels = ['email', 'in_app'],
      batchSize = 10
    } = body;
    
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return new Response(JSON.stringify({ error: 'userIds array is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Process in batches to avoid overwhelming the system
    const results = [];
    for (let i = 0; i < userIds.length; i += batchSize) {
      const batch = userIds.slice(i, i + batchSize);
      
      const batchPromises = batch.map(userId => 
        dispatchNotification({
          userId,
          templateName,
          variables,
          channels,
          priority: 'bulk',
          env: context.env
        })
      );
      
      const batchResults = await Promise.allSettled(batchPromises);
      results.push(...batchResults.map((result, index) => ({
        userId: batch[index],
        success: result.status === 'fulfilled' && result.value.success,
        notification_id: result.status === 'fulfilled' ? result.value.notification_id : null,
        error: result.status === 'rejected' ? result.reason : 
               (result.value.success ? null : result.value.error)
      })));
      
      // Small delay between batches
      if (i + batchSize < userIds.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    const successful = results.filter(r => r.success).length;
    
    return new Response(JSON.stringify({
      success: true,
      total_users: userIds.length,
      successful_dispatches: successful,
      failed_dispatches: userIds.length - successful,
      results
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Bulk dispatch error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}