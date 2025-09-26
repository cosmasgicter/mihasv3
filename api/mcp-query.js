import { supabaseAdminClient, getUserFromRequest } from './_lib/supabaseClient.js'
import { withNetlifyHandler } from './_lib/netlifyHandler.js';

async function baseHandler(req, res) {
  

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const authContext = await getUserFromRequest({ headers: Object.fromEntries(request.headers) }, { requireAdmin: true })
  if (authContext.error) {
    const status = authContext.error === 'Access denied' ? 403 : 401
    return new Response(JSON.stringify({ error: authContext.error }), { status, headers })
  }

  const body = req.body
  const sql = (body.sql || body.query || '').trim()

  if (!sql) {
    return res.status(400).json({ error: 'SQL query is required' })
  }

  try {
    const { data, error } = await supabaseAdminClient.rpc('execute_sql', { query: sql })
    if (error) throw error
    return new Response(JSON.stringify({ data }), { headers })
  } catch (error) {
    return res.status(500).json({ error: 'Failed to execute query' })
  }
}


const netlifyHandler = withNetlifyHandler(baseHandler)

export { baseHandler as expressHandler }
export { netlifyHandler as handler }
export default netlifyHandler