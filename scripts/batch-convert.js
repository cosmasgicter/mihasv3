#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

// Simple pass-through functions (just query Supabase)
const simpleQueries = {
  'admin/users': { table: 'profiles', select: '*', order: 'created_at' },
  'analytics/metrics': { table: 'analytics_events', select: '*', order: 'created_at' },
  'applications/summary': { table: 'applications', select: 'id,status,created_at', order: 'created_at' },
  'applications/details': { table: 'applications', select: '*', order: 'created_at' },
  'applications/documents': { table: 'application_documents', select: '*', order: 'created_at' },
  'applications/grades': { table: 'application_grades', select: '*', order: 'created_at' },
  'notifications/preferences': { table: 'notification_preferences', select: '*', order: 'created_at' }
};

// Auth endpoints (special handling)
const authEndpoints = {
  'auth/login': `import { supabaseAdminClient } from '../../_lib/supabaseClient.js';

export async function onRequestPost(context) {
  const { request } = context;
  const body = await request.json();
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
  
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  
  try {
    const { data, error } = await supabaseAdminClient.auth.signInWithPassword({
      email: body.email,
      password: body.password
    });
    
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}`,
  
  'auth/register': `import { supabaseAdminClient } from '../../_lib/supabaseClient.js';

export async function onRequestPost(context) {
  const { request } = context;
  const body = await request.json();
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
  
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  
  try {
    const { data, error } = await supabaseAdminClient.auth.signUp({
      email: body.email,
      password: body.password,
      options: {
        data: body.user_metadata || {}
      }
    });
    
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}`
};

// Generic template for simple queries
function createSimpleQuery(config) {
  return `import { supabaseAdminClient, getUserFromRequest } from '../_lib/supabaseClient.js';

export async function onRequestGet(context) {
  const { request } = context;
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
  
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  
  try {
    const authContext = await getUserFromRequest({ headers: Object.fromEntries(request.headers) });
    if (authContext.error) {
      return new Response(JSON.stringify({ error: authContext.error }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    const { data, error } = await supabaseAdminClient
      .from('${config.table}')
      .select('${config.select}')
      .order('${config.order}', { ascending: false });
    
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    return new Response(JSON.stringify(data || []), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}`;
}

// Stub template for complex functions
function createStub() {
  return `import { supabaseAdminClient, getUserFromRequest } from '../_lib/supabaseClient.js';

export async function onRequest(context) {
  const { request } = context;
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
  
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  
  return new Response(JSON.stringify({ 
    error: 'Not implemented yet',
    message: 'This endpoint is being migrated to Cloudflare Pages'
  }), {
    status: 501,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}`;
}

let converted = 0;

// Convert auth endpoints
Object.entries(authEndpoints).forEach(([endpoint, code]) => {
  const filePath = path.join(rootDir, 'functions', `${endpoint}.js`);
  fs.writeFileSync(filePath, code);
  console.log(`✓ ${endpoint}`);
  converted++;
});

// Convert simple query endpoints
Object.entries(simpleQueries).forEach(([endpoint, config]) => {
  const filePath = path.join(rootDir, 'functions', `${endpoint}.js`);
  const code = createSimpleQuery(config);
  fs.writeFileSync(filePath, code);
  console.log(`✓ ${endpoint}`);
  converted++;
});

// Convert remaining stubs
const stubs = [
  'admin/applications/update/status',
  'admin/applications/verify/payment',
  'admin/audit/log',
  'admin/audit/log/export',
  'admin/audit/log/stats',
  'admin/email/queue/status',
  'admin/queue/status',
  'admin/users/[id]',
  'admin/users/id/permissions',
  'admin/users/id/role',
  'analytics/predictive/dashboard',
  'applications/academic/summary',
  'applications/bulk',
  'applications/email/slip',
  'applications/generate/slip',
  'applications/review',
  'auth/reset/password',
  'auth/signin',
  'documents/upload',
  'mcp/query',
  'mcp/schema',
  'notifications/application/submitted',
  'notifications/dispatch/channel',
  'notifications/process/email/queue',
  'notifications/send',
  'notifications/update/consent',
  'push/subscriptions',
  'push/subscriptions/dispatch',
  'test'
];

stubs.forEach(endpoint => {
  const filePath = path.join(rootDir, 'functions', `${endpoint}.js`);
  fs.writeFileSync(filePath, createStub());
  console.log(`⚠ ${endpoint} (stub)`);
  converted++;
});

console.log(`\n✅ Converted ${converted} functions`);
