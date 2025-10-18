const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, authorization, x-requested-with',
  'Access-Control-Max-Age': '86400'
}

export function addCorsHeaders(headers = {}) {
  return { ...CORS_HEADERS, ...headers }
}

export function handleCors(req, res) {
  Object.entries(CORS_HEADERS).forEach(([key, value]) => {
    res.setHeader(key, value)
  })

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return true
  }

  return false
}
