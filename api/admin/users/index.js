import { supabaseAdminClient, getUserFromRequest } from '../../_lib/supabaseClient.js'
import { withNetlifyHandler } from '../../_lib/netlifyHandler.js'

const supabase = supabaseAdminClient

async function baseHandler(req, res) {
  if (req.method !== 'GET') {
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

    // Get users from profiles table
    const { data: users, error } = await supabase
      .from('profiles')
      .select('id, email, first_name, last_name, role, is_active, created_at')
      .order('created_at', { ascending: false })

    if (error) {
      throw error
    }

    return res.status(200).json({
      users: users || []
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