import { supabaseAdminClient, getUserFromRequest } from './_lib/supabaseClient.js'
import { withNetlifyHandler } from '../../api/_lib/netlifyHandler.js'

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  
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
  return res.status(200).json({ intakes: data || [] })
}

export const handler = withNetlifyHandler(handler)