/**
 * Property-Based Tests for Rate Limiting and Account Protection
 * Feature: website-quality-remediation
 * Properties: P15 (progressive backoff), P16 (account lockout)
 *
 * Tests the pure logic of login attempt tracking, cooldown windows,
 * and account lockout thresholds without requiring a live database.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ============================================================================
// Pure logic extracted from api-src/auth.ts for testability
// ============================================================================

const LOGIN_COOLDOWN_THRESHOLD = 5;
const LOGIN_COOLDOWN_MINUTES = 15;
const LOGIN_LOCKOUT_THRESHOLD = 10;
const LOGIN_LOCKOUT_MINUTES = 30;
const REGISTRATION_RATE_LIMIT = 3;
const REGISTRATION_RATE_WINDOW_MINUTES = 10;

interface LoginAttempt {
  success: boolean;
  attempted_at: Date;
}

/**
 * Pure function: determine if an email should be in cooldown based on attempts.
 * Mirrors the logic in checkLoginCooldown().
 */
function shouldCooldown(
  attempts: LoginAttempt[],
  now: Date
): { blocked: boolean; retryAfterSeconds: number } {
  const windowStart = new Date(now.getTime() - LOGIN_COOLDOWN_MINUTES * 60 * 1000);
  const recentFailures = attempts.filter(
    (a) => !a.success && a.attempted_at > windowStart
  );

  if (recentFailures.length >= LOGIN_COOLDOWN_THRESHOLD) {
    const oldest = recentFailures.reduce(
      (min, a) => (a.attempted_at < min ? a.attempted_at : min),
      recentFailures[0].attempted_at
    );
    const cooldownEnd = new Date(oldest.getTime() + LOGIN_COOLDOWN_MINUTES * 60 * 1000);
    const retryAfterSeconds = Math.max(1, Math.ceil((cooldownEnd.getTime() - now.getTime()) / 1000));
    return { blocked: true, retryAfterSeconds };
  }

  return { blocked: false, retryAfterSeconds: 0 };
}

/**
 * Pure function: determine if an account should be locked based on consecutive failures.
 * Mirrors the logic in checkAccountLockout().
 */
function shouldLockout(
  attempts: LoginAttempt[],
  now: Date
): { locked: boolean; retryAfterSeconds: number } {
  // Sort by most recent first
  const sorted = [...attempts].sort(
    (a, b) => b.attempted_at.getTime() - a.attempted_at.getTime()
  );
  const lastN = sorted.slice(0, LOGIN_LOCKOUT_THRESHOLD);

  if (lastN.length < LOGIN_LOCKOUT_THRESHOLD) {
    return { locked: false, retryAfterSeconds: 0 };
  }

  const allFailed = lastN.every((a) => !a.success);
  if (!allFailed) {
    return { locked: false, retryAfterSeconds: 0 };
  }

  // Lockout window from the oldest of the last N failures
  const tenthFailure = lastN[lastN.length - 1].attempted_at;
  const lockoutEnd = new Date(tenthFailure.getTime() + LOGIN_LOCKOUT_MINUTES * 60 * 1000);

  if (now.getTime() < lockoutEnd.getTime()) {
    const retryAfterSeconds = Math.max(1, Math.ceil((lockoutEnd.getTime() - now.getTime()) / 1000));
    return { locked: true, retryAfterSeconds };
  }

  return { locked: false, retryAfterSeconds: 0 };
}

/**
 * Pure function: check registration rate limit per IP.
 */
function shouldBlockRegistration(
  registrationTimestamps: Date[],
  now: Date
): { blocked: boolean; retryAfterSeconds: number } {
  const windowStart = new Date(now.getTime() - REGISTRATION_RATE_WINDOW_MINUTES * 60 * 1000);
  const recent = registrationTimestamps.filter((t) => t > windowStart);

  if (recent.length >= REGISTRATION_RATE_LIMIT) {
    const oldest = recent.reduce((min, t) => (t < min ? t : min), recent[0]);
    const windowEnd = new Date(oldest.getTime() + REGISTRATION_RATE_WINDOW_MINUTES * 60 * 1000);
    const retryAfterSeconds = Math.max(1, Math.ceil((windowEnd.getTime() - now.getTime()) / 1000));
    return { blocked: true, retryAfterSeconds };
  }

  return { blocked: false, retryAfterSeconds: 0 };
}

// ============================================================================
// Arbitraries
// ============================================================================

/** Generate a recent timestamp within the last N minutes from `now`. */
function recentTimestamp(now: Date, withinMinutes: number): fc.Arbitrary<Date> {
  return fc.integer({ min: 0, max: withinMinutes * 60 * 1000 }).map(
    (ms) => new Date(now.getTime() - ms)
  );
}

// ============================================================================
// Property Tests
// ============================================================================

// Feature: website-quality-remediation, Property P15: Per-email login progressive backoff
describe('P15: Per-email login progressive backoff', () => {
  it('should block after 5+ failures within the cooldown window', () => {
    const now = new Date();

    fc.assert(
      fc.property(
        fc.integer({ min: LOGIN_COOLDOWN_THRESHOLD, max: 50 }),
        (failCount) => {
          // Generate failCount failures all within the cooldown window
          const attempts: LoginAttempt[] = Array.from({ length: failCount }, (_, i) => ({
            success: false,
            attempted_at: new Date(now.getTime() - i * 1000), // 1 second apart
          }));

          const result = shouldCooldown(attempts, now);
          expect(result.blocked).toBe(true);
          expect(result.retryAfterSeconds).toBeGreaterThan(0);
          expect(result.retryAfterSeconds).toBeLessThanOrEqual(LOGIN_COOLDOWN_MINUTES * 60);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should NOT block with fewer than 5 failures', () => {
    const now = new Date();

    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: LOGIN_COOLDOWN_THRESHOLD - 1 }),
        (failCount) => {
          const attempts: LoginAttempt[] = Array.from({ length: failCount }, (_, i) => ({
            success: false,
            attempted_at: new Date(now.getTime() - i * 1000),
          }));

          const result = shouldCooldown(attempts, now);
          expect(result.blocked).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should NOT block if failures are outside the cooldown window', () => {
    const now = new Date();

    fc.assert(
      fc.property(
        fc.integer({ min: LOGIN_COOLDOWN_THRESHOLD, max: 30 }),
        (failCount) => {
          // All failures are older than the cooldown window
          const attempts: LoginAttempt[] = Array.from({ length: failCount }, (_, i) => ({
            success: false,
            attempted_at: new Date(
              now.getTime() - (LOGIN_COOLDOWN_MINUTES + 1) * 60 * 1000 - i * 1000
            ),
          }));

          const result = shouldCooldown(attempts, now);
          expect(result.blocked).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should include a positive Retry-After when blocked', () => {
    const now = new Date();

    fc.assert(
      fc.property(
        fc.integer({ min: LOGIN_COOLDOWN_THRESHOLD, max: 20 }),
        fc.integer({ min: 1, max: LOGIN_COOLDOWN_MINUTES * 60 * 1000 - 1 }),
        (failCount, ageMs) => {
          // Failures within the window, oldest at ageMs ago
          const attempts: LoginAttempt[] = Array.from({ length: failCount }, (_, i) => ({
            success: false,
            attempted_at: new Date(now.getTime() - ageMs + i * 100),
          }));

          const result = shouldCooldown(attempts, now);
          if (result.blocked) {
            expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(1);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('a successful login resets consecutive failure tracking for lockout', () => {
    const now = new Date();

    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: LOGIN_LOCKOUT_THRESHOLD - 1 }),
        (failsBefore) => {
          // Some failures, then a success, then more failures (but not enough total consecutive)
          const attempts: LoginAttempt[] = [
            ...Array.from({ length: failsBefore }, (_, i) => ({
              success: false,
              attempted_at: new Date(now.getTime() - (failsBefore - i) * 1000 - 5000),
            })),
            { success: true, attempted_at: new Date(now.getTime() - 4000) },
            ...Array.from({ length: failsBefore }, (_, i) => ({
              success: false,
              attempted_at: new Date(now.getTime() - (failsBefore - i) * 1000),
            })),
          ];

          // Should NOT be locked because the success breaks the consecutive chain
          const result = shouldLockout(attempts, now);
          expect(result.locked).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: website-quality-remediation, Property P16: Account lockout after consecutive failures
describe('P16: Account lockout after consecutive failures', () => {
  it('should lock after 10 consecutive failures within lockout window', () => {
    const now = new Date();

    fc.assert(
      fc.property(
        fc.integer({ min: LOGIN_LOCKOUT_THRESHOLD, max: 30 }),
        (failCount) => {
          const attempts: LoginAttempt[] = Array.from({ length: failCount }, (_, i) => ({
            success: false,
            attempted_at: new Date(now.getTime() - i * 1000),
          }));

          const result = shouldLockout(attempts, now);
          expect(result.locked).toBe(true);
          expect(result.retryAfterSeconds).toBeGreaterThan(0);
          expect(result.retryAfterSeconds).toBeLessThanOrEqual(LOGIN_LOCKOUT_MINUTES * 60);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should NOT lock with fewer than 10 consecutive failures', () => {
    const now = new Date();

    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: LOGIN_LOCKOUT_THRESHOLD - 1 }),
        (failCount) => {
          const attempts: LoginAttempt[] = Array.from({ length: failCount }, (_, i) => ({
            success: false,
            attempted_at: new Date(now.getTime() - i * 1000),
          }));

          const result = shouldLockout(attempts, now);
          expect(result.locked).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should NOT lock if a success breaks the consecutive chain', () => {
    const now = new Date();

    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: LOGIN_LOCKOUT_THRESHOLD - 1 }),
        (successPosition) => {
          // Create 10+ attempts but insert a success at successPosition
          const attempts: LoginAttempt[] = Array.from(
            { length: LOGIN_LOCKOUT_THRESHOLD + 2 },
            (_, i) => ({
              success: i === successPosition,
              attempted_at: new Date(now.getTime() - i * 1000),
            })
          );

          const result = shouldLockout(attempts, now);
          expect(result.locked).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should NOT lock if lockout window has expired', () => {
    const now = new Date();

    fc.assert(
      fc.property(
        fc.integer({ min: LOGIN_LOCKOUT_THRESHOLD, max: 20 }),
        (failCount) => {
          // All failures are older than the lockout window
          const attempts: LoginAttempt[] = Array.from({ length: failCount }, (_, i) => ({
            success: false,
            attempted_at: new Date(
              now.getTime() - (LOGIN_LOCKOUT_MINUTES + 1) * 60 * 1000 - i * 1000
            ),
          }));

          const result = shouldLockout(attempts, now);
          expect(result.locked).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('lockout Retry-After is always positive and bounded', () => {
    const now = new Date();

    fc.assert(
      fc.property(
        fc.integer({ min: LOGIN_LOCKOUT_THRESHOLD, max: 20 }),
        (failCount) => {
          const attempts: LoginAttempt[] = Array.from({ length: failCount }, (_, i) => ({
            success: false,
            attempted_at: new Date(now.getTime() - i * 1000),
          }));

          const result = shouldLockout(attempts, now);
          if (result.locked) {
            expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(1);
            expect(result.retryAfterSeconds).toBeLessThanOrEqual(LOGIN_LOCKOUT_MINUTES * 60);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Registration rate limiting
describe('Registration rate limiting', () => {
  it('should block after 3+ registrations within the window', () => {
    const now = new Date();

    fc.assert(
      fc.property(
        fc.integer({ min: REGISTRATION_RATE_LIMIT, max: 20 }),
        (regCount) => {
          const timestamps = Array.from(
            { length: regCount },
            (_, i) => new Date(now.getTime() - i * 1000)
          );

          const result = shouldBlockRegistration(timestamps, now);
          expect(result.blocked).toBe(true);
          expect(result.retryAfterSeconds).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should NOT block with fewer than 3 registrations', () => {
    const now = new Date();

    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: REGISTRATION_RATE_LIMIT - 1 }),
        (regCount) => {
          const timestamps = Array.from(
            { length: regCount },
            (_, i) => new Date(now.getTime() - i * 1000)
          );

          const result = shouldBlockRegistration(timestamps, now);
          expect(result.blocked).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should NOT block if registrations are outside the window', () => {
    const now = new Date();

    fc.assert(
      fc.property(
        fc.integer({ min: REGISTRATION_RATE_LIMIT, max: 20 }),
        (regCount) => {
          const timestamps = Array.from(
            { length: regCount },
            (_, i) =>
              new Date(
                now.getTime() - (REGISTRATION_RATE_WINDOW_MINUTES + 1) * 60 * 1000 - i * 1000
              )
          );

          const result = shouldBlockRegistration(timestamps, now);
          expect(result.blocked).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});
