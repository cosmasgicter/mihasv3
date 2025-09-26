import { supabaseAdminClient, getUserFromRequest } from './_lib/supabaseClient.js'
import { withNetlifyHandler } from './_lib/netlifyHandler.js';

async function baseHandler(req, res) {
  

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method === 'GET') {
    const url = new URL(request.url)
    const page = parseInt(url.searchParams.get('page') || '0')
    const pageSize = parseInt(url.searchParams.get('pageSize') || '10')
    const from = page * pageSize
    const to = from + pageSize - 1

    const { data, error, count } = await supabaseAdminClient
      .from('applications_new')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to)

    if (error) {
      return res.status(400).json({ error: error.message })
    }

    return new Response(JSON.stringify({
      applications: data || [],
      totalCount: count || 0,
      page,
      pageSize
    }), { headers })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

const netlifyHandler = withNetlifyHandler(baseHandler)

export { baseHandler as expressHandler }
export { netlifyHandler as handler }
export default netlifyHandler