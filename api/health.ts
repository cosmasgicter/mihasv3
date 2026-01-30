import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors } from './_lib/cors';
import { sendSuccess, sendError, HttpStatus } from './_lib/errorHandler';

/**
 * Health Check Response Data
 */
interface HealthData {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  environment: string;
  version?: string;
}

/**
 * Determine the current environment from Vercel environment variables.
 * 
 * @returns Environment name: 'production', 'preview', or 'development'
 */
function getEnvironment(): string {
  // VERCEL_ENV is set by Vercel: 'production', 'preview', or 'development'
  const vercelEnv = process.env.VERCEL_ENV;
  
  if (vercelEnv) {
    return vercelEnv;
  }
  
  // Fallback for local development
  return process.env.NODE_ENV === 'production' ? 'production' : 'development';
}

/**
 * Health Check API
 * GET /api/health - Returns system health status
 * OPTIONS /api/health - CORS preflight
 * 
 * This endpoint is used for:
 * - Deployment verification
 * - Monitoring and alerting
 * - Load balancer health checks
 * 
 * @example Response:
 * {
 *   "success": true,
 *   "data": {
 *     "status": "ok",
 *     "timestamp": "2024-01-15T10:30:00.000Z",
 *     "environment": "production"
 *   }
 * }
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS preflight requests
  if (handleCors(req, res)) return;

  // Only allow GET requests for health checks
  if (req.method !== 'GET') {
    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED, 'METHOD_NOT_ALLOWED');
  }

  try {
    const healthData: HealthData = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: getEnvironment(),
    };

    // Optionally include version if available
    const version = process.env.VERCEL_GIT_COMMIT_SHA;
    if (version) {
      healthData.version = version.substring(0, 7); // Short SHA
    }

    return sendSuccess(res, healthData, HttpStatus.OK);
  } catch (error) {
    // Even if something goes wrong, try to return a response
    // Health endpoints should be resilient
    console.error('[health] Unexpected error:', error);
    
    const degradedData: HealthData = {
      status: 'error',
      timestamp: new Date().toISOString(),
      environment: getEnvironment(),
    };

    return sendSuccess(res, degradedData, HttpStatus.OK);
  }
}
