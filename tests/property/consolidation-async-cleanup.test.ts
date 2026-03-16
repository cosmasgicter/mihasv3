/**
 * Property 9: Async Effects Have Proper Cleanup
 * Feature: duplicate-deprecated-consolidation, Property 9: Async Effects Have Proper Cleanup
 *
 * Static analysis: verify each useEffect with setInterval has corresponding clearInterval.
 *
 * Validates: Requirements 7.2, 7.3, 7.4
 */
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs';
import * as path from 'path';

const HOOKS_DIR = path.resolve(__dirname, '../../src/hooks');

function collectFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...collectFiles(full));
    else if (/\.(ts|tsx)$/.test(entry.name)) results.push(full);
  }
  return results;
}

const hookFiles = collectFiles(HOOKS_DIR);
const filesWithSetInterval = hookFiles.filter(f => {
  const content = fs.readFileSync(f, 'utf-8');
  return content.includes('setInterval');
});

describe('Property 9: Async Effects Have Proper Cleanup', () => {
  it('every hook file using setInterval also uses clearInterval', () => {
    if (filesWithSetInterval.length === 0) return;
    fc.assert(
      fc.property(fc.constantFrom(...filesWithSetInterval), (filePath) => {
        const content = fs.readFileSync(filePath, 'utf-8');
        const relativePath = path.relative(HOOKS_DIR, filePath);
        expect(
          content.includes('clearInterval'),
          `Hook ${relativePath} uses setInterval but is missing clearInterval cleanup`
        ).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});
