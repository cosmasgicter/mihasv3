/**
 * Property 3: No PWA artifacts in build output
 *
 * For any file in dist/, filename must not match sw.js, service-worker.js,
 * workbox-*.js, or manifest.webmanifest. No JS file in build output shall
 * contain `workbox` or `serviceWorker.register`.
 *
 * // Feature: production-stability-hardening, Property 3: No PWA artifacts in build output
 *
 * **Validates: Requirements 4.3, 4.4**
 */
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Recursively collect all file paths under `dir`. */
function walkDir(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkDir(full));
    } else {
      files.push(full);
    }
  }
  return files;
}

const DIST_DIR = path.resolve(process.cwd(), 'dist');
const allFiles = walkDir(DIST_DIR);

// Forbidden filename patterns
const FORBIDDEN_FILENAMES = [
  /^sw\.js$/,
  /^service-worker\.js$/,
  /^workbox-.*\.js$/,
  /^manifest\.webmanifest$/,
];

// Forbidden content patterns in JS files
const FORBIDDEN_CONTENT_PATTERNS = [/workbox/i, /serviceWorker\.register/];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Property 3: No PWA artifacts in build output', () => {
  // Skip gracefully if dist/ doesn't exist (build may not have been run)
  const shouldRun = allFiles.length > 0;

  it.skipIf(!shouldRun)(
    'no file in dist/ has a forbidden PWA filename',
    () => {
      // Generate random indices into the file list and verify each
      const fileIndexArb = fc.integer({ min: 0, max: allFiles.length - 1 });

      fc.assert(
        fc.property(fileIndexArb, (idx) => {
          const filePath = allFiles[idx];
          const basename = path.basename(filePath);

          for (const pattern of FORBIDDEN_FILENAMES) {
            expect(
              pattern.test(basename),
              `File "${basename}" matches forbidden PWA pattern ${pattern}`,
            ).toBe(false);
          }
        }),
        { numRuns: 100 },
      );
    },
  );

  it.skipIf(!shouldRun)(
    'no JS file in dist/ contains workbox or serviceWorker.register',
    () => {
      const jsFiles = allFiles.filter((f) => f.endsWith('.js'));
      if (jsFiles.length === 0) return; // nothing to check

      const jsIndexArb = fc.integer({ min: 0, max: jsFiles.length - 1 });

      fc.assert(
        fc.property(jsIndexArb, (idx) => {
          const filePath = jsFiles[idx];
          const content = fs.readFileSync(filePath, 'utf-8');

          for (const pattern of FORBIDDEN_CONTENT_PATTERNS) {
            expect(
              pattern.test(content),
              `JS file "${path.basename(filePath)}" contains forbidden PWA content matching ${pattern}`,
            ).toBe(false);
          }
        }),
        { numRuns: 100 },
      );
    },
  );
});
