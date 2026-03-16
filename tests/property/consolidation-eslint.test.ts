/**
 * Property 11: ESLint Rules Cover All Deprecated Paths
 * Feature: duplicate-deprecated-consolidation, Property 11: ESLint Rules Cover All Deprecated Paths
 *
 * For any deprecated path, the ESLint config should contain a no-restricted-imports pattern.
 *
 * Validates: Requirements 8.2, 8.4
 */
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');

const DEPRECATED_PATHS = [
  '@/utils/logger',
  '@/utils/errorMessages',
  '@/lib/sanitizer',
  '@/lib/securityEnhancements',
  '@/utils/keyboardNavigation',
  '@/utils/contrastChecker',
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

const deprecatedPathArb = fc.constantFrom(...DEPRECATED_PATHS);

describe('Property 11: ESLint Rules Cover All Deprecated Paths', () => {
  it('each deprecated path appears in eslint.config.js no-restricted-imports', () => {
    const eslintConfig = fs.readFileSync(path.resolve(ROOT, 'eslint.config.js'), 'utf-8');

    fc.assert(
      fc.property(deprecatedPathArb, (deprecatedPath) => {
        expect(
          eslintConfig.includes(deprecatedPath),
          `ESLint config is missing no-restricted-imports rule for: ${deprecatedPath}`
        ).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});
