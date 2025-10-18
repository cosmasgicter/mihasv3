import webpush from 'web-push'
import { z } from 'zod'
import { supabaseAdminClient, getUserFromRequest } from '../_lib/supabaseClient.js'
import { withNetlifyHandler } from '../_lib/netlifyHandler.js'

const dependencies = {
  supabaseClient: supabaseAdminClient,
  webpush,
  getUserFromRequest
}

const requestSchema = z.object({
  userId: z.string().min(1),
  title: z.string().min(1),
  body: z.string().min(1),
  data: z.record(z.unknown()).optional()
})

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

function getVapidContact() {
  const contact = process.env.VAPID_CONTACT_EMAIL
  if (!contact) {
    return 'mailto:notifications@example.com'
  }
  if (contact.startsWith('mailto:')) {
    return contact
  }
  return `mailto:${contact}`
}

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, authorization')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const authContext = await dependencies.getUserFromRequest(req, { requireAdmin: true })
  if (authContext.error) {
    const status = authContext.error === 'Access denied' ? 403 : 401
    return res.status(status).json({ error: authContext.error })
  }

  const body = parseBody(req.body)
  const parseResult = requestSchema.safeParse(body)

  if (!parseResult.success) {
    return res.status(400).json({ error: 'Invalid push notification payload' })
  }

  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY

  if (!vapidPublicKey || !vapidPrivateKey) {
    return res.status(503).json({ error: 'Push notification service is not configured' })
  }

  const payload = parseResult.data

  try {
    dependencies.webpush.setVapidDetails(getVapidContact(), vapidPublicKey, vapidPrivateKey)
  } catch (error) {
    console.error('Failed to configure VAPID details:', error)
    return res.status(500).json({ error: 'Push notification service misconfigured' })
  }

  try {
    const { data: subscriptions, error: fetchError } = await dependencies.supabaseClient
      .from('push_subscriptions')
      .select('id, subscription')
      .eq('user_id', payload.userId)

    if (fetchError) {
      throw new Error(fetchError.message)
    }

    if (!subscriptions || subscriptions.length === 0) {
      return res.status(200).json({ success: false, delivered: 0, attempted: 0 })
    }

    const pushPayload = JSON.stringify({
      title: payload.title,
      body: payload.body,
      data: payload.data ?? {}
    })

    let delivered = 0
    const staleSubscriptionIds = []

    await Promise.all(
      subscriptions.map(async record => {
        try {
          await dependencies.webpush.sendNotification(record.subscription, pushPayload)
          delivered += 1
        } catch (error) {
          const statusCode = typeof error?.statusCode === 'number' ? error.statusCode : undefined
          if (statusCode === 404 || statusCode === 410) {
            staleSubscriptionIds.push(record.id)
          } else {
            console.error('Push delivery error:', error)
          }
        }
      })
    )

    if (staleSubscriptionIds.length > 0) {
      await dependencies.supabaseClient
        .from('push_subscriptions')
        .delete()
        .in('id', staleSubscriptionIds)
    }

    return res.status(200).json({
      success: delivered > 0,
      delivered,
      attempted: subscriptions.length
    })
  } catch (error) {
    console.error('Push dispatch error:', error)
    return res.status(500).json({ error: 'Failed to dispatch push notification' })
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
