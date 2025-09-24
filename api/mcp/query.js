import { supabaseAdminClient, getUserFromRequest } from '../_lib/supabaseClient.js'
import { logAuditEvent } from '../_lib/auditLogger.js'
import { withNetlifyHandler } from '../_lib/netlifyHandler.js'

async function handler(req, res) {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, authorization')
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }


  const method = (req.method || 'POST').toUpperCase()
  if (method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: `Method ${method} not allowed` })
  }

  const authContext = await getUserFromRequest(req, { requireAdmin: true })
  if (authContext.error) {
    const status = authContext.error === 'Access denied' ? 403 : 401
    return res.status(status).json({ error: authContext.error })
  }

  // Parse body if it's a string (Netlify functions)
  let body = req.body
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body)
    } catch (e) {
      return res.status(400).json({ error: 'Invalid JSON in request body' })
    }
  }
  
  body = body || {}
  const sql = (typeof body.sql === 'string' ? body.sql : body.query || '').trim()
  const parameters = Array.isArray(body.params) ? body.params : []

  if (!sql) {
    return res.status(400).json({ error: 'SQL query is required' })
  }

  try {
    const { data, error } = await supabaseAdminClient.rpc('execute_sql', {
      query: sql,
      parameters
    })

    if (error) {
      throw error
    }

    await logAuditEvent({
      req,
      action: 'mcp.query.execute',
      actorId: authContext.user.id,
      actorEmail: authContext.user.email || null,
      actorRoles: authContext.roles,
      targetTable: 'execute_sql',
      metadata: {
        hasParameters: parameters.length > 0,
        parameterCount: parameters.length,
        sqlPreview: sql.slice(0, 200)
      }
    })

    return res.status(200).json({ data })
  } catch (error) {
    console.error('MCP query handler error:', error)
    return res.status(500).json({ error: 'Failed to execute query' })
  }
}

const netlifyHandler = withNetlifyHandler(handler)

export { handler as expressHandler }
export { netlifyHandler as handler }
export default netlifyHandler
