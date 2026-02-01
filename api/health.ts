import type { VercelRequest, VercelResponse } from '@vercel/node';
import { query, detectDatabaseType } from './_db';

/**
 * Health Check API
 * 
 * GET /api/health - Returns system health status
 * GET /api/health?action=ping - Minimal ping/pong response
 * GET /api/health?action=db - Check database connectivity (RPC replacement)
 * GET /api/health?action=env - Check environment variables
 * GET /api/health?action=arcjet - Test Arcjet security layer initialization
 * 
 * Replaces: check_database_health() Supabase RPC
 * Consolidates: /api/ping, /api/arcjet-test (Vercel Hobby 12 function limit)
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set headers directly
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const action = req.query.action as string;

  // Ping action (minimal response for uptime checks)
  if (action === 'ping') {
    return res.status(200).json({
      success: true,
      message: 'pong',
      timestamp: new Date().toISOString(),
    });
  }

  // Arcjet security layer test
  if (action === 'arcjet') {
    return handleArcjetTest(req, res);
  }

  // Database health check
  if (action === 'db') {
    return handleDatabaseHealth(res);
  }

  // Environment variable check (for debugging)
  if (action === 'env') {
    return handleEnvCheck(res);
  }

  // Basic health check
  return res.status(200).json({
    success: true,
    data: {
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: process.env.VERCEL_ENV || 'development',
      version: process.env.VERCEL_GIT_COMMIT_SHA?.substring(0, 7),
      databaseType: detectDatabaseType(),
    }
  });
}

/**
 * Check database health and connectivity
 * Replaces: check_database_health() Supabase RPC
 */
async function handleDatabaseHealth(res: VercelResponse): Promise<void> {
  const startTime = Date.now();
  const checks: Record<string, { status: string; latency?: number; error?: string }> = {};

  // Check 1: Basic connectivity
  try {
    const connectStart = Date.now();
    await query('SELECT 1 as test');
    checks.connectivity = {
      status: 'ok',
      latency: Date.now() - connectStart,
    };
  } catch (error) {
    checks.connectivity = {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }

  // Check 2: Table existence (profiles table)
  try {
    const tableStart = Date.now();
    await query('SELECT COUNT(*) FROM profiles LIMIT 1');
    checks.profiles_table = {
      status: 'ok',
      latency: Date.now() - tableStart,
    };
  } catch (error) {
    checks.profiles_table = {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }

  // Check 3: Applications table
  try {
    const appsStart = Date.now();
    await query('SELECT COUNT(*) FROM applications LIMIT 1');
    checks.applications_table = {
      status: 'ok',
      latency: Date.now() - appsStart,
    };
  } catch (error) {
    checks.applications_table = {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }

  // Check 4: Extensions
  try {
    const extStart = Date.now();
    const result = await query<{ extname: string }>('SELECT extname FROM pg_extension');
    const extensions = result.rows.map(r => r.extname);
    checks.extensions = {
      status: extensions.includes('uuid-ossp') && extensions.includes('pgcrypto') ? 'ok' : 'warning',
      latency: Date.now() - extStart,
    };
  } catch (error) {
    checks.extensions = {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }

  const totalLatency = Date.now() - startTime;
  const allOk = Object.values(checks).every(c => c.status === 'ok');
  const hasErrors = Object.values(checks).some(c => c.status === 'error');

  const overallStatus = hasErrors ? 'unhealthy' : allOk ? 'healthy' : 'degraded';

  res.status(hasErrors ? 503 : 200).json({
    success: !hasErrors,
    data: {
      status: overallStatus,
      databaseType: detectDatabaseType(),
      checks,
      totalLatency,
      timestamp: new Date().toISOString(),
    }
  });
}


/**
 * Check required environment variables
 * GET /api/health?action=env
 * 
 * Returns which required env vars are set (not their values)
 */
function handleEnvCheck(res: VercelResponse): void {
  const requiredVars = [
    'DATABASE_URL',
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
    'ARCJET_KEY',
    'R2_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_BUCKET_NAME',
    'RESEND_API_KEY',
  ];

  const optionalVars = [
    'VITE_API_BASE_URL',
    'VITE_APP_BASE_URL',
    'EMAIL_FROM',
  ];

  const envStatus: Record<string, boolean> = {};
  const missing: string[] = [];

  for (const varName of requiredVars) {
    const isSet = !!process.env[varName];
    envStatus[varName] = isSet;
    if (!isSet) {
      missing.push(varName);
    }
  }

  for (const varName of optionalVars) {
    envStatus[varName] = !!process.env[varName];
  }

  const allRequired = missing.length === 0;

  res.status(allRequired ? 200 : 503).json({
    success: allRequired,
    data: {
      status: allRequired ? 'ok' : 'missing_env_vars',
      environment: process.env.VERCEL_ENV || 'development',
      envStatus,
      missing: missing.length > 0 ? missing : undefined,
      timestamp: new Date().toISOString(),
    }
  });
}


/**
 * Test Arcjet security layer initialization
 * GET /api/health?action=arcjet
 * 
 * Diagnostic endpoint to verify Arcjet is working correctly.
 * Tests: module import, instance creation, protect call
 */
async function handleArcjetTest(req: VercelRequest, res: VercelResponse): Promise<void> {
  const results: Record<string, string | number | boolean | null> = {
    timestamp: new Date().toISOString(),
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    arcjetKeySet: !!process.env.ARCJET_KEY,
    arcjetKeyLength: process.env.ARCJET_KEY?.length || 0,
  };

  let allPassed = true;

  // Test 1: Import @arcjet/node package
  try {
    const arcjetNode = await import('@arcjet/node');
    results.arcjetNodeImport = 'SUCCESS';
    results.arcjetNodeExports = Object.keys(arcjetNode).join(', ');
  } catch (error) {
    results.arcjetNodeImport = 'FAILED';
    results.arcjetNodeError = error instanceof Error ? error.message : String(error);
    allPassed = false;
  }

  // Test 2: Import local arcjet wrapper
  try {
    const arcjetWrapper = await import('./_arcjet');
    results.arcjetWrapperImport = 'SUCCESS';
    results.arcjetWrapperExports = Object.keys(arcjetWrapper).join(', ');
  } catch (error) {
    results.arcjetWrapperImport = 'FAILED';
    results.arcjetWrapperError = error instanceof Error ? error.message : String(error);
    allPassed = false;
  }

  // Test 3: Create Arcjet instance (if key is set)
  if (process.env.ARCJET_KEY) {
    try {
      const { default: arcjet, shield, detectBot } = await import('@arcjet/node');
      const testAj = arcjet({
        key: process.env.ARCJET_KEY,
        characteristics: ['ip.src'],
        rules: [
          shield({ mode: 'LIVE' }),
          detectBot({ mode: 'LIVE', allow: ['CATEGORY:SEARCH_ENGINE'] }),
        ],
      });
      results.arcjetInstanceCreate = 'SUCCESS';

      // Test 4: Call protect (actual API call)
      try {
        const decision = await testAj.protect(req);
        results.arcjetProtectCall = 'SUCCESS';
        results.arcjetDecision = decision.isDenied() ? 'DENIED' : 'ALLOWED';
        results.arcjetDecisionId = decision.id;
      } catch (error) {
        results.arcjetProtectCall = 'FAILED';
        results.arcjetProtectError = error instanceof Error ? error.message : String(error);
        allPassed = false;
      }
    } catch (error) {
      results.arcjetInstanceCreate = 'FAILED';
      results.arcjetInstanceError = error instanceof Error ? error.message : String(error);
      allPassed = false;
    }
  } else {
    results.arcjetInstanceCreate = 'SKIPPED';
    results.arcjetProtectCall = 'SKIPPED';
    results.arcjetSkipReason = 'ARCJET_KEY not set';
  }

  res.status(allPassed ? 200 : 500).json({
    success: allPassed,
    message: allPassed ? 'All Arcjet tests passed' : 'Arcjet initialization failed',
    results,
  });
}
