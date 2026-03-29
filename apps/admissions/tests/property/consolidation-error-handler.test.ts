/**
 * Property 15: Error Handler Preserves Core Capabilities
 * Feature: duplicate-deprecated-consolidation, Property 15: Error Handler Preserves Core Capabilities
 *
 * For any async operation executed through the canonical error handling hook,
 * the hook should accept errors, surface them via toast, and support retry with backoff.
 *
 * Validates: Requirements 13.2
 */
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs';
import * as path from 'path';

const SRC_DIR = path.resolve(__dirname, '../../src');

describe('Property 15: Error Handler Preserves Core Capabilities', () => {
  it('canonical useErrorHandler exports handleError, retryWithBackoff, and withErrorHandling', () => {
    const filePath = path.resolve(SRC_DIR, 'hooks/useErrorHandler.ts');
    const content = fs.readFileSync(filePath, 'utf-8');

    fc.assert(
      fc.property(
        fc.constantFrom('handleError', 'retryWithBackoff', 'withErrorHandling', 'clearError'),
        (capability) => {
          expect(
            content.includes(capability),
            `useErrorHandler should export '${capability}'`
          ).toBe(true);
        }
      ),
      { numRuns: 100 },
    );
  });

  it('canonical useErrorHandler imports from @/lib/errorMessages (not deprecated path)', () => {
    const filePath = path.resolve(SRC_DIR, 'hooks/useErrorHandler.ts');
    const content = fs.readFileSync(filePath, 'utf-8');

    expect(content).toContain("from '@/lib/errorMessages'");
    expect(content).not.toContain("from '@/utils/errorMessages'");
  });

  it('deprecated useErrorHandling.ts no longer exists', () => {
    const deprecatedPath = path.resolve(SRC_DIR, 'hooks/useErrorHandling.ts');
    expect(fs.existsSync(deprecatedPath)).toBe(false);
  });
});
