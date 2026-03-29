/**
 * Property 13: React Query Cache Keys Preserved
 * Feature: duplicate-deprecated-consolidation, Property 13: React Query Cache Keys Preserved
 *
 * For any React Query hook in the canonical hook set, the query key arrays
 * used after consolidation should match the expected pre-consolidation keys.
 *
 * Validates: Requirements 10.6
 */
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs';
import * as path from 'path';

const SRC_DIR = path.resolve(__dirname, '../../src');

/**
 * Expected query keys for canonical hooks.
 * These must not change during consolidation.
 */
const EXPECTED_CACHE_KEYS: Array<{
  file: string;
  hookName: string;
  expectedKeyPattern: string; // regex pattern to match in the file
}> = [
  {
    file: 'hooks/queries/useApplicationDataQueries.ts',
    hookName: 'useApplications',
    expectedKeyPattern: "queryKey:\\s*\\['applications'",
  },
  {
    file: 'hooks/queries/useApplicationDataQueries.ts',
    hookName: 'useApplication',
    expectedKeyPattern: "queryKey:\\s*\\['application'",
  },
  {
    file: 'hooks/queries/useApplicationDataQueries.ts',
    hookName: 'usePrograms',
    expectedKeyPattern: "queryKey:\\s*\\['programs'\\]",
  },
  {
    file: 'hooks/queries/useApplicationDataQueries.ts',
    hookName: 'useIntakes',
    expectedKeyPattern: "queryKey:\\s*\\['intakes'\\]",
  },
];

const cacheKeyEntryArb = fc.constantFrom(...EXPECTED_CACHE_KEYS);

describe('Property 13: React Query Cache Keys Preserved', () => {
  it('each canonical hook uses the expected query key pattern', () => {
    fc.assert(
      fc.property(cacheKeyEntryArb, ({ file, hookName, expectedKeyPattern }) => {
        const filePath = path.resolve(SRC_DIR, file);
        expect(fs.existsSync(filePath), `File src/${file} should exist`).toBe(true);

        const content = fs.readFileSync(filePath, 'utf-8');
        const pattern = new RegExp(expectedKeyPattern);
        expect(
          pattern.test(content),
          `Hook '${hookName}' in src/${file} should use query key matching: ${expectedKeyPattern}`
        ).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});
