// Minimal email sending function using Netlify
import { supabaseAdminClient } from '../_lib/supabaseClient.js'
import { logger } from '../_lib/logger.js'

const supabase = supabaseAdminClient

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      }
    });
  }
  
  try {
    // Get query params
    const queryStringParameters = Object.fromEntries(url.searchParams);
    
    // Get body for POST/PUT
    let body = null;
    if (request.method === 'POST' || request.method === 'PUT') {
      const contentType = request.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        body = await request.json();
      } else {
        body = await request.text();
      }
    }
    
    // Get headers
    const headers = Object.fromEntries(request.headers);
    
    // Create event-like object for compatibility
    const event = {
      httpMethod: request.method,
      body: typeof body === 'string' ? body : JSON.stringify(body),
      headers,
      queryStringParameters
    };

  if (event.httpMethod !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  try {
    const { to, subject, html, type, metadata } = JSON.parse(event.body)

    // Log email for tracking
    const { error: logError } = await supabase
      .from('email_notifications')
      .insert({
        recipient: to,
        subject,
        body: html,
        type: type || 'general',
        metadata: metadata || {},
        status: 'pending',
        sent_at: new Date().toISOString()
      })

    if (logError) {
      logger.error('Email log error:', logError)
    }

    // In production, integrate with SendGrid, AWS SES, or Resend
    // For now, just log and mark as sent
    logger.info('Email queued:', { to: '[REDACTED]', subject })

    return new Response(JSON.stringify({ success: true, message: 'Email queued' }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })
  } catch (error) {
    logger.error('Email error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })
  }

  } catch (error) {
    logger.error('Function error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
