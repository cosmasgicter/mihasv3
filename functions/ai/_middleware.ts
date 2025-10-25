// AI API Middleware - Auth & Rate Limiting
export const onRequest: PagesFunction = async (context) => {
  const authHeader = context.request.headers.get('Authorization')
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  return context.next()
}
