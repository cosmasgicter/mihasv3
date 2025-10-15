import { z } from 'zod'
import { supabaseAdminClient, getUserFromRequest } from '../_lib/supabaseClient.js'
import { withNetlifyHandler } from '../_lib/netlifyHandler.js'

const subscriptionSchema = z.object({
  endpoint: z.string().url(),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string(),
    auth: z.string()
  })
})

const requestSchema = z.object({
  subscription: subscriptionSchema,
  userAgent: z.string().max(512).optional().nullable()
})

const dependencies = {
  supabaseClient: supabaseAdminClient,
  getUserFromRequest
}

function parseBody(body) {
  if (!body) {
    return null
  }

  if (typeof body !== 'string') {
    return body
  }

  try {
    return JSON.parse(body)
  } catch (error) {
    return null
  }
}

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, authorization')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  const authContext = await dependencies.getUserFromRequest(req)
  if (authContext.error) {
    const status = authContext.error === 'Access denied' ? 403 : 401
    return res.status(status).json({ error: authContext.error })
  }

  if (req.method === 'GET') {
    const { data, error } = await dependencies.supabaseClient
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', authContext.user.id)

    if (error) {
      return res.status(500).json({ error: error.message })
    }

    return res.status(200).json({
      success: true,
      subscriptions: data ?? []
    })
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const body = parseBody(req.body)
  const parseResult = requestSchema.safeParse(body)

  if (!parseResult.success) {
    return res.status(400).json({ error: 'Invalid subscription payload' })
  }

  const { subscription, userAgent } = parseResult.data

  try {
    const { data: existing, error: selectError } = await dependencies.supabaseClient
      .from('push_subscriptions')
      .select('id, user_id')
      .eq('endpoint', subscription.endpoint)
      .maybeSingle()

    if (selectError) {
      throw new Error(selectError.message)
    }

    const record = {
      user_id: authContext.user.id,
      endpoint: subscription.endpoint,
      subscription,
      auth_key: subscription.keys.auth,
      p256dh_key: subscription.keys.p256dh,
      expiration_time: subscription.expirationTime ?? null,
      user_agent: userAgent ?? null,
      updated_at: new Date().toISOString()
    }

    if (existing?.id) {
      record.id = existing.id
    }

    const { data: upserted, error: upsertError } = await dependencies.supabaseClient
      .from('push_subscriptions')
      .upsert(record, { onConflict: 'endpoint' })
      .select('id, user_id, endpoint')
      .single()

    if (upsertError) {
      throw new Error(upsertError.message)
    }

    return res.status(existing ? 200 : 201).json({
      success: true,
      subscription: {
        id: upserted.id,
        userId: upserted.user_id,
        endpoint: upserted.endpoint
      }
    })
  } catch (error) {
    console.error('Push subscription storage error:', error)
    return res.status(500).json({ error: 'Failed to store subscription' })
  }
}

handler.__testables__ = {
  setDependencies(overrides = {}) {
    Object.assign(dependencies, overrides)
  }
}

const netlifyHandler = withNetlifyHandler(handler)

export { handler as expressHandler }
export { netlifyHandler as handler }
export default netlifyHandler
