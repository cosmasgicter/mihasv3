export async function onRequestGet() {
  return new Response(JSON.stringify({
    status: 'ok',
    timestamp: new Date().toISOString(),
    message: 'Live test successful'
  }), {
    headers: { 'Content-Type': 'application/json' }
  })
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  })
}