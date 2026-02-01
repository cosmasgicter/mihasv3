import type { VercelRequest, VercelResponse } from '@vercel/node';
import { query, detectDatabaseType } from './lib/db';

/**
 * Health Check API
 * 
 * GET /api/health - Returns system health status
 * GET /api/health?action=db - Check database connectivity (RPC replacement)
 * 
 * Replaces: check_database_health() Supabase RPC
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
