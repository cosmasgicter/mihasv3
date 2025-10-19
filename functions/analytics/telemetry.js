export async function onRequest(context) {
  const { request } = context;
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
  
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  
  if (request.method === 'POST') {
    try {
      const body = await request.json();
      // Log telemetry data (in production, send to analytics service)
      console.log('Telemetry:', body);
      
      return new Response(JSON.stringify({ success: true }), {
        status: 202,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } catch (error) {
      return new Response(JSON.stringify({ success: true }), {
        status: 202,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
  
  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
