import { supabaseAdminClient, getUserFromRequest } from '../_lib/supabaseClient.js'
import { logAuditEvent } from '../_lib/auditLogger.js'

function getQueryParam(req, name) {
  if (req.query && typeof req.query[name] === 'string') {
    return req.query[name]
  }

  try {
    const url = new URL(req.url || '', 'http://localhost')
    return url.searchParams.get(name)
  } catch (error) {
    return null
  }
}

export default async function handler(req, res) {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }


  const method = (req.method || 'GET').toUpperCase()
  if (method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: `Method ${method} not allowed` })
  }

  const authContext = await getUserFromRequest(req, { requireAdmin: true })
  if (authContext.error) {
    const status = authContext.error === 'Access denied' ? 403 : 401
    return res.status(status).json({ error: authContext.error })
  }

  const tableName = (getQueryParam(req, 'table') || '').trim()

  try {
    if (tableName) {
      const { data, error } = await supabaseAdminClient
        .from('information_schema.columns')
        .select('column_name, data_type, is_nullable, ordinal_position')
        .eq('table_schema', 'public')
        .eq('table_name', tableName)
        .order('ordinal_position', { ascending: true })

      if (error) {
        throw error
      }

      await logAuditEvent({
        req,
        action: 'mcp.schema.table-info',
        actorId: authContext.user.id,
        actorEmail: authContext.user.email || null,
        actorRoles: authContext.roles,
        targetTable: tableName,
        metadata: { columnCount: data?.length || 0 }
      })

      return res.status(200).json({ table: tableName, columns: data || [] })
    }

    const { data, error } = await supabaseAdminClient
      .from('information_schema.tables')
      .select('table_name, table_type')
      .eq('table_schema', 'public')
      .order('table_name', { ascending: true })

    if (error) {
      throw error
    }

    await logAuditEvent({
      req,
      action: 'mcp.schema.list',
      actorId: authContext.user.id,
      actorEmail: authContext.user.email || null,
      actorRoles: authContext.roles,
      targetTable: 'information_schema.tables',
      metadata: { tableCount: data?.length || 0 }
    })

    return res.status(200).json({ tables: data || [] })
  } catch (error) {
    console.error('MCP schema handler error:', error)
    return res.status(500).json({ error: 'Failed to load schema information' })
  }
}
