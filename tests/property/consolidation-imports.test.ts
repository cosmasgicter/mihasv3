/**
 * Property 3: No Imports From Deprecated Paths
 * Feature: duplicate-deprecated-consolidation, Property 3: No Imports From Deprecated Paths
 *
 * For any source file in src/, no import statement should reference any deprecated path.
 *
 * Validates: Requirements 1.3, 2.3, 3.4, 5.6, 8.1, 9.5, 11.3, 12.3, 13.3, 15.5, 21.3
 */
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs';
import * as path from 'path';

const SRC_DIR = path.resolve(__dirname, '../../src');

const DEPRECATED_PATHS = [
  '@/utils/logger',
  '@/utils/errorMessages',
  '@/utils/keyboardNavigation',
  '@/utils/contrastChecker',
  '@/lib/sanitizer',
  '@/lib/securityEnhancements',
  '@/lib/draftCleanup',
  '@/lib/networkChecker',
  '@/lib/networkDiagnostics',
  '@/stores/toastStore',
  '@/lib/notificationService',
  '@/lib/adminNotifications',
  '@/lib/securityPatches',
  '@/lib/securityHeaders',
  '@/lib/securityUtils',
  '@/hooks/useErrorHandling',
  '@/hooks/useNotificationPreferences',
  '@/components/ErrorBoundary',
];

function collectSourceFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules') results.push(...collectSourceFiles(full));
    else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) results.push(full);
  }
  return results;
}

const allSourceFiles = collectSourceFiles(SRC_DIR);
const sourceFileSubsetArb = fc.shuffledSubarray(allSourceFiles, {
  minLength: 1,
  maxLength: Math.min(allSourceFiles.length, 50),
});

describe('Property 3: No Imports From Deprecated Paths', () => {
  it('no source file imports from any deprecated path', () => {
    fc.assert(
      fc.property(sourceFileSubsetArb, (files) => {
        for (const filePath of files) {
          const content = fs.readFileSync(filePath, 'utf-8');
          const relativePath = path.relative(SRC_DIR, filePath);
          for (const deprecatedPath of DEPRECATED_PATHS) {
            const pattern = new RegExp(`from\\s+['"]${deprecatedPath.replace(/\//g, '\\/')}['"]`);
            expect(
              pattern.test(content),
              `File src/${relativePath} imports from deprecated path: ${deprecatedPath}`
            ).toBe(false);
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});
