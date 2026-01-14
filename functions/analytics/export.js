/**
 * Secure Multi-Format Data Export API Endpoint
 * Provides secure data export in PDF, Excel, and CSV formats
 * with access controls and audit logging
 * 
 * Requirements: 5.5 - Secure multi-format data export
 */

import { getUserFromRequest } from '../_lib/supabaseClient.js';
import {
  exportApplications,
  exportComplianceReport,
  getExportHistory,
  validateExportPermissions
} from '../_lib/dataExport.js';

export async function onRequest(context) {
  const { request } = context;
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
  
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  
  try {
    // Authenticate user
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
      default:
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
          status: 405,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
    
  } catch (error) {
    console.error('Export API error:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      details: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Handle GET requests - retrieve export history and permissions
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
      case 'history':
        return await getHistory(authContext, corsHeaders);
      case 'permissions':
        return await getPermissions(url, authContext, corsHeaders);
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
 * Handle POST requests - perform data exports
 */
async function handlePostRequest(context, authContext, action) {
  const { request } = context;
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*'
  };
  
  try {
    const body = await request.json();
    
    switch (action) {
      case 'applications':
        return await exportApplicationsData(body, authContext, corsHeaders);
      case 'compliance':
        return await exportComplianceData(body, authContext, corsHeaders);
      default:
        return new Response(JSON.stringify({ error: 'Invalid action' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
  } catch (error) {
    console.error('POST request error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Get export history for user
 */
async function getHistory(authContext, corsHeaders) {
  const limit = 50;
  const history = await getExportHistory(authContext.user.id, limit);
  
  return new Response(JSON.stringify({
    success: true,
    history
  }), {
    status: 200,
    headers: corsHeaders
  });
}

/**
 * Get export permissions for user
 */
async function getPermissions(url, authContext, corsHeaders) {
  const exportType = url.searchParams.get('type');
  
  if (!exportType) {
    return new Response(JSON.stringify({ error: 'Export type is required' }), {
      status: 400,
      headers: corsHeaders
    });
  }
  
  const permission = await validateExportPermissions(authContext.user.id, exportType);
  
  return new Response(JSON.stringify({
    success: true,
    exportType,
    ...permission
  }), {
    status: 200,
    headers: corsHeaders
  });
}

/**
 * Export applications data
 */
async function exportApplicationsData(body, authContext, corsHeaders) {
  const { format, filters, anonymize } = body;
  
  // Validate format
  if (!format || !['pdf', 'excel', 'csv'].includes(format)) {
    return new Response(JSON.stringify({ 
      error: 'Invalid format. Must be pdf, excel, or csv' 
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  
  // Perform export
  const exportResult = await exportApplications({
    userId: authContext.user.id,
    format,
    filters: filters || {},
    anonymize: anonymize || false
  });
  
  // Return file
  return new Response(exportResult.buffer, {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': exportResult.mimeType,
      'Content-Disposition': `attachment; filename="${exportResult.filename}"`,
      'Content-Length': exportResult.size.toString()
    }
  });
}

/**
 * Export compliance report data
 */
async function exportComplianceData(body, authContext, corsHeaders) {
  const { reportId, format, anonymize } = body;
  
  // Validate required parameters
  if (!reportId) {
    return new Response(JSON.stringify({ error: 'Report ID is required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  
  if (!format || !['pdf', 'excel', 'csv'].includes(format)) {
    return new Response(JSON.stringify({ 
      error: 'Invalid format. Must be pdf, excel, or csv' 
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  
  // Perform export
  const exportResult = await exportComplianceReport({
    userId: authContext.user.id,
    reportId,
    format,
    anonymize: anonymize || false
  });
  
  // Return file
  return new Response(exportResult.buffer, {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': exportResult.mimeType,
      'Content-Disposition': `attachment; filename="${exportResult.filename}"`,
      'Content-Length': exportResult.size.toString()
    }
  });
}
