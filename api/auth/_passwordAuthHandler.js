const { logAuditEvent } = require('../_lib/auditLogger')

function createPasswordAuthHandler({ auditEventBase = 'auth.login' } = {}) {
  return async function passwordAuthHandler(req, res, { supabaseClient }) {
    // Parse body if it's a string (Netlify functions)
    let body = req.body
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body)
      } catch (e) {
        return res.status(400).json({ error: 'Invalid JSON in request body' })
      }
    }
    
    const { email, password } = body || {}

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' })
    }

    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    })

    if (error) {
      await logAuditEvent({
        req,
        action: `${auditEventBase}.failure`,
        actorEmail: email,
        metadata: { reason: error.message }
      })
      return res.status(401).json({ error: error.message })
    }

    await logAuditEvent({
      req,
      action: `${auditEventBase}.success`,
      actorId: data.user?.id || null,
      actorEmail: email,
      metadata: { hasSession: Boolean(data.session) }
    })

    return res.status(200).json({
      user: data.user,
      session: data.session
    })
  }
}

module.exports = { createPasswordAuthHandler }
