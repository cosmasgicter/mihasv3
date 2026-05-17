/**
 * Codebase invariant property tests for single-source-of-truth consolidation
 * Feature: single-source-of-truth-consolidation
 *
 * Property 1: No imports from deleted modules
 * Property 2: No raw fetch to auth endpoints
 * Property 3: All endpoint strings use /api/ prefix
 * Property 6: Only ApiClient writes to CSRF Token Store
 */
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs';
import * as path from 'path';

// ── Helpers ─────────────────────────────────────────────────────────────

const SRC_DIR = path.resolve(__dirname, '../../src');

/** Recursively collect all .ts and .tsx files under a directory */
function collectSourceFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectSourceFiles(fullPath));
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

/** All source files in src/ */
const allSourceFiles = collectSourceFiles(SRC_DIR);

/** Arbitrary that picks a random non-empty subset of source files */
const sourceFileSubsetArb = fc
  .shuffledSubarray(allSourceFiles, { minLength: 1, maxLength: Math.min(allSourceFiles.length, 50) });

// ── Deleted module paths (normalized for import matching) ───────────────

const DELETED_MODULE_PATHS = [
  'src/lib/api/authApi',
  'src/lib/session',
  'src/lib/authRefresh',
  'src/lib/authPersistence',
  'src/hooks/auth/useTokenRefresh',
  'src/lib/sessionUtils',
  'src/hooks/queries/useAuthMutations',
  'src/hooks/auth/useRoleQuery',
];

/**
 * Convert deleted module paths to patterns that match import statements.
 * Handles both relative imports (../lib/session) and alias imports (@/lib/session).
 */
function buildDeletedModulePatterns(): RegExp[] {
  return DELETED_MODULE_PATHS.flatMap((modPath) => {
    // Strip 'src/' prefix to get the path after src/
    const afterSrc = modPath.replace(/^src\//, '');
    // Match @/ alias imports: from '@/lib/session'
    const aliasPattern = new RegExp(
      `from\\s+['"]@/${afterSrc.replace(/\//g, '\\/')}['"]`
    );
    // Match relative imports: from '../lib/session' or './lib/session' etc.
    // Extract the last segment for a simpler relative match
    const segments = afterSrc.split('/');
    const lastSegment = segments[segments.length - 1];
    const relativePattern = new RegExp(
      `from\\s+['"][.]{1,2}\\/.*${lastSegment.replace(/\//g, '\\/')}['"]`
    );
    return [aliasPattern, relativePattern];
  });
}

const deletedModulePatterns = buildDeletedModulePatterns();

// ── Tests ───────────────────────────────────────────────────────────────

describe('Codebase Invariant Property Tests', () => {

  // Feature: single-source-of-truth-consolidation, Property 1: No imports from deleted modules
  // **Validates: Requirements 1.5, 1.6, 2.2–2.8, 3.2–3.6, 4.3–4.5, 5.3, 5.4, 7.1–7.7, 10.1**
  describe('Property 1: No imports from deleted modules', () => {
    it('no source file imports from any deleted module path', () => {
      fc.assert(
        fc.property(sourceFileSubsetArb, (files) => {
          for (const filePath of files) {
            const content = fs.readFileSync(filePath, 'utf-8');
            const relativePath = path.relative(SRC_DIR, filePath);

            for (let i = 0; i < DELETED_MODULE_PATHS.length; i++) {
              const pattern = deletedModulePatterns[i * 2]; // alias pattern
              const relPattern = deletedModulePatterns[i * 2 + 1]; // relative pattern

              expect(
                pattern.test(content) || relPattern.test(content),
                `File src/${relativePath} imports from deleted module: ${DELETED_MODULE_PATHS[i]}`
              ).toBe(false);
            }
          }
        }),
        { numRuns: 10 },
      );
    });
  });

  // Feature: single-source-of-truth-consolidation, Property 2: No raw fetch to auth endpoints
  // **Validates: Requirements 1.1, 1.7, 2.10, 10.2**
  describe('Property 2: No raw fetch to auth endpoints', () => {
    /** Files allowed to use raw fetch to auth endpoints */
    const ALLOWED_FILES = [
      path.resolve(SRC_DIR, 'services/client.ts'), // This IS the ApiClient
    ];

    it('no source file (except ApiClient) uses raw fetch() to auth endpoints', () => {
      fc.assert(
        fc.property(sourceFileSubsetArb, (files) => {
          for (const filePath of files) {
            // Skip allowed files
            if (ALLOWED_FILES.includes(filePath)) continue;

            const content = fs.readFileSync(filePath, 'utf-8');
            const relativePath = path.relative(SRC_DIR, filePath);

            // Match fetch( with a URL containing /api/auth or /auth?action=
            // Patterns: fetch('/api/auth..., fetch("/api/auth..., fetch(`/api/auth...
            // Also: fetch('/auth?action=..., fetch("/auth?action=...
            const rawFetchAuthPattern = /\bfetch\s*\(\s*['"`][^'"`]*\/api\/auth/;
            const rawFetchAuthActionPattern = /\bfetch\s*\(\s*['"`][^'"`]*\/auth\?action=/;

            expect(
              rawFetchAuthPattern.test(content),
              `File src/${relativePath} contains raw fetch() to /api/auth endpoint`
            ).toBe(false);

            expect(
              rawFetchAuthActionPattern.test(content),
              `File src/${relativePath} contains raw fetch() to /auth?action= endpoint`
            ).toBe(false);
          }
        }),
        { numRuns: 10 },
      );
    });
  });

  // Feature: single-source-of-truth-consolidation, Property 3: All endpoint strings use /api/ prefix
  // **Validates: Requirements 8.1, 8.2, 8.3, 10.4**
  describe('Property 3: All endpoint strings use /api/ prefix', () => {
    /**
     * Detect endpoint-like strings that reference known API resources WITHOUT the /api/ prefix
     * in contexts where they bypass the ApiClient's endpoint normalization.
     *
     * The ApiClient (task 1.4) normalizes endpoints by prepending /api/ when missing,
     * so strings passed to apiClient.request() are safe without the prefix.
     * This property checks for raw fetch() calls that bypass normalization.
     *
     * We also check for standalone string assignments to variables that look like
     * endpoint URLs without /api/ prefix, excluding those clearly passed to apiClient.
     *
     * We exclude React Router paths like '/auth/login' which are frontend routes.
     */
    const ENDPOINT_RESOURCES = ['auth', 'admin', 'applications', 'catalog', 'documents', 'notifications'];

    /**
     * Check if a file contains raw fetch() calls to API endpoints without /api/ prefix.
     * This is the dangerous case — fetch() doesn't normalize endpoints.
     */
    function hasRawFetchWithoutApiPrefix(content: string): { found: boolean; resource: string } {
      for (const resource of ENDPOINT_RESOURCES) {
        // Match: fetch('/auth?action=...) or fetch("/auth?action=...) or fetch(`/auth?action=...)
        // but NOT fetch('/api/auth?action=...)
        const pattern = new RegExp(
          `\\bfetch\\s*\\([^)]*['"\`](?!\\/api\\/)\\/${resource}\\?(?:action|type|id)=`
        );
        if (pattern.test(content)) {
          return { found: true, resource };
        }
      }
      return { found: false, resource: '' };
    }

    it('no raw fetch() calls use endpoint strings without /api/ prefix', () => {
      fc.assert(
        fc.property(sourceFileSubsetArb, (files) => {
          for (const filePath of files) {
            // Skip the ApiClient itself — it uses fetch internally
            if (filePath === path.resolve(SRC_DIR, 'services/client.ts')) continue;

            const content = fs.readFileSync(filePath, 'utf-8');
            const relativePath = path.relative(SRC_DIR, filePath);

            const result = hasRawFetchWithoutApiPrefix(content);
            expect(
              result.found,
              `File src/${relativePath} has raw fetch() to '${result.resource}' endpoint missing /api/ prefix`
            ).toBe(false);
          }
        }),
        { numRuns: 10 },
      );
    });
  });

  // Feature: single-source-of-truth-consolidation, Property 6: Only ApiClient writes to CSRF Token Store
  // **Validates: Requirements 6.4**
  describe('Property 6: Only ApiClient writes to CSRF Token Store', () => {
    /** Files allowed to call setCsrfToken */
    const ALLOWED_CSRF_WRITERS = [
      path.resolve(SRC_DIR, 'lib/csrfToken.ts'),    // The store itself
      path.resolve(SRC_DIR, 'services/client.ts'),   // The ApiClient
      path.resolve(SRC_DIR, 'services/csrf.ts'),     // CSRF recovery helper
      path.resolve(SRC_DIR, 'services/authInterceptor.ts'), // refresh token rotation helper
    ];

    it('only CSRF/auth service helpers write to the CSRF token store', () => {
      fc.assert(
        fc.property(sourceFileSubsetArb, (files) => {
          for (const filePath of files) {
            // Skip allowed files
            if (ALLOWED_CSRF_WRITERS.includes(filePath)) continue;

            const content = fs.readFileSync(filePath, 'utf-8');
            const relativePath = path.relative(SRC_DIR, filePath);

            // Match setCsrfToken( call — but not clearCsrfToken( or getCsrfToken(
            const setCsrfPattern = /\bsetCsrfToken\s*\(/;

            expect(
              setCsrfPattern.test(content),
              `File src/${relativePath} calls setCsrfToken() outside the allowed CSRF/auth helpers`
            ).toBe(false);
          }
        }),
        { numRuns: 10 },
      );
    });
  });
});
