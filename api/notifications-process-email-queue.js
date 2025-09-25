import { createClient } from '@supabase/supabase-js'

let cachedSupabaseClient

function getSupabaseServiceClient() {
  if (cachedSupabaseClient) {
    return cachedSupabaseClient
  }

  const url = process.env.VITE_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new Error('Supabase service credentials are not configured')
  }

  cachedSupabaseClient = createClient(url, serviceRoleKey)
  return cachedSupabaseClient
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

    const detailString = providerError.details ? safeStringify(providerError.details) : undefined
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

async function processEmailQueue(client) {
  const { data: emails, error } = await client
    .from('email_notifications')
    .select('*')
    .eq('status', 'pending')
    .limit(10)

  if (error) {
    throw error
  }

  let sent = 0
  let failed = 0

  for (const email of emails || []) {
    try {
      const { data: result, error: invocationError } = await client.functions.invoke('send-email', {
        body: { to: email.recipient_email, subject: email.subject, html: email.body }
      })

      const wasSuccessful = !invocationError && result?.success

      if (wasSuccessful) {
        await client
          .from('email_notifications')
          .update({ status: 'sent', sent_at: new Date().toISOString() })
          .eq('id', email.id)

        sent++
        continue
      }

      const errorMessage = buildProviderErrorMessage(result, invocationError)

      await client
        .from('email_notifications')
        .update({
          status: 'failed',
          error_message: errorMessage,
          retry_count: (email.retry_count || 0) + 1
        })
        .eq('id', email.id)

      failed++
    } catch (queueError) {
      const errorMessage = queueError instanceof Error ? queueError.message : 'Unknown error processing email'

      await client
        .from('email_notifications')
        .update({
          status: 'failed',
          error_message: errorMessage,
          retry_count: (email.retry_count || 0) + 1
        })
        .eq('id', email.id)

      failed++
    }
  }

  return { sent, failed }
}

async function expressHandler(req, res) {
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
    const supabase = getSupabaseServiceClient()
    const result = await processEmailQueue(supabase)
    return res.status(200).json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to process email queue'
    console.error('Direct queue processing error:', error)
    return res.status(500).json({ error: message })
  }
}

export { expressHandler, processEmailQueue }
export default expressHandler
