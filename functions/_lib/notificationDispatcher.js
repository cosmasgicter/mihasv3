/**
 * Multi-Channel Notification Dispatcher
 * Handles delivery across email, SMS, WhatsApp, push notifications, and in-app messages
 * with delivery confirmation and status tracking
 * Enhanced with resilience features: retry logic, fallback channels, and delivery tracking
 */

import { supabaseAdminClient } from './supabaseClient.js';
import { sendEmail } from './emailService.js';
import { sendSMS, sendWhatsApp } from './twilioService.js';
import { sendPushNotification } from './pushService.js';
import { 
  executeResilientDelivery, 
  retryFailedDelivery, 
  attemptFallbackDelivery,
  shouldUseFallback 
} from './notificationResilience.js';

/**
 * Channel-specific formatters
 */
const channelFormatters = {
  email: (template, variables) => ({
    subject: substituteVariables(template.subject_template || '', variables),
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        ${substituteVariables(template.body_template, variables)}
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
        <p style="font-size: 14px; color: #6b7280;">MIHAS - Mukuba Institute of Health and Allied Sciences</p>
      </div>
    `
  }),
  
  sms: (template, variables) => ({
    message: substituteVariables(template.body_template, variables).substring(0, 160) // SMS limit
  }),
  
  whatsapp: (template, variables) => ({
    message: substituteVariables(template.body_template, variables)
  }),
  
  push: (template, variables) => ({
    title: substituteVariables(template.subject_template || '', variables),
    body: substituteVariables(template.body_template, variables),
    icon: '/images/mihas-icon-192.png',
    badge: '/images/mihas-badge-72.png'
  }),
  
  in_app: (template, variables) => ({
    title: substituteVariables(template.subject_template || 'Notification', variables),
    content: substituteVariables(template.body_template, variables)
  })
};

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
 * Get user notification preferences with defaults
 */
async function getUserPreferences(userId) {
  // Import the preference manager
  const { getUserPreferences: getPrefs } = await import('./notificationPreferenceManager.js');
  
  try {
    return await getPrefs(userId);
  } catch (error) {
    console.error('Error getting user preferences, using defaults:', error);
    // Return defaults if preference manager fails
    return {
      email_enabled: true,
      sms_enabled: false,
      whatsapp_enabled: false,
      push_enabled: true,
      in_app_enabled: true
    };
  }
}

/**
 * Get user contact information
 */
async function getUserContactInfo(userId) {
  const { data: profile } = await supabaseAdminClient
    .from('profiles')
    .select('email, phone, full_name')
    .eq('id', userId)
    .single();
  
  return profile;
}

/**
 * Get notification template
 */
async function getNotificationTemplate(templateName, channel) {
  const { data: template } = await supabaseAdminClient
    .from('notification_templates')
    .select('*')
    .eq('name', templateName)
    .eq('channel', channel)
    .eq('is_active', true)
    .maybeSingle();
  
  return template;
}

/**
 * Create delivery tracking record with enhanced metadata
 */
async function createDeliveryRecord(notificationId, channel, status = 'pending', metadata = {}) {
  const { data, error } = await supabaseAdminClient
    .from('notification_deliveries')
    .insert({
      notification_id: notificationId,
      channel,
      status,
      metadata: {
        created_at: new Date().toISOString(),
        ...metadata
      }
    })
    .select()
    .single();
  
  if (error) {
    console.error('Failed to create delivery record:', error);
    return null;
  }
  
  return data;
}

/**
 * Update delivery status
 */
async function updateDeliveryStatus(deliveryId, status, metadata = {}) {
  const updateData = {
    status,
    metadata: metadata,
    updated_at: new Date().toISOString()
  };
  
  if (status === 'sent') {
    updateData.sent_at = new Date().toISOString();
  } else if (status === 'delivered') {
    updateData.delivered_at = new Date().toISOString();
  } else if (status === 'failed') {
    updateData.failed_at = new Date().toISOString();
    if (metadata.error) {
      updateData.error_message = metadata.error;
    }
  }
  
  const { error } = await supabaseAdminClient
    .from('notification_deliveries')
    .update(updateData)
    .eq('id', deliveryId);
  
  if (error) {
    console.error('Failed to update delivery status:', error);
  }
}

/**
 * Send email notification
 */
async function sendEmailNotification(deliveryId, contactInfo, template, variables, env) {
  if (!contactInfo.email) {
    await updateDeliveryStatus(deliveryId, 'failed', { error: 'No email address' });
    return { success: false, error: 'No email address' };
  }
  
  const formatted = channelFormatters.email(template, variables);
  
  try {
    const result = await sendEmail({
      to: contactInfo.email,
      subject: formatted.subject,
      html: formatted.html,
      env
    });
    
    if (result.success) {
      await updateDeliveryStatus(deliveryId, 'sent', { 
        external_id: result.id,
        email: contactInfo.email 
      });
    } else {
      await updateDeliveryStatus(deliveryId, 'failed', { error: result.error });
    }
    
    return result;
  } catch (error) {
    await updateDeliveryStatus(deliveryId, 'failed', { error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * Send SMS notification
 */
async function sendSMSNotification(deliveryId, contactInfo, template, variables) {
  if (!contactInfo.phone) {
    await updateDeliveryStatus(deliveryId, 'failed', { error: 'No phone number' });
    return { success: false, error: 'No phone number' };
  }
  
  const formatted = channelFormatters.sms(template, variables);
  
  try {
    const result = await sendSMS({
      to: contactInfo.phone,
      message: formatted.message
    });
    
    if (result.success) {
      await updateDeliveryStatus(deliveryId, 'sent', { 
        external_id: result.sid,
        phone: contactInfo.phone 
      });
    } else {
      await updateDeliveryStatus(deliveryId, 'failed', { error: result.error });
    }
    
    return result;
  } catch (error) {
    await updateDeliveryStatus(deliveryId, 'failed', { error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * Send WhatsApp notification
 */
async function sendWhatsAppNotification(deliveryId, contactInfo, template, variables) {
  if (!contactInfo.phone) {
    await updateDeliveryStatus(deliveryId, 'failed', { error: 'No phone number' });
    return { success: false, error: 'No phone number' };
  }
  
  const formatted = channelFormatters.whatsapp(template, variables);
  
  try {
    const result = await sendWhatsApp({
      to: contactInfo.phone,
      message: formatted.message
    });
    
    if (result.success) {
      await updateDeliveryStatus(deliveryId, 'sent', { 
        external_id: result.sid,
        phone: contactInfo.phone 
      });
    } else {
      await updateDeliveryStatus(deliveryId, 'failed', { error: result.error });
    }
    
    return result;
  } catch (error) {
    await updateDeliveryStatus(deliveryId, 'failed', { error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * Send push notification
 */
async function sendPushNotificationChannel(deliveryId, userId, template, variables) {
  const formatted = channelFormatters.push(template, variables);
  
  try {
    const result = await sendPushNotification(userId, formatted);
    
    if (result.success) {
      await updateDeliveryStatus(deliveryId, 'sent', { 
        subscriptions_sent: result.sent_count 
      });
    } else {
      await updateDeliveryStatus(deliveryId, 'failed', { error: result.error });
    }
    
    return result;
  } catch (error) {
    await updateDeliveryStatus(deliveryId, 'failed', { error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * Send in-app notification
 */
async function sendInAppNotification(deliveryId, userId, template, variables) {
  const formatted = channelFormatters.in_app(template, variables);
  
  try {
    const { data, error } = await supabaseAdminClient
      .from('in_app_notifications')
      .insert({
        user_id: userId,
        title: formatted.title,
        content: formatted.content,
        type: 'info',
        read: false
      })
      .select()
      .single();
    
    if (error) {
      await updateDeliveryStatus(deliveryId, 'failed', { error: error.message });
      return { success: false, error: error.message };
    }
    
    await updateDeliveryStatus(deliveryId, 'sent', { 
      in_app_notification_id: data.id 
    });
    
    return { success: true, id: data.id };
  } catch (error) {
    await updateDeliveryStatus(deliveryId, 'failed', { error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * Main notification dispatcher function with resilience features
 */
export async function dispatchNotification({
  userId,
  templateName = 'default',
  variables = {},
  channels = ['email', 'sms', 'whatsapp', 'push', 'in_app'],
  priority = 'normal',
  env = {}
}) {
  try {
    // Create main notification record
    const { data: notification, error: notificationError } = await supabaseAdminClient
      .from('notifications')
      .insert({
        user_id: userId,
        title: variables.title || 'Notification',
        message: variables.message || '',
        type: variables.type || 'info',
        action_url: variables.action_url,
        is_read: false
      })
      .select()
      .single();
    
    if (notificationError) {
      throw new Error(`Failed to create notification: ${notificationError.message}`);
    }
    
    // Get user preferences and contact info
    const [preferences, contactInfo] = await Promise.all([
      getUserPreferences(userId),
      getUserContactInfo(userId)
    ]);
    
    const results = {};
    const deliveryPromises = [];
    
    // Process each requested channel with resilience features
    for (const channel of channels) {
      // Check if user has enabled this channel
      const channelEnabled = preferences[`${channel}_enabled`];
      if (!channelEnabled) {
        results[channel] = { success: false, error: 'Channel disabled by user' };
        continue;
      }
      
      // Check channel reliability and consider fallback
      const shouldFallback = await shouldUseFallback(channel);
      if (shouldFallback && priority !== 'high') {
        console.log(`Channel ${channel} has low reliability, considering fallback`);
      }
      
      // Create delivery record with resilience metadata
      const deliveryRecord = await createDeliveryRecord(notification.id, channel, 'pending', {
        priority,
        resilience_enabled: true,
        original_channel: channel
      });
      
      if (!deliveryRecord) {
        results[channel] = { success: false, error: 'Failed to create delivery record' };
        continue;
      }
      
      // Get template for this channel
      const template = await getNotificationTemplate(templateName, channel);
      if (!template) {
        await updateDeliveryStatus(deliveryRecord.id, 'failed', { 
          error: `No template found for ${templateName}/${channel}` 
        });
        results[channel] = { success: false, error: 'Template not found' };
        continue;
      }
      
      // Use resilient delivery execution
      const contactInfoWithUserId = { ...contactInfo, user_id: userId };
      const deliveryPromise = executeResilientDelivery(
        deliveryRecord, 
        contactInfoWithUserId, 
        template, 
        variables, 
        env
      ).then(result => {
        // If delivery failed and we should retry, schedule retry
        if (!result.success && result.shouldRetry) {
          setTimeout(() => {
            retryFailedDelivery(deliveryRecord.id, env);
          }, 5000); // Initial 5 second delay before first retry
        }
        // If delivery failed completely, attempt fallback
        else if (!result.success && !result.shouldRetry) {
          setTimeout(() => {
            attemptFallbackDelivery(deliveryRecord.id, env);
          }, 1000); // Quick fallback attempt
        }
        
        return { channel, result };
      });
      
      deliveryPromises.push(deliveryPromise);
    }
    
    // Wait for all deliveries to complete
    const deliveryResults = await Promise.allSettled(deliveryPromises);
    
    // Collect results
    deliveryResults.forEach(({ status, value, reason }) => {
      if (status === 'fulfilled') {
        results[value.channel] = value.result;
      } else {
        console.error('Delivery promise failed:', reason);
      }
    });
    
    return {
      success: true,
      notification_id: notification.id,
      results,
      resilience_enabled: true
    };
    
  } catch (error) {
    console.error('Notification dispatch error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get delivery status for a notification
 */
export async function getDeliveryStatus(notificationId) {
  const { data, error } = await supabaseAdminClient
    .from('notification_deliveries')
    .select('*')
    .eq('notification_id', notificationId)
    .order('created_at', { ascending: false });
  
  if (error) {
    return { success: false, error: error.message };
  }
  
  return { success: true, deliveries: data };
}

/**
 * Retry failed deliveries
 */
export async function retryFailedDeliveries(notificationId, maxRetries = 3) {
  const { data: failedDeliveries } = await supabaseAdminClient
    .from('notification_deliveries')
    .select('*')
    .eq('notification_id', notificationId)
    .eq('status', 'failed')
    .lt('delivery_attempt', maxRetries);
  
  if (!failedDeliveries || failedDeliveries.length === 0) {
    return { success: true, retried: 0 };
  }
  
  // Increment attempt count and retry
  const retryPromises = failedDeliveries.map(async (delivery) => {
    await supabaseAdminClient
      .from('notification_deliveries')
      .update({ 
        delivery_attempt: delivery.delivery_attempt + 1,
        status: 'pending'
      })
      .eq('id', delivery.id);
    
    // Re-dispatch would need the original notification data
    // This is a simplified retry - in production you'd want to 
    // store the original dispatch parameters
  });
  
  await Promise.allSettled(retryPromises);
  
  return { success: true, retried: failedDeliveries.length };
}