/**
 * Property 2: Canonical Module Export Completeness
 * Feature: duplicate-deprecated-consolidation, Property 2: Canonical Module Export Completeness
 *
 * For any canonical module and its expected export list (derived from the union of all
 * deprecated sources), every expected symbol should be present as a named export.
 *
 * Validates: Requirements 1.2, 2.2, 12.2
 */
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs';
import * as path from 'path';

const SRC_DIR = path.resolve(__dirname, '../../src');

/**
 * Map of canonical modules to the symbols they must export
 * (union of all deprecated sources that were merged in).
 */
const EXPECTED_EXPORTS: Array<{
  canonicalFile: string;
  expectedSymbols: string[];
}> = [
  {
    canonicalFile: 'lib/utils.ts',
    expectedSymbols: ['cn', 'debounce', 'throttle', 'formatFileSize', 'safeJsonParse'],
  },
  {
    canonicalFile: 'lib/accessibility-utils.ts',
    expectedSymbols: [
      'trapFocus', 'getFocusableElements', 'focusFirstElement', 'focusLastElement',
      'isFocusable', 'announceToScreenReader', 'skipToMainContent',
      'KEYS', 'handleEnterKey', 'handleSpaceKey', 'handleActivationKeys',
      'handleEscapeKey', 'handleArrowNavigation', 'handleHorizontalArrowNavigation',
      'createSearchKeyHandler', 'createFormSubmitKeyHandler',
      'getContrastRatio', 'hexToRgb', 'meetsWcagAA', 'meetsWcagAAA',
      'getAccessibilityLevel', 'suggestAccessibleColor', 'validateColorPalette',
      'logContrastValidation', 'getRelativeLuminance',
    ],
  },
  {
    canonicalFile: 'lib/errorMessages.ts',
    expectedSymbols: ['getErrorMessageForCode', 'isNetworkError', 'ERROR_CODE_MESSAGES'],
  },
  {
    canonicalFile: 'lib/logger.ts',
    expectedSymbols: ['logger'],
  },
];

// Build flat list of (canonicalFile, symbol) pairs
const exportEntries = EXPECTED_EXPORTS.flatMap(entry =>
  entry.expectedSymbols.map(symbol => ({
    canonicalFile: entry.canonicalFile,
    symbol,
  }))
);

const exportEntryArb = fc.constantFrom(...exportEntries);

/**
 * Check if a file exports a given symbol (named export).
 */
function fileExportsSymbol(filePath: string, symbol: string): boolean {
  if (!fs.existsSync(filePath)) return false;
  const content = fs.readFileSync(filePath, 'utf-8');
  const patterns = [
    new RegExp(`export\\s+(?:function|const|let|var|class|enum|interface|type)\\s+${symbol}\\b`),
    new RegExp(`export\\s+\\{[^}]*\\b${symbol}\\b[^}]*\\}`),
    new RegExp(`export\\s+default\\s+${symbol}\\b`),
  ];
  return patterns.some(p => p.test(content));
}

describe('Property 2: Canonical Module Export Completeness', () => {
  it('every expected symbol is exported from its canonical module', () => {
    fc.assert(
      fc.property(exportEntryArb, ({ canonicalFile, symbol }) => {
        const fullPath = path.resolve(SRC_DIR, canonicalFile);
        expect(
          fileExportsSymbol(fullPath, symbol),
          `Canonical module src/${canonicalFile} is missing expected export '${symbol}'`
        ).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});
