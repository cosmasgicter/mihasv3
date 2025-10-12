import { supabaseAdminClient, getUserFromRequest } from './_lib/supabaseClient.js'
import { withNetlifyHandler } from './_lib/netlifyHandler.js'

async function baseHandler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  // Extract ID from query params (from Netlify redirect) or path params
  let { id, include } = req.query
  
  // If not in query, try to extract from path params
  if (!id && req.params) {
    id = req.params.id
  }
  
  // If still not found, try to extract from URL path
  if (!id && req.path) {
    const pathMatch = req.path.match(/\/applications\/([^/?]+)/)
    if (pathMatch) {
      id = pathMatch[1]
    }
  }
  
  // Debug logging
  console.log('ID extraction debug:', {
    queryId: req.query?.id,
    paramsId: req.params?.id,
    path: req.path,
    url: req.url,
    extractedId: id
  })

  if (!id) {
    return res.status(400).json({ 
      error: 'Application ID is required',
      debug: {
        query: req.query,
        params: req.params,
        path: req.path
      }
    })
  }

  try {
    if (req.method === 'GET') {
      const authContext = await getUserFromRequest(req)
      if (authContext.error) {
        return res.status(401).json({ error: authContext.error })
      }

      // Fetch application with access control
      const { data, error } = await supabaseAdminClient
        .from('applications_new')
        .select('*')
        .eq('id', id)
        .maybeSingle()

      if (error) {
        return res.status(400).json({ error: error.message })
      }

      if (!data) {
        return res.status(404).json({ error: 'Application not found' })
      }

      // Check access - user can only see their own applications unless admin
      if (!authContext.isAdmin && data.user_id !== authContext.user.id) {
        return res.status(403).json({ error: 'Access denied' })
      }

      return res.status(200).json({ success: true, data })
    }

    if (req.method === 'PATCH') {
      const authContext = await getUserFromRequest(req, { requireAdmin: true })
      if (authContext.error) {
        return res.status(401).json({ error: authContext.error })
      }

      const body = req.body || {}
      const { action, paymentStatus } = body

      if (action === 'update_payment_status' && paymentStatus) {
        const { data, error } = await supabaseAdminClient
          .from('applications_new')
          .update({ 
            payment_status: paymentStatus,
            updated_at: new Date().toISOString()
          })
          .eq('id', id)
          .select()
          .single()

        if (error) {
          return res.status(400).json({ error: error.message })
        }

        return res.status(200).json({ success: true, data })
      }

      return res.status(400).json({ error: 'Invalid action or missing parameters' })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    console.error('Application handler error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

const netlifyHandler = withNetlifyHandler(baseHandler)

export { baseHandler as expressHandler }
export { netlifyHandler as handler }
export default netlifyHandler