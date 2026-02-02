import type { VercelRequest, VercelResponse } from '@vercel/node';
import { detectDatabaseType, query } from '../lib/db';

/**
 * Database test endpoint - tests if _db.ts can be imported
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const results: Record<string, string> = {
    step1_start: 'ok',
  };

  try {
    // Test 1: Check detectDatabaseType (static import)
    results.step2_detect_start = 'attempting';
    const dbType = detectDatabaseType();
    results.step2_detect_done = 'ok';
    results.step2_dbType = dbType;

    return res.status(200).json({
      success: true,
      message: 'Database module imported successfully',
      results,
    });
  } catch (error) {
    results.error = error instanceof Error ? error.message : String(error);
    results.errorStack = error instanceof Error ? (error.stack || '').substring(0, 500) : '';
    
    return res.status(500).json({
      success: false,
      message: 'Database module import failed',
      results,
    });
  }
}
