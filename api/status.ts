/**
 * Status Check API
 * 
 * Lightweight endpoint for health checks and monitoring
 * Returns API operational status without database dependencies
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleCors } from "./_lib/cors";
import { sendSuccess, sendError, HttpStatus } from "./_lib/errorHandler";

/**
 * Status Check API
 * GET /api/status - Returns API operational status
 * 
 * This is a lightweight endpoint for quick health checks
 * that doesn't require any external service calls.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS preflight requests
  if (handleCors(req, res)) return;

  // Only allow GET requests
  if (req.method !== "GET") {
    return sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED, "METHOD_NOT_ALLOWED");
  }

  try {
    const statusData = {
      status: "operational",
      timestamp: new Date().toISOString(),
      service: "mihas-api",
      version: process.env.VERCEL_GIT_COMMIT_SHA?.substring(0, 7) || "dev",
      environment: process.env.NODE_ENV || "development",
    };

    return sendSuccess(res, statusData, HttpStatus.OK);
  } catch (error) {
    console.error("[status] Unexpected error:", error);
    
    // Even if something goes wrong, return a degraded response
    return sendSuccess(res, {
      status: "degraded",
      timestamp: new Date().toISOString(),
      service: "mihas-api",
    }, HttpStatus.OK);
  }
}
