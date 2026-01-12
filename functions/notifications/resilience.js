/**
 * Notification Delivery Resilience API Endpoint
 * Provides endpoints for managing notification delivery resilience,
 * retry logic, fallback channels, and delivery statistics.
 * 
 * Requirements: 6.3 - Notification delivery resilience system
 */

import { supabaseAdminClient, getUserFromRequest } from '../_lib/supabaseClient.js';
import {
  retryFailedDelivery,
  attemptFallbackDelivery,
  getDeliveryStatistics,
  processFailedDeliveries,
  getChannelSuccessRate
} from '../_lib/notificationResilience.js';

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
    
    const url = new URL(request.url);
    const action = url.searchParams.get('action');
    
    switch (request.method) {
      case 'GET':
        return await handleGetRequest(context, authContext, action);
      case 'POST':
        return await handlePostRequest(context, authContext, action);
      case 'PUT':
        return await handlePutRequest(context, authContext, action);
      default:
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
          status: 405,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
    
  } catch (error) {
    console.error('Resilience API error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Handle GET requests - retrieve statistics and status information
 */
async function handleGetRequest(context, authContext, action) {
  const { request } = context;
  const url = new URL(request.url);
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };
  
  try {
    switch (action) {
      case 'statistics':
        return await getStatistics(url, authContext, corsHeaders);
      case 'channel-health':
        return await getChannelHealth(url, authContext, corsHeaders);
      case 'delivery-status':
        return await getDeliveryStatus(url, authContext, corsHeaders);
      default:
        return new Response(JSON.stringify({ error: 'Invalid action' }), {
          status: 400,
          headers: corsHeaders
        });
    }
  } catch (error) {
    console.error('GET request error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: corsHeaders
    });
  }
}

/**
 * Handle POST requests - trigger retries and fallbacks
 */
async function handlePostRequest(context, authContext, action) {
  const { request } = context;
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };
  
  try {
    const body = await request.json();
    
    switch (action) {
      case 'retry':
        return await retryDelivery(body, authContext, corsHeaders, context.env);
      case 'fallback':
        return await triggerFallback(body, authContext, corsHeaders, context.env);
      default:
        return new Response(JSON.stringify({ error: 'Invalid action' }), {
          status: 400,
          headers: corsHeaders
        });
    }
  } catch (error) {
    console.error('POST request error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: corsHeaders
    });
  }
}

/**
 * Handle PUT requests - process failed deliveries (admin only)
 */
async function handlePutRequest(context, authContext, action) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };
  
  // Admin authentication required for bulk operations
  const isAdmin = authContext.user.role === 'admin' || authContext.user.role === 'super_admin';
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: 'Admin access required' }), {
      status: 403,
      headers: corsHeaders
    });
  }
  
  try {
    switch (action) {
      case 'process-failed':
        return await processFailedDeliveriesEndpoint(corsHeaders, context.env);
      default:
        return new Response(JSON.stringify({ error: 'Invalid action' }), {
          status: 400,
          headers: corsHeaders
        });
    }
  } catch (error) {
    console.error('PUT request error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: corsHeaders
    });
  }
}

/**
 * Get delivery statistics
 */
async function getStatistics(url, authContext, corsHeaders) {
  const timeWindowHours = parseInt(url.searchParams.get('hours')) || 24;
  
  if (timeWindowHours < 1 || timeWindowHours > 168) { // Max 1 week
    return new Response(JSON.stringify({ error: 'Invalid time window (1-168 hours)' }), {
      status: 400,
      headers: corsHeaders
    });
  }
  
  const result = await getDeliveryStatistics(timeWindowHours);
  
  return new Response(JSON.stringify(result), {
    status: result.success ? 200 : 500,
    headers: corsHeaders
  });
}

/**
 * Get channel health information
 */
async function getChannelHealth(url, authContext, corsHeaders) {
  const channels = ['email', 'sms', 'whatsapp', 'push', 'in_app'];
  const hoursBack = parseInt(url.searchParams.get('hours')) || 24;
  
  const healthData = {};
  
  for (const channel of channels) {
    const successRate = await getChannelSuccessRate(channel, hoursBack);
    healthData[channel] = {
      success_rate: successRate,
      status: successRate >= 0.9 ? 'excellent' : 
              successRate >= 0.7 ? 'good' : 
              successRate >= 0.5 ? 'poor' : 'critical'
    };
  }
  
  return new Response(JSON.stringify({
    success: true,
    time_window_hours: hoursBack,
    channels: healthData
  }), {
    status: 200,
    headers: corsHeaders
  });
}

/**
 * Get delivery status for a specific notification
 */
async function getDeliveryStatus(url, authContext, corsHeaders) {
  const notificationId = url.searchParams.get('notification_id');
  
  if (!notificationId) {
    return new Response(JSON.stringify({ error: 'notification_id is required' }), {
      status: 400,
      headers: corsHeaders
    });
  }
  
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
  
  // Get delivery records
  const { data: deliveries, error } = await supabaseAdminClient
    .from('notification_deliveries')
    .select('*')
    .eq('notification_id', notificationId)
    .order('created_at', { ascending: false });
  
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: corsHeaders
    });
  }
  
  return new Response(JSON.stringify({
    success: true,
    notification_id: notificationId,
    deliveries: deliveries || []
  }), {
    status: 200,
    headers: corsHeaders
  });
}

/**
 * Retry a specific delivery
 */
async function retryDelivery(body, authContext, corsHeaders, env) {
  const { delivery_id } = body;
  
  if (!delivery_id) {
    return new Response(JSON.stringify({ error: 'delivery_id is required' }), {
      status: 400,
      headers: corsHeaders
    });
  }
  
  // Verify user has access to this delivery
  const { data: delivery } = await supabaseAdminClient
    .from('notification_deliveries')
    .select(`
      id,
      notifications!inner(user_id)
    `)
    .eq('id', delivery_id)
    .single();
  
  if (!delivery) {
    return new Response(JSON.stringify({ error: 'Delivery not found' }), {
      status: 404,
      headers: corsHeaders
    });
  }
  
  // Check permissions
  const isAdmin = authContext.user.role === 'admin' || authContext.user.role === 'super_admin';
  if (!isAdmin && delivery.notifications.user_id !== authContext.user.id) {
    return new Response(JSON.stringify({ error: 'Insufficient permissions' }), {
      status: 403,
      headers: corsHeaders
    });
  }
  
  const result = await retryFailedDelivery(delivery_id, env);
  
  return new Response(JSON.stringify(result), {
    status: result.success ? 200 : 400,
    headers: corsHeaders
  });
}

/**
 * Trigger fallback delivery
 */
async function triggerFallback(body, authContext, corsHeaders, env) {
  const { delivery_id } = body;
  
  if (!delivery_id) {
    return new Response(JSON.stringify({ error: 'delivery_id is required' }), {
      status: 400,
      headers: corsHeaders
    });
  }
  
  // Verify user has access to this delivery
  const { data: delivery } = await supabaseAdminClient
    .from('notification_deliveries')
    .select(`
      id,
      notifications!inner(user_id)
    `)
    .eq('id', delivery_id)
    .single();
  
  if (!delivery) {
    return new Response(JSON.stringify({ error: 'Delivery not found' }), {
      status: 404,
      headers: corsHeaders
    });
  }
  
  // Check permissions
  const isAdmin = authContext.user.role === 'admin' || authContext.user.role === 'super_admin';
  if (!isAdmin && delivery.notifications.user_id !== authContext.user.id) {
    return new Response(JSON.stringify({ error: 'Insufficient permissions' }), {
      status: 403,
      headers: corsHeaders
    });
  }
  
  const result = await attemptFallbackDelivery(delivery_id, env);
  
  return new Response(JSON.stringify(result), {
    status: result.success ? 200 : 400,
    headers: corsHeaders
  });
}

/**
 * Process all failed deliveries (admin only)
 */
async function processFailedDeliveriesEndpoint(corsHeaders, env) {
  const result = await processFailedDeliveries(env);
  
  return new Response(JSON.stringify(result), {
    status: result.success ? 200 : 500,
    headers: corsHeaders
  });
}