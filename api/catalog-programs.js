import { supabaseAdminClient } from './_lib/supabaseClient.js'
import { withNetlifyHandler } from './_lib/netlifyHandler.js';

async function baseHandler(req, res) {
  

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { data, error } = await supabaseAdminClient
      .from('programs')
      .select('*, institutions (id, name, full_name, slug)')
      .eq('is_active', true)
      .order('name')

    if (error) throw error

    return res.status(200).json({ programs: data || [] });
  } catch (error) {
    console.error('Failed to load programs:', error);
    console.error('Failed to load programs:', { message: error.message, code: error.code, hint: error.hint, stack: error.stack });
    return res.status(500).json({
      error: 'Failed to load programs',
      details: error.message,
      code: error.code
    });
  }
}

const netlifyHandler = withNetlifyHandler(baseHandler)

export { baseHandler as expressHandler }
export { netlifyHandler as handler }
export default netlifyHandler