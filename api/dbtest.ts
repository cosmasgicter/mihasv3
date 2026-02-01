import type { VercelRequest, VercelResponse } from '@vercel/node';

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
    // Test 1: Import _db module
    results.step2_import_start = 'attempting';
    const dbModule = await import('./_db');
    results.step2_import_done = 'ok';
    results.step2_exports = Object.keys(dbModule).join(', ');

    // Test 2: Check detectDatabaseType
    results.step3_detect_start = 'attempting';
    const dbType = dbModule.detectDatabaseType();
    results.step3_detect_done = 'ok';
    results.step3_dbType = dbType;

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
