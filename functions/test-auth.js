import { getUserFromRequest } from './_lib/supabaseClient.js';

export async function onRequestGet(context) {
  const { request } = context;
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
  
  try {
    const headers = Object.fromEntries(request.headers);
    const authHeader = headers.authorization || headers.Authorization;
    
    const authContext = await getUserFromRequest({ headers }, { requireAdmin: false });
    
    return new Response(JSON.stringify({
      hasAuthHeader: !!authHeader,
      authContext: authContext.error ? { error: authContext.error } : { 
        userId: authContext.user?.id,
        email: authContext.user?.email,
        roles: authContext.roles,
        isAdmin: authContext.isAdmin
      }
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
