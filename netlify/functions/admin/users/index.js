const {
  supabaseAdminClient,
  requireUser
} = require('../../_lib/supabaseClient')
const { logAuditEvent } = require('../../_lib/auditLogger')

module.exports = async function handler(req, res) {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }


  try {
    const { user, roles } = await requireUser(req, { requireAdmin: true })

    if (req.method === 'GET') {
      const { data, error } = await supabaseAdminClient
        .from('user_profiles')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error

      await logAuditEvent({
        req,
        action: 'admin.users.list',
        actorId: user.id,
        actorEmail: user.email || null,
        actorRoles: roles,
        targetTable: 'user_profiles',
        metadata: { total: Array.isArray(data) ? data.length : 0 }
      })

      return res.status(200).json({ data })
    }

    if (req.method === 'POST') {
      let body = req.body

      if (typeof body === 'string') {
        try {
          body = JSON.parse(body)
        } catch (parseError) {
          console.error('Invalid JSON body for admin users POST:', parseError)
          return res.status(400).json({ error: 'Invalid JSON body' })
        }
      }

      const payload = body && typeof body === 'object' ? body : {}
      const { email, password, full_name, phone, role } = payload

      const { data: authData, error: authError } = await supabaseAdminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true
      })

      if (authError) throw authError
      if (!authData?.user) throw new Error('Failed to create user')

      const { data: profileData, error: profileError } = await supabaseAdminClient
        .from('user_profiles')
        .insert({
          user_id: authData.user.id,
          email,
          full_name,
          phone,
          role
        })
        .select()
        .single()

      if (profileError) throw profileError

      await logAuditEvent({
        req,
        action: 'admin.users.create',
        actorId: user.id,
        actorEmail: user.email || null,
        actorRoles: roles,
        targetTable: 'user_profiles',
        targetId: profileData?.user_id || null,
        metadata: { email, role }
      })

      return res.status(201).json({ data: profileData })
    }

    res.setHeader('Allow', 'GET,POST')
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    console.error('Admin users index handler error:', error)
    const statusCode = error.message === 'Access denied' ? 403 : 500
    return res.status(statusCode).json({ error: error.message || 'Internal server error' })
  }
}
