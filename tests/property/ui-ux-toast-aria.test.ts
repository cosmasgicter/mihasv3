/**
 * Property 3: Toast ARIA role matches toast type
 * Feature: website-ui-ux-fix, Property 3: Toast ARIA role matches toast type
 *
 * For any toast notification, if the toast type is `error` or `warning`, the
 * rendered element SHALL have `role="alert"`, and if the toast type is `success`
 * or `info`, the rendered element SHALL have `role="status"`.
 *
 * Also verifies that typeStyles and iconStyles use only semantic design tokens
 * (no hardcoded Tailwind palette colors).
 *
 * Validates: Requirements 6.3, 6.4
 */
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Read the Toast source file for static analysis
const TOAST_SOURCE = readFileSync(
  resolve(__dirname, '../../src/components/ui/Toast.tsx'),
  'utf-8'
);

// Toast types
type ToastType = 'success' | 'error' | 'info' | 'warning';
const ALL_TOAST_TYPES: ToastType[] = ['success', 'error', 'info', 'warning'];

// Arbitraries
const toastTypeArb = fc.constantFrom(...ALL_TOAST_TYPES);
const alertTypeArb = fc.constantFrom<ToastType>('error', 'warning');
const statusTypeArb = fc.constantFrom<ToastType>('success', 'info');

/**
 * Extract the typeStyles object from Toast source.
 * Returns a map of toast type → class string.
 */
function extractTypeStyles(): Record<ToastType, string> {
  const match = TOAST_SOURCE.match(
    /const\s+typeStyles\s*=\s*\{([^}]+)\}/s
  );
  if (!match) throw new Error('Could not find typeStyles in Toast.tsx');

  const result: Record<string, string> = {};
  const entryRegex = /(\w+)\s*:\s*['"`]([^'"`]+)['"`]/g;
  let m: RegExpExecArray | null;
  while ((m = entryRegex.exec(match[1])) !== null) {
    result[m[1]] = m[2];
  }
  return result as Record<ToastType, string>;
}

/**
 * Extract the iconStyles object from Toast source.
 * Returns a map of toast type → class string.
 */
function extractIconStyles(): Record<ToastType, string> {
  const match = TOAST_SOURCE.match(
    /const\s+iconStyles\s*=\s*\{([^}]+)\}/s
  );
  if (!match) throw new Error('Could not find iconStyles in Toast.tsx');

  const result: Record<string, string> = {};
  const entryRegex = /(\w+)\s*:\s*['"`]([^'"`]+)['"`]/g;
  let m: RegExpExecArray | null;
  while ((m = entryRegex.exec(match[1])) !== null) {
    result[m[1]] = m[2];
  }
  return result as Record<ToastType, string>;
}

/**
 * Extract the ARIA role logic from Toast source.
 * Verifies the isAlertRole condition and role assignment.
 */
function extractRoleMapping(): { alertTypes: string[]; roleAssignment: string } {
  // Find: const isAlertRole = toast.type === 'error' || toast.type === 'warning';
  const condMatch = TOAST_SOURCE.match(
    /const\s+isAlertRole\s*=\s*([^;]+);/
  );
  if (!condMatch) throw new Error('Could not find isAlertRole in Toast.tsx');

  const condition = condMatch[1].trim();
  // Extract types from the condition
  const typeMatches = [...condition.matchAll(/toast\.type\s*===\s*['"`](\w+)['"`]/g)];
  const alertTypes = typeMatches.map((m) => m[1]);

  // Find: role={isAlertRole ? 'alert' : 'status'}
  const roleMatch = TOAST_SOURCE.match(
    /role=\{isAlertRole\s*\?\s*['"`](\w+)['"`]\s*:\s*['"`](\w+)['"`]\}/
  );
  if (!roleMatch) throw new Error('Could not find role assignment in Toast.tsx');

  return {
    alertTypes,
    roleAssignment: `${roleMatch[1]}/${roleMatch[2]}`,
  };
}

/**
 * Hardcoded Tailwind palette color pattern.
 * Matches classes like green-300, red-50, blue-600, yellow-200, slate-900, etc.
 * Does NOT match semantic tokens like success, destructive, info, warning, foreground, etc.
 */
const HARDCODED_PALETTE_REGEX =
  /\b(?:red|green|blue|yellow|orange|purple|pink|indigo|teal|cyan|emerald|violet|fuchsia|rose|amber|lime|sky|slate|gray|zinc|neutral|stone)-\d{1,3}\b/;

/** Semantic tokens that ARE allowed */
const SEMANTIC_TOKENS = [
  'success', 'destructive', 'info', 'warning', 'foreground',
  'background', 'primary', 'secondary', 'muted', 'accent',
  'card', 'border', 'ring', 'skeleton', 'admin', 'link', 'error',
];

// Pre-extract data from source
const typeStyles = extractTypeStyles();
const iconStyles = extractIconStyles();
const roleMapping = extractRoleMapping();

describe('Feature: website-ui-ux-fix, Property 3: Toast ARIA role matches toast type', () => {
  // **Validates: Requirements 6.3, 6.4**

  it('error and warning toast types map to role="alert"', () => {
    fc.assert(
      fc.property(alertTypeArb, (toastType) => {
        // Verify the source code maps these types to alert role
        expect(
          roleMapping.alertTypes,
          `Toast type "${toastType}" should be in the isAlertRole condition`
        ).toContain(toastType);

        // Verify the role assignment is alert/status
        expect(
          roleMapping.roleAssignment,
          'isAlertRole should map to alert, else status'
        ).toBe('alert/status');
      }),
      { numRuns: 100 }
    );
  });

  it('success and info toast types map to role="status"', () => {
    fc.assert(
      fc.property(statusTypeArb, (toastType) => {
        // These types should NOT be in the isAlertRole condition
        expect(
          roleMapping.alertTypes,
          `Toast type "${toastType}" should NOT be in the isAlertRole condition`
        ).not.toContain(toastType);
      }),
      { numRuns: 100 }
    );
  });

  it('isAlertRole condition covers exactly error and warning', () => {
    // The alert types extracted from source should be exactly ['error', 'warning']
    expect(roleMapping.alertTypes.sort()).toEqual(['error', 'warning']);
  });

  it('typeStyles for every toast type use only semantic tokens (no hardcoded palette colors)', () => {
    fc.assert(
      fc.property(toastTypeArb, (toastType) => {
        const classes = typeStyles[toastType];
        expect(classes).toBeDefined();

        // Should NOT contain any hardcoded palette color
        const paletteMatch = classes.match(HARDCODED_PALETTE_REGEX);
        expect(
          paletteMatch,
          `typeStyles["${toastType}"] contains hardcoded palette color "${paletteMatch?.[0]}" in: ${classes}`
        ).toBeNull();

        // Each class token should reference a semantic token
        const tokens = classes.split(/\s+/);
        for (const token of tokens) {
          // Extract the color part from classes like "border-success/30", "bg-destructive/5", "text-foreground"
          const colorPart = token
            .replace(/^(?:border|bg|text|ring|shadow)-/, '')
            .replace(/\/\d+$/, '');

          const isSemantic = SEMANTIC_TOKENS.some(
            (st) => colorPart === st || colorPart.startsWith(st + '-')
          );
          expect(
            isSemantic,
            `typeStyles["${toastType}"] class "${token}" (color: "${colorPart}") is not a semantic token`
          ).toBe(true);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('iconStyles for every toast type use only semantic tokens (no hardcoded palette colors)', () => {
    fc.assert(
      fc.property(toastTypeArb, (toastType) => {
        const classes = iconStyles[toastType];
        expect(classes).toBeDefined();

        // Should NOT contain any hardcoded palette color
        const paletteMatch = classes.match(HARDCODED_PALETTE_REGEX);
        expect(
          paletteMatch,
          `iconStyles["${toastType}"] contains hardcoded palette color "${paletteMatch?.[0]}" in: ${classes}`
        ).toBeNull();

        // Each class token should reference a semantic token
        const tokens = classes.split(/\s+/);
        for (const token of tokens) {
          const colorPart = token
            .replace(/^(?:border|bg|text|ring|shadow)-/, '')
            .replace(/\/\d+$/, '');

          const isSemantic = SEMANTIC_TOKENS.some(
            (st) => colorPart === st || colorPart.startsWith(st + '-')
          );
          expect(
            isSemantic,
            `iconStyles["${toastType}"] class "${token}" (color: "${colorPart}") is not a semantic token`
          ).toBe(true);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('every toast type has both typeStyles and iconStyles defined', () => {
    fc.assert(
      fc.property(toastTypeArb, (toastType) => {
        expect(typeStyles[toastType]).toBeDefined();
        expect(iconStyles[toastType]).toBeDefined();
        expect(typeStyles[toastType].length).toBeGreaterThan(0);
        expect(iconStyles[toastType].length).toBeGreaterThan(0);
      }),
      { numRuns: 100 }
    );
  });

  it('ToastContainer splits toasts into assertive and polite aria-live regions', () => {
    // Verify the source has two aria-live regions
    const assertiveRegion = TOAST_SOURCE.match(/aria-live="assertive"/g);
    const politeRegion = TOAST_SOURCE.match(/aria-live="polite"/g);

    expect(assertiveRegion).not.toBeNull();
    expect(politeRegion).not.toBeNull();
    expect(assertiveRegion!.length).toBeGreaterThanOrEqual(1);
    expect(politeRegion!.length).toBeGreaterThanOrEqual(1);

    // Verify error/warning go to assertive, success/info go to polite
    const assertiveFilter = TOAST_SOURCE.match(
      /assertiveToasts\s*=\s*toasts\.filter\(\s*\(t\)\s*=>\s*([^)]+)\)/
    );
    expect(assertiveFilter).not.toBeNull();
    expect(assertiveFilter![1]).toContain("'error'");
    expect(assertiveFilter![1]).toContain("'warning'");

    const politeFilter = TOAST_SOURCE.match(
      /politeToasts\s*=\s*toasts\.filter\(\s*\(t\)\s*=>\s*([^)]+)\)/
    );
    expect(politeFilter).not.toBeNull();
    expect(politeFilter![1]).toContain("'success'");
    expect(politeFilter![1]).toContain("'info'");
  });
});
