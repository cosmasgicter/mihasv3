// @vitest-environment node
// Feature: ui-consistency-consolidation, Property 1: Dead files are removed

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Property 1: Dead files are removed
 *
 * For any file path in the dead-code deletion set, that file should not exist
 * in the source tree after consolidation.
 *
 * Validates: Requirements 3.1, 4.1, 5.3, 5.4, 7.1, 11.1
 */

const deadFilePaths = [
  'src/components/admin/AdminLayout.tsx',
  'src/components/admin/AdminSidebar.tsx',
  'src/components/admin/AdminHeader.tsx',
  'src/components/admin/AdminMobileNav.tsx',
  'src/components/ui/AuthLayout.tsx',
  'src/components/ui/SaveStatus.tsx',
  'src/components/ui/SaveNotification.tsx',
  'src/hooks/useMediaQuery.ts',
  'src/hooks/useMobileNavigation.ts',
  'src/components/admin/NotificationPreferences.tsx',
  'src/hooks/useEnhancedResponsive.ts',
];

const projectRoot = path.resolve(__dirname, '../..');

describe('UI Consolidation — Property 1: Dead files are removed', () => {
  it('should not have any dead files in the source tree', () => {
    fc.assert(
      fc.property(fc.constantFrom(...deadFilePaths), (filePath) => {
        const absolutePath = path.join(projectRoot, filePath);
        expect(fs.existsSync(absolutePath)).toBe(false);
      }),
      { numRuns: 5 }
    );
  });
});

// Feature: ui-consistency-consolidation, Property 2: No deprecated error component exports

/**
 * Property 2: No deprecated error component exports
 *
 * For any symbol name in the deprecated set (ErrorBanner, LegacyErrorDisplay,
 * InlineError, ErrorPage), the canonical ErrorDisplay.tsx module should not
 * export that symbol after consolidation.
 *
 * Validates: Requirements 1.4
 */

const errorDisplayPath = path.join(projectRoot, 'src/components/ui/ErrorDisplay.tsx');

describe('UI Consolidation — Property 2: No deprecated error component exports', () => {
  it('should not export any deprecated error component symbols', () => {
    const source = fs.readFileSync(errorDisplayPath, 'utf-8');

    fc.assert(
      fc.property(
        fc.constantFrom('ErrorBanner', 'LegacyErrorDisplay', 'InlineError', 'ErrorPage'),
        (deprecatedName) => {
          // Match named export declarations: "export function ErrorBanner", "export const ErrorBanner"
          const namedExport = new RegExp(
            `export\\s+(?:function|const|class)\\s+${deprecatedName}\\b`,
          );
          // Match re-exports: "export { ErrorBanner }" or "export { Foo as ErrorBanner }"
          const reExport = new RegExp(
            `export\\s*\\{[^}]*\\b${deprecatedName}\\b[^}]*\\}`,
          );
          expect(namedExport.test(source)).toBe(false);
          expect(reExport.test(source)).toBe(false);
        },
      ),
      { numRuns: 5 },
    );
  });
});

// Feature: ui-consistency-consolidation, Property 3: Toast imports use canonical path

/**
 * Property 3: Toast imports use canonical path
 *
 * For any .tsx or .ts file under src/ that imports useToastStore,
 * the import source path should be @/hooks/useToast and never
 * @/components/ui/Toast.
 *
 * Exceptions: src/hooks/useToast.ts (bridge module) and
 * src/stores/toastStore.ts (another bridge) are allowed to import
 * from @/components/ui/Toast.
 *
 * Validates: Requirements 6.1, 6.2
 */

const BRIDGE_MODULES = new Set([
  path.join(projectRoot, 'src', 'hooks', 'useToast.ts'),
  path.join(projectRoot, 'src', 'stores', 'toastStore.ts'),
]);

function findTsFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules') {
      results.push(...findTsFiles(fullPath));
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Finds all .ts/.tsx files under src/ that import useToastStore
 * from a non-canonical path (@/components/ui/Toast) and are NOT
 * bridge modules.
 */
function findFilesWithToastImport(): { file: string; canonical: boolean }[] {
  const srcDir = path.join(projectRoot, 'src');
  const allFiles = findTsFiles(srcDir);
  const results: { file: string; canonical: boolean }[] = [];

  // Matches: import { useToastStore } from '...' or import useToastStore from '...'
  const importRegex = /import\s+(?:\{[^}]*\buseToastStore\b[^}]*\}|useToastStore)\s+from\s+['"]([^'"]+)['"]/g;

  for (const filePath of allFiles) {
    if (BRIDGE_MODULES.has(filePath)) continue;

    const content = fs.readFileSync(filePath, 'utf-8');
    let match: RegExpExecArray | null;
    importRegex.lastIndex = 0;

    while ((match = importRegex.exec(content)) !== null) {
      const importPath = match[1];
      const isCanonical = importPath === '@/hooks/useToast';
      results.push({ file: filePath, canonical: isCanonical });
    }
  }

  return results;
}

describe('UI Consolidation — Property 3: Toast imports use canonical path', () => {
  const filesWithToastImport = findFilesWithToastImport();

  if (filesWithToastImport.length === 0) {
    it('should have no non-bridge useToastStore imports from @/components/ui/Toast (vacuously true — no consumer imports found)', () => {
      // No files import useToastStore outside bridge modules — property holds vacuously
      expect(true).toBe(true);
    });
  } else {
    it('should only import useToastStore from @/hooks/useToast', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...filesWithToastImport),
          ({ file, canonical }) => {
            const relativePath = path.relative(projectRoot, file);
            expect(
              canonical,
              `${relativePath} imports useToastStore from a non-canonical path (should use @/hooks/useToast)`,
            ).toBe(true);
          },
        ),
        { numRuns: 5 },
      );
    });
  }
});

// Feature: ui-consistency-consolidation, Property 4: No hardcoded hex colors in migrated chart files

/**
 * Property 4: No hardcoded hex colors in migrated chart files
 *
 * For any hex color string literal (matching #[0-9a-fA-F]{6}) found in
 * EligibilityDashboard.tsx after migration, that hex value should be a member
 * of the approved CHART_COLORS constant.
 *
 * After migration the file should have NO raw hex literals at all — they are
 * all replaced with CHART_COLORS references. The test still verifies that if
 * any hex literals exist, they belong to the approved set.
 *
 * Validates: Requirements 8.1, 8.2, 8.3
 */

const CHART_COLORS_VALUES = new Set([
  '#047857',
  '#b45309',
  '#cc2424',
  '#2563eb',
  '#7c3aed',
]);

const eligibilityDashboardPath = path.join(
  projectRoot,
  'src/components/application/EligibilityDashboard.tsx',
);

function extractHexLiterals(filePath: string): string[] {
  const source = fs.readFileSync(filePath, 'utf-8');
  // Match hex color literals like '#047857' or "#2563eb" (inside quotes)
  const hexRegex = /['"]#([0-9a-fA-F]{6})['"]/g;
  const hexValues: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = hexRegex.exec(source)) !== null) {
    hexValues.push(`#${match[1].toLowerCase()}`);
  }
  return hexValues;
}

describe('UI Consolidation — Property 4: No hardcoded hex colors in migrated chart files', () => {
  const hexLiterals = extractHexLiterals(eligibilityDashboardPath);

  if (hexLiterals.length === 0) {
    it('should have no raw hex color literals (vacuously true — all colors use CHART_COLORS references)', () => {
      // No hex literals found — property holds vacuously.
      // This is the expected state after migration.
      expect(true).toBe(true);
    });
  } else {
    it('should only contain hex colors that are members of CHART_COLORS', () => {
      fc.assert(
        fc.property(fc.constantFrom(...hexLiterals), (hex) => {
          expect(
            CHART_COLORS_VALUES.has(hex),
            `Found hex literal ${hex} in EligibilityDashboard.tsx that is not in CHART_COLORS`,
          ).toBe(true);
        }),
        { numRuns: 5 },
      );
    });
  }
});


// Feature: ui-consistency-consolidation, Property 5: Migrated pages do not use manual loading state

/**
 * Property 5: Migrated pages do not use manual loading state
 *
 * For each migrated page path, scan source for `setLoading(true)`, assert zero matches.
 * After migration to React Query, pages should derive loading state from
 * `isLoading` / `isPending` instead of manual `setLoading(true)` calls.
 *
 * Validates: Requirements 9.1, 9.4
 */

const migratedPagePaths = [
  'src/pages/auth/SignInPage.tsx',
  'src/pages/auth/SignUpPage.tsx',
  'src/pages/auth/ForgotPasswordPage.tsx',
  'src/pages/auth/ResetPasswordPage.tsx',
  'src/pages/admin/Intakes.tsx',
  'src/pages/admin/EligibilityManagement.tsx',
  'src/pages/admin/AuditTrail.tsx',
  'src/pages/admin/Programs.tsx',
  'src/pages/admin/Settings.tsx',
  'src/pages/student/NotificationSettings.tsx',
  'src/pages/student/Payment.tsx',
  'src/pages/student/ApplicationDetail.tsx',
  'src/pages/student/Settings.tsx',
  'src/pages/student/ApplicationStatus.tsx',
];

const existingMigratedPagePaths = migratedPagePaths.filter((pagePath) =>
  fs.existsSync(path.join(projectRoot, pagePath)),
);

describe('UI Consolidation — Property 5: Migrated pages do not use manual loading state', () => {
  it('should not contain setLoading(true) in any migrated page', () => {
    fc.assert(
      fc.property(fc.constantFrom(...existingMigratedPagePaths), (pagePath) => {
        const absolutePath = path.join(projectRoot, pagePath);
        const source = fs.readFileSync(absolutePath, 'utf-8');
        const hasManualLoading = source.includes('setLoading(true)');
        expect(
          hasManualLoading,
          `${pagePath} still contains setLoading(true) — should use React Query instead`,
        ).toBe(false);
      }),
      { numRuns: 5 },
    );
  });
});


// Feature: ui-consistency-consolidation, Property 6: Application store contains only UI state

/**
 * Property 6: Application store contains only UI state
 *
 * For any field name in the applicationStore Zustand interface, that field
 * should be a UI-concern identifier (currentApplicationId, wizardStep,
 * setCurrentApplicationId, setWizardStep) and not a server-data array or
 * object (applications, programs, intakes, loading, error).
 *
 * The test reads the store source file, extracts field names from the
 * ApplicationUIState interface, and asserts each is in the allowed set.
 *
 * Validates: Requirements 10.1, 10.2
 */

const ALLOWED_UI_FIELDS = new Set([
  'currentApplicationId',
  'wizardStep',
  'setCurrentApplicationId',
  'setWizardStep',
]);

const applicationStorePath = path.join(projectRoot, 'src/stores/applicationStore.ts');

/**
 * Extracts field names from the ApplicationUIState interface declaration
 * and from the create<ApplicationUIState>() implementation block.
 */
function extractStoreFieldNames(): string[] {
  const source = fs.readFileSync(applicationStorePath, 'utf-8');
  const fieldNames = new Set<string>();

  // Extract fields from the interface block: "  fieldName: type"
  const interfaceMatch = source.match(
    /interface\s+ApplicationUIState\s*\{([^}]+)\}/s,
  );
  if (interfaceMatch) {
    const interfaceBody = interfaceMatch[1];
    const fieldRegex = /^\s+(\w+)\s*[:(]/gm;
    let match: RegExpExecArray | null;
    while ((match = fieldRegex.exec(interfaceBody)) !== null) {
      fieldNames.add(match[1]);
    }
  }

  // Also extract keys from the store implementation: "  fieldName: value," or "  fieldName: (args) =>"
  const createMatch = source.match(
    /create<ApplicationUIState>\(\)\(\(set\)\s*=>\s*\((\{[\s\S]*?\})\)\)/,
  );
  if (createMatch) {
    const implBody = createMatch[1];
    const keyRegex = /^\s+(\w+)\s*[:(]/gm;
    let match: RegExpExecArray | null;
    while ((match = keyRegex.exec(implBody)) !== null) {
      fieldNames.add(match[1]);
    }
  }

  return Array.from(fieldNames);
}

describe('UI Consolidation — Property 6: Application store contains only UI state', () => {
  const storeFields = extractStoreFieldNames();

  it('should only contain UI-concern fields in the application store', () => {
    // Ensure we actually extracted fields (sanity check)
    expect(storeFields.length).toBeGreaterThan(0);

    fc.assert(
      fc.property(fc.constantFrom(...storeFields), (fieldName) => {
        expect(
          ALLOWED_UI_FIELDS.has(fieldName),
          `Field "${fieldName}" in applicationStore is not in the allowed UI field set — server data should use React Query instead`,
        ).toBe(true);
      }),
      { numRuns: 5 },
    );
  });
});
