import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Minimal ping endpoint for testing
 * No imports from local files - pure Vercel function
 */
export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  
  return res.status(200).json({
    success: true,
    message: 'pong',
    timestamp: new Date().toISOString(),
    nodeVersion: process.version,
  });
}
