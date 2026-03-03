import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sendSuccess, sendError, HttpStatus, logErrorAuditEvent } from '../lib/errorHandler';
import { validateServerEnv } from '../lib/envValidator';

/**
 * Health Check API - Simplified version with inline db code
 * 
 * GET /api/health - Returns system health status
 * GET /api/health?action=ping - Minimal ping/pong response
 * GET /api/health?action=db - Check database connectivity
 * GET /api/health?action=env - Check environment variables
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  // Set headers directly
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  }

  const action = req.query.action as string;

  try {
    // Ping action (minimal response for uptime checks)
    if (action === 'ping') {
      return sendSuccess(res, {
        message: 'pong',
        timestamp: new Date().toISOString(),
      });
    }

    // Database health check
    if (action === 'db') {
      return handleDatabaseHealth(res);
    }

    // Environment variable check (for debugging)
    if (action === 'env') {
      return handleEnvCheck(res);
    }

    // Validate required environment variables for actions that need them (Req 25.3)
    const envResult = validateServerEnv();
    if (!envResult.valid) {
      const details = envResult.errors.map((e) => e.message).join('; ');
      return sendError(res, `Server misconfiguration: ${details}`, HttpStatus.SERVICE_UNAVAILABLE, 'SERVICE_UNAVAILABLE');
    }

    // Basic health check
    return sendSuccess(res, {
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: process.env.VERCEL_ENV || 'development',
      version: process.env.VERCEL_GIT_COMMIT_SHA?.substring(0, 7),
      databaseType: 'neon',
    });
  } catch (error) {
    logErrorAuditEvent('health', error).catch(() => {});
    return sendError(res, 'Health check failed', HttpStatus.INTERNAL_SERVER_ERROR, 'INTERNAL_ERROR');
  }
}

/**
 * Check database health and connectivity
 */
async function handleDatabaseHealth(res: VercelResponse): Promise<void> {
  const startTime = Date.now();
  const checks: Record<string, { status: string; latency?: number; error?: string }> = {};

  try {
    // Dynamic import for Neon serverless driver
    const { neon } = await import('@neondatabase/serverless');
    const connectionString = process.env.DATABASE_URL;
    
    if (!connectionString) {
      sendError(res, 'DATABASE_URL not configured', HttpStatus.SERVICE_UNAVAILABLE, 'SERVICE_UNAVAILABLE');
      return;
    }

    const sql = neon(connectionString);

    // Check 1: Basic connectivity
    try {
      const connectStart = Date.now();
      await sql`SELECT 1 as test`;
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
      await sql`SELECT COUNT(*) FROM profiles LIMIT 1`;
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

    const totalLatency = Date.now() - startTime;
    const allOk = Object.values(checks).every(c => c.status === 'ok');
    const hasErrors = Object.values(checks).some(c => c.status === 'error');

    const overallStatus = hasErrors ? 'unhealthy' : allOk ? 'healthy' : 'degraded';

    if (hasErrors) {
      sendError(res, `Database health: ${overallStatus}`, HttpStatus.SERVICE_UNAVAILABLE, 'SERVICE_UNAVAILABLE');
    } else {
      sendSuccess(res, {
        status: overallStatus,
        databaseType: 'neon',
        checks,
        totalLatency,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    logErrorAuditEvent('health/db', error).catch(() => {});
    sendError(res, 'Database health check failed', HttpStatus.SERVICE_UNAVAILABLE, 'SERVICE_UNAVAILABLE');
  }
}

/**
 * Check required environment variables
 */
function handleEnvCheck(res: VercelResponse): void {
  const requiredVars = [
    'DATABASE_URL',
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
    'ARCJET_KEY',
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

  const allRequired = missing.length === 0;

  if (!allRequired) {
    sendError(res, `Missing environment variables: ${missing.join(', ')}`, HttpStatus.SERVICE_UNAVAILABLE, 'SERVICE_UNAVAILABLE');
    return;
  }

  sendSuccess(res, {
    status: 'ok',
    environment: process.env.VERCEL_ENV || 'development',
    envStatus,
    timestamp: new Date().toISOString(),
  });
}
