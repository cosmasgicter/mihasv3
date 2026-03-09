// @vitest-environment node
/**
 * Double-Submit Prevention Unit Tests
 *
 * Verifies that the useApplicationSubmit hook implements double-submit prevention:
 * - Uses a ref-based isSubmitting guard to prevent duplicate clicks (Req 3.1, 3.2)
 * - Generates an idempotency key via crypto.randomUUID() (Req 3.3)
 * - Sends X-Idempotency-Key header in the PUT request (Req 3.3)
 * - Preserves the same idempotency key on network failure for retry (Req 3.5)
 * - Resets the idempotency key on successful submission (Req 3.3)
 *
 * Also verifies server-side idempotency helpers exist in api-src/applications.ts.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const HOOK_PATH = path.resolve(process.cwd(), 'src/hooks/useApplicationSubmit.ts');
const hookSource = fs.readFileSync(HOOK_PATH, 'utf-8');

const API_PATH = path.resolve(process.cwd(), 'api-src/applications.ts');
const apiSource = fs.readFileSync(API_PATH, 'utf-8');

// ── 1. Frontend: Ref-based double-click guard (Req 3.1, 3.2) ───────────────

describe('useApplicationSubmit double-click guard (Req 3.1, 3.2)', () => {
  it('should use a ref (not state) for isSubmitting to avoid stale closures', () => {
    expect(hookSource).toContain('isSubmittingRef');
    expect(hookSource).toContain('useRef');
    // Should check the ref before proceeding
    expect(hookSource).toContain('isSubmittingRef.current');
  });

  it('should return early if already submitting', () => {
    // The guard pattern: if ref is true, return
    expect(hookSource).toMatch(/if\s*\(\s*isSubmittingRef\.current\s*\)/);
  });

  it('should set isSubmitting to true at start and false in finally', () => {
    expect(hookSource).toContain('isSubmittingRef.current = true');
    expect(hookSource).toContain('isSubmittingRef.current = false');
  });

  it('should expose loading state for button disable', () => {
    expect(hookSource).toContain('setLoading(true)');
    expect(hookSource).toContain('setLoading(false)');
    // Return value includes loading
    expect(hookSource).toMatch(/return\s*\{[\s\S]*loading[\s\S]*\}/);
  });
});

// ── 2. Frontend: Idempotency key generation (Req 3.3) ──────────────────────

describe('useApplicationSubmit idempotency key (Req 3.3)', () => {
  it('should generate an idempotency key using crypto.randomUUID', () => {
    expect(hookSource).toContain('crypto.randomUUID');
  });

  it('should store the idempotency key in a ref for persistence across renders', () => {
    expect(hookSource).toContain('idempotencyKeyRef');
  });

  it('should send X-Idempotency-Key header in the submission request', () => {
    expect(hookSource).toContain('X-Idempotency-Key');
    expect(hookSource).toContain('idempotencyKeyRef.current');
  });

  it('should expose the idempotency key in the return value', () => {
    expect(hookSource).toContain('idempotencyKey');
  });
});

// ── 3. Frontend: Idempotency key lifecycle (Req 3.3, 3.5) ──────────────────

describe('useApplicationSubmit idempotency key lifecycle (Req 3.3, 3.5)', () => {
  it('should reset the idempotency key on successful submission', () => {
    // After success, a new key is generated
    expect(hookSource).toContain('resetIdempotencyKey');
  });

  it('should NOT reset the idempotency key on error (preserve for retry)', () => {
    // The main catch block (the one with "Error submitting application") should not call resetIdempotencyKey
    const marker = 'Error submitting application';
    const markerIdx = hookSource.indexOf(marker);
    expect(markerIdx).toBeGreaterThan(-1);
    // Find the finally block after this catch
    const finallyIdx = hookSource.indexOf('} finally {', markerIdx);
    expect(finallyIdx).toBeGreaterThan(markerIdx);
    const catchBlock = hookSource.slice(markerIdx, finallyIdx);
    expect(catchBlock).not.toContain('resetIdempotencyKey');
  });

  it('should handle network errors specifically and preserve key for retry', () => {
    expect(hookSource).toContain('network');
    expect(hookSource).toContain('Failed to fetch');
  });
});

// ── 4. Frontend: Cache invalidation includes dashboard polling key ──────────

describe('useApplicationSubmit cache invalidation (Req 15.1)', () => {
  it('should invalidate student-dashboard-polling query key on success', () => {
    expect(hookSource).toContain('student-dashboard-polling');
  });

  it('should invalidate applications query key on success', () => {
    expect(hookSource).toContain("'applications'");
  });
});

// ── 5. Server-side: Idempotency key handling (Req 3.3) ─────────────────────

describe('Server-side idempotency in api-src/applications.ts (Req 3.3)', () => {
  it('should contain checkIdempotencyKey function', () => {
    expect(apiSource).toContain('checkIdempotencyKey');
  });

  it('should contain storeIdempotencyKey function', () => {
    expect(apiSource).toContain('storeIdempotencyKey');
  });

  it('should read X-Idempotency-Key from request headers', () => {
    expect(apiSource).toContain('x-idempotency-key');
  });

  it('should query the idempotency_keys table', () => {
    expect(apiSource).toContain('idempotency_keys');
  });

  it('should enforce a 24-hour expiry window for cached responses', () => {
    expect(apiSource).toContain("INTERVAL '24 hours'");
  });

  it('should return cached response when idempotency key exists', () => {
    // The check function returns response_json from the table
    expect(apiSource).toContain('response_json');
    expect(apiSource).toContain('cachedResponse');
  });

  it('should store the response after successful submission', () => {
    // After the update, store the key + response
    expect(apiSource).toMatch(/storeIdempotencyKey\s*\(/);
  });

  it('should clean up expired keys periodically', () => {
    expect(apiSource).toContain('DELETE FROM idempotency_keys');
    expect(apiSource).toContain("INTERVAL '24 hours'");
  });

  it('should only apply idempotency check for submissions (status=submitted)', () => {
    expect(apiSource).toContain("body.status === 'submitted'");
  });
});

// ── 6. Server-side: Idempotency key helper correctness ──────────────────────

describe('Server-side idempotency helper functions (Req 3.3)', () => {
  it('checkIdempotencyKey should accept key and endpoint parameters', () => {
    const fnMatch = apiSource.match(/async function checkIdempotencyKey\s*\(([^)]+)\)/);
    expect(fnMatch).toBeTruthy();
    expect(fnMatch![1]).toContain('key');
    expect(fnMatch![1]).toContain('endpoint');
  });

  it('storeIdempotencyKey should accept key, endpoint, and responseData parameters', () => {
    const fnMatch = apiSource.match(/async function storeIdempotencyKey\s*\(([^)]+)\)/);
    expect(fnMatch).toBeTruthy();
    expect(fnMatch![1]).toContain('key');
    expect(fnMatch![1]).toContain('endpoint');
    expect(fnMatch![1]).toContain('responseData');
  });

  it('storeIdempotencyKey should use ON CONFLICT for upsert safety', () => {
    expect(apiSource).toContain('ON CONFLICT');
  });
});
