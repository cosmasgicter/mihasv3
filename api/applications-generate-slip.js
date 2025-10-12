import { withNetlifyHandler } from './_lib/netlifyHandler.js'
import { getUserFromRequest } from './_lib/supabaseClient.js'

async function baseHandler(req, res) {
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
    const authContext = await getUserFromRequest(req)
    if (authContext.error) {
      return res.status(401).json({ error: authContext.error })
    }

    return res.status(200).json({ 
      success: true, 
      slipUrl: 'https://example.com/slip.pdf',
      message: 'Slip generated successfully'
    })
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' })
  }
}

const netlifyHandler = withNetlifyHandler(baseHandler)

export { baseHandler as expressHandler }
export { netlifyHandler as handler }
export default netlifyHandler