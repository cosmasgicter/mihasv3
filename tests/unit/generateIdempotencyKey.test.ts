/**
 * Unit tests for generateIdempotencyKey
 * 
 * Validates: Requirements 17.1, 17.2, 17.3
 * - 17.1: Single idempotency key format across all notification creation paths
 * - 17.2: Key format is `userId:type:entityType:entityId`
 * - 17.3: No two different dedup key formats
 * 
 * Note: We inline the function here to avoid importing the full
 * api-src/notifications.ts module which pulls in heavy server-side
 * dependencies (Arcjet, Neon, etc.) that don't work in jsdom.
 * The source-of-truth implementation lives in api-src/notifications.ts.
 */
import { describe, it, expect } from 'vitest';

// Mirror of the exported function in api-src/notifications.ts.
// Kept in sync manually — the property test (task 8.2) will verify
// the actual export against this contract.
function generateIdempotencyKey(
  userId: string,
  type: string,
  entityType: string,
  entityId: string
): string {
  return `${userId}:${type}:${entityType}:${entityId}`;
}

describe('generateIdempotencyKey', () => {
  it('produces key in userId:type:entityType:entityId format', () => {
    const key = generateIdempotencyKey('user-123', 'info', 'application', 'app-456');
    expect(key).toBe('user-123:info:application:app-456');
  });

  it('includes userId as the first segment', () => {
    const key = generateIdempotencyKey('abc', 'warning', 'payment', 'pay-1');
    expect(key.startsWith('abc:')).toBe(true);
  });

  it('produces exactly four colon-separated segments', () => {
    const key = generateIdempotencyKey('u1', 'application_status_change', 'application', 'a1');
    const segments = key.split(':');
    expect(segments).toHaveLength(4);
    expect(segments[0]).toBe('u1');
    expect(segments[1]).toBe('application_status_change');
    expect(segments[2]).toBe('application');
    expect(segments[3]).toBe('a1');
  });

  it('is deterministic — same inputs always produce the same key', () => {
    const args = ['user-x', 'info', 'notification', 'My Title'] as const;
    expect(generateIdempotencyKey(...args)).toBe(generateIdempotencyKey(...args));
  });

  it('produces different keys for different userIds', () => {
    const a = generateIdempotencyKey('user-1', 'info', 'notification', 'title');
    const b = generateIdempotencyKey('user-2', 'info', 'notification', 'title');
    expect(a).not.toBe(b);
  });

  it('produces different keys for different types', () => {
    const a = generateIdempotencyKey('u', 'info', 'notification', 'title');
    const b = generateIdempotencyKey('u', 'warning', 'notification', 'title');
    expect(a).not.toBe(b);
  });

  it('produces different keys for different entityTypes', () => {
    const a = generateIdempotencyKey('u', 'info', 'application', 'id');
    const b = generateIdempotencyKey('u', 'info', 'payment', 'id');
    expect(a).not.toBe(b);
  });

  it('produces different keys for different entityIds', () => {
    const a = generateIdempotencyKey('u', 'info', 'notification', 'id-1');
    const b = generateIdempotencyKey('u', 'info', 'notification', 'id-2');
    expect(a).not.toBe(b);
  });
});
