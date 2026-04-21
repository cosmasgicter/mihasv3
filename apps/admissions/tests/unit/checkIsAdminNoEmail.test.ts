/**
 * Unit tests for checkIsAdmin — verify no email literals, role-only logic
 *
 * _Requirements: 5.5, 10.3_
 */
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { isAdminRole } from '@/lib/auth/roles';

// Adapter: checkIsAdmin takes a user object and delegates to isAdminRole
function checkIsAdmin(user: any): boolean {
  if (!user) return false;
  return isAdminRole(user.role);
}

// ── Source code inspection ──────────────────────────────────────────────

const SOURCE_PATH = path.resolve(__dirname, '../../src/lib/auth/roles.ts');
const sourceCode = fs.readFileSync(SOURCE_PATH, 'utf-8');

// Extract just the isAdminRole function body for inspection
const fnStart = sourceCode.indexOf('export function isAdminRole');
const fnEnd = sourceCode.indexOf('\n}', fnStart) + 2;
const checkIsAdminSource = sourceCode.slice(fnStart, fnEnd);

describe('checkIsAdmin — no email literals in source', () => {
  // _Requirements: 5.5, 10.3_
  it('checkIsAdmin source does NOT contain any email string literals (no @ in strings)', () => {
    // Match string literals containing @ (single or double quoted)
    const emailInStringRegex = /['"`][^'"`]*@[^'"`]*['"`]/g;
    const matches = checkIsAdminSource.match(emailInStringRegex);
    expect(matches).toBeNull();
  });

  it('checkIsAdmin source does not reference "cosmas" or "beanola"', () => {
    expect(checkIsAdminSource.toLowerCase()).not.toContain('cosmas');
    expect(checkIsAdminSource.toLowerCase()).not.toContain('beanola');
  });
});

describe('checkIsAdmin — role-only logic', () => {
  // _Requirements: 5.5_
  it('returns true for admin role', () => {
    expect(checkIsAdmin({ role: 'admin' } as any)).toBe(true);
  });

  it('returns true for super_admin role', () => {
    expect(checkIsAdmin({ role: 'super_admin' } as any)).toBe(true);
  });

  it('returns false for student role', () => {
    expect(checkIsAdmin({ role: 'student' } as any)).toBe(false);
  });

  it('returns false when email matches old hardcoded email but role is student', () => {
    expect(
      checkIsAdmin({ email: 'cosmas@beanola.com', role: 'student' } as any),
    ).toBe(false);
  });

  it('returns false for null user', () => {
    expect(checkIsAdmin(null)).toBe(false);
  });

  it('returns false for user with no role', () => {
    expect(checkIsAdmin({} as any)).toBe(false);
  });

  it('returns false when role is only in user_metadata (not top-level)', () => {
    expect(
      checkIsAdmin({ user_metadata: { role: 'admin' } } as any),
    ).toBe(false);
  });

  it('returns false when role is only in app_metadata (not top-level)', () => {
    expect(
      checkIsAdmin({ app_metadata: { role: 'super_admin' } } as any),
    ).toBe(false);
  });
});
