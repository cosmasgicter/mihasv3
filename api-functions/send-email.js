// Minimal email sending function using Netlify
import { supabaseAdminClient } from '../api/_lib/supabaseClient.js'
import { logger } from './utils/logger.js'

const supabase = supabaseAdminClient

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
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

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, message: 'Email queued' })
    }
  } catch (error) {
    logger.error('Email error:', error)
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    }
  }
}
