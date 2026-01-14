/**
 * Migration Management API
 * 
 * Provides endpoints for executing and managing database migrations
 * Requirements: 10.4
 */

import { createMigrationFramework } from '../_lib/migrationFramework.js';

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const method = request.method;

  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  if (method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize migration framework
    const framework = createMigrationFramework(
      env.VITE_SUPABASE_URL,
      env.VITE_SUPABASE_ANON_KEY
    );

    // Route handling
    const path = url.pathname.split('/').pop();

    switch (method) {
      case 'GET':
        if (path === 'history') {
          return await getMigrationHistory(framework, corsHeaders);
        } else if (path === 'progress') {
          const migrationId = url.searchParams.get('migrationId');
          return await getMigrationProgress(framework, migrationId, corsHeaders);
        } else if (path === 'statistics') {
          return await getMigrationStatistics(framework, corsHeaders);
        }
        break;

      case 'POST':
        if (path === 'execute') {
          const body = await request.json();
          return await executeMigration(framework, body, corsHeaders);
        } else if (path === 'rollback') {
          const body = await request.json();
          return await rollbackMigration(framework, body, corsHeaders);
        } else if (path === 'validate') {
          const body = await request.json();
          return await validateMigration(framework, body, corsHeaders);
        }
        break;
    }

    return new Response(
      JSON.stringify({ error: 'Not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Migration API error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Get migration history
 */
async function getMigrationHistory(framework, corsHeaders) {
  try {
    const history = await framework.getMigrationHistory();
    
    return new Response(
      JSON.stringify({
        success: true,
        history,
        count: history.length
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Get migration progress
 */
async function getMigrationProgress(framework, migrationId, corsHeaders) {
  if (!migrationId) {
    return new Response(
      JSON.stringify({ error: 'migrationId is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const progress = await framework.getMigrationProgress(migrationId);
    
    return new Response(
      JSON.stringify({
        success: true,
        progress
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Get migration statistics
 */
async function getMigrationStatistics(framework, corsHeaders) {
  try {
    const { data, error } = await framework.supabase
      .rpc('get_migration_statistics');

    if (error) throw error;

    return new Response(
      JSON.stringify({
        success: true,
        statistics: data[0] || {
          total_migrations: 0,
          completed_migrations: 0,
          failed_migrations: 0,
          rolled_back_migrations: 0,
          average_duration_seconds: 0
        }
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Execute a migration
 */
async function executeMigration(framework, body, corsHeaders) {
  const { migrationId } = body;

  if (!migrationId) {
    return new Response(
      JSON.stringify({ error: 'migrationId is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const result = await framework.executeMigration(migrationId);
    
    return new Response(
      JSON.stringify(result),
      { 
        status: result.success ? 200 : 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Rollback a migration
 */
async function rollbackMigration(framework, body, corsHeaders) {
  const { migrationId, backupId } = body;

  if (!migrationId) {
    return new Response(
      JSON.stringify({ error: 'migrationId is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const result = await framework.rollbackMigration(migrationId, backupId);
    
    return new Response(
      JSON.stringify(result),
      { 
        status: result.success ? 200 : 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Validate migration integrity
 */
async function validateMigration(framework, body, corsHeaders) {
  const { table, checks } = body;

  if (!table || !checks) {
    return new Response(
      JSON.stringify({ error: 'table and checks are required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const result = await framework.validateDataIntegrity(table, checks);
    
    return new Response(
      JSON.stringify({
        success: true,
        validation: result
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}
