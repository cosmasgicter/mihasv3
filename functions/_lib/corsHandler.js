export function withCors(handler) {
  return async function corsWrapper(req, res) {
    // Add CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, authorization, x-requested-with')
    
    if (req.method === 'OPTIONS') {
      return res.status(200).end()
    }
    
    return await handler(req, res)
  }
}