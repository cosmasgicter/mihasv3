import { withNetlifyHandler } from './_lib/netlifyHandler.js'
import { supabaseAdminClient, getUserFromRequest } from './_lib/supabaseClient.js'

const supabase = supabaseAdminClient

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { query, context } = req.body || {}

    if (!query) {
      return res.status(400).json({ error: 'Query is required' })
    }

    // For basic queries, don't require authentication
    if (query.toLowerCase().includes('help') || query.toLowerCase().includes('status')) {
      return res.status(200).json({ 
        success: true,
        result: 'MCP service is operational. Available commands: help, status, applications (requires auth)',
        data: [],
        query: query
      })
    }

    // For data queries, require authentication
    const authContext = await getUserFromRequest(req)
    if (authContext.error) {
      return res.status(200).json({ 
        success: true,
        result: 'Authentication required for data queries. Please login first.',
        data: [],
        query: query
      })
    }

    // Simple query processing for applications
    if (query.toLowerCase().includes('application')) {
      const { data: applications, error } = await supabase
        .from('applications_new')
        .select('id, application_number, full_name, status, program')
        .limit(10)

      if (error) {
        return res.status(500).json({ error: 'Query failed' })
      }

      return res.status(200).json({
        success: true,
        result: `Found ${applications.length} applications`,
        data: applications,
        query: query
      })
    }

    return res.status(200).json({ 
      success: true,
      result: 'Query processed successfully',
      data: [],
      query: query
    })
  } catch (error) {
    console.error('MCP query error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

const netlifyHandler = withNetlifyHandler(handler)

export { handler as expressHandler }
export { netlifyHandler as handler }
export default netlifyHandler