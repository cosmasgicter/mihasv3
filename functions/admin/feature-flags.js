/**
 * Feature Flags API
 * 
 * Provides endpoints for managing feature flags
 * Requirements: 10.5
 */

import { createFeatureFlagManager } from '../_lib/featureFlags.js';

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const method = request.method;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  if (method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const manager = createFeatureFlagManager(
      env.VITE_SUPABASE_URL,
      env.VITE_SUPABASE_ANON_KEY
    );

    const path = url.pathname.split('/').pop();

    switch (method) {
      case 'GET':
        if (path === 'all') {
          return await getAllFlags(manager, corsHeaders);
        } else if (path === 'check') {
          const featureKey = url.searchParams.get('key');
          const userId = url.searchParams.get('userId');
          return await checkFlag(manager, featureKey, userId, corsHeaders);
        } else if (path === 'statistics') {
          const featureKey = url.searchParams.get('key');
          return await getStatistics(manager, featureKey, corsHeaders);
        }
        break;

      case 'POST':
        const body = await request.json();
        if (path === 'create') {
          return await createFlag(manager, body, corsHeaders);
        } else if (path === 'enable') {
          return await enableFlag(manager, body, corsHeaders);
        } else if (path === 'disable') {
          return await disableFlag(manager, body, corsHeaders);
        } else if (path === 'rollout') {
          return await gradualRollout(manager, body, corsHeaders);
        }
        break;

      case 'PUT':
        const updateBody = await request.json();
        return await updateFlag(manager, updateBody, corsHeaders);
    }

    return new Response(
      JSON.stringify({ error: 'Not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Feature flags API error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

async function getAllFlags(manager, corsHeaders) {
  const flags = await manager.getAllFlags();
  return new Response(
    JSON.stringify({ success: true, flags }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function checkFlag(manager, featureKey, userId, corsHeaders) {
  if (!featureKey) {
    return new Response(
      JSON.stringify({ error: 'featureKey is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const enabled = await manager.isEnabled(featureKey, { userId });
  
  // Track evaluation
  if (userId) {
    await manager.trackEvaluation(featureKey, userId, enabled);
  }

  return new Response(
    JSON.stringify({ success: true, enabled }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function getStatistics(manager, featureKey, corsHeaders) {
  if (!featureKey) {
    return new Response(
      JSON.stringify({ error: 'featureKey is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const statistics = await manager.getStatistics(featureKey);
  return new Response(
    JSON.stringify({ success: true, statistics }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function createFlag(manager, body, corsHeaders) {
  const flag = await manager.setFlag(body);
  return new Response(
    JSON.stringify({ success: true, flag }),
    { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function updateFlag(manager, body, corsHeaders) {
  const flag = await manager.setFlag(body);
  return new Response(
    JSON.stringify({ success: true, flag }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function enableFlag(manager, body, corsHeaders) {
  const { featureKey, percentage = 100 } = body;
  const flag = await manager.enableFlag(featureKey, percentage);
  return new Response(
    JSON.stringify({ success: true, flag }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function disableFlag(manager, body, corsHeaders) {
  const { featureKey } = body;
  const flag = await manager.disableFlag(featureKey);
  return new Response(
    JSON.stringify({ success: true, flag }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function gradualRollout(manager, body, corsHeaders) {
  const { featureKey, targetPercentage, incrementBy } = body;
  const flag = await manager.gradualRollout(featureKey, targetPercentage, incrementBy);
  return new Response(
    JSON.stringify({ success: true, flag }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
