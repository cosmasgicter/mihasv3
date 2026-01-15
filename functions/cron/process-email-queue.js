import { supabaseAdminClient } from '../_lib/supabaseClient.js';
import { sendEmail } from '../_lib/emailService.js';

/**
 * Calculate exponential backoff delay for retries
 * @param {number} retryCount - Current retry count (0-based)
 * @returns {number} - Delay in milliseconds
 */
function calculateBackoffDelay(retryCount) {
  // Exponential backoff: 1s, 2s, 4s, 8s, etc.
  const baseDelay = 1000; // 1 second
  const maxDelay = 60000; // 60 seconds max
  const delay = Math.min(baseDelay * Math.pow(2, retryCount), maxDelay);
  return delay;
}

/**
 * Check if an email should be retried based on its scheduled retry time
 * @param {object} email - Email record from database
 * @returns {boolean} - Whether the email is ready for retry
 */
function isReadyForRetry(email) {
  if (!email.next_retry_at) return true;
  return new Date(email.next_retry_at) <= new Date();
}

/**
 * Process email queue - handles priority ordering, retry logic with exponential backoff,
 * and proper status tracking.
 * 
 * Requirements:
 * - 3.2: Attempt to send emails within 60 seconds of scheduling
 * - 3.3: Log delivery status on success
 * - 3.4: Retry up to 3 times with exponential backoff
 */
export async function onRequest(context) {
  const { env, request } = context;
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Cron-Key'
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Verify cron key
  const cronKey = request.headers.get('X-Cron-Key');
  if (env.CRON_SECRET_KEY && cronKey !== env.CRON_SECRET_KEY) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const now = new Date().toISOString();
    
    // Fetch pending emails with priority-based ordering (high priority first)
    // Also fetch emails that are ready for retry (next_retry_at <= now or null)
    // Requirements: 3.2 - Process emails scheduled for now or earlier
    const { data: emails, error: fetchError } = await supabaseAdminClient
      .from('email_queue')
      .select('*')
      .eq('status', 'pending')
      .or(`scheduled_for.is.null,scheduled_for.lte.${now}`)
      .or(`next_retry_at.is.null,next_retry_at.lte.${now}`)
      .order('priority', { ascending: false }) // high priority first
      .order('created_at', { ascending: true }) // oldest first within same priority
      .limit(50);

    if (fetchError) throw fetchError;

    if (!emails || emails.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No pending emails',
        processed: 0 
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const results = {
      total: emails.length,
      sent: 0,
      failed: 0,
      retrying: 0,
      errors: []
    };

    // Process each email with rate limiting
    for (let i = 0; i < emails.length; i++) {
      const email = emails[i];
      
      // Skip emails that aren't ready for retry yet
      if (!isReadyForRetry(email)) {
        continue;
      }
      
      // Add delay between emails to respect rate limits (2 requests/second = 500ms delay)
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 600)); // 600ms delay for safety
      }

      const currentRetryCount = email.retry_count || 0;
      const maxRetries = 3;

      try {
        // Send email
        const result = await sendEmail({
          to: email.to_email,
          subject: email.subject,
          html: email.template,
          env
        });

        if (result.success) {
          // Requirement 3.3: Update status to 'sent' with timestamp on success
          await supabaseAdminClient
            .from('email_queue')
            .update({
              status: 'sent',
              sent_at: new Date().toISOString(),
              error_message: null,
              retry_count: currentRetryCount
            })
            .eq('id', email.id);
          
          results.sent++;
        } else {
          // Handle send failure with retry logic
          await handleSendFailure(email, result.error || 'Unknown error', currentRetryCount, maxRetries, results);
        }
      } catch (error) {
        // Handle exception with retry logic
        await handleSendFailure(email, error.message, currentRetryCount, maxRetries, results);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: `Processed ${results.total} emails`,
      results
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Email queue processing error:', error);
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
 * Handle email send failure with retry logic and exponential backoff
 * 
 * Requirements:
 * - 3.4: Retry up to 3 times with exponential backoff
 * - Mark as 'failed' after 3 retry attempts
 * 
 * @param {object} email - Email record from database
 * @param {string} errorMessage - Error message from send attempt
 * @param {number} currentRetryCount - Current retry count
 * @param {number} maxRetries - Maximum number of retries allowed
 * @param {object} results - Results object to update
 */
async function handleSendFailure(email, errorMessage, currentRetryCount, maxRetries, results) {
  const newRetryCount = currentRetryCount + 1;
  
  if (newRetryCount >= maxRetries) {
    // Requirement 3.4: Mark as 'failed' after 3 retry attempts
    await supabaseAdminClient
      .from('email_queue')
      .update({
        status: 'failed',
        error_message: `Failed after ${maxRetries} attempts: ${errorMessage}`,
        retry_count: newRetryCount,
        failed_at: new Date().toISOString()
      })
      .eq('id', email.id);
    
    results.failed++;
    results.errors.push({ 
      id: email.id, 
      error: errorMessage,
      finalFailure: true,
      retryCount: newRetryCount
    });
  } else {
    // Calculate next retry time with exponential backoff
    const backoffDelay = calculateBackoffDelay(newRetryCount);
    const nextRetryAt = new Date(Date.now() + backoffDelay).toISOString();
    
    // Keep status as 'pending' but update retry count and next retry time
    await supabaseAdminClient
      .from('email_queue')
      .update({
        status: 'pending',
        error_message: `Attempt ${newRetryCount} failed: ${errorMessage}. Retrying at ${nextRetryAt}`,
        retry_count: newRetryCount,
        next_retry_at: nextRetryAt
      })
      .eq('id', email.id);
    
    results.retrying++;
    results.errors.push({ 
      id: email.id, 
      error: errorMessage,
      willRetry: true,
      retryCount: newRetryCount,
      nextRetryAt
    });
  }
}
