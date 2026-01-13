/**
 * Bulk Notification Manager Library
 * Handles queuing, throttling, and processing of bulk notifications
 * with priority-based delivery scheduling.
 * 
 * Requirements: 6.4 - Bulk notification management
 */

import { supabaseAdminClient } from './supabaseClient.js';
import { sendEmail } from './emailService.js';
import { sendSMS, sendWhatsApp } from './twilioService.js';

/**
 * Priority levels for bulk notification jobs
 */
const PRIORITY_LEVELS = {
  urgent: 1,
  high: 2,
  normal: 3,
  low: 4
};

/**
 * Default throttle settings
 */
const DEFAULT_THROTTLE_SETTINGS = {
  max_concurrent_jobs: 3,
  max_notifications_per_minute: 100,
  max_notifications_per_hour: 5000,
  batch_size: 50,
  delay_between_batches_ms: 1000
};

/**
 * Queue bulk notifications for processing
 * @param {Object} jobData - Job configuration
 * @param {string} jobData.name - Job name
 * @param {Array} jobData.recipients - Array of recipient user IDs or email addresses
 * @param {string} jobData.template_name - Notification template name
 * @param {Object} jobData.template_variables - Variables for template substitution
 * @param {Array} jobData.channels - Delivery channels
 * @param {string} jobData.priority - Job priority (urgent, high, normal, low)
 * @param {string} jobData.scheduled_for - ISO timestamp for scheduled delivery
 * @param {string} jobData.created_by - User ID of job creator
 * @param {Object} env - Environment variables
 * @returns {Promise<{success: boolean, job_id?: string, error?: string}>}
 */
export async function queueBulkNotifications(jobData, env) {
  try {
    const {
      name,
      recipients,
      template_name,
      template_variables = {},
      channels = ['email', 'in_app'],
      priority = 'normal',
      scheduled_for,
      created_by
    } = jobData;

    // Validate recipients
    const validRecipients = await validateRecipients(recipients);
    if (validRecipients.length === 0) {
      return { success: false, error: 'No valid recipients found' };
    }

    // Validate template exists
    if (template_name) {
      const { data: template } = await supabaseAdminClient
        .from('notification_templates')
        .select('id')
        .eq('name', template_name)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (!template) {
        return { success: false, error: `Template '${template_name}' not found` };
      }
    }

    // Create bulk job record
    const { data: job, error: jobError } = await supabaseAdminClient
      .from('bulk_notification_jobs')
      .insert({
        name,
        status: scheduled_for ? 'scheduled' : 'queued',
        priority,
        total_recipients: validRecipients.length,
        template_name,
        template_variables,
        channels,
        scheduled_for,
        created_by,
        recipients_data: validRecipients
      })
      .select()
      .single();

    if (jobError) {
      throw jobError;
    }

    // If not scheduled, start processing immediately
    if (!scheduled_for) {
      // Trigger background processing (don't await to avoid timeout)
      processBulkQueue(job.id, false, env).catch(error => {
        console.error('Background processing error:', error);
      });
    }

    return {
      success: true,
      job_id: job.id,
      total_recipients: validRecipients.length,
      status: job.status
    };

  } catch (error) {
    console.error('Queue bulk notifications error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Process bulk notification queue
 * @param {string} jobId - Specific job ID to process (optional)
 * @param {boolean} force - Force processing even if throttle limits exceeded
 * @param {Object} env - Environment variables
 * @returns {Promise<{success: boolean, processed_jobs?: number, error?: string}>}
 */
export async function processBulkQueue(jobId = null, force = false, env) {
  try {
    // Get throttle settings
    const throttleSettings = await getThrottleSettings();
    
    // Check current system load if not forcing
    if (!force) {
      const canProcess = await checkSystemCapacity(throttleSettings);
      if (!canProcess.allowed) {
        return { 
          success: false, 
          error: `System at capacity: ${canProcess.reason}` 
        };
      }
    }

    // Get jobs to process
    let query = supabaseAdminClient
      .from('bulk_notification_jobs')
      .select('*')
      .in('status', ['queued', 'scheduled', 'processing'])
      .order('priority', { ascending: true })
      .order('created_at', { ascending: true });

    if (jobId) {
      query = query.eq('id', jobId);
    } else {
      // Limit concurrent jobs
      query = query.limit(throttleSettings.max_concurrent_jobs);
    }

    const { data: jobs, error: jobsError } = await query;

    if (jobsError) {
      throw jobsError;
    }

    if (!jobs || jobs.length === 0) {
      return { success: true, processed_jobs: 0, message: 'No jobs to process' };
    }

    let processedJobs = 0;

    for (const job of jobs) {
      // Check if scheduled job is ready
      if (job.status === 'scheduled' && new Date(job.scheduled_for) > new Date()) {
        continue;
      }

      // Process the job
      const result = await processJob(job, throttleSettings, env);
      if (result.success) {
        processedJobs++;
      }

      // Respect throttle limits between jobs
      if (processedJobs > 0 && processedJobs < jobs.length) {
        await sleep(throttleSettings.delay_between_batches_ms);
      }
    }

    return { success: true, processed_jobs: processedJobs };

  } catch (error) {
    console.error('Process bulk queue error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Process a single bulk notification job
 * @param {Object} job - Job data
 * @param {Object} throttleSettings - Throttle configuration
 * @param {Object} env - Environment variables
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function processJob(job, throttleSettings, env) {
  try {
    // Mark job as processing
    await supabaseAdminClient
      .from('bulk_notification_jobs')
      .update({
        status: 'processing',
        started_at: new Date().toISOString()
      })
      .eq('id', job.id);

    const recipients = job.recipients_data || [];
    const batchSize = throttleSettings.batch_size;
    let processedCount = 0;
    let successCount = 0;
    let failedCount = 0;

    // Process recipients in batches
    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize);
      
      // Process batch
      const batchResults = await Promise.allSettled(
        batch.map(recipient => processRecipient(recipient, job, env))
      );

      // Count results
      batchResults.forEach(result => {
        processedCount++;
        if (result.status === 'fulfilled' && result.value.success) {
          successCount++;
        } else {
          failedCount++;
        }
      });

      // Update job progress
      await supabaseAdminClient
        .from('bulk_notification_jobs')
        .update({
          processed_count: processedCount,
          success_count: successCount,
          failed_count: failedCount,
          progress_percentage: Math.round((processedCount / recipients.length) * 100)
        })
        .eq('id', job.id);

      // Throttle between batches
      if (i + batchSize < recipients.length) {
        await sleep(throttleSettings.delay_between_batches_ms);
      }
    }

    // Mark job as completed
    await supabaseAdminClient
      .from('bulk_notification_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        processed_count: processedCount,
        success_count: successCount,
        failed_count: failedCount,
        progress_percentage: 100
      })
      .eq('id', job.id);

    return { success: true };

  } catch (error) {
    console.error('Process job error:', error);
    
    // Mark job as failed
    await supabaseAdminClient
      .from('bulk_notification_jobs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: error.message
      })
      .eq('id', job.id);

    return { success: false, error: error.message };
  }
}

/**
 * Process notification for a single recipient
 * @param {Object} recipient - Recipient data
 * @param {Object} job - Job configuration
 * @param {Object} env - Environment variables
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function processRecipient(recipient, job, env) {
  try {
    const { user_id, email, phone } = recipient;
    
    // Get user preferences if user_id provided
    let preferences = null;
    if (user_id) {
      const { data: prefs } = await supabaseAdminClient
        .from('user_notification_preferences')
        .select('*')
        .eq('user_id', user_id)
        .single();
      preferences = prefs;
    }

    // Create notification record
    const { data: notification, error: notificationError } = await supabaseAdminClient
      .from('notifications')
      .insert({
        user_id: user_id || null,
        title: job.template_variables.title || job.name,
        message: job.template_variables.message || 'Bulk notification',
        type: job.template_variables.type || 'info',
        bulk_job_id: job.id
      })
      .select()
      .single();

    if (notificationError) {
      throw notificationError;
    }

    // Send through enabled channels
    const results = {};
    
    for (const channel of job.channels) {
      // Check user preferences
      if (preferences && !preferences[`${channel}_enabled`]) {
        continue;
      }

      try {
        let result;
        switch (channel) {
          case 'email':
            if (email || (user_id && preferences)) {
              result = await sendEmailNotification(
                email || preferences?.email,
                job.template_name,
                job.template_variables,
                env
              );
            }
            break;
          case 'sms':
            if (phone || (user_id && preferences)) {
              result = await sendSMSNotification(
                phone || preferences?.phone,
                job.template_name,
                job.template_variables
              );
            }
            break;
          case 'whatsapp':
            if (phone || (user_id && preferences)) {
              result = await sendWhatsAppNotification(
                phone || preferences?.phone,
                job.template_name,
                job.template_variables
              );
            }
            break;
          case 'in_app':
            // In-app notification already created above
            result = { success: true };
            break;
        }

        if (result) {
          results[channel] = result;
          
          // Record delivery attempt
          await supabaseAdminClient
            .from('notification_deliveries')
            .insert({
              notification_id: notification.id,
              channel,
              status: result.success ? 'sent' : 'failed',
              error_message: result.error || null,
              external_id: result.id || null
            });
        }
      } catch (channelError) {
        console.error(`Channel ${channel} error:`, channelError);
        results[channel] = { success: false, error: channelError.message };
      }
    }

    return { success: true, results };

  } catch (error) {
    console.error('Process recipient error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send email notification using template
 */
async function sendEmailNotification(email, templateName, variables, env) {
  if (!email) return { success: false, error: 'No email address' };

  try {
    // Get template
    const { data: template } = await supabaseAdminClient
      .from('notification_templates')
      .select('subject_template, body_template')
      .eq('name', templateName)
      .eq('channel', 'email')
      .eq('is_active', true)
      .single();

    if (!template) {
      return { success: false, error: 'Email template not found' };
    }

    // Substitute variables
    const subject = substituteVariables(template.subject_template, variables);
    const html = substituteVariables(template.body_template, variables);

    return await sendEmail({ to: email, subject, html, env });
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Send SMS notification using template
 */
async function sendSMSNotification(phone, templateName, variables) {
  if (!phone) return { success: false, error: 'No phone number' };

  try {
    // Get template
    const { data: template } = await supabaseAdminClient
      .from('notification_templates')
      .select('body_template')
      .eq('name', templateName)
      .eq('channel', 'sms')
      .eq('is_active', true)
      .single();

    if (!template) {
      return { success: false, error: 'SMS template not found' };
    }

    // Substitute variables
    const message = substituteVariables(template.body_template, variables);

    return await sendSMS({ to: phone, message });
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Send WhatsApp notification using template
 */
async function sendWhatsAppNotification(phone, templateName, variables) {
  if (!phone) return { success: false, error: 'No phone number' };

  try {
    // Get template
    const { data: template } = await supabaseAdminClient
      .from('notification_templates')
      .select('body_template')
      .eq('name', templateName)
      .eq('channel', 'whatsapp')
      .eq('is_active', true)
      .single();

    if (!template) {
      return { success: false, error: 'WhatsApp template not found' };
    }

    // Substitute variables
    const message = substituteVariables(template.body_template, variables);

    return await sendWhatsApp({ to: phone, message });
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Substitute variables in template string
 */
function substituteVariables(template, variables) {
  if (!template) return '';
  
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
    result = result.replace(regex, value || '');
  }
  return result;
}

/**
 * Validate recipients array
 */
async function validateRecipients(recipients) {
  const validRecipients = [];

  for (const recipient of recipients) {
    if (typeof recipient === 'string') {
      // Assume it's a user ID or email
      if (recipient.includes('@')) {
        validRecipients.push({ email: recipient });
      } else {
        // Try to get user profile
        const { data: profile } = await supabaseAdminClient
          .from('profiles')
          .select('id, email, phone')
          .eq('id', recipient)
          .single();

        if (profile) {
          validRecipients.push({
            user_id: profile.id,
            email: profile.email,
            phone: profile.phone
          });
        }
      }
    } else if (typeof recipient === 'object') {
      // Validate object structure
      if (recipient.user_id || recipient.email) {
        validRecipients.push(recipient);
      }
    }
  }

  return validRecipients;
}

/**
 * Get system throttle settings
 */
async function getThrottleSettings() {
  try {
    const { data: settings } = await supabaseAdminClient
      .from('system_settings')
      .select('value')
      .eq('key', 'bulk_notification_throttle')
      .single();

    return { ...DEFAULT_THROTTLE_SETTINGS, ...(settings?.value || {}) };
  } catch (error) {
    console.error('Error getting throttle settings:', error);
    return DEFAULT_THROTTLE_SETTINGS;
  }
}

/**
 * Check if system can handle more processing
 */
async function checkSystemCapacity(throttleSettings) {
  try {
    // Check concurrent jobs
    const { count: activeJobs } = await supabaseAdminClient
      .from('bulk_notification_jobs')
      .select('id', { count: 'exact' })
      .eq('status', 'processing');

    if (activeJobs >= throttleSettings.max_concurrent_jobs) {
      return { 
        allowed: false, 
        reason: `Maximum concurrent jobs (${throttleSettings.max_concurrent_jobs}) reached` 
      };
    }

    // Check hourly rate limit
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: hourlyNotifications } = await supabaseAdminClient
      .from('notification_deliveries')
      .select('id', { count: 'exact' })
      .gte('created_at', oneHourAgo);

    if (hourlyNotifications >= throttleSettings.max_notifications_per_hour) {
      return { 
        allowed: false, 
        reason: `Hourly limit (${throttleSettings.max_notifications_per_hour}) reached` 
      };
    }

    return { allowed: true };
  } catch (error) {
    console.error('Error checking system capacity:', error);
    return { allowed: false, reason: 'System capacity check failed' };
  }
}

/**
 * Get bulk job status
 */
export async function getBulkJobStatus(jobId) {
  try {
    const { data: job, error } = await supabaseAdminClient
      .from('bulk_notification_jobs')
      .select(`
        *,
        created_by_profiles:created_by(full_name)
      `)
      .eq('id', jobId)
      .single();

    if (error) {
      throw error;
    }

    if (!job) {
      return { success: false, error: 'Job not found' };
    }

    return { success: true, job };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Cancel bulk job
 */
export async function cancelBulkJob(jobId) {
  try {
    const { data: job, error } = await supabaseAdminClient
      .from('bulk_notification_jobs')
      .update({
        status: 'cancelled',
        completed_at: new Date().toISOString()
      })
      .eq('id', jobId)
      .in('status', ['queued', 'scheduled', 'processing'])
      .select()
      .single();

    if (error) {
      throw error;
    }

    if (!job) {
      return { success: false, error: 'Job not found or cannot be cancelled' };
    }

    return { success: true, job };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Get bulk job statistics
 */
export async function getBulkJobStatistics(jobId = null, timeWindowHours = 24) {
  try {
    const timeWindow = new Date(Date.now() - timeWindowHours * 60 * 60 * 1000).toISOString();
    
    let query = supabaseAdminClient
      .from('bulk_notification_jobs')
      .select('status, total_recipients, success_count, failed_count, created_at')
      .gte('created_at', timeWindow);

    if (jobId) {
      query = query.eq('id', jobId);
    }

    const { data: jobs, error } = await query;

    if (error) {
      throw error;
    }

    const stats = {
      total_jobs: jobs.length,
      jobs_by_status: {},
      total_recipients: 0,
      total_success: 0,
      total_failed: 0,
      success_rate: 0
    };

    jobs.forEach(job => {
      stats.jobs_by_status[job.status] = (stats.jobs_by_status[job.status] || 0) + 1;
      stats.total_recipients += job.total_recipients || 0;
      stats.total_success += job.success_count || 0;
      stats.total_failed += job.failed_count || 0;
    });

    if (stats.total_recipients > 0) {
      stats.success_rate = (stats.total_success / stats.total_recipients) * 100;
    }

    return { success: true, statistics: stats, time_window_hours: timeWindowHours };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Update job priority
 */
export async function updateJobPriority(jobId, priority) {
  try {
    const { data: job, error } = await supabaseAdminClient
      .from('bulk_notification_jobs')
      .update({ priority })
      .eq('id', jobId)
      .in('status', ['queued', 'scheduled'])
      .select()
      .single();

    if (error) {
      throw error;
    }

    if (!job) {
      return { success: false, error: 'Job not found or cannot be updated' };
    }

    return { success: true, job };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Utility function to sleep for specified milliseconds
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}