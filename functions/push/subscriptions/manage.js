/**
 * Push Subscription Management Endpoint
 * Handles push notification subscription and unsubscription
 */

import { getUserFromRequest } from '../../_lib/supabaseClient.js';
import { subscribeToPush, unsubscribeFromPush, getUserPushSubscriptions } from '../../_lib/pushService.js';

export async function onRequest(context) {
  const { request } = context;
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
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
        return await handleGetSubscriptions(userId, corsHeaders);
      case 'POST':
        return await handleSubscribe(request, userId, corsHeaders);
      case 'DELETE':
        return await handleUnsubscribe(request, userId, corsHeaders);
      default:
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
          status: 405,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
    
  } catch (error) {
    console.error('Push subscription management error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Get user's push subscriptions
 */
async function handleGetSubscriptions(userId, corsHeaders) {
  try {
    const result = await getUserPushSubscriptions(userId);
    
    return new Response(JSON.stringify(result), {
      status: result.success ? 200 : 400,
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
 * Subscribe to push notifications
 */
async function handleSubscribe(request, userId, corsHeaders) {
  try {
    const body = await request.json();
    const { subscription } = body;
    
    if (!subscription || !subscription.endpoint) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Valid subscription object is required' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Add user agent for tracking
    const userAgent = request.headers.get('User-Agent') || '';
    const subscriptionData = {
      ...subscription,
      userAgent
    };
    
    const result = await subscribeToPush(userId, subscriptionData);
    
    return new Response(JSON.stringify(result), {
      status: result.success ? 200 : 400,
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
 * Unsubscribe from push notifications
 */
async function handleUnsubscribe(request, userId, corsHeaders) {
  try {
    const url = new URL(request.url);
    const endpoint = url.searchParams.get('endpoint');
    
    if (!endpoint) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'endpoint parameter is required' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    const result = await unsubscribeFromPush(userId, decodeURIComponent(endpoint));
    
    return new Response(JSON.stringify(result), {
      status: result.success ? 200 : 400,
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