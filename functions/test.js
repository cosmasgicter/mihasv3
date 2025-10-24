export async function onRequest(context) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };

  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  return new Response(JSON.stringify({ 
    success: true, 
    message: 'Cloudflare Pages function is working',
    timestamp: new Date().toISOString(),
    env_check: {
      has_supabase_url: !!context.env.SUPABASE_URL,
      has_service_key: !!context.env.SUPABASE_SERVICE_ROLE_KEY,
      available_vars: Object.keys(context.env || {})
    }
  }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}