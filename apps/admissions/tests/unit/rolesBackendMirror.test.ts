/**
 * Drift-guard test for the role hierarchy.
 *
 * Reads backend/apps/accounts/permissions.py at test time, parses the
 * ROLE_HIERARCHY dict, and asserts the TS const matches. If the backend
 * changes the role hierarchy without updating types/roles.ts (or vice
 * versa), this test fails in CI.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { ROLE_HIERARCHY } from '@/types/roles';

describe('roles drift guard — TS mirror matches backend permissions.py', () => {
  it('ROLE_HIERARCHY in TS matches the backend dict', () => {
    const backendPath = resolve(__dirname, '../../../../backend/apps/accounts/permissions.py');
    const backendSource = readFileSync(backendPath, 'utf-8');

    // Find the ROLE_HIERARCHY block:
    //   ROLE_HIERARCHY = {
    //       "super_admin": 4,
    //       ...
    //   }
    const match = backendSource.match(/ROLE_HIERARCHY\s*=\s*\{([\s\S]*?)\}/);
    expect(match, 'ROLE_HIERARCHY assignment must exist in permissions.py').not.toBeNull();

    const body = match![1];
    const backendMap: Record<string, number> = {};
    const lineRe = /["']([a-z_]+)["']\s*:\s*(\d+)/g;
    let m: RegExpExecArray | null;
    while ((m = lineRe.exec(body)) !== null) {
      backendMap[m[1]!] = Number(m[2]);
    }

    expect(Object.keys(backendMap).length, 'parser must find at least one role').toBeGreaterThan(0);

    // Assert key set equality.
    const tsKeys = Object.keys(ROLE_HIERARCHY).sort();
    const beKeys = Object.keys(backendMap).sort();
    expect(tsKeys).toEqual(beKeys);

    // Assert level equality per key.
    for (const key of tsKeys) {
      expect(
        ROLE_HIERARCHY[key as keyof typeof ROLE_HIERARCHY],
        `ROLE_HIERARCHY['${key}'] must match the backend value`,
      ).toBe(backendMap[key]);
    }
  });

  it('all four canonical roles are present', () => {
    expect(ROLE_HIERARCHY).toHaveProperty('super_admin');
    expect(ROLE_HIERARCHY).toHaveProperty('admin');
    expect(ROLE_HIERARCHY).toHaveProperty('reviewer');
    expect(ROLE_HIERARCHY).toHaveProperty('student');
  });

  it('super_admin has the highest level', () => {
    const max = Math.max(...Object.values(ROLE_HIERARCHY));
    expect(ROLE_HIERARCHY.super_admin).toBe(max);
  });

  it('student has the lowest level', () => {
    const min = Math.min(...Object.values(ROLE_HIERARCHY));
    expect(ROLE_HIERARCHY.student).toBe(min);
  });
});
