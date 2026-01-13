/**
 * Bulk Notification Management API Endpoint
 * Provides endpoints for queuing, throttling, and managing bulk notification delivery
 * with priority-based scheduling to prevent system overload.
 * 
 * Requirements: 6.4 - Bulk notification management
 */

import { supabaseAdminClient, getUserFromRequest } from '../_lib/supabaseClient.js';
import {
  queueBulkNotifications,
  processBulkQueue,
  getBulkJobStatus,
  cancelBulkJob,
  getBulkJobStatistics,
  updateJobPriority
} from '../_lib/bulkNotificationManager.js';

export async function onRequest(context) {
  const { request } = context;
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
  
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  
  try {
    // Authentication required - admin only for bulk operations
    const authContext = await getUserFromRequest(request);
    if (authContext.error) {
      return new Response(JSON.stringify({ error: authContext.error }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Verify admin permissions
    const isAdmin = authContext.user.role === 'admin' || authContext.user.role === 'super_admin';
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Admin access required for bulk operations' }), {
        status: 403,
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
      case 'DELETE':
        return await handleDeleteRequest(context, authContext, action);
      default:
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
          status: 405,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
    
  } catch (error) {
    console.error('Bulk notification manager error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Handle GET requests - retrieve job status and statistics
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
      case 'status':
        return await getJobStatus(url, corsHeaders);
      case 'statistics':
        return await getJobStatistics(url, corsHeaders);
      case 'queue-status':
        return await getQueueStatus(corsHeaders);
      case 'jobs':
        return await getJobsList(url, corsHeaders);
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
 * Handle POST requests - create new bulk jobs and process queue
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
      case 'queue':
        return await queueBulkJob(body, authContext, corsHeaders, context.env);
      case 'process':
        return await processQueue(body, authContext, corsHeaders, context.env);
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
 * Handle PUT requests - update job priority and settings
 */
async function handlePutRequest(context, authContext, action) {
  const { request } = context;
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };
  
  try {
    const body = await request.json();
    
    switch (action) {
      case 'priority':
        return await updatePriority(body, corsHeaders);
      case 'throttle':
        return await updateThrottleSettings(body, corsHeaders);
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
 * Handle DELETE requests - cancel bulk jobs
 */
async function handleDeleteRequest(context, authContext, action) {
  const { request } = context;
  const url = new URL(request.url);
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };
  
  try {
    switch (action) {
      case 'cancel':
        return await cancelJob(url, corsHeaders);
      default:
        return new Response(JSON.stringify({ error: 'Invalid action' }), {
          status: 400,
          headers: corsHeaders
        });
    }
  } catch (error) {
    console.error('DELETE request error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: corsHeaders
    });
  }
}

/**
 * Get status of a specific bulk job
 */
async function getJobStatus(url, corsHeaders) {
  const jobId = url.searchParams.get('job_id');
  
  if (!jobId) {
    return new Response(JSON.stringify({ error: 'job_id is required' }), {
      status: 400,
      headers: corsHeaders
    });
  }
  
  const result = await getBulkJobStatus(jobId);
  
  return new Response(JSON.stringify(result), {
    status: result.success ? 200 : 404,
    headers: corsHeaders
  });
}

/**
 * Get statistics for bulk jobs
 */
async function getJobStatistics(url, corsHeaders) {
  const timeWindowHours = parseInt(url.searchParams.get('hours')) || 24;
  const jobId = url.searchParams.get('job_id');
  
  if (timeWindowHours < 1 || timeWindowHours > 168) { // Max 1 week
    return new Response(JSON.stringify({ error: 'Invalid time window (1-168 hours)' }), {
      status: 400,
      headers: corsHeaders
    });
  }
  
  const result = await getBulkJobStatistics(jobId, timeWindowHours);
  
  return new Response(JSON.stringify(result), {
    status: result.success ? 200 : 500,
    headers: corsHeaders
  });
}

/**
 * Get current queue status
 */
async function getQueueStatus(corsHeaders) {
  try {
    const { data: queueStats, error } = await supabaseAdminClient
      .from('bulk_notification_jobs')
      .select('status, priority, COUNT(*)')
      .group('status, priority');
    
    if (error) {
      throw error;
    }
    
    // Get system throttle settings
    const { data: settings } = await supabaseAdminClient
      .from('system_settings')
      .select('value')
      .eq('key', 'bulk_notification_throttle')
      .single();
    
    const throttleSettings = settings?.value || {
      max_concurrent_jobs: 3,
      max_notifications_per_minute: 100,
      max_notifications_per_hour: 5000
    };
    
    return new Response(JSON.stringify({
      success: true,
      queue_stats: queueStats || [],
      throttle_settings: throttleSettings,
      timestamp: new Date().toISOString()
    }), {
      status: 200,
      headers: corsHeaders
    });
    
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: corsHeaders
    });
  }
}

/**
 * Get list of bulk jobs with pagination
 */
async function getJobsList(url, corsHeaders) {
  const limit = Math.min(parseInt(url.searchParams.get('limit')) || 20, 100);
  const offset = parseInt(url.searchParams.get('offset')) || 0;
  const status = url.searchParams.get('status');
  
  try {
    let query = supabaseAdminClient
      .from('bulk_notification_jobs')
      .select(`
        id,
        name,
        status,
        priority,
        total_recipients,
        processed_count,
        success_count,
        failed_count,
        created_at,
        started_at,
        completed_at,
        created_by_profiles:created_by(full_name)
      `)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
    if (status) {
      query = query.eq('status', status);
    }
    
    const { data: jobs, error, count } = await query;
    
    if (error) {
      throw error;
    }
    
    return new Response(JSON.stringify({
      success: true,
      jobs: jobs || [],
      pagination: {
        limit,
        offset,
        total: count
      }
    }), {
      status: 200,
      headers: corsHeaders
    });
    
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: corsHeaders
    });
  }
}

/**
 * Queue a new bulk notification job
 */
async function queueBulkJob(body, authContext, corsHeaders, env) {
  const {
    name,
    recipients,
    template_name,
    template_variables = {},
    channels = ['email', 'in_app'],
    priority = 'normal',
    scheduled_for
  } = body;
  
  // Validation
  if (!name || !recipients || !Array.isArray(recipients) || recipients.length === 0) {
    return new Response(JSON.stringify({ 
      error: 'name, recipients array are required' 
    }), {
      status: 400,
      headers: corsHeaders
    });
  }
  
  if (recipients.length > 10000) {
    return new Response(JSON.stringify({ 
      error: 'Maximum 10,000 recipients per bulk job' 
    }), {
      status: 400,
      headers: corsHeaders
    });
  }
  
  if (!['low', 'normal', 'high', 'urgent'].includes(priority)) {
    return new Response(JSON.stringify({ 
      error: 'Invalid priority. Must be: low, normal, high, urgent' 
    }), {
      status: 400,
      headers: corsHeaders
    });
  }
  
  const result = await queueBulkNotifications({
    name,
    recipients,
    template_name,
    template_variables,
    channels,
    priority,
    scheduled_for,
    created_by: authContext.user.id
  }, env);
  
  return new Response(JSON.stringify(result), {
    status: result.success ? 201 : 400,
    headers: corsHeaders
  });
}

/**
 * Process the bulk notification queue
 */
async function processQueue(body, authContext, corsHeaders, env) {
  const { job_id, force = false } = body;
  
  const result = await processBulkQueue(job_id, force, env);
  
  return new Response(JSON.stringify(result), {
    status: result.success ? 200 : 400,
    headers: corsHeaders
  });
}

/**
 * Update job priority
 */
async function updatePriority(body, corsHeaders) {
  const { job_id, priority } = body;
  
  if (!job_id || !priority) {
    return new Response(JSON.stringify({ 
      error: 'job_id and priority are required' 
    }), {
      status: 400,
      headers: corsHeaders
    });
  }
  
  if (!['low', 'normal', 'high', 'urgent'].includes(priority)) {
    return new Response(JSON.stringify({ 
      error: 'Invalid priority. Must be: low, normal, high, urgent' 
    }), {
      status: 400,
      headers: corsHeaders
    });
  }
  
  const result = await updateJobPriority(job_id, priority);
  
  return new Response(JSON.stringify(result), {
    status: result.success ? 200 : 400,
    headers: corsHeaders
  });
}

/**
 * Update system throttle settings
 */
async function updateThrottleSettings(body, corsHeaders) {
  const { 
    max_concurrent_jobs,
    max_notifications_per_minute,
    max_notifications_per_hour 
  } = body;
  
  // Validation
  if (max_concurrent_jobs && (max_concurrent_jobs < 1 || max_concurrent_jobs > 10)) {
    return new Response(JSON.stringify({ 
      error: 'max_concurrent_jobs must be between 1 and 10' 
    }), {
      status: 400,
      headers: corsHeaders
    });
  }
  
  if (max_notifications_per_minute && (max_notifications_per_minute < 10 || max_notifications_per_minute > 1000)) {
    return new Response(JSON.stringify({ 
      error: 'max_notifications_per_minute must be between 10 and 1000' 
    }), {
      status: 400,
      headers: corsHeaders
    });
  }
  
  if (max_notifications_per_hour && (max_notifications_per_hour < 100 || max_notifications_per_hour > 50000)) {
    return new Response(JSON.stringify({ 
      error: 'max_notifications_per_hour must be between 100 and 50000' 
    }), {
      status: 400,
      headers: corsHeaders
    });
  }
  
  try {
    const settings = {
      max_concurrent_jobs: max_concurrent_jobs || 3,
      max_notifications_per_minute: max_notifications_per_minute || 100,
      max_notifications_per_hour: max_notifications_per_hour || 5000,
      updated_at: new Date().toISOString()
    };
    
    const { error } = await supabaseAdminClient
      .from('system_settings')
      .upsert({
        key: 'bulk_notification_throttle',
        value: settings
      });
    
    if (error) {
      throw error;
    }
    
    return new Response(JSON.stringify({
      success: true,
      settings
    }), {
      status: 200,
      headers: corsHeaders
    });
    
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: corsHeaders
    });
  }
}

/**
 * Cancel a bulk job
 */
async function cancelJob(url, corsHeaders) {
  const jobId = url.searchParams.get('job_id');
  
  if (!jobId) {
    return new Response(JSON.stringify({ error: 'job_id is required' }), {
      status: 400,
      headers: corsHeaders
    });
  }
  
  const result = await cancelBulkJob(jobId);
  
  return new Response(JSON.stringify(result), {
    status: result.success ? 200 : 400,
    headers: corsHeaders
  });
}