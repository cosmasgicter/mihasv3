import { withNetlifyHandler } from './_lib/netlifyHandler.js'

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  const { id } = req.query
  
  if (!id) {
    return res.status(400).json({ error: 'User ID is required' })
  }

  return res.status(200).json({ 
    user: { 
      id, 
      email: 'user@example.com',
      full_name: 'Test User',
      roles: ['user']
    } 
  })
}

const netlifyHandler = withNetlifyHandler(handler)

export { handler as expressHandler }
export { netlifyHandler as handler }
export default netlifyHandler