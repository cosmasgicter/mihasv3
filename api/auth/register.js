import { supabaseAdminClient } from '../_lib/supabaseClient.js'
import { logAuditEvent } from '../_lib/auditLogger.js'
import { withNetlifyHandler } from '../_lib/netlifyHandler.js'
import { validateTurnstileToken } from '../_lib/turnstileValidator.js'

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const { email, password, fullName, turnstileToken } = req.body || {}

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' })
  }

  if (!fullName) {
    return res.status(400).json({ error: 'Full name is required for registration' })
  }

  // Validate Turnstile token if provided
  if (turnstileToken) {
    const clientIP = req.headers['x-forwarded-for'] || req.connection?.remoteAddress
    const turnstileResult = await validateTurnstileToken(turnstileToken, clientIP)
    
    if (!turnstileResult.success && !turnstileResult.bypass) {
      await logAuditEvent({
        req,
        action: 'auth.register.turnstile_failure',
        actorEmail: email,
        metadata: { reason: 'Turnstile verification failed' }
      })
      return res.status(400).json({ error: 'Security verification failed. Please try again.' })
    }
  }

  try {
    const { data, error } = await supabaseAdminClient.auth.admin.createUser({
      email,
      password,
      user_metadata: {
        full_name: fullName
      },
      email_confirm: true
    })

    if (error) {
      console.error('Supabase signup error:', error)
      let errorMessage = 'Registration failed'
      
      if (error.message?.includes('duplicate key')) {
        errorMessage = 'User already exists'
      } else if (error.message?.includes('invalid email')) {
        errorMessage = 'Invalid email format'
      } else if (error.message?.includes('password')) {
        errorMessage = 'Password does not meet requirements'
      }
      
      await logAuditEvent({
        req,
        action: 'auth.register.failure',
        actorEmail: email,
        metadata: { reason: error.message }
      })
      return res.status(400).json({ error: errorMessage })
    }

    await logAuditEvent({
      req,
      action: 'auth.register.success',
      actorId: data.user?.id || null,
      actorEmail: email,
      metadata: { hasSession: Boolean(data.session) }
    })

    return res.status(201).json({
      user: data.user,
      session: data.session
    })
  } catch (err) {
    console.error('Registration error:', err)
    return res.status(500).json({ error: 'Database error creating new user' })
  }
}

const netlifyHandler = withNetlifyHandler(handler)

export { handler as expressHandler }
export { netlifyHandler as handler }
export default netlifyHandler
