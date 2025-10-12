import { withNetlifyHandler } from './_lib/netlifyHandler.js'

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
    const { email } = req.body || {}
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' })
    }

    return res.status(200).json({ 
      success: true,
      message: 'Password reset email sent'
    })
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' })
  }
}

const netlifyHandler = withNetlifyHandler(baseHandler)

export { baseHandler as expressHandler }
export { netlifyHandler as handler }
export default netlifyHandler