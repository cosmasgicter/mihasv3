import { z } from 'zod'
import { supabaseAdminClient, getUserFromRequest } from '../_lib/supabaseClient.js'
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

export default async (request, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers })
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers })
  }

  const authContext = await getUserFromRequest(request)
  if (authContext.error) {
    const status = authContext.error === 'Access denied' ? 403 : 401
    return new Response(JSON.stringify({ error: authContext.error }), { status, headers })
  }

  const body = await request.json().catch(() => null)
  const parseResult = requestSchema.safeParse(body)

  if (!parseResult.success) {
    return new Response(JSON.stringify({ error: 'Invalid subscription payload' }), { status: 400, headers })
  }

  const { subscription, userAgent } = parseResult.data

  try {
    const { data: existing, error: selectError } = await supabaseAdminClient
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

    const { data: upserted, error: upsertError } = await supabaseAdminClient
      .from('push_subscriptions')
      .upsert(record, { onConflict: 'endpoint' })
      .select('id, user_id, endpoint')
      .single()

    if (upsertError) {
      throw new Error(upsertError.message)
    }

    return new Response(JSON.stringify({
      success: true,
      subscription: {
        id: upserted.id,
        userId: upserted.user_id,
        endpoint: upserted.endpoint
      }
    }), { status: existing ? 200 : 201, headers })
  } catch (error) {
    console.error('Push subscription storage error:', error)
    return new Response(JSON.stringify({ error: 'Failed to store subscription' }), { status: 500, headers })
  }
}
