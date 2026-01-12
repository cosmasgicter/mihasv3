/**
 * Notification Delivery Resilience System
 * Implements retry logic with exponential backoff, fallback channel selection,
 * and comprehensive delivery tracking for the MIHAS notification system.
 * 
 * Requirements: 6.3 - Notification delivery resilience system
 */

import { supabaseAdminClient } from './supabaseClient.js';
import { sendEmail } from './emailService.js';
import { sendSMS, sendWhatsApp } from './twilioService.js';
import { sendPushNotification } from './pushService.js';

/**
 * Configuration for retry logic and fallback channels
 */
const RESILIENCE_CONFIG = {
  // Exponential backoff settings
  baseDelayMs: 1000, // 1 second base delay
  maxDelayMs: 300000, // 5 minutes max delay
  backoffMultiplier: 2,
  jitterFactor: 0.1, // 10% jitter to prevent thundering herd
  
  // Maximum retry attempts per channel
  maxRetries: 3,
  
  // Fallback channel priority order
  fallbackChannels: {
    email: ['in_app', 'sms', 'whatsapp'],
    sms: ['email', 'in_app', 'whatsapp'],
    whatsapp: ['sms', 'email', 'in_app'],
    push: ['in_app', 'email', 'sms'],
    in_app: ['email', 'push', 'sms']
  },
  
  // Channel reliability thresholds (success rate below which to trigger fallback)
  reliabilityThreshold: 0.7, // 70% success rate
  
  // Time window for calculating success rates (in hours)
  successRateWindow: 24
};

/**
 * Calculate exponential backoff delay with jitter
 */
function calculateBackoffDelay(attempt) {
  const baseDelay = RESILIENCE_CONFIG.baseDelayMs * Math.pow(RESILIENCE_CONFIG.backoffMultiplier, attempt - 1);
  const jitter = baseDelay * RESILIENCE_CONFIG.jitterFactor * (Math.random() - 0.5);
  const delay = Math.min(baseDelay + jitter, RESILIENCE_CONFIG.maxDelayMs);
  return Math.max(delay, RESILIENCE_CONFIG.baseDelayMs);
}

/**
 * Get channel success rate over the specified time window
 */
async function getChannelSuccessRate(channel, hoursBack = RESILIENCE_CONFIG.successRateWindow) {
  const since = new Date(Date.now() - (hoursBack * 60 * 60 * 1000)).toISOString();
  
  const { data, error } = await supabaseAdminClient
    .from('notification_deliveries')
    .select('status')
    .eq('channel', channel)
    .gte('created_at', since);
  
  if (error || !data || data.length === 0) {
    return 1.0; // Assume good if no data
  }
  
  const successful = data.filter(d => ['sent', 'delivered'].includes(d.status)).length;
  return successful / data.length;
}

/**
 * Determine if a channel should use fallback based on recent success rate
 */
async function shouldUseFallback(channel) {
  const successRate = await getChannelSuccessRate(channel);
  return successRate < RESILIENCE_CONFIG.reliabilityThreshold;
}

/**
 * Get available fallback channels for a user
 */
async function getAvailableFallbackChannels(userId, originalChannel, userPreferences) {
  const fallbackOptions = RESILIENCE_CONFIG.fallbackChannels[originalChannel] || [];
  const availableChannels = [];
  
  for (const channel of fallbackOptions) {
    // Check if user has enabled this channel
    if (userPreferences[`${channel}_enabled`]) {
      // Check if channel is currently reliable
      const shouldFallback = await shouldUseFallback(channel);
      if (!shouldFallback) {
        availableChannels.push(channel);
      }
    }
  }
  
  return availableChannels;
}

/**
 * Update delivery record with retry information
 */
async function updateDeliveryForRetry(deliveryId, attempt, nextRetryAt = null) {
  const updateData = {
    delivery_attempt: attempt,
    status: 'pending',
    updated_at: new Date().toISOString()
  };
  
  if (nextRetryAt) {
    updateData.metadata = { next_retry_at: nextRetryAt.toISOString() };
  }
  
  const { error } = await supabaseAdminClient
    .from('notification_deliveries')
    .update(updateData)
    .eq('id', deliveryId);
  
  if (error) {
    console.error('Failed to update delivery for retry:', error);
    return false;
  }
  
  return true;
}

/**
 * Create fallback delivery record
 */
async function createFallbackDelivery(notificationId, originalDeliveryId, fallbackChannel) {
  const { data, error } = await supabaseAdminClient
    .from('notification_deliveries')
    .insert({
      notification_id: notificationId,
      channel: fallbackChannel,
      status: 'pending',
      delivery_attempt: 1,
      metadata: {
        is_fallback: true,
        original_delivery_id: originalDeliveryId,
        fallback_reason: 'original_channel_failed'
      }
    })
    .select()
    .single();
  
  if (error) {
    console.error('Failed to create fallback delivery:', error);
    return null;
  }
  
  return data;
}

/**
 * Execute delivery with resilience features
 */
async function executeResilientDelivery(deliveryRecord, contactInfo, template, variables, env = {}) {
  const { id: deliveryId, channel, delivery_attempt, notification_id } = deliveryRecord;
  
  try {
    let result;
    
    // Execute channel-specific delivery
    switch (channel) {
      case 'email':
        if (!contactInfo.email) {
          throw new Error('No email address available');
        }
        result = await sendEmail({
          to: contactInfo.email,
          subject: template.subject_template ? 
            substituteVariables(template.subject_template, variables) : 
            variables.title || 'Notification',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              ${substituteVariables(template.body_template, variables)}
              <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
              <p style="font-size: 14px; color: #6b7280;">MIHAS - Mukuba Institute of Health and Allied Sciences</p>
            </div>
          `,
          env
        });
        break;
        
      case 'sms':
        if (!contactInfo.phone) {
          throw new Error('No phone number available');
        }
        result = await sendSMS({
          to: contactInfo.phone,
          message: substituteVariables(template.body_template, variables).substring(0, 160)
        });
        break;
        
      case 'whatsapp':
        if (!contactInfo.phone) {
          throw new Error('No phone number available');
        }
        result = await sendWhatsApp({
          to: contactInfo.phone,
          message: substituteVariables(template.body_template, variables)
        });
        break;
        
      case 'push':
        result = await sendPushNotification(contactInfo.user_id, {
          title: template.subject_template ? 
            substituteVariables(template.subject_template, variables) : 
            variables.title || 'Notification',
          body: substituteVariables(template.body_template, variables),
          icon: '/images/mihas-icon-192.png',
          badge: '/images/mihas-badge-72.png'
        });
        break;
        
      case 'in_app':
        const { data, error } = await supabaseAdminClient
          .from('in_app_notifications')
          .insert({
            user_id: contactInfo.user_id,
            title: template.subject_template ? 
              substituteVariables(template.subject_template, variables) : 
              variables.title || 'Notification',
            content: substituteVariables(template.body_template, variables),
            type: variables.type || 'info',
            read: false
          })
          .select()
          .single();
        
        if (error) {
          throw new Error(error.message);
        }
        
        result = { success: true, id: data.id };
        break;
        
      default:
        throw new Error(`Unsupported channel: ${channel}`);
    }
    
    // Update delivery status based on result
    if (result.success) {
      await supabaseAdminClient
        .from('notification_deliveries')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          external_id: result.id || result.sid,
          metadata: {
            ...deliveryRecord.metadata,
            delivery_success: true,
            attempt_completed_at: new Date().toISOString()
          }
        })
        .eq('id', deliveryId);
      
      return { success: true, result };
    } else {
      throw new Error(result.error || 'Delivery failed');
    }
    
  } catch (error) {
    console.error(`Delivery failed for ${channel} (attempt ${delivery_attempt}):`, error);
    
    // Update delivery with failure information
    await supabaseAdminClient
      .from('notification_deliveries')
      .update({
        status: 'failed',
        failed_at: new Date().toISOString(),
        error_message: error.message,
        metadata: {
          ...deliveryRecord.metadata,
          delivery_success: false,
          attempt_completed_at: new Date().toISOString(),
          error_details: error.message
        }
      })
      .eq('id', deliveryId);
    
    return { success: false, error: error.message, shouldRetry: delivery_attempt < RESILIENCE_CONFIG.maxRetries };
  }
}

/**
 * Variable substitution helper
 */
function substituteVariables(template, variables) {
  if (!template || !variables) return template || '';
  
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return variables[key] || match;
  });
}

/**
 * Retry failed delivery with exponential backoff
 */
export async function retryFailedDelivery(deliveryId, env = {}) {
  // Get delivery record
  const { data: delivery, error } = await supabaseAdminClient
    .from('notification_deliveries')
    .select(`
      *,
      notifications!inner(user_id, title, message, type, action_url)
    `)
    .eq('id', deliveryId)
    .single();
  
  if (error || !delivery) {
    return { success: false, error: 'Delivery record not found' };
  }
  
  // Check if we've exceeded max retries
  if (delivery.delivery_attempt >= RESILIENCE_CONFIG.maxRetries) {
    return { success: false, error: 'Maximum retry attempts exceeded' };
  }
  
  // Calculate backoff delay
  const delayMs = calculateBackoffDelay(delivery.delivery_attempt);
  const nextRetryAt = new Date(Date.now() + delayMs);
  
  // Update delivery record for retry
  const nextAttempt = delivery.delivery_attempt + 1;
  const updated = await updateDeliveryForRetry(deliveryId, nextAttempt, nextRetryAt);
  
  if (!updated) {
    return { success: false, error: 'Failed to update delivery record' };
  }
  
  // Schedule the retry (in a real implementation, you'd use a job queue)
  // For now, we'll execute after the delay
  setTimeout(async () => {
    await executeScheduledRetry(deliveryId, env);
  }, delayMs);
  
  return {
    success: true,
    nextAttempt,
    retryAt: nextRetryAt,
    delayMs
  };
}

/**
 * Execute a scheduled retry
 */
async function executeScheduledRetry(deliveryId, env = {}) {
  try {
    // Get updated delivery record and related data
    const { data: delivery } = await supabaseAdminClient
      .from('notification_deliveries')
      .select(`
        *,
        notifications!inner(user_id, title, message, type, action_url)
      `)
      .eq('id', deliveryId)
      .single();
    
    if (!delivery) {
      console.error('Delivery record not found for retry:', deliveryId);
      return;
    }
    
    // Get user contact info
    const { data: profile } = await supabaseAdminClient
      .from('profiles')
      .select('email, phone, full_name')
      .eq('id', delivery.notifications.user_id)
      .single();
    
    // Get template
    const { data: template } = await supabaseAdminClient
      .from('notification_templates')
      .select('*')
      .eq('name', 'default') // You might want to store the original template name
      .eq('channel', delivery.channel)
      .eq('is_active', true)
      .maybeSingle();
    
    if (!template) {
      console.error('Template not found for retry:', delivery.channel);
      return;
    }
    
    // Prepare variables
    const variables = {
      title: delivery.notifications.title,
      message: delivery.notifications.message,
      full_name: profile?.full_name,
      user_id: delivery.notifications.user_id
    };
    
    // Execute delivery
    const contactInfo = {
      ...profile,
      user_id: delivery.notifications.user_id
    };
    
    const result = await executeResilientDelivery(delivery, contactInfo, template, variables, env);
    
    // If retry failed and we haven't exceeded max attempts, schedule another retry
    if (!result.success && result.shouldRetry) {
      await retryFailedDelivery(deliveryId, env);
    }
    
  } catch (error) {
    console.error('Error executing scheduled retry:', error);
  }
}

/**
 * Attempt fallback delivery to alternative channels
 */
export async function attemptFallbackDelivery(originalDeliveryId, env = {}) {
  // Get original delivery record
  const { data: originalDelivery, error } = await supabaseAdminClient
    .from('notification_deliveries')
    .select(`
      *,
      notifications!inner(user_id, title, message, type, action_url)
    `)
    .eq('id', originalDeliveryId)
    .single();
  
  if (error || !originalDelivery) {
    return { success: false, error: 'Original delivery record not found' };
  }
  
  // Get user preferences
  const { data: preferences } = await supabaseAdminClient
    .from('user_notification_preferences')
    .select('*')
    .eq('user_id', originalDelivery.notifications.user_id)
    .single();
  
  if (!preferences) {
    return { success: false, error: 'User preferences not found' };
  }
  
  // Get available fallback channels
  const fallbackChannels = await getAvailableFallbackChannels(
    originalDelivery.notifications.user_id,
    originalDelivery.channel,
    preferences
  );
  
  if (fallbackChannels.length === 0) {
    return { success: false, error: 'No fallback channels available' };
  }
  
  // Try each fallback channel in order
  const results = [];
  
  for (const fallbackChannel of fallbackChannels) {
    // Create fallback delivery record
    const fallbackDelivery = await createFallbackDelivery(
      originalDelivery.notification_id,
      originalDeliveryId,
      fallbackChannel
    );
    
    if (!fallbackDelivery) {
      results.push({ channel: fallbackChannel, success: false, error: 'Failed to create fallback record' });
      continue;
    }
    
    // Get user contact info
    const { data: profile } = await supabaseAdminClient
      .from('profiles')
      .select('email, phone, full_name')
      .eq('id', originalDelivery.notifications.user_id)
      .single();
    
    // Get template for fallback channel
    const { data: template } = await supabaseAdminClient
      .from('notification_templates')
      .select('*')
      .eq('name', 'default')
      .eq('channel', fallbackChannel)
      .eq('is_active', true)
      .maybeSingle();
    
    if (!template) {
      results.push({ channel: fallbackChannel, success: false, error: 'Template not found' });
      continue;
    }
    
    // Prepare variables
    const variables = {
      title: originalDelivery.notifications.title,
      message: originalDelivery.notifications.message,
      full_name: profile?.full_name,
      user_id: originalDelivery.notifications.user_id
    };
    
    // Execute fallback delivery
    const contactInfo = {
      ...profile,
      user_id: originalDelivery.notifications.user_id
    };
    
    const result = await executeResilientDelivery(fallbackDelivery, contactInfo, template, variables, env);
    
    results.push({
      channel: fallbackChannel,
      deliveryId: fallbackDelivery.id,
      ...result
    });
    
    // If successful, we can stop trying other fallbacks
    if (result.success) {
      break;
    }
  }
  
  return {
    success: results.some(r => r.success),
    originalChannel: originalDelivery.channel,
    fallbackResults: results
  };
}

/**
 * Get comprehensive delivery statistics for monitoring
 */
export async function getDeliveryStatistics(timeWindowHours = 24) {
  const since = new Date(Date.now() - (timeWindowHours * 60 * 60 * 1000)).toISOString();
  
  const { data, error } = await supabaseAdminClient
    .from('notification_deliveries')
    .select('channel, status, delivery_attempt, created_at')
    .gte('created_at', since);
  
  if (error) {
    return { success: false, error: error.message };
  }
  
  const stats = {
    total: data.length,
    byChannel: {},
    byStatus: {},
    retryStats: {
      totalRetries: 0,
      retriesByAttempt: {}
    },
    successRates: {}
  };
  
  // Process statistics
  data.forEach(delivery => {
    const { channel, status, delivery_attempt } = delivery;
    
    // Channel stats
    if (!stats.byChannel[channel]) {
      stats.byChannel[channel] = { total: 0, sent: 0, failed: 0, pending: 0 };
    }
    stats.byChannel[channel].total++;
    stats.byChannel[channel][status] = (stats.byChannel[channel][status] || 0) + 1;
    
    // Status stats
    stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;
    
    // Retry stats
    if (delivery_attempt > 1) {
      stats.retryStats.totalRetries++;
      stats.retryStats.retriesByAttempt[delivery_attempt] = 
        (stats.retryStats.retriesByAttempt[delivery_attempt] || 0) + 1;
    }
  });
  
  // Calculate success rates
  Object.keys(stats.byChannel).forEach(channel => {
    const channelStats = stats.byChannel[channel];
    const successful = (channelStats.sent || 0) + (channelStats.delivered || 0);
    stats.successRates[channel] = channelStats.total > 0 ? successful / channelStats.total : 0;
  });
  
  return { success: true, stats, timeWindow: `${timeWindowHours} hours` };
}

/**
 * Process failed deliveries and trigger retries/fallbacks
 */
export async function processFailedDeliveries(env = {}) {
  // Get failed deliveries that haven't exceeded max retries
  const { data: failedDeliveries } = await supabaseAdminClient
    .from('notification_deliveries')
    .select('id, channel, delivery_attempt, created_at')
    .eq('status', 'failed')
    .lt('delivery_attempt', RESILIENCE_CONFIG.maxRetries)
    .order('created_at', { ascending: true })
    .limit(50); // Process in batches
  
  if (!failedDeliveries || failedDeliveries.length === 0) {
    return { success: true, processed: 0 };
  }
  
  const results = [];
  
  for (const delivery of failedDeliveries) {
    try {
      // First try retry with exponential backoff
      const retryResult = await retryFailedDelivery(delivery.id, env);
      
      if (retryResult.success) {
        results.push({ deliveryId: delivery.id, action: 'retry_scheduled', result: retryResult });
      } else {
        // If retry failed, try fallback channels
        const fallbackResult = await attemptFallbackDelivery(delivery.id, env);
        results.push({ deliveryId: delivery.id, action: 'fallback_attempted', result: fallbackResult });
      }
    } catch (error) {
      console.error('Error processing failed delivery:', delivery.id, error);
      results.push({ deliveryId: delivery.id, action: 'error', error: error.message });
    }
  }
  
  return {
    success: true,
    processed: failedDeliveries.length,
    results
  };
}

export {
  RESILIENCE_CONFIG,
  calculateBackoffDelay,
  getChannelSuccessRate,
  shouldUseFallback,
  executeResilientDelivery
};