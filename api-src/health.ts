import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sendSuccess, sendError, HttpStatus, logErrorAuditEvent } from '../lib/errorHandler';
import { validateServerEnv } from '../lib/envValidator';
import { handleCors } from '../lib/cors';
import { setSecurityHeaders } from '../lib/securityHeaders';
import { withArcjetProtection } from '../lib/arcjet';

/**
 * Valid actions for the health endpoint.
 * Used for allowlist validation (Req 7.1, 7.2).
 */
const VALID_ACTIONS = ['ping', 'db', 'env', 'errors'] as const;

/**
 * Health Check API - Simplified version with inline db code
 * 
 * GET /api/health - Returns system health status
 * GET /api/health?action=ping - Minimal ping/pong response
 * GET /api/health?action=db - Check database connectivity
 * GET /api/health?action=env - Check environment variables
 * GET /api/health?action=errors - Check recent errors from audit logs
 */
async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  // CORS handling
  if (handleCors(req, res)) return;

  // Security headers (Req 8.1, 8.2, 8.3, 8.4, 8.7)
  setSecurityHeaders(res);

  // Narrow CORS methods to GET, OPTIONS only (Req 8.5)
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  // Method guard — health endpoint only serves GET
  if (req.method !== 'GET') {
    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  }

  const action = req.query.action as string | undefined;

  // Action allowlist validation (Req 7.1, 7.2)
  if (action && !VALID_ACTIONS.includes(action as typeof VALID_ACTIONS[number])) {
    return sendError(res, 'Invalid action. Valid actions: ping, db, env, errors', HttpStatus.BAD_REQUEST);
  }

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

    // Diagnostic check for errors
    if (action === 'errors') {
      return handleErrorsCheck(res);
    }

    // Validate required environment variables for actions that need them (Req 25.3)
    const envResult = validateServerEnv();
    if (!envResult.valid) {
      const details = envResult.errors.map((e) => e.message).join('; ');
      return sendError(res, `Server misconfiguration: ${details}`, HttpStatus.SERVICE_UNAVAILABLE, 'SERVICE_UNAVAILABLE');
    }

    // Basic health check (default — no action)
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
  const checks: Record<string, any> = {};

  try {
    // Dynamic import for Neon serverless driver
    const { neon } = await import('@neondatabase/serverless');
    const connectionString = process.env.DATABASE_URL;
    
    if (!connectionString) {
      return sendError(res, 'DATABASE_URL not configured', HttpStatus.SERVICE_UNAVAILABLE, 'SERVICE_UNAVAILABLE');
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

    // Check 2: Table existence (required tables)
    const tables = ['profiles', 'device_sessions', 'audit_logs', 'settings', 'applications', 'migration_history'];
    for (const table of tables) {
      try {
        const tableStart = Date.now();
        const result = await sql.query(`SELECT COUNT(*) as count FROM ${table} LIMIT 1`);

        // If it's the profiles table, also check for key columns
        let columns = undefined;
        if (table === 'profiles') {
          const colResult = await sql.query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'profiles'
          `);
          columns = colResult.map(r => r.column_name);
        }

        checks[`table_${table}`] = {
          status: 'ok',
          count: result[0]?.count,
          latency: Date.now() - tableStart,
          columns
        };
      } catch (error) {
        checks[`table_${table}`] = {
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }

    const totalLatency = Date.now() - startTime;
    const allOk = Object.values(checks).every(c => c.status === 'ok');
    const hasErrors = Object.values(checks).some(c => c.status === 'error');

    const overallStatus = hasErrors ? 'unhealthy' : allOk ? 'healthy' : 'degraded';

    if (hasErrors) {
      return sendError(res, `Database health: ${overallStatus}`, HttpStatus.SERVICE_UNAVAILABLE, 'SERVICE_UNAVAILABLE');
    } else {
      return sendSuccess(res, {
        status: overallStatus,
        databaseType: 'neon',
        checks,
        totalLatency,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    logErrorAuditEvent('health/db', error).catch(() => {});
    return sendError(res, 'Database health check failed', HttpStatus.SERVICE_UNAVAILABLE, 'SERVICE_UNAVAILABLE');
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

/**
 * Diagnostic check to see recent errors from audit logs
 */
async function handleErrorsCheck(res: VercelResponse): Promise<void> {
  try {
    const { neon } = await import('@neondatabase/serverless');
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      return sendError(res, 'DATABASE_URL not configured', HttpStatus.SERVICE_UNAVAILABLE, 'SERVICE_UNAVAILABLE');
    }
    const sql = neon(connectionString);
    const logs = await sql`
      SELECT action, changes, created_at
      FROM audit_logs
      WHERE action = 'api_error'
      ORDER BY created_at DESC
      LIMIT 10
    `;
    return sendSuccess(res, { logs });
  } catch (error) {
    return sendError(res, 'Failed to fetch error logs', HttpStatus.INTERNAL_SERVER_ERROR, 'INTERNAL_ERROR');
  }
}

// Export with Arcjet protection (Req 3.2)
export default withArcjetProtection(handler, 'general');
