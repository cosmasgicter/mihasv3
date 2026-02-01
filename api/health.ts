import type { VercelRequest, VercelResponse } from '@vercel/node';
import { query, detectDatabaseType } from './_lib/db';

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
