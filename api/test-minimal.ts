import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Minimal test endpoint - no lib/ imports
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // Test direct Neon import
  try {
    const { neon } = await import('@neondatabase/serverless');
    const connectionString = process.env.DATABASE_URL;
    
    if (!connectionString) {
      return res.status(500).json({
        success: false,
        error: 'DATABASE_URL not configured',
      });
    }

    const sql = neon(connectionString);
    const result = await sql`SELECT 1 as test`;
    
    return res.status(200).json({
      success: true,
      message: 'Direct Neon query worked!',
      result,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack?.substring(0, 500) : undefined,
    });
  }
}
