import { supabaseAdminClient, getUserFromRequest } from './_lib/supabaseClient.js'
import { withNetlifyHandler } from './_lib/netlifyHandler.js'

async function baseHandler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  const { id } = req.query

  if (!id) {
    return res.status(400).json({ error: 'Application ID is required' })
  }

  try {
    if (req.method === 'GET') {
      const authContext = await getUserFromRequest(req)
      if (authContext.error) {
        return res.status(401).json({ error: authContext.error })
      }

      return res.status(200).json({ 
        success: true, 
        data: { 
          id, 
          status: 'submitted',
          created_at: new Date().toISOString()
        } 
      })
    }

    if (req.method === 'PATCH') {
      const authContext = await getUserFromRequest(req, { requireAdmin: true })
      if (authContext.error) {
        return res.status(401).json({ error: authContext.error })
      }

      return res.status(200).json({ 
        success: true, 
        data: { 
          id, 
          payment_status: 'verified',
          updated_at: new Date().toISOString()
        } 
      })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' })
  }
}

const netlifyHandler = withNetlifyHandler(baseHandler)

export { baseHandler as expressHandler }
export { netlifyHandler as handler }
export default netlifyHandler