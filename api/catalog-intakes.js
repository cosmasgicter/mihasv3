import { supabaseAdminClient } from './_lib/supabaseClient.js'
import { withNetlifyHandler } from './_lib/netlifyHandler.js';

async function baseHandler(req, res) {
  

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { data, error } = await supabaseAdminClient
    .from('intakes')
    .select('*')
    .eq('is_active', true)
    .order('application_deadline')

  if (error) {
    return res.status(400).json({ error: error.message })
  }

  return new Response(JSON.stringify({ intakes: data || [] }), { headers })
}

const netlifyHandler = withNetlifyHandler(baseHandler)

export { baseHandler as expressHandler }
export { netlifyHandler as handler }
export default netlifyHandler