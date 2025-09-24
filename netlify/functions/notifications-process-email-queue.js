import { createClient } from '@supabase/supabase-js'
import { withNetlifyHandler } from '../../api/_lib/netlifyHandler.js'

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

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { data: emails } = await supabase
      .from('email_notifications')
      .select('*')
      .eq('status', 'pending')
      .limit(10)

    let sent = 0, failed = 0

    for (const email of emails || []) {
      try {
        const { data: result, error: invocationError } = await supabase.functions.invoke('send-email', {
          body: { to: email.recipient_email, subject: email.subject, html: email.body }
        })

        const wasSuccessful = !invocationError && result?.success

        if (wasSuccessful) {
          await supabase
            .from('email_notifications')
            .update({ status: 'sent', sent_at: new Date().toISOString() })
            .eq('id', email.id)

          sent++
          continue
        }

        const errorMessage = buildProviderErrorMessage(result, invocationError)

        await supabase
          .from('email_notifications')
          .update({
            status: 'failed',
            error_message: errorMessage,
            retry_count: (email.retry_count || 0) + 1
          })
          .eq('id', email.id)

        failed++
      } catch (error) {
        await supabase
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

    res.json({ sent, failed })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

const netlifyHandler = withNetlifyHandler(handler)

export { netlifyHandler as handler }
export default netlifyHandler
