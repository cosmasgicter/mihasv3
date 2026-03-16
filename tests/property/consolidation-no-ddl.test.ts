/**
 * Property 12: No Database DDL in Frontend Code
 * Feature: duplicate-deprecated-consolidation, Property 12: No Database DDL in Frontend Code
 *
 * For any source file in src/, no SQL DDL statements should exist.
 *
 * Validates: Requirements 10.3
 */
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs';
import * as path from 'path';

const SRC_DIR = path.resolve(__dirname, '../../src');

function collectFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules') results.push(...collectFiles(full));
    else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) results.push(full);
  }
  return results;
}

const allFiles = collectFiles(SRC_DIR);
const fileSubsetArb = fc.shuffledSubarray(allFiles, { minLength: 1, maxLength: Math.min(allFiles.length, 50) });

const DDL_PATTERNS = [
  /ALTER\s+TABLE/i,
  /DROP\s+TABLE/i,
  /CREATE\s+TABLE/i,
  /DROP\s+COLUMN/i,
  /ADD\s+COLUMN/i,
];

describe('Property 12: No Database DDL in Frontend Code', () => {
  it('no source file contains SQL DDL statements', () => {
    fc.assert(
      fc.property(fileSubsetArb, (files) => {
        for (const filePath of files) {
          const content = fs.readFileSync(filePath, 'utf-8');
          const rel = path.relative(SRC_DIR, filePath);
          for (const pattern of DDL_PATTERNS) {
            expect(
              pattern.test(content),
              `File src/${rel} contains SQL DDL: ${pattern.source}`
            ).toBe(false);
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});
