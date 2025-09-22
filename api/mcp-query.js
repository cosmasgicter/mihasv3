import { supabaseAdminClient, getUserFromRequest } from './_lib/supabaseClient.js'
import { logAuditEvent } from './_lib/auditLogger.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const authContext = await getUserFromRequest(req, { requireAdmin: true })
  if (authContext.error) {
    const status = authContext.error === 'Access denied' ? 403 : 401
    return res.status(status).json({ error: authContext.error })
  }

  let body = req.body
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body)
    } catch (e) {
      return res.status(400).json({ error: 'Invalid JSON in request body' })
    }
  }
  
  const sql = (typeof body.sql === 'string' ? body.sql : body.query || '').trim()

  if (!sql) {
    return res.status(400).json({ error: 'SQL query is required' })
  }

  try {
    const { data, error } = await supabaseAdminClient.rpc('execute_sql', {
      query: sql
    })

    if (error) {
      throw error
    }

    return res.status(200).json({ data })
  } catch (error) {
    console.error('MCP query handler error:', error)
    return res.status(500).json({ error: 'Failed to execute query' })
  }
}