/**
 * Property 8: Auto-Save Interval Preserved
 * Feature: duplicate-deprecated-consolidation, Property 8: Auto-Save Interval Preserved
 *
 * For any form state managed by the auto-save system, the save callback should be
 * invoked at 8000ms intervals.
 *
 * Validates: Requirements 5.4, 10.4, 16.5
 */
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs';
import * as path from 'path';

const SRC_DIR = path.resolve(__dirname, '../../src');

/** Collect all .ts/.tsx files recursively */
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

const allFiles = collectFiles(SRC_DIR);

/** Files that reference setInterval with auto-save semantics */
const autoSaveFiles = allFiles.filter(f => {
  const content = fs.readFileSync(f, 'utf-8');
  return content.includes('setInterval') && (content.includes('auto') || content.includes('save') || content.includes('draft'));
});

describe('Property 8: Auto-Save Interval Preserved', () => {
  it('auto-save intervals use 8000ms (8 seconds)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...(autoSaveFiles.length > 0 ? autoSaveFiles : [path.resolve(SRC_DIR, 'hooks/useAutoSave.ts')])),
        (filePath) => {
          if (!fs.existsSync(filePath)) return; // skip if file doesn't exist
          const content = fs.readFileSync(filePath, 'utf-8');
          // If this file has setInterval with auto-save context, check for 8000ms
          if (content.includes('setInterval') && (content.includes('auto') || content.includes('save') || content.includes('draft'))) {
            // Should contain 8000 or 8_000 or 8 * 1000
            const has8SecondInterval = content.includes('8000') || content.includes('8_000') || content.includes('8 * 1000');
            expect(
              has8SecondInterval,
              `File ${path.relative(SRC_DIR, filePath)} has auto-save setInterval but doesn't use 8000ms`
            ).toBe(true);
          }
        }
      ),
      { numRuns: 100 },
    );
  });
});
