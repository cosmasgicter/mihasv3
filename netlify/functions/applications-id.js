export default async (request, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, authorization',
    'Content-Type': 'application/json'
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers })
  }

  const url = new URL(request.url)
  const id = url.searchParams.get('id')
  
  return new Response(JSON.stringify({ application: { id, status: 'draft' } }), { headers })
}
