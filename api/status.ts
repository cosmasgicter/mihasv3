import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Status API - MINIMAL endpoint with NO imports
 * Used to verify Vercel function execution works at all
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set headers directly - no imports
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  return res.status(200).json({
    success: true,
    data: {
      status: 'ok',
      timestamp: new Date().toISOString(),
      runtime: 'vercel-node'
    }
  });
}
