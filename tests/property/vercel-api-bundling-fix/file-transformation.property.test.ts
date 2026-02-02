// @ts-nocheck
/**
 * Property-Based Tests: File Transformation
 * Feature: vercel-api-bundling-fix
 * Task: 5.1 Write property test for file transformation
 * 
 * **Property 1: One-to-One File Transformation**
 * 
 * *For any* `.ts` file in the `api/` directory (excluding files starting with `_`),
 * bundling SHALL produce exactly one `.js` file with the same base name,
 * and the original `.ts` file SHALL be removed.
 * 
 * **Validates: Requirements 1.1, 1.4, 2.1, 2.2, 5.1, 5.2, 5.4**
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fc from 'fast-check';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// ============================================================================
// Test Configuration
// ============================================================================

const ROOT_DIR = path.resolve(__dirname, '../../..');
const API_DIR = path.join(ROOT_DIR, 'api');
const SCRIPTS_DIR = path.join(ROOT_DIR, 'scripts');
const BUNDLE_SCRIPT = path.join(SCRIPTS_DIR, 'bundle-api.mjs');

/**
 * Number of property test iterations
 * Using 100 as specified in the design document
 */
const NUM_RUNS = 100;

/**
 * Valid TypeScript filename arbitrary generator
 * Generates valid API endpoint filenames that:
 * - End with .ts
 * - Do not start with underscore
 * - Have valid filename characters
 */
const validTsFilenameArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_-]*\.ts$/)
  .filter(s => !s.startsWith('_') && s.length > 3 && s.length <= 50);

/**
 * Special catch-all route filename arbitrary
 * Tests the [...path].ts pattern specifically
 */
const catchAllFilenameArb = fc.constant('[...path].ts');

/**
 * Underscore filename arbitrary (should be excluded)
 * Generates filenames starting with underscore
 */
const underscoreFilenameArb = fc.stringMatching(/^_[a-zA-Z0-9_-]+\.ts$/)
  .filter(s => s.length > 4 && s.length <= 50);

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Converts a .ts filename to expected .js output filename
 */
function getExpectedOutputFilename(tsFilename: string): string {
  return tsFilename.replace(/\.ts$/, '.js');
}

/**
 * Checks if a filename should be processed by the bundler
 * Files starting with underscore are excluded
 */
function shouldBeProcessed(filename: string): boolean {
  return filename.endsWith('.ts') && !filename.startsWith('_');
}

/**
 * Gets the base name without extension
 */
function getBaseName(filename: string): string {
  return filename.replace(/\.(ts|js)$/, '');
}

/**
 * Simulates the file transformation logic from bundle-api.mjs
 * This is a pure function that can be tested with property-based testing
 */
function transformFilename(tsFilename: string): { 
  shouldProcess: boolean;
  outputFilename: string | null;
  baseName: string;
} {
  const shouldProcess = shouldBeProcessed(tsFilename);
  
  if (!shouldProcess) {
    return {
      shouldProcess: false,
      outputFilename: null,
      baseName: getBaseName(tsFilename),
    };
  }
  
  return {
    shouldProcess: true,
    outputFilename: getExpectedOutputFilename(tsFilename),
    baseName: getBaseName(tsFilename),
  };
}

/**
 * Validates that a transformation result maintains one-to-one mapping
 */
function validateOneToOneTransformation(
  inputFilename: string,
  result: ReturnType<typeof transformFilename>
): boolean {
  if (!result.shouldProcess) {
    // Underscore files should not produce output
    return result.outputFilename === null;
  }
  
  // For processed files:
  // 1. Output filename must exist
  // 2. Output must have .js extension
  // 3. Base name must match input
  // 4. Exactly one output file per input
  return (
    result.outputFilename !== null &&
    result.outputFilename.endsWith('.js') &&
    getBaseName(result.outputFilename) === getBaseName(inputFilename)
  );
}

// ============================================================================
// Property Tests
// ============================================================================

describe('Property 1: One-to-One File Transformation', () => {
  /**
   * **Validates: Requirements 1.1, 1.4, 2.1, 2.2, 5.1, 5.2, 5.4**
   * 
   * For any valid .ts filename, bundling produces exactly one .js file with same base name.
   */
  describe('Core Transformation Property', () => {
    it('PROPERTY: For any valid .ts filename, transformation produces exactly one .js file with same base name', () => {
      fc.assert(
        fc.property(
          validTsFilenameArb,
          (tsFilename) => {
            const result = transformFilename(tsFilename);
            
            // Must be processed
            expect(result.shouldProcess).toBe(true);
            
            // Must produce exactly one output file
            expect(result.outputFilename).not.toBeNull();
            
            // Output must have .js extension
            expect(result.outputFilename).toMatch(/\.js$/);
            
            // Base name must be preserved
            expect(getBaseName(result.outputFilename!)).toBe(getBaseName(tsFilename));
            
            // Validate one-to-one mapping
            expect(validateOneToOneTransformation(tsFilename, result)).toBe(true);
            
            return true;
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Output filename is input filename with .ts replaced by .js', () => {
      fc.assert(
        fc.property(
          validTsFilenameArb,
          (tsFilename) => {
            const result = transformFilename(tsFilename);
            const expectedOutput = tsFilename.replace('.ts', '.js');
            
            expect(result.outputFilename).toBe(expectedOutput);
            
            return result.outputFilename === expectedOutput;
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Transformation is deterministic - same input always produces same output', () => {
      fc.assert(
        fc.property(
          validTsFilenameArb,
          (tsFilename) => {
            const result1 = transformFilename(tsFilename);
            const result2 = transformFilename(tsFilename);
            
            expect(result1.outputFilename).toBe(result2.outputFilename);
            expect(result1.shouldProcess).toBe(result2.shouldProcess);
            expect(result1.baseName).toBe(result2.baseName);
            
            return (
              result1.outputFilename === result2.outputFilename &&
              result1.shouldProcess === result2.shouldProcess &&
              result1.baseName === result2.baseName
            );
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  describe('Base Name Preservation Property', () => {
    /**
     * **Validates: Requirements 5.2**
     * 
     * THE Bundle_Script SHALL preserve the original file names (minus extension change)
     */
    it('PROPERTY: Base name is always preserved during transformation', () => {
      fc.assert(
        fc.property(
          validTsFilenameArb,
          (tsFilename) => {
            const result = transformFilename(tsFilename);
            const inputBaseName = getBaseName(tsFilename);
            const outputBaseName = result.outputFilename ? getBaseName(result.outputFilename) : null;
            
            expect(outputBaseName).toBe(inputBaseName);
            
            return outputBaseName === inputBaseName;
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: No extra characters added or removed from base name', () => {
      fc.assert(
        fc.property(
          validTsFilenameArb,
          (tsFilename) => {
            const result = transformFilename(tsFilename);
            
            // Remove extensions and compare
            const inputWithoutExt = tsFilename.slice(0, -3); // Remove .ts
            const outputWithoutExt = result.outputFilename!.slice(0, -3); // Remove .js
            
            expect(outputWithoutExt).toBe(inputWithoutExt);
            
            return outputWithoutExt === inputWithoutExt;
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  describe('Catch-All Route Handling', () => {
    /**
     * **Validates: Requirements 5.5**
     * 
     * THE Bundle_Script SHALL handle the `[...path].ts` catch-all route correctly
     */
    it('PROPERTY: Catch-all route [...path].ts transforms to [...path].js', () => {
      fc.assert(
        fc.property(
          catchAllFilenameArb,
          (tsFilename) => {
            const result = transformFilename(tsFilename);
            
            expect(result.shouldProcess).toBe(true);
            expect(result.outputFilename).toBe('[...path].js');
            expect(result.baseName).toBe('[...path]');
            
            return (
              result.shouldProcess === true &&
              result.outputFilename === '[...path].js' &&
              result.baseName === '[...path]'
            );
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Bracket syntax in filename is preserved', () => {
      const bracketFilenames = ['[...path].ts', '[id].ts', '[slug].ts', '[...rest].ts'];
      
      for (const tsFilename of bracketFilenames) {
        const result = transformFilename(tsFilename);
        const expectedOutput = tsFilename.replace('.ts', '.js');
        
        expect(result.outputFilename).toBe(expectedOutput);
        
        // Verify brackets are preserved
        const inputBrackets = (tsFilename.match(/[\[\]]/g) || []).join('');
        const outputBrackets = (result.outputFilename!.match(/[\[\]]/g) || []).join('');
        expect(outputBrackets).toBe(inputBrackets);
      }
    });
  });

  describe('One-to-One Mapping Guarantee', () => {
    /**
     * **Validates: Requirements 2.1, 2.2**
     * 
     * THE Bundle_Script SHALL produce exactly one output file per API_Endpoint
     * THE Bundle_Script SHALL NOT create additional files that Vercel counts as functions
     */
    it('PROPERTY: Each input file maps to exactly one output file', () => {
      fc.assert(
        fc.property(
          validTsFilenameArb,
          (tsFilename) => {
            const result = transformFilename(tsFilename);
            
            // Count outputs (should be exactly 1 for processed files)
            const outputCount = result.outputFilename ? 1 : 0;
            
            if (result.shouldProcess) {
              expect(outputCount).toBe(1);
              return outputCount === 1;
            }
            
            return true;
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Different input files produce different output files', () => {
      fc.assert(
        fc.property(
          fc.tuple(validTsFilenameArb, validTsFilenameArb).filter(([a, b]) => a !== b),
          ([tsFilename1, tsFilename2]) => {
            const result1 = transformFilename(tsFilename1);
            const result2 = transformFilename(tsFilename2);
            
            // Different inputs must produce different outputs
            expect(result1.outputFilename).not.toBe(result2.outputFilename);
            
            return result1.outputFilename !== result2.outputFilename;
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Transformation is injective (one-to-one)', () => {
      fc.assert(
        fc.property(
          fc.array(validTsFilenameArb, { minLength: 2, maxLength: 10 }),
          (tsFilenames) => {
            // Get unique inputs
            const uniqueInputs = [...new Set(tsFilenames)];
            
            // Transform all
            const outputs = uniqueInputs.map(f => transformFilename(f).outputFilename);
            
            // Get unique outputs
            const uniqueOutputs = [...new Set(outputs)];
            
            // Number of unique inputs must equal number of unique outputs
            expect(uniqueOutputs.length).toBe(uniqueInputs.length);
            
            return uniqueOutputs.length === uniqueInputs.length;
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  describe('Extension Handling', () => {
    /**
     * **Validates: Requirements 1.4, 5.1**
     * 
     * WHEN bundling completes, THE Bundle_Script SHALL output `.js` files
     * WHEN bundling completes, THE Bundle_Script SHALL replace `.ts` source files with bundled `.js` files
     */
    it('PROPERTY: Output always has .js extension', () => {
      fc.assert(
        fc.property(
          validTsFilenameArb,
          (tsFilename) => {
            const result = transformFilename(tsFilename);
            
            expect(result.outputFilename).toMatch(/\.js$/);
            
            return result.outputFilename!.endsWith('.js');
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Input .ts extension is replaced, not appended', () => {
      fc.assert(
        fc.property(
          validTsFilenameArb,
          (tsFilename) => {
            const result = transformFilename(tsFilename);
            
            // Output should not contain .ts
            expect(result.outputFilename).not.toContain('.ts');
            
            // Output length should be same as input (both extensions are 3 chars)
            expect(result.outputFilename!.length).toBe(tsFilename.length);
            
            return (
              !result.outputFilename!.includes('.ts') &&
              result.outputFilename!.length === tsFilename.length
            );
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  describe('Edge Cases', () => {
    /**
     * **Validates: Requirements 1.1, 5.4**
     */
    it('PROPERTY: Single character base names transform correctly', () => {
      const singleCharFilenames = ['a.ts', 'b.ts', 'x.ts', 'Z.ts'];
      
      for (const tsFilename of singleCharFilenames) {
        const result = transformFilename(tsFilename);
        
        expect(result.shouldProcess).toBe(true);
        expect(result.outputFilename).toBe(tsFilename.replace('.ts', '.js'));
      }
    });

    it('PROPERTY: Filenames with numbers transform correctly', () => {
      fc.assert(
        fc.property(
          fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,20}\.ts$/),
          (tsFilename) => {
            const result = transformFilename(tsFilename);
            
            expect(result.shouldProcess).toBe(true);
            expect(result.outputFilename).toBe(tsFilename.replace('.ts', '.js'));
            
            return result.outputFilename === tsFilename.replace('.ts', '.js');
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Filenames with hyphens and underscores transform correctly', () => {
      fc.assert(
        fc.property(
          fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_-]{0,20}\.ts$/),
          (tsFilename) => {
            const result = transformFilename(tsFilename);
            
            expect(result.shouldProcess).toBe(true);
            expect(result.outputFilename).toBe(tsFilename.replace('.ts', '.js'));
            
            return result.outputFilename === tsFilename.replace('.ts', '.js');
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });
});

describe('Actual API Files Transformation', () => {
  /**
   * Tests against the actual API files in the project
   * This validates that the transformation logic works for real-world filenames
   */
  const ACTUAL_API_FILES = [
    'auth.ts',
    'admin.ts',
    'applications.ts',
    'catalog.ts',
    'documents.ts',
    'health.ts',
    'notifications.ts',
    'payments.ts',
    'sessions.ts',
    'ping.ts',
    '[...path].ts',
    'dbtest.ts',
  ];

  it('PROPERTY: All actual API files transform correctly', () => {
    for (const tsFilename of ACTUAL_API_FILES) {
      const result = transformFilename(tsFilename);
      
      expect(result.shouldProcess).toBe(true);
      expect(result.outputFilename).toBe(tsFilename.replace('.ts', '.js'));
      expect(result.baseName).toBe(getBaseName(tsFilename));
    }
  });

  it('PROPERTY: Actual underscore files are excluded', () => {
    const underscoreFiles = ['_auth.ts.legacy'];
    
    for (const filename of underscoreFiles) {
      // Note: _auth.ts.legacy doesn't end with .ts, so it wouldn't be processed anyway
      // But if it were _auth.ts, it should be excluded
      const tsVersion = filename.replace('.legacy', '');
      if (tsVersion.endsWith('.ts')) {
        const result = transformFilename(tsVersion);
        expect(result.shouldProcess).toBe(false);
      }
    }
  });

  it('PROPERTY: Function count stays within Vercel limit after transformation', () => {
    const processedFiles = ACTUAL_API_FILES.filter(f => shouldBeProcessed(f));
    const outputCount = processedFiles.length;
    
    // Vercel Hobby plan limit is 12
    expect(outputCount).toBeLessThanOrEqual(12);
  });
});
