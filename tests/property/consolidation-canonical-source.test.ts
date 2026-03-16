/**
 * Property 1: Single Canonical Source
 * Feature: duplicate-deprecated-consolidation, Property 1: Single Canonical Source
 *
 * For any module name in the canonical module map, the symbol should be defined
 * in exactly one file in src/ — the designated canonical module.
 *
 * Validates: Requirements 1.1, 2.1, 3.1, 11.1, 12.1, 16.1, 17.1
 */
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs';
import * as path from 'path';

const SRC_DIR = path.resolve(__dirname, '../../src');

/**
 * Canonical module map: each entry maps a canonical file to the key symbols
 * it should exclusively export.
 */
const CANONICAL_MODULE_MAP: Array<{
  canonicalFile: string;
  symbols: string[];
}> = [
  {
    canonicalFile: 'lib/utils.ts',
    symbols: ['debounce', 'throttle', 'formatFileSize', 'safeJsonParse', 'cn'],
  },
  {
    canonicalFile: 'lib/accessibility-utils.ts',
    symbols: ['trapFocus', 'getFocusableElements', 'getContrastRatio', 'hexToRgb', 'announceToScreenReader', 'KEYS'],
  },
  {
    canonicalFile: 'lib/logger.ts',
    symbols: ['logger'],
  },
  {
    canonicalFile: 'lib/errorMessages.ts',
    symbols: ['getErrorMessageForCode', 'isNetworkError'],
  },
  {
    canonicalFile: 'lib/draftManager.ts',
    symbols: ['DraftManager', 'draftManager'],
  },
  {
    canonicalFile: 'lib/securityConfig.ts',
    symbols: ['CSP_CONFIG', 'generateCSPHeader'],
  },
];

/** Recursively collect all .ts and .tsx files under a directory */
function collectSourceFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules') {
      results.push(...collectSourceFiles(fullPath));
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      results.push(fullPath);
    }
  }
  return results;
}

const allSourceFiles = collectSourceFiles(SRC_DIR);

/**
 * Check if a file defines/exports a given symbol.
 * Looks for: export function X, export const X, export class X, export { X }
 */
function fileExportsSymbol(filePath: string, symbol: string): boolean {
  const content = fs.readFileSync(filePath, 'utf-8');
  const patterns = [
    new RegExp(`export\\s+(?:function|const|let|var|class|enum|interface|type)\\s+${symbol}\\b`),
    new RegExp(`export\\s+\\{[^}]*\\b${symbol}\\b[^}]*\\}`),
    new RegExp(`export\\s+default\\s+${symbol}\\b`),
  ];
  return patterns.some(p => p.test(content));
}

// Build flat list of (canonicalFile, symbol) pairs for the arbitrary
const canonicalEntries = CANONICAL_MODULE_MAP.flatMap(entry =>
  entry.symbols.map(symbol => ({
    canonicalFile: entry.canonicalFile,
    symbol,
  }))
);

const canonicalEntryArb = fc.constantFrom(...canonicalEntries);

describe('Property 1: Single Canonical Source', () => {
  it('each symbol in the canonical module map is exported from exactly its canonical file', () => {
    fc.assert(
      fc.property(canonicalEntryArb, ({ canonicalFile, symbol }) => {
        const canonicalFullPath = path.resolve(SRC_DIR, canonicalFile);

        // The canonical file must export the symbol
        expect(
          fileExportsSymbol(canonicalFullPath, symbol),
          `Canonical file src/${canonicalFile} does not export symbol '${symbol}'`
        ).toBe(true);

        // No other source file should define/export the same symbol
        // (excluding test files, .d.ts files, and re-export shims)
        const otherFiles = allSourceFiles.filter(f => {
          if (f === canonicalFullPath) return false;
          // Allow re-export shims (files that only re-export from canonical)
          const content = fs.readFileSync(f, 'utf-8');
          const lines = content.split('\n').filter(l => l.trim() && !l.trim().startsWith('//') && !l.trim().startsWith('/*') && !l.trim().startsWith('*'));
          const isReExportOnly = lines.every(l =>
            l.trim().startsWith('export') && l.includes('from') || l.trim() === '' || l.trim() === '}'
          );
          if (isReExportOnly) return false;
          return true;
        });

        for (const otherFile of otherFiles) {
          const relativePath = path.relative(SRC_DIR, otherFile);
          // Skip index files that re-export
          if (relativePath.endsWith('index.ts') || relativePath.endsWith('index.tsx')) continue;
          
          const content = fs.readFileSync(otherFile, 'utf-8');
          // Only flag if the file has a standalone export definition (not a re-export from canonical)
          const hasOwnDefinition = [
            new RegExp(`export\\s+(?:function|const|let|var|class|enum)\\s+${symbol}\\b`),
          ].some(p => p.test(content));

          // Check it's not re-exporting from the canonical module
          if (hasOwnDefinition) {
            const reExportsFromCanonical = content.includes(`from '@/lib/`) || content.includes(`from '../lib/`) || content.includes(`from './`);
            // If it defines the symbol AND doesn't re-export from canonical, it's a duplicate
            const isReExport = new RegExp(`export\\s+\\{[^}]*\\b${symbol}\\b[^}]*\\}\\s+from`).test(content);
            if (!isReExport) {
              expect(
                false,
                `Symbol '${symbol}' is also defined in src/${relativePath} (should only be in src/${canonicalFile})`
              ).toBe(true);
            }
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});
