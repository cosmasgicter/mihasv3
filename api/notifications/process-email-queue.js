import { supabaseAdminClient } from '../_lib/supabaseClient.js'
import { withNetlifyHandler } from '../_lib/netlifyHandler.js'

function buildProviderErrorMessage(result, invocationError) {
  const providerError = result?.error
  if (providerError) {
    const parts = []
    if (providerError.provider) {
      parts.push(`[${providerError.provider}]`)
    }
    if (providerError.code) {
      parts.push(`(${providerError.code})`)
    }
    if (providerError.message) {
      parts.push(providerError.message)
    }

    const detailString = providerError.details
      ? safeStringify(providerError.details)
      : undefined

    if (detailString) {
      parts.push(`details: ${detailString}`)
    }

    return parts.filter(Boolean).join(' ') || 'Email provider returned an unknown error'
  }

  if (invocationError) {
    const parts = []
    if (invocationError.status) {
      parts.push(`(status ${invocationError.status})`)
    }
    if (invocationError.message) {
      parts.push(invocationError.message)
    }
    if (invocationError.details) {
      const detailString = safeStringify(invocationError.details)
      if (detailString) {
        parts.push(`details: ${detailString}`)
      }
    }
    return parts.filter(Boolean).join(' ') || 'Failed to invoke send-email edge function'
  }

  return 'Unknown failure when dispatching email'
}

function safeStringify(value) {
  try {
    if (typeof value === 'string') {
      return value
    }
    return JSON.stringify(value)
  } catch (error) {
    return undefined
  }
}

async function handler(req, res) {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, authorization')
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { data: emails } = await supabaseAdminClient
      .from('email_notifications')
      .select('*')
      .eq('status', 'pending')
      .limit(10)

    let sent = 0, failed = 0

    for (const email of emails || []) {
      try {
        const { data: result, error: invocationError } =
          await supabaseAdminClient.functions.invoke('send-email', {
            body: { to: email.recipient_email, subject: email.subject, html: email.body }
          })

        const wasSuccessful = !invocationError && result?.success

        if (wasSuccessful) {
          await supabaseAdminClient
            .from('email_notifications')
            .update({ status: 'sent', sent_at: new Date().toISOString() })
            .eq('id', email.id)

          sent++
          continue
        }

        const errorMessage = buildProviderErrorMessage(result, invocationError)

        await supabaseAdminClient
          .from('email_notifications')
          .update({
            status: 'failed',
            error_message: errorMessage,
            retry_count: (email.retry_count || 0) + 1
          })
          .eq('id', email.id)

        failed++
      } catch (error) {
        await supabaseAdminClient
          .from('email_notifications')
          .update({
            status: 'failed',
            error_message: error.message,
            retry_count: (email.retry_count || 0) + 1
          })
          .eq('id', email.id)

        failed++
      }
    }

    return res.status(200).json({ sent, failed })
  } catch (error) {
    console.error('Queue processing error:', error)
    return res.status(500).json({ error: error.message })
  }
}

const netlifyHandler = withNetlifyHandler(handler)

export { handler as expressHandler }
export { netlifyHandler as handler }
export default netlifyHandler
