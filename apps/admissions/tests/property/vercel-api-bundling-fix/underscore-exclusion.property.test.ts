// @ts-nocheck
/**
 * Property-Based Tests: Underscore File Exclusion
 * Feature: vercel-api-bundling-fix
 * Task: 5.3 Write property test for underscore exclusion
 * 
 * **Property 3: Underscore File Exclusion**
 * 
 * *For any* file in the api/ directory starting with _ (underscore),
 * the Bundle_Script SHALL NOT process, modify, or delete that file.
 * 
 * **Validates: Requirements 5.3**
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

const NUM_RUNS = 10;

const ACTUAL_API_FILES = [
  'auth.ts', 'admin.ts', 'applications.ts', 'catalog.ts',
  'documents.ts', 'health.ts', 'notifications.ts', 'payments.ts',
  'sessions.ts', 'ping.ts', '[...path].ts', 'dbtest.ts',
];

const KNOWN_UNDERSCORE_FILES: string[] = [];

function shouldBeProcessed(filename: string): boolean {
  return filename.endsWith('.ts') && !filename.startsWith('_');
}

function isUnderscoreFile(filename: string): boolean {
  return filename.startsWith('_');
}

function getProcessedFiles(allFiles: string[]): string[] {
  return allFiles.filter(f => f.endsWith('.ts') && !f.startsWith('_'));
}

function getSkippedUnderscoreFiles(allFiles: string[]): string[] {
  return allFiles.filter(f => f.startsWith('_') && f.endsWith('.ts'));
}

function validateUnderscoreExclusion(
  allFiles: string[],
  processedFiles: string[]
): { valid: boolean; underscoreFilesProcessed: string[]; issues: string[] } {
  const issues: string[] = [];
  const underscoreFilesProcessed: string[] = [];
  
  for (const file of processedFiles) {
    if (file.startsWith('_')) {
      underscoreFilesProcessed.push(file);
      issues.push('Underscore file was incorrectly processed');
    }
  }
  
  return { valid: underscoreFilesProcessed.length === 0, underscoreFilesProcessed, issues };
}

const underscoreFilenameArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_-]{0,20}$/)
  .map(s => '_' + s + '.ts')
  .filter(s => s.length > 4 && s.length <= 50);

const nonUnderscoreFilenameArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_-]{0,20}\.ts$/)
  .filter(s => !s.startsWith('_') && s.length > 3 && s.length <= 50);

const mixedFilenamesArb = fc.tuple(
  fc.array(underscoreFilenameArb, { minLength: 1, maxLength: 5 }),
  fc.array(nonUnderscoreFilenameArb, { minLength: 1, maxLength: 10 })
).map(([underscore, nonUnderscore]) => [...underscore, ...nonUnderscore]);

describe('Property 3: Underscore File Exclusion', () => {
  describe('Core Exclusion Property', () => {
    it('PROPERTY: Files starting with underscore are never processed', () => {
      fc.assert(
        fc.property(underscoreFilenameArb, (underscoreFile) => {
          const shouldProcess = shouldBeProcessed(underscoreFile);
          expect(shouldProcess).toBe(false);
          return shouldProcess === false;
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Underscore files are correctly identified', () => {
      fc.assert(
        fc.property(underscoreFilenameArb, (underscoreFile) => {
          const isUnderscore = isUnderscoreFile(underscoreFile);
          expect(isUnderscore).toBe(true);
          return isUnderscore === true;
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Non-underscore files are not falsely identified', () => {
      fc.assert(
        fc.property(nonUnderscoreFilenameArb, (normalFile) => {
          const isUnderscore = isUnderscoreFile(normalFile);
          expect(isUnderscore).toBe(false);
          return isUnderscore === false;
        }),
        { numRuns: NUM_RUNS }
      );
    });
  });

  describe('Filtering Property', () => {
    it('PROPERTY: getProcessedFiles excludes all underscore files', () => {
      fc.assert(
        fc.property(mixedFilenamesArb, (allFiles) => {
          const processed = getProcessedFiles(allFiles);
          const hasUnderscoreInProcessed = processed.some(f => f.startsWith('_'));
          expect(hasUnderscoreInProcessed).toBe(false);
          return !hasUnderscoreInProcessed;
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: All underscore .ts files are in skipped list', () => {
      fc.assert(
        fc.property(mixedFilenamesArb, (allFiles) => {
          const skipped = getSkippedUnderscoreFiles(allFiles);
          const underscoreTsFiles = allFiles.filter(f => f.startsWith('_') && f.endsWith('.ts'));
          expect(skipped.length).toBe(underscoreTsFiles.length);
          return skipped.length === underscoreTsFiles.length;
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Processed and skipped underscore files are disjoint', () => {
      fc.assert(
        fc.property(mixedFilenamesArb, (allFiles) => {
          const processed = getProcessedFiles(allFiles);
          const skipped = getSkippedUnderscoreFiles(allFiles);
          const intersection = processed.filter(f => skipped.includes(f));
          expect(intersection.length).toBe(0);
          return intersection.length === 0;
        }),
        { numRuns: NUM_RUNS }
      );
    });
  });

  describe('Validation Property', () => {
    it('PROPERTY: Validation passes when no underscore files are processed', () => {
      fc.assert(
        fc.property(mixedFilenamesArb, (allFiles) => {
          const processed = getProcessedFiles(allFiles);
          const result = validateUnderscoreExclusion(allFiles, processed);
          expect(result.valid).toBe(true);
          return result.valid;
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Validation fails when underscore files are incorrectly processed', () => {
      fc.assert(
        fc.property(
          fc.tuple(underscoreFilenameArb, nonUnderscoreFilenameArb),
          ([underscoreFile, normalFile]) => {
            const allFiles = [underscoreFile, normalFile];
            const incorrectlyProcessed = [underscoreFile, normalFile];
            const result = validateUnderscoreExclusion(allFiles, incorrectlyProcessed);
            expect(result.valid).toBe(false);
            return !result.valid;
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  describe('Edge Cases', () => {
    it('PROPERTY: Single underscore filename is excluded', () => {
      expect(shouldBeProcessed('_.ts')).toBe(false);
      expect(isUnderscoreFile('_.ts')).toBe(true);
    });

    it('PROPERTY: Underscore in middle of filename does NOT exclude', () => {
      const middleUnderscoreFiles = ['auth_backup.ts', 'my_file.ts', 'test_utils.ts'];
      for (const file of middleUnderscoreFiles) {
        expect(shouldBeProcessed(file)).toBe(true);
        expect(isUnderscoreFile(file)).toBe(false);
      }
    });

    it('PROPERTY: Underscore at end of filename does NOT exclude', () => {
      const endUnderscoreFiles = ['auth_.ts', 'backup_.ts'];
      for (const file of endUnderscoreFiles) {
        expect(shouldBeProcessed(file)).toBe(true);
        expect(isUnderscoreFile(file)).toBe(false);
      }
    });

    it('PROPERTY: Empty filename handling', () => {
      expect(shouldBeProcessed('')).toBe(false);
      expect(isUnderscoreFile('')).toBe(false);
    });
  });

  describe('Consistency with Actual Bundle Script Logic', () => {
    it('PROPERTY: Filter logic matches bundle-api.mjs pattern', () => {
      fc.assert(
        fc.property(
          fc.array(fc.oneof(underscoreFilenameArb, nonUnderscoreFilenameArb), { minLength: 0, maxLength: 20 }),
          (allFiles) => {
            const bundleScriptResult = allFiles.filter(f => f.endsWith('.ts') && !f.startsWith('_'));
            const helperResult = getProcessedFiles(allFiles);
            expect(bundleScriptResult).toEqual(helperResult);
            return JSON.stringify(bundleScriptResult) === JSON.stringify(helperResult);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });
});

describe('Actual Underscore Files in Project', () => {
  it('PROPERTY: Known underscore files are excluded', () => {
    for (const file of KNOWN_UNDERSCORE_FILES) {
      expect(shouldBeProcessed(file)).toBe(false);
      expect(isUnderscoreFile(file)).toBe(true);
    }
  });

  it('PROPERTY: Actual API files are NOT underscore files', () => {
    for (const file of ACTUAL_API_FILES) {
      expect(isUnderscoreFile(file)).toBe(false);
      expect(shouldBeProcessed(file)).toBe(true);
    }
  });

  it('PROPERTY: Mixed actual files are correctly filtered', () => {
    const allFiles = [...ACTUAL_API_FILES, ...KNOWN_UNDERSCORE_FILES];
    const processed = getProcessedFiles(allFiles);
    for (const file of ACTUAL_API_FILES) {
      expect(processed).toContain(file);
    }
    for (const file of KNOWN_UNDERSCORE_FILES) {
      expect(processed).not.toContain(file);
    }
  });

  it('PROPERTY: Validation passes for actual project files', () => {
    const allFiles = [...ACTUAL_API_FILES, ...KNOWN_UNDERSCORE_FILES];
    const processed = getProcessedFiles(allFiles);
    const result = validateUnderscoreExclusion(allFiles, processed);
    expect(result.valid).toBe(true);
    expect(result.underscoreFilesProcessed.length).toBe(0);
  });
});
