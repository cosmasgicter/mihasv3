/**
 * Web Push Notification Service
 * Handles push notification delivery to registered devices
 */

import { supabaseAdminClient } from './supabaseClient.js';

// VAPID keys should be stored in environment variables
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:***REMOVED***';

/**
 * Send push notification to all user's subscriptions
 */
export async function sendPushNotification(userId, payload) {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn('VAPID keys not configured, push notifications disabled');
    return { success: false, error: 'Push service not configured' };
  }

  try {
    // Get all active subscriptions for the user
    const { data: subscriptions, error } = await supabaseAdminClient
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (error) {
      throw new Error(`Failed to get subscriptions: ${error.message}`);
    }

    if (!subscriptions || subscriptions.length === 0) {
      return { success: false, error: 'No active push subscriptions found' };
    }

    const notificationPayload = JSON.stringify({
      title: payload.title || 'MIHAS Notification',
      body: payload.body || '',
      icon: payload.icon || '/images/mihas-icon-192.png',
      badge: payload.badge || '/images/mihas-badge-72.png',
      data: {
        url: payload.url || '/',
        timestamp: Date.now(),
        ...payload.data
      }
    });

    const sendPromises = subscriptions.map(async (subscription) => {
      try {
        const result = await sendToSubscription(subscription, notificationPayload);
        
        // If subscription is invalid, mark as inactive
        if (!result.success && result.error === 'invalid_subscription') {
          await supabaseAdminClient
            .from('push_subscriptions')
            .update({ is_active: false })
            .eq('id', subscription.id);
        }
        
        return result;
      } catch (error) {
        console.error('Push send error for subscription:', subscription.id, error);
        return { success: false, error: error.message };
      }
    });

    const results = await Promise.allSettled(sendPromises);
    const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    
    return {
      success: successful > 0,
      sent_count: successful,
      total_subscriptions: subscriptions.length,
      results: results.map(r => r.status === 'fulfilled' ? r.value : { success: false, error: r.reason })
    };

  } catch (error) {
    console.error('Push notification error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send notification to a specific subscription
 */
async function sendToSubscription(subscription, payload) {
  try {
    // Create the subscription object for web-push
    const pushSubscription = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.p256dh,
        auth: subscription.auth
      }
    };

    // For Cloudflare Workers, we need to use the Web Push Protocol directly
    // since web-push library may not be available
    const result = await sendWebPush(pushSubscription, payload);
    
    return { success: true, ...result };
  } catch (error) {
    console.error('Subscription send error:', error);
    
    // Check if it's an invalid subscription error
    if (error.statusCode === 410 || error.statusCode === 404) {
      return { success: false, error: 'invalid_subscription' };
    }
    
    return { success: false, error: error.message };
  }
}

/**
 * Send web push using Web Push Protocol
 * This is a simplified implementation - in production you'd want to use
 * a proper web-push library or service
 */
async function sendWebPush(subscription, payload) {
  // This is a placeholder implementation
  // In a real implementation, you would:
  // 1. Generate VAPID headers
  // 2. Encrypt the payload
  // 3. Send HTTP request to the push service
  
  console.log('Sending push notification:', {
    endpoint: subscription.endpoint,
    payload: payload.substring(0, 100) + '...'
  });
  
  // For now, we'll simulate success
  // In production, replace this with actual web push implementation
  return { success: true, messageId: `push_${Date.now()}` };
}

/**
 * Subscribe user to push notifications
 */
export async function subscribeToPush(userId, subscriptionData) {
  try {
    const { endpoint, keys } = subscriptionData;
    
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      throw new Error('Invalid subscription data');
    }

    // Insert or update subscription
    const { data, error } = await supabaseAdminClient
      .from('push_subscriptions')
      .upsert({
        user_id: userId,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        user_agent: subscriptionData.userAgent || '',
        is_active: true
      }, {
        onConflict: 'user_id,endpoint'
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to save subscription: ${error.message}`);
    }

    return { success: true, subscription: data };
  } catch (error) {
    console.error('Push subscription error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Unsubscribe from push notifications
 */
export async function unsubscribeFromPush(userId, endpoint) {
  try {
    const { error } = await supabaseAdminClient
      .from('push_subscriptions')
      .update({ is_active: false })
      .eq('user_id', userId)
      .eq('endpoint', endpoint);

    if (error) {
      throw new Error(`Failed to unsubscribe: ${error.message}`);
    }

    return { success: true };
  } catch (error) {
    console.error('Push unsubscribe error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get user's push subscriptions
 */
export async function getUserPushSubscriptions(userId) {
  try {
    const { data, error } = await supabaseAdminClient
      .from('push_subscriptions')
      .select('id, endpoint, is_active, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to get subscriptions: ${error.message}`);
    }

    return { success: true, subscriptions: data || [] };
  } catch (error) {
    console.error('Get push subscriptions error:', error);
    return { success: false, error: error.message };
  }
}