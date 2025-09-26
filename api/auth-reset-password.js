import { initiatePasswordReset } from './_lib/passwordReset.js'
import { withNetlifyHandler } from './_lib/netlifyHandler.js';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, authorization, x-requested-with',
  'Content-Type': 'application/json'
}

function cloneHeaders(request) {
  const result = {}
  for (const [key, value] of request.headers.entries()) {
    result[key] = value
  }
  return result
}

async function baseHandler(request, _context) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers })
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers })
  }

  let body = {}
  try {
    body = await request.json()
  } catch (_error) {
    body = {}
  }

  const { email, redirectTo, turnstileToken } = body || {}

  const clientIpHeader = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip')
  const clientIp = clientIpHeader ? clientIpHeader.split(',')[0].trim() : undefined

  const result = await initiatePasswordReset({
    email,
    redirectTo,
    turnstileToken,
    clientIp,
    request: { headers: cloneHeaders(request) }
  })

  if (result.error) {
    return new Response(JSON.stringify({ error: result.error }), { status: result.status ?? 500, headers })
  }

  return new Response(JSON.stringify({ success: true }), { status: 200, headers })
}


const netlifyHandler = withNetlifyHandler(baseHandler)

export { baseHandler as expressHandler }
export { netlifyHandler as handler }
export default netlifyHandler