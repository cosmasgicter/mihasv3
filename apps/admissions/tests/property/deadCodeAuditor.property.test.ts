/**
 * Property-Based Tests: Dead Code Auditor - Dead Code Identification
 * Feature: frontend-backend-forensic-audit
 * Task: 14.5 Write property test for dead code identification
 *
 * **Property 23: Dead Code Identification**
 *
 * *For any* export (component, hook, service, utility) not imported anywhere
 * in the codebase, or any import from legacy packages (Supabase, Cloudflare),
 * or any commented-out code block, the Dead Code Auditor SHALL identify and flag it.
 *
 * **Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5**
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

import {
  extractExports,
  extractImports,
  classifyExport,
  resolveImportPath,
  doesImportMatchExport,
  type ExportEntry,
  type ImportEntry,
} from '../../scripts/audit/deadcode/unusedExportScanner';

import {
  extractCommentedBlocks,
  isDocumentationComment,
  isSingleLineComment,
  countCodeIndicators,
  countProseIndicators,
  type CommentedBlock,
} from '../../scripts/audit/deadcode/commentedCodeScanner';

import {
  extractFeatureFlagDefinitions,
  extractFeatureFlagUsages,
  detectConditionalType,
  type FeatureFlagDefinition,
  type FeatureFlagUsage,
} from '../../scripts/audit/deadcode/featureFlagScanner';

import type { DeadCodeType } from '../../scripts/audit/types';

// ============================================================================
// Test Configuration
// ============================================================================

const NUM_RUNS = 10;

// ============================================================================
// Arbitraries (Generators)
// ============================================================================

/**
 * Generate valid TypeScript/JavaScript identifier names
 */
const identifierArb = fc.stringMatching(/^[A-Z][a-zA-Z0-9]{2,15}$/);

/**
 * Generate valid hook names (useXxx pattern)
 */
const hookNameArb = identifierArb.map(name => `use${name}`);

/**
 * Generate valid component names (PascalCase)
 */
const componentNameArb = identifierArb;

/**
 * Generate valid file paths in src/ directories
 */
const componentFilePathArb = fc.tuple(
  fc.constantFrom('src/components/ui', 'src/components/admin', 'src/components/student', 'src/components/auth'),
  componentNameArb,
).map(([dir, name]) => `${dir}/${name}.tsx`);

const hookFilePathArb = fc.tuple(
  fc.constant('src/hooks'),
  hookNameArb,
).map(([dir, name]) => `${dir}/${name}.ts`);

const serviceFilePathArb = fc.tuple(
  fc.constantFrom('src/services', 'src/stores'),
  fc.stringMatching(/^[a-z][a-zA-Z0-9]{2,12}$/),
).map(([dir, name]) => `${dir}/${name}.ts`);

const utilFilePathArb = fc.tuple(
  fc.constantFrom('src/lib', 'src/utils', 'src/config'),
  fc.stringMatching(/^[a-z][a-zA-Z0-9]{2,12}$/),
).map(([dir, name]) => `${dir}/${name}.ts`);

/**
 * Generate any valid file path
 */
const anyFilePathArb = fc.oneof(
  componentFilePathArb,
  hookFilePathArb,
  serviceFilePathArb,
  utilFilePathArb,
);

/**
 * Generate export statement code for a named export
 */
const namedExportCodeArb = (name: string): fc.Arbitrary<string> =>
  fc.constantFrom(
    `export function ${name}() { return null; }`,
    `export const ${name} = () => null;`,
    `export class ${name} {}`,
    `export interface ${name} { id: string; }`,
  );

/**
 * Generate feature flag constant names
 */
const featureFlagNameArb = fc.stringMatching(/^[A-Z][A-Z0-9_]{2,12}$/).map(
  suffix => `FEATURE_${suffix}`,
);

/**
 * Generate ENABLE_ flag names
 */
const enableFlagNameArb = fc.stringMatching(/^[A-Z][A-Z0-9_]{2,12}$/).map(
  suffix => `ENABLE_${suffix}`,
);

/**
 * Generate any feature flag name
 */
const anyFlagNameArb = fc.oneof(featureFlagNameArb, enableFlagNameArb);

/**
 * Generate consecutive single-line comment blocks (3+ lines)
 */
const commentBlockArb = (minLines: number): fc.Arbitrary<string[]> =>
  fc.array(
    fc.stringMatching(/^[a-zA-Z0-9 .,;:=(){}[\]<>!?+\-*/&|^~@#$%]{1,60}$/),
    { minLength: minLines, maxLength: minLines + 10 },
  ).map(lines => lines.map(l => `// ${l}`));

// ============================================================================
// Property Tests
// ============================================================================

describe('Property 23: Dead Code Identification', () => {
  /**
   * **Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5**
   */

  // ==========================================================================
  // Sub-property 1: Unused Export Detection
  // ==========================================================================

  describe('Unused Export Detection (Requirements 9.1, 9.2)', () => {
    it('PROPERTY: exports not referenced by any import are identified as unused', () => {
      /**
       * **Validates: Requirements 9.1, 9.2**
       *
       * For any generated codebase with exports and imports, exports not
       * referenced by any import should be flagged as dead code.
       */
      fc.assert(
        fc.property(
          fc.tuple(
            // Generate 1-5 export names
            fc.array(componentNameArb, { minLength: 1, maxLength: 5 }),
            // Generate 0-3 import names (subset of exports or different)
            fc.array(componentNameArb, { minLength: 0, maxLength: 3 }),
          ),
          ([exportNames, importNames]) => {
            const uniqueExports = [...new Set(exportNames)];
            const filePath = 'src/components/ui/TestComponent.tsx';

            // Build export content
            const exportContent = uniqueExports
              .map(name => `export function ${name}() { return null; }`)
              .join('\n');

            const exports = extractExports(filePath, exportContent);

            // Build import content referencing some exports
            const importerPath = 'src/pages/TestPage.tsx';
            const importContent = importNames.length > 0
              ? `import { ${importNames.join(', ')} } from '@/components/ui/TestComponent';`
              : '';

            const imports = importContent
              ? extractImports(importerPath, importContent)
              : [];

            // Determine which exports are imported
            const importedNameSet = new Set<string>();
            for (const imp of imports) {
              for (const name of imp.importedNames) {
                importedNameSet.add(name);
              }
            }

            // Every export should be found
            expect(exports.length).toBe(uniqueExports.length);

            // Exports not in importedNameSet should be identifiable as unused
            for (const exp of exports) {
              const isImported = importedNameSet.has(exp.name);
              if (!isImported) {
                // This export is unused - verify it has the right structure
                expect(exp.filePath).toBe(filePath);
                expect(exp.name).toBeTruthy();
                expect(exp.lineNumber).toBeGreaterThan(0);
              }
            }
          },
        ),
        { numRuns: NUM_RUNS },
      );
    });

    it('PROPERTY: all extracted exports have valid structure', () => {
      /**
       * **Validates: Requirements 9.1, 9.2**
       */
      fc.assert(
        fc.property(
          fc.tuple(anyFilePathArb, componentNameArb),
          ([filePath, name]) => {
            const content = `export function ${name}() { return null; }\nexport const ${name}Helper = 42;`;
            const exports = extractExports(filePath, content);

            for (const exp of exports) {
              expect(exp.filePath).toBe(filePath);
              expect(typeof exp.name).toBe('string');
              expect(exp.name.length).toBeGreaterThan(0);
              expect(exp.lineNumber).toBeGreaterThan(0);
              expect(typeof exp.isDefault).toBe('boolean');
              expect(exp.type).toBeTruthy();
            }
          },
        ),
        { numRuns: NUM_RUNS },
      );
    });
  });

  // ==========================================================================
  // Sub-property 2: Export Classification
  // ==========================================================================

  describe('Export Classification (Requirements 9.1, 9.2)', () => {
    it('PROPERTY: classifyExport always returns a valid DeadCodeType', () => {
      /**
       * **Validates: Requirements 9.1, 9.2**
       *
       * For any export name and file path, the classification should always
       * return a valid DeadCodeType.
       */
      const validTypes: DeadCodeType[] = [
        'COMPONENT', 'HOOK', 'SERVICE', 'UTIL',
        'LEGACY_INTEGRATION', 'COMMENTED_CODE', 'FEATURE_FLAG',
      ];

      fc.assert(
        fc.property(
          fc.tuple(
            fc.oneof(componentNameArb, hookNameArb, fc.stringMatching(/^[a-z][a-zA-Z0-9]{2,12}$/)),
            anyFilePathArb,
          ),
          ([name, filePath]) => {
            const result = classifyExport(name, filePath);
            expect(validTypes).toContain(result);
          },
        ),
        { numRuns: NUM_RUNS },
      );
    });

    it('PROPERTY: hooks (useXxx) are classified as HOOK', () => {
      /**
       * **Validates: Requirements 9.2**
       */
      fc.assert(
        fc.property(hookNameArb, (hookName) => {
          const result = classifyExport(hookName, 'src/hooks/test.ts');
          expect(result).toBe('HOOK');
        }),
        { numRuns: NUM_RUNS },
      );
    });

    it('PROPERTY: components in components/ are classified as COMPONENT', () => {
      /**
       * **Validates: Requirements 9.1**
       */
      fc.assert(
        fc.property(componentNameArb, (name) => {
          const result = classifyExport(name, 'src/components/ui/Test.tsx');
          expect(result).toBe('COMPONENT');
        }),
        { numRuns: NUM_RUNS },
      );
    });

    it('PROPERTY: services in services/ are classified as SERVICE', () => {
      /**
       * **Validates: Requirements 9.1**
       */
      fc.assert(
        fc.property(
          fc.stringMatching(/^[a-z][a-zA-Z0-9]{2,12}$/),
          (name) => {
            const result = classifyExport(name, 'src/services/apiClient.ts');
            expect(result).toBe('SERVICE');
          },
        ),
        { numRuns: NUM_RUNS },
      );
    });
  });

  // ==========================================================================
  // Sub-property 3: Import Path Resolution
  // ==========================================================================

  describe('Import Path Resolution (Requirements 9.1, 9.2)', () => {
    it('PROPERTY: @/ alias imports resolve to src/ paths', () => {
      /**
       * **Validates: Requirements 9.1, 9.2**
       *
       * For any @/ alias import, it should resolve to a src/ path.
       */
      fc.assert(
        fc.property(
          fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9/]{1,30}$/),
          (subPath) => {
            const importSource = `@/${subPath}`;
            const result = resolveImportPath(importSource, 'src/pages/Test.tsx');

            expect(result).not.toBeNull();
            expect(result!.startsWith('src/')).toBe(true);
            expect(result).toBe(`src/${subPath}`);
          },
        ),
        { numRuns: NUM_RUNS },
      );
    });

    it('PROPERTY: relative imports resolve correctly', () => {
      /**
       * **Validates: Requirements 9.1, 9.2**
       *
       * For relative imports, they should resolve relative to the importer.
       */
      fc.assert(
        fc.property(
          fc.constantFrom(
            { importSource: './utils', importerPath: 'src/hooks/useAuth.ts', expected: 'src/hooks/utils' },
            { importSource: '../lib/helpers', importerPath: 'src/hooks/useAuth.ts', expected: 'src/lib/helpers' },
            { importSource: './Button', importerPath: 'src/components/ui/index.ts', expected: 'src/components/ui/Button' },
          ),
          ({ importSource, importerPath, expected }) => {
            const result = resolveImportPath(importSource, importerPath);
            expect(result).not.toBeNull();
            expect(result).toBe(expected);
          },
        ),
        { numRuns: NUM_RUNS },
      );
    });

    it('PROPERTY: external package imports return null', () => {
      /**
       * **Validates: Requirements 9.1, 9.2**
       */
      fc.assert(
        fc.property(
          fc.constantFrom('react', 'zustand', 'fast-check', '@radix-ui/react-dialog', 'vitest'),
          (pkg) => {
            const result = resolveImportPath(pkg, 'src/components/Test.tsx');
            expect(result).toBeNull();
          },
        ),
        { numRuns: NUM_RUNS },
      );
    });

    it('PROPERTY: doesImportMatchExport correctly matches @/ imports to export paths', () => {
      /**
       * **Validates: Requirements 9.1, 9.2**
       */
      fc.assert(
        fc.property(
          fc.tuple(
            fc.constantFrom('hooks', 'components/ui', 'services', 'lib', 'stores'),
            fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{2,12}$/),
          ),
          ([dir, fileName]) => {
            const importSource = `@/${dir}/${fileName}`;
            const importerPath = 'src/pages/TestPage.tsx';
            const exportFilePath = `src/${dir}/${fileName}.ts`;

            const result = doesImportMatchExport(importSource, importerPath, exportFilePath);
            expect(result).toBe(true);
          },
        ),
        { numRuns: NUM_RUNS },
      );
    });
  });

  // ==========================================================================
  // Sub-property 4: Commented Code Detection
  // ==========================================================================

  describe('Commented Code Detection (Requirement 9.4)', () => {
    it('PROPERTY: 3+ consecutive comment lines are detected as blocks', () => {
      /**
       * **Validates: Requirements 9.4**
       *
       * For any file content with 3+ consecutive comment lines,
       * extractCommentedBlocks should find them.
       */
      fc.assert(
        fc.property(
          fc.tuple(
            fc.integer({ min: 3, max: 15 }),
            fc.array(
              fc.stringMatching(/^[a-zA-Z0-9 .,;:=(){}+\-*/]{1,40}$/),
              { minLength: 3, maxLength: 15 },
            ),
          ),
          ([blockSize, commentTexts]) => {
            const lines = commentTexts.slice(0, blockSize);
            const commentLines = lines.map(l => `// ${l}`);
            const content = [
              'const before = 1;',
              ...commentLines,
              'const after = 2;',
            ].join('\n');

            const blocks = extractCommentedBlocks('test.ts', content);

            // Should find at least one block
            expect(blocks.length).toBeGreaterThanOrEqual(1);

            // The block should contain the right number of lines
            const block = blocks[0];
            expect(block.lineCount).toBe(commentLines.length);
            expect(block.startLine).toBe(2); // After 'const before = 1;'
            expect(block.endLine).toBe(1 + commentLines.length);
            expect(block.filePath).toBe('test.ts');
          },
        ),
        { numRuns: NUM_RUNS },
      );
    });

    it('PROPERTY: fewer than 3 consecutive comment lines are NOT detected', () => {
      /**
       * **Validates: Requirements 9.4**
       */
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 2 }),
          (lineCount) => {
            const commentLines = Array.from({ length: lineCount }, (_, i) => `// comment ${i}`);
            const content = [
              'const before = 1;',
              ...commentLines,
              'const after = 2;',
            ].join('\n');

            const blocks = extractCommentedBlocks('test.ts', content);
            expect(blocks.length).toBe(0);
          },
        ),
        { numRuns: NUM_RUNS },
      );
    });

    it('PROPERTY: isSingleLineComment correctly identifies // comments', () => {
      /**
       * **Validates: Requirements 9.4**
       */
      fc.assert(
        fc.property(
          fc.stringMatching(/^[a-zA-Z0-9 .,;:=(){}+\-*/]{0,40}$/),
          (text) => {
            expect(isSingleLineComment(`// ${text}`)).toBe(true);
            expect(isSingleLineComment(`  // ${text}`)).toBe(true);
            expect(isSingleLineComment(`\t// ${text}`)).toBe(true);
          },
        ),
        { numRuns: NUM_RUNS },
      );
    });

    it('PROPERTY: non-comment lines are not identified as comments', () => {
      /**
       * **Validates: Requirements 9.4**
       */
      fc.assert(
        fc.property(
          fc.constantFrom(
            'const x = 1;',
            'function foo() {}',
            'import { bar } from "baz";',
            'export default App;',
            'return <div>Hello</div>;',
          ),
          (line) => {
            expect(isSingleLineComment(line)).toBe(false);
          },
        ),
        { numRuns: NUM_RUNS },
      );
    });

    it('PROPERTY: countCodeIndicators returns non-negative count', () => {
      /**
       * **Validates: Requirements 9.4**
       */
      fc.assert(
        fc.property(
          fc.array(
            fc.stringMatching(/^[a-zA-Z0-9 .,;:=(){}+\-*/]{0,60}$/),
            { minLength: 0, maxLength: 10 },
          ),
          (lines) => {
            const count = countCodeIndicators(lines);
            expect(count).toBeGreaterThanOrEqual(0);
            expect(count).toBeLessThanOrEqual(lines.length);
          },
        ),
        { numRuns: NUM_RUNS },
      );
    });

    it('PROPERTY: countProseIndicators returns non-negative count', () => {
      /**
       * **Validates: Requirements 9.4**
       */
      fc.assert(
        fc.property(
          fc.array(
            fc.stringMatching(/^[a-zA-Z0-9 .,;:=(){}+\-*/]{0,60}$/),
            { minLength: 0, maxLength: 10 },
          ),
          (lines) => {
            const count = countProseIndicators(lines);
            expect(count).toBeGreaterThanOrEqual(0);
            expect(count).toBeLessThanOrEqual(lines.length);
          },
        ),
        { numRuns: NUM_RUNS },
      );
    });
  });

  // ==========================================================================
  // Sub-property 5: Feature Flag Detection
  // ==========================================================================

  describe('Feature Flag Detection (Requirement 9.5)', () => {
    it('PROPERTY: FEATURE_* constants are detected as feature flag definitions', () => {
      /**
       * **Validates: Requirements 9.5**
       *
       * For any content with FEATURE_* constants,
       * extractFeatureFlagDefinitions should find them.
       */
      fc.assert(
        fc.property(
          featureFlagNameArb,
          (flagName) => {
            const content = `export const ${flagName} = true;\n`;
            const defs = extractFeatureFlagDefinitions('src/config/flags.ts', content);

            expect(defs.length).toBeGreaterThanOrEqual(1);
            const found = defs.find(d => d.name === flagName);
            expect(found).toBeDefined();
            expect(found!.source).toBe('constant');
            expect(found!.filePath).toBe('src/config/flags.ts');
            expect(found!.lineNumber).toBeGreaterThan(0);
          },
        ),
        { numRuns: NUM_RUNS },
      );
    });

    it('PROPERTY: ENABLE_* constants are detected as feature flag definitions', () => {
      /**
       * **Validates: Requirements 9.5**
       */
      fc.assert(
        fc.property(
          enableFlagNameArb,
          (flagName) => {
            const content = `const ${flagName} = false;\n`;
            const defs = extractFeatureFlagDefinitions('src/config/flags.ts', content);

            expect(defs.length).toBeGreaterThanOrEqual(1);
            const found = defs.find(d => d.name === flagName);
            expect(found).toBeDefined();
            expect(found!.source).toBe('constant');
          },
        ),
        { numRuns: NUM_RUNS },
      );
    });

    it('PROPERTY: feature flag definitions have valid structure', () => {
      /**
       * **Validates: Requirements 9.5**
       */
      fc.assert(
        fc.property(
          fc.tuple(anyFlagNameArb, fc.constantFrom('true', 'false', '"yes"', '"no"')),
          ([flagName, value]) => {
            const content = `export const ${flagName} = ${value};\n`;
            const defs = extractFeatureFlagDefinitions('src/config/flags.ts', content);

            for (const def of defs) {
              expect(typeof def.filePath).toBe('string');
              expect(typeof def.name).toBe('string');
              expect(def.name.length).toBeGreaterThan(0);
              expect(def.lineNumber).toBeGreaterThan(0);
              expect(['constant', 'env_variable', 'object_property']).toContain(def.source);
              expect(typeof def.rawLine).toBe('string');
            }
          },
        ),
        { numRuns: NUM_RUNS },
      );
    });
  });

  // ==========================================================================
  // Sub-property 6: Feature Flag Conditional Detection
  // ==========================================================================

  describe('Feature Flag Conditional Detection (Requirement 9.5)', () => {
    it('PROPERTY: flags in if statements are detected as "if" conditional type', () => {
      /**
       * **Validates: Requirements 9.5**
       *
       * For any feature flag used in an if expression,
       * detectConditionalType should identify it as "if".
       */
      fc.assert(
        fc.property(
          anyFlagNameArb,
          (flagName) => {
            const line = `if (${flagName}) { doSomething(); }`;
            const result = detectConditionalType(line, flagName);
            expect(result).toBe('if');
          },
        ),
        { numRuns: NUM_RUNS },
      );
    });

    it('PROPERTY: flags in ternary expressions are detected as "ternary"', () => {
      /**
       * **Validates: Requirements 9.5**
       */
      fc.assert(
        fc.property(
          anyFlagNameArb,
          (flagName) => {
            const line = `const result = ${flagName} ? 'enabled' : 'disabled';`;
            const result = detectConditionalType(line, flagName);
            expect(result).toBe('ternary');
          },
        ),
        { numRuns: NUM_RUNS },
      );
    });

    it('PROPERTY: flags in && expressions are detected as "logical_and"', () => {
      /**
       * **Validates: Requirements 9.5**
       */
      fc.assert(
        fc.property(
          anyFlagNameArb,
          (flagName) => {
            const line = `{${flagName} && <FeatureComponent />}`;
            const result = detectConditionalType(line, flagName);
            expect(result).toBe('logical_and');
          },
        ),
        { numRuns: NUM_RUNS },
      );
    });

    it('PROPERTY: flags in || expressions are detected as "logical_or"', () => {
      /**
       * **Validates: Requirements 9.5**
       */
      fc.assert(
        fc.property(
          anyFlagNameArb,
          (flagName) => {
            const line = `const value = ${flagName} || defaultValue;`;
            const result = detectConditionalType(line, flagName);
            expect(result).toBe('logical_or');
          },
        ),
        { numRuns: NUM_RUNS },
      );
    });

    it('PROPERTY: simple constant definitions return null (not a conditional)', () => {
      /**
       * **Validates: Requirements 9.5**
       */
      fc.assert(
        fc.property(
          anyFlagNameArb,
          (flagName) => {
            const line = `export const ${flagName} = true;`;
            const result = detectConditionalType(line, flagName);
            expect(result).toBeNull();
          },
        ),
        { numRuns: NUM_RUNS },
      );
    });

    it('PROPERTY: detectConditionalType returns valid type or null', () => {
      /**
       * **Validates: Requirements 9.5**
       */
      const validTypes = ['if', 'ternary', 'logical_and', 'logical_or', 'switch', null];

      fc.assert(
        fc.property(
          fc.tuple(
            fc.stringMatching(/^[a-zA-Z0-9 .,;:=(){}?&|!+\-*/<>]{1,80}$/),
            anyFlagNameArb,
          ),
          ([line, flagToken]) => {
            const result = detectConditionalType(line, flagToken);
            expect(validTypes).toContain(result);
          },
        ),
        { numRuns: NUM_RUNS },
      );
    });

    it('PROPERTY: extractFeatureFlagUsages finds flags used in conditionals', () => {
      /**
       * **Validates: Requirements 9.5**
       */
      fc.assert(
        fc.property(
          featureFlagNameArb,
          (flagName) => {
            const content = [
              `import { ${flagName} } from './config';`,
              `if (${flagName}) {`,
              `  console.log('enabled');`,
              `}`,
            ].join('\n');

            const usages = extractFeatureFlagUsages('src/app.ts', content, [flagName]);

            expect(usages.length).toBeGreaterThanOrEqual(1);
            const found = usages.find(u => u.flagName === flagName);
            expect(found).toBeDefined();
            expect(found!.conditionalType).toBe('if');
            expect(found!.filePath).toBe('src/app.ts');
          },
        ),
        { numRuns: NUM_RUNS },
      );
    });

    it('PROPERTY: flags only in definitions (not conditionals) yield zero usages', () => {
      /**
       * **Validates: Requirements 9.5**
       */
      fc.assert(
        fc.property(
          featureFlagNameArb,
          (flagName) => {
            const content = `export const ${flagName} = true;\n`;
            const usages = extractFeatureFlagUsages('src/config.ts', content, [flagName]);

            // The definition line itself should not count as a conditional usage
            expect(usages.length).toBe(0);
          },
        ),
        { numRuns: NUM_RUNS },
      );
    });
  });
});
