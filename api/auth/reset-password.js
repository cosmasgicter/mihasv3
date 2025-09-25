import { withNetlifyHandler } from '../_lib/netlifyHandler.js'
import { initiatePasswordReset } from '../_lib/passwordReset.js'

function normalizeBody(body) {
  if (!body) return {}
  if (typeof body === 'string') {
    try {
      return JSON.parse(body)
    } catch (_error) {
      return {}
    }
  }
  return body
}

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, authorization, x-requested-with')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const body = normalizeBody(req.body)
  const { email, redirectTo, turnstileToken } = body || {}

  const clientIp = req.headers?.['x-forwarded-for']
    ? String(req.headers['x-forwarded-for']).split(',')[0].trim()
    : req.socket?.remoteAddress

  const result = await initiatePasswordReset({
    email,
    redirectTo,
    turnstileToken,
    clientIp,
    request: req
  })

  if (result.error) {
    return res.status(result.status ?? 500).json({ error: result.error })
  }

  return res.status(200).json({ success: true })
}

const netlifyHandler = withNetlifyHandler(handler)

export { handler as expressHandler }
export { netlifyHandler as handler }
export default netlifyHandler
