/**
 * Deployments API
 * 
 * Provides endpoints for managing deployments
 * Requirements: 10.5
 */

import { createDeploymentManager } from '../_lib/deploymentManager.js';

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
    const manager = createDeploymentManager(
      env.VITE_SUPABASE_URL,
      env.VITE_SUPABASE_ANON_KEY
    );

    const path = url.pathname.split('/').pop();

    switch (method) {
      case 'GET':
        if (path === 'progress') {
          const deploymentId = url.searchParams.get('deploymentId');
          return await getProgress(manager, deploymentId, corsHeaders);
        }
        break;

      case 'POST':
        const body = await request.json();
        if (path === 'create') {
          return await createDeployment(manager, body, corsHeaders);
        } else if (path === 'execute') {
          return await executeDeployment(manager, body, corsHeaders);
        } else if (path === 'rollback') {
          return await rollbackDeployment(manager, body, corsHeaders);
        }
        break;
    }

    return new Response(
      JSON.stringify({ error: 'Not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Deployments API error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

async function createDeployment(manager, body, corsHeaders) {
  const deployment = await manager.createDeployment(body);
  return new Response(
    JSON.stringify({ success: true, deployment }),
    { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function executeDeployment(manager, body, corsHeaders) {
  const { deploymentId, strategy, config } = body;

  if (!deploymentId) {
    return new Response(
      JSON.stringify({ error: 'deploymentId is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  let result;
  switch (strategy) {
    case 'blue_green':
      result = await manager.executeBlueGreenDeployment(deploymentId, config);
      break;
    case 'canary':
      result = await manager.executeCanaryDeployment(deploymentId, config);
      break;
    default:
      return new Response(
        JSON.stringify({ error: `Unsupported strategy: ${strategy}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
  }

  return new Response(
    JSON.stringify(result),
    { status: result.success ? 200 : 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function rollbackDeployment(manager, body, corsHeaders) {
  const { deploymentId } = body;

  if (!deploymentId) {
    return new Response(
      JSON.stringify({ error: 'deploymentId is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const result = await manager.rollbackDeployment(deploymentId);
  return new Response(
    JSON.stringify(result),
    { status: result.success ? 200 : 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function getProgress(manager, deploymentId, corsHeaders) {
  if (!deploymentId) {
    return new Response(
      JSON.stringify({ error: 'deploymentId is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const progress = await manager.getDeploymentProgress(deploymentId);
  return new Response(
    JSON.stringify({ success: true, progress }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
