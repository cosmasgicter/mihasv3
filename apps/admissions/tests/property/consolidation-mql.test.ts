/**
 * Property 10: No Deprecated MediaQueryList API
 * Feature: duplicate-deprecated-consolidation, Property 10: No Deprecated MediaQueryList API
 *
 * For any source file in src/, no call to addListener or removeListener on MediaQueryList.
 *
 * Validates: Requirements 7.7
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

describe('Property 10: No Deprecated MediaQueryList API', () => {
  it('no source file uses deprecated .addListener() or .removeListener()', () => {
    fc.assert(
      fc.property(fileSubsetArb, (files) => {
        for (const filePath of files) {
          const content = fs.readFileSync(filePath, 'utf-8');
          const rel = path.relative(SRC_DIR, filePath);
          // Match .addListener( but not .addEventListener(
          expect(
            /\.addListener\s*\(/.test(content) && !content.includes('.addEventListener'),
            `File src/${rel} uses deprecated .addListener()`
          ).toBe(false);
          expect(
            /\.removeListener\s*\(/.test(content) && !content.includes('.removeEventListener'),
            `File src/${rel} uses deprecated .removeListener()`
          ).toBe(false);
        }
      }),
      { numRuns: 100 },
    );
  });
});
