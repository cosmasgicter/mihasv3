import { supabaseAdminClient } from './_lib/supabaseClient.js'
import { withNetlifyHandler } from './_lib/netlifyHandler.js';
import { logAuditEvent } from './_lib/auditLogger.js'

async function baseHandler(req, res) {
  

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const body = req.body
  const { email, password, fullName } = body

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' })
  }

  if (!fullName) {
    return res.status(400).json({ error: 'Full name is required for registration' })
  }

  try {
    const { data, error } = await supabaseAdminClient.auth.admin.createUser({
      email,
      password,
      user_metadata: { full_name: fullName },
      email_confirm: true
    })

    if (error) {
      let errorMessage = 'Registration failed'
      if (error.message?.includes('duplicate key')) errorMessage = 'User already exists'
      else if (error.message?.includes('invalid email')) errorMessage = 'Invalid email format'
      else if (error.message?.includes('password')) errorMessage = 'Password does not meet requirements'
      
      return res.status(400).json({ error: errorMessage })
    }

    return res.status(201).json({ user: data.user, session: data.session })
  } catch (err) {
    return res.status(500).json({ error: 'Database error creating new user' })
  }
}

const netlifyHandler = withNetlifyHandler(baseHandler)

export { baseHandler as expressHandler }
export { netlifyHandler as handler }
export default netlifyHandler