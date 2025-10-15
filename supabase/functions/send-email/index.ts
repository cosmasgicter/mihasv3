import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  try {
    const { to, subject, html } = await req.json()

    if (!to || !subject || !html) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }

    // Mock email - just log it
    console.log('📧 Mock Email Sent:')
    console.log('To:', to)
    console.log('Subject:', subject)
    console.log('HTML:', html.substring(0, 200) + '...')

    return new Response(JSON.stringify({ success: true, id: 'mock-' + Date.now() }), { headers: { 'Content-Type': 'application/json' } })

  } catch (error) {
    console.error('Send email error:', error)
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})
