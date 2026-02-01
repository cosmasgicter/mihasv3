/**
 * Arcjet Isolation Test Endpoint
 * 
 * Purpose: Diagnose @arcjet/node initialization failures
 * 
 * GET /api/arcjet-test - Tests if Arcjet can be imported and initialized
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'application/json');
  
  const results: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
  };

  // Test 1: Check if ARCJET_KEY is set
  results.arcjetKeySet = !!process.env.ARCJET_KEY;
  results.arcjetKeyLength = process.env.ARCJET_KEY?.length || 0;

  // Test 2: Try to import @arcjet/node directly
  try {
    const arcjetNode = await import('@arcjet/node');
    results.arcjetNodeImport = 'SUCCESS';
    results.arcjetNodeExports = Object.keys(arcjetNode);
  } catch (error) {
    results.arcjetNodeImport = 'FAILED';
    results.arcjetNodeError = error instanceof Error ? error.message : String(error);
    results.arcjetNodeStack = error instanceof Error ? error.stack?.split('\n').slice(0, 5) : undefined;
  }

  // Test 3: Try to import our arcjet.ts wrapper
  try {
    const arcjetWrapper = await import('./_lib/arcjet');
    results.arcjetWrapperImport = 'SUCCESS';
    results.arcjetWrapperExports = Object.keys(arcjetWrapper);
  } catch (error) {
    results.arcjetWrapperImport = 'FAILED';
    results.arcjetWrapperError = error instanceof Error ? error.message : String(error);
    results.arcjetWrapperStack = error instanceof Error ? error.stack?.split('\n').slice(0, 5) : undefined;
  }

  // Test 4: Try to create an Arcjet instance (if import succeeded)
  if (results.arcjetNodeImport === 'SUCCESS' && process.env.ARCJET_KEY) {
    try {
      const { default: arcjet, shield } = await import('@arcjet/node');
      const aj = arcjet({
        key: process.env.ARCJET_KEY,
        characteristics: ['ip.src'],
        rules: [shield({ mode: 'LIVE' })],
      });
      results.arcjetInstanceCreate = 'SUCCESS';
      results.arcjetInstanceType = typeof aj;
    } catch (error) {
      results.arcjetInstanceCreate = 'FAILED';
      results.arcjetInstanceError = error instanceof Error ? error.message : String(error);
      results.arcjetInstanceStack = error instanceof Error ? error.stack?.split('\n').slice(0, 5) : undefined;
    }
  }

  // Test 5: Try to call protect() (if instance created)
  if (results.arcjetInstanceCreate === 'SUCCESS') {
    try {
      const { default: arcjet, shield } = await import('@arcjet/node');
      const aj = arcjet({
        key: process.env.ARCJET_KEY!,
        characteristics: ['ip.src'],
        rules: [shield({ mode: 'LIVE' })],
      });
      const decision = await aj.protect(req);
      results.arcjetProtectCall = 'SUCCESS';
      results.arcjetDecision = {
        conclusion: decision.conclusion,
        isDenied: decision.isDenied(),
        isAllowed: !decision.isDenied(),
      };
    } catch (error) {
      results.arcjetProtectCall = 'FAILED';
      results.arcjetProtectError = error instanceof Error ? error.message : String(error);
      results.arcjetProtectStack = error instanceof Error ? error.stack?.split('\n').slice(0, 5) : undefined;
    }
  }

  // Determine overall status
  const allPassed = 
    results.arcjetNodeImport === 'SUCCESS' &&
    results.arcjetWrapperImport === 'SUCCESS' &&
    results.arcjetInstanceCreate === 'SUCCESS' &&
    results.arcjetProtectCall === 'SUCCESS';

  return res.status(allPassed ? 200 : 500).json({
    success: allPassed,
    message: allPassed ? 'All Arcjet tests passed' : 'Arcjet initialization failed',
    results,
  });
}
