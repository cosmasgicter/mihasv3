/**
 * Cron Job: Process Bulk Notifications
 * Automatically processes queued bulk notification jobs
 * Runs every minute to check for jobs ready for processing
 * 
 * Requirements: 6.4 - Bulk notification management
 */

import { processBulkQueue } from '../_lib/bulkNotificationManager.js';
import { supabaseAdminClient } from '../_lib/supabaseClient.js';

export async function onRequest(context) {
  const { request } = context;
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
  
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  
  // Only allow POST requests for cron jobs
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  
  try {
    console.log('Starting bulk notification processing cron job');
    
    // Check if there are any jobs to process
    const { data: pendingJobs, error: jobsError } = await supabaseAdminClient
      .from('bulk_notification_jobs')
      .select('id, name, priority, total_recipients')
      .in('status', ['queued', 'scheduled'])
      .or('scheduled_for.is.null,scheduled_for.lte.' + new Date().toISOString())
      .order('priority', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(10);
    
    if (jobsError) {
      throw jobsError;
    }
    
    if (!pendingJobs || pendingJobs.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'No pending jobs to process',
        processed_jobs: 0
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    console.log(`Found ${pendingJobs.length} pending jobs to process`);
    
    // Process the bulk queue
    const result = await processBulkQueue(null, false, context.env);
    
    // Log the results
    console.log('Bulk notification processing result:', result);
    
    // Update cron job statistics
    await updateCronStatistics(result, pendingJobs.length);
    
    return new Response(JSON.stringify({
      success: result.success,
      processed_jobs: result.processed_jobs || 0,
      pending_jobs_found: pendingJobs.length,
      message: result.error || 'Bulk notification processing completed',
      timestamp: new Date().toISOString()
    }), {
      status: result.success ? 200 : 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Bulk notification cron job error:', error);
    
    // Log error to database
    await logCronError(error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Update cron job statistics
 */
async function updateCronStatistics(result, pendingJobsFound) {
  try {
    const stats = {
      last_run: new Date().toISOString(),
      pending_jobs_found: pendingJobsFound,
      processed_jobs: result.processed_jobs || 0,
      success: result.success,
      error: result.error || null
    };
    
    await supabaseAdminClient
      .from('system_settings')
      .upsert({
        key: 'bulk_notification_cron_stats',
        value: stats,
        description: 'Statistics for bulk notification cron job'
      });
      
  } catch (error) {
    console.error('Error updating cron statistics:', error);
  }
}

/**
 * Log cron job errors
 */
async function logCronError(error) {
  try {
    await supabaseAdminClient
      .from('system_logs')
      .insert({
        level: 'error',
        source: 'cron_bulk_notifications',
        message: error.message,
        details: {
          stack: error.stack,
          timestamp: new Date().toISOString()
        }
      });
  } catch (logError) {
    console.error('Error logging cron error:', logError);
  }
}