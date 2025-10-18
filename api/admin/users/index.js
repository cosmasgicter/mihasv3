import { supabaseAdminClient, getUserFromRequest } from '../../_lib/supabaseClient.js'
import { withNetlifyHandler } from '../../_lib/netlifyHandler.js'

const supabase = supabaseAdminClient

async function baseHandler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const authContext = await getUserFromRequest(req)
    if (authContext.error) {
      const status = authContext.error === 'Access denied' ? 403 : 401
      return res.status(status).json({ error: authContext.error })
    }

    if (!authContext.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' })
    }

    if (req.method === 'POST') {
      const { email, password, full_name, phone, role } = JSON.parse(req.body || '{}')
      
      if (!email || !password || !full_name) {
        return res.status(400).json({ error: 'Email, password, and full name are required' })
      }

      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name }
      })

      if (authError) throw authError

      const nameParts = full_name.trim().split(' ')
      const firstName = nameParts[0] || ''
      const lastName = nameParts.slice(1).join(' ') || ''

      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({
          id: authData.user.id,
          email,
          first_name: firstName,
          last_name: lastName,
          phone: phone || null,
          role: role || 'student',
          is_active: true
        })

      if (profileError) throw profileError

      return res.status(201).json({ 
        data: {
          user_id: authData.user.id,
          email,
          full_name,
          phone: phone || '',
          role: role || 'student',
          created_at: authData.user.created_at
        }
      })
    }

    // Get users from profiles table
    const { data: users, error } = await supabase
      .from('profiles')
      .select('id, email, first_name, last_name, phone, role, is_active, created_at')
      .order('created_at', { ascending: false })

    if (error) {
      throw error
    }

    const mappedUsers = (users || []).map(user => ({
      user_id: user.id,
      email: user.email,
      full_name: [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email?.split('@')[0] || 'Unknown',
      phone: user.phone || '',
      role: user.role || 'student',
      is_active: user.is_active !== false,
      created_at: user.created_at
    }))

    return res.status(200).json({
      data: mappedUsers
    })

  } catch (error) {
    console.error('Users list error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

const netlifyHandler = withNetlifyHandler(baseHandler)

export { baseHandler as expressHandler }
export { netlifyHandler as handler }
export default netlifyHandler