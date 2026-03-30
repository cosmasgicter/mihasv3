/**
 * Property-based tests for dependency removal verification
 * Feature: admissions-frontend-overhaul
 *
 * Property 14: No imports from removed backend packages
 *
 * **Validates: Requirement 14.6**
 */
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ── Constants ───────────────────────────────────────────────────────────

/** Complete list of removed backend-only packages */
const REMOVED_PACKAGES = [
  '@arcjet/decorate',
  '@arcjet/node',
  '@neondatabase/serverless',
  'bcryptjs',
  'cors',
  'express',
  'jose',
  'node-fetch',
  'pg',
  'resend',
  'web-push',
  '@aws-sdk/client-sqs',
  '@vercel/node',
] as const;

// ── File scanning helpers ───────────────────────────────────────────────

const SRC_DIR = path.resolve(__dirname, '../../src');

/** Recursively collect all .ts and .tsx files under a directory */
function collectSourceFiles(dir: string): string[] {
  const files: string[] = [];
  if (!fs.existsSync(dir)) return files;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules') {
      files.push(...collectSourceFiles(fullPath));
    } else if (entry.isFile() && /\.tsx?$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

/** Check if a file's content contains an import/require of the given package */
function fileImportsPackage(content: string, pkg: string): boolean {
  // Match ES import: import ... from 'pkg' or import 'pkg'
  // Match dynamic import: import('pkg')
  // Match require: require('pkg')
  // Also match sub-path imports like 'pkg/sub'
  const escaped = pkg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `(?:from\\s+['"\`]${escaped}(?:/[^'"\`]*)?['"\`])|` +
    `(?:import\\s*\\(\\s*['"\`]${escaped}(?:/[^'"\`]*)?['"\`])|` +
    `(?:require\\s*\\(\\s*['"\`]${escaped}(?:/[^'"\`]*)?['"\`])|` +
    `(?:import\\s+['"\`]${escaped}(?:/[^'"\`]*)?['"\`])`,
  );
  return pattern.test(content);
}

// ── Property 14: No imports from removed backend packages ───────────────

describe('Property 14: No imports from removed backend packages', () => {
  const sourceFiles = collectSourceFiles(SRC_DIR);

  // Pre-read all file contents once for efficiency
  const fileContents = new Map<string, string>();
  for (const filePath of sourceFiles) {
    fileContents.set(filePath, fs.readFileSync(filePath, 'utf-8'));
  }

  /**
   * For any random subset of removed packages, no source file under
   * apps/admissions/src/ contains an import or require referencing
   * any package in that subset.
   *
   * **Validates: Requirement 14.6**
   */
  it('no source file imports any subset of removed packages', () => {
    fc.assert(
      fc.property(
        fc.subarray([...REMOVED_PACKAGES], { minLength: 1 }),
        (packageSubset) => {
          for (const [filePath, content] of fileContents) {
            for (const pkg of packageSubset) {
              const relativePath = path.relative(SRC_DIR, filePath);
              expect(
                fileImportsPackage(content, pkg),
                `File "${relativePath}" imports removed package "${pkg}"`,
              ).toBe(false);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Exhaustive check: scan every source file against every removed package.
   * This complements the property test with a deterministic full sweep.
   *
   * **Validates: Requirement 14.6**
   */
  it('exhaustive scan finds zero imports from any removed package', () => {
    const violations: string[] = [];

    for (const [filePath, content] of fileContents) {
      for (const pkg of REMOVED_PACKAGES) {
        if (fileImportsPackage(content, pkg)) {
          const relativePath = path.relative(SRC_DIR, filePath);
          violations.push(`${relativePath} imports "${pkg}"`);
        }
      }
    }

    expect(violations, `Found imports from removed packages:\n${violations.join('\n')}`).toEqual([]);
  });

  /**
   * The import detection regex correctly identifies known import patterns
   * for any removed package name.
   *
   * **Validates: Requirement 14.6**
   */
  it('import detection catches all standard import patterns for any removed package', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...REMOVED_PACKAGES),
        (pkg) => {
          // ES named import
          expect(fileImportsPackage(`import { foo } from '${pkg}';`, pkg)).toBe(true);
          // ES default import
          expect(fileImportsPackage(`import bar from "${pkg}";`, pkg)).toBe(true);
          // Side-effect import
          expect(fileImportsPackage(`import '${pkg}';`, pkg)).toBe(true);
          // Dynamic import
          expect(fileImportsPackage(`const m = import('${pkg}');`, pkg)).toBe(true);
          // CommonJS require
          expect(fileImportsPackage(`const x = require('${pkg}');`, pkg)).toBe(true);
          // Sub-path import
          expect(fileImportsPackage(`import { thing } from '${pkg}/sub';`, pkg)).toBe(true);

          // Should NOT match partial package name in unrelated string
          expect(fileImportsPackage(`// just a comment mentioning ${pkg}`, pkg)).toBe(false);
        },
      ),
      { numRuns: REMOVED_PACKAGES.length },
    );
  });
});
