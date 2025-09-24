export default async (request, context) => {
  return new Response(JSON.stringify({
    message: 'API is working!',
    method: request.method,
    timestamp: new Date().toISOString(),
    url: request.url
  }), {
    headers: { 'Content-Type': 'application/json' }
  })
}
