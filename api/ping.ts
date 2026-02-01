/**
 * Minimal ping endpoint for debugging
 * GET /api/ping - Returns pong
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'application/json');
  
  return res.status(200).json({
    success: true,
    message: 'pong',
    timestamp: new Date().toISOString(),
    env: {
      hasDbUrl: !!process.env.DATABASE_URL,
      hasJwtSecret: !!process.env.JWT_SECRET,
      hasArcjetKey: !!process.env.ARCJET_KEY,
      vercelEnv: process.env.VERCEL_ENV || 'unknown',
    }
  });
}
