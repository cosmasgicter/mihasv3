/**
 * Property-Based Tests: Evidence Generator
 * Feature: frontend-backend-forensic-audit
 * Task: 1.3 Write property test for evidence generator
 * 
 * **Property 10: Issue Flagging with Evidence**
 * 
 * *For any* identified issue (dead code, duplicate logic, unused hooks, over-fetching),
 * the auditor SHALL provide complete evidence including file path, line numbers, and reason.
 * 
 * **Validates: Requirements 2.9, 2.10, 2.11, 2.12, 9.6**
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  generateEvidence,
  assignConfidence,
  validateEvidence,
  createMinimalEvidence,
  createLineEvidence,
  createRangeEvidence,
  formatEvidence,
  type GenerateEvidenceOptions,
} from '../../scripts/audit/utils/evidence';
import type { Evidence } from '../../scripts/audit/types';

// ============================================================================
// Test Configuration
// ============================================================================

/**
 * Number of runs for property tests.
 * Evidence generation is fast, so we can run more iterations.
 */
const NUM_RUNS = 10;

// ============================================================================
// Arbitraries (Generators)
// ============================================================================

/**
 * Valid file path arbitrary generator.
 * Generates non-empty strings that look like file paths.
 */
const validFilePathArb = fc.array(
  fc.constantFrom(
    ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_./'.split('')
  ),
  { minLength: 1, maxLength: 100 }
).map(chars => chars.join('')).filter(s => s.trim().length > 0);

/**
 * Realistic file path arbitrary (e.g., src/components/Button.tsx)
 */
const realisticFilePathArb = fc.tuple(
  fc.constantFrom('src', 'lib', 'api-src', 'scripts', 'tests'),
  fc.array(
    fc.array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')), { minLength: 1, maxLength: 20 }).map(chars => chars.join('')),
    { minLength: 0, maxLength: 3 }
  ),
  fc.array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')), { minLength: 1, maxLength: 30 }).map(chars => chars.join('')),
  fc.constantFrom('.ts', '.tsx', '.js', '.jsx', '.json', '.md')
).map(([root, dirs, filename, ext]) => [root, ...dirs, filename + ext].join('/'));

/**
 * Valid line number arbitrary generator.
 * Generates positive integers (1 or greater).
 */
const validLineNumberArb = fc.integer({ min: 1, max: 10000 });

/**
 * Array of valid line numbers (non-empty, positive integers).
 */
const validLineNumbersArb = fc.array(validLineNumberArb, { minLength: 1, maxLength: 20 });

/**
 * Valid reason arbitrary generator.
 * Generates non-empty strings.
 */
const validReasonArb = fc.string({ minLength: 1, maxLength: 500 }).filter(s => s.trim().length > 0);

/**
 * Realistic reason arbitrary (common audit reasons).
 */
const realisticReasonArb = fc.constantFrom(
  'Unused export - no imports found in codebase',
  'Dead code - function is never called',
  'Duplicate logic - similar implementation exists in another file',
  'Unused hook - useEffect with no dependencies',
  'Over-fetching - fetches all fields but only uses 2',
  'Legacy integration - references removed Supabase SDK',
  'Commented code block - 50+ lines of commented code',
  'Missing error handling - API call without try/catch',
  'Race condition risk - concurrent state updates',
  'Missing auth check - protected route without useAuth'
);

/**
 * Valid code snippet arbitrary generator.
 * Generates non-empty strings that look like code.
 */
const validCodeSnippetArb = fc.string({ minLength: 1, maxLength: 500 }).filter(s => s.trim().length > 0);

/**
 * Realistic code snippet arbitrary.
 */
const realisticCodeSnippetArb = fc.constantFrom(
  'export function unusedHelper() { return null; }',
  'const [data, setData] = useState(null);',
  'useEffect(() => { fetchData(); }, []);',
  '// TODO: Remove this legacy code\n// import { supabase } from "@supabase/supabase-js"',
  'if (isLoading) return <Spinner />;'
);

/**
 * Confidence level arbitrary.
 */
const confidenceLevelArb = fc.constantFrom<Evidence['confidence']>('certain', 'likely', 'possible');

/**
 * Complete evidence options arbitrary.
 */
const completeEvidenceOptionsArb = fc.record({
  filePath: realisticFilePathArb,
  lineNumbers: fc.option(validLineNumbersArb, { nil: undefined }),
  reason: realisticReasonArb,
  codeSnippet: fc.option(realisticCodeSnippetArb, { nil: undefined }),
  confidence: fc.option(confidenceLevelArb, { nil: undefined }),
});

/**
 * Invalid file path arbitrary (empty or whitespace only).
 */
const invalidFilePathArb = fc.constantFrom('', '   ', '\t', '\n', '  \t\n  ');

/**
 * Invalid reason arbitrary (empty or whitespace only).
 */
const invalidReasonArb = fc.constantFrom('', '   ', '\t', '\n', '  \t\n  ');

/**
 * Invalid line number arbitrary (zero, negative, or non-integer).
 */
const invalidLineNumberArb = fc.oneof(
  fc.integer({ min: -1000, max: 0 }),
  fc.double({ min: 0.1, max: 100, noNaN: true }).filter(n => !Number.isInteger(n))
);

// ============================================================================
// Property Tests
// ============================================================================

describe('Property 10: Issue Flagging with Evidence', () => {
  /**
   * **Validates: Requirements 2.9, 2.10, 2.11, 2.12, 9.6**
   */
  
  describe('generateEvidence produces valid Evidence objects', () => {
    it('PROPERTY: generateEvidence always produces Evidence with required fields (filePath, reason, confidence)', () => {
      fc.assert(
        fc.property(
          completeEvidenceOptionsArb,
          (options) => {
            const evidence = generateEvidence(options);
            
            // Required fields must always be present
            expect(evidence.filePath).toBeDefined();
            expect(typeof evidence.filePath).toBe('string');
            expect(evidence.filePath.trim().length).toBeGreaterThan(0);
            
            expect(evidence.reason).toBeDefined();
            expect(typeof evidence.reason).toBe('string');
            expect(evidence.reason.trim().length).toBeGreaterThan(0);
            
            expect(evidence.confidence).toBeDefined();
            expect(['certain', 'likely', 'possible']).toContain(evidence.confidence);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: generateEvidence preserves filePath and reason from input', () => {
      fc.assert(
        fc.property(
          realisticFilePathArb,
          realisticReasonArb,
          (filePath, reason) => {
            const evidence = generateEvidence({ filePath, reason });
            
            // Values should be preserved (trimmed)
            expect(evidence.filePath).toBe(filePath.trim());
            expect(evidence.reason).toBe(reason.trim());
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: generateEvidence with all fields produces complete Evidence', () => {
      fc.assert(
        fc.property(
          realisticFilePathArb,
          validLineNumbersArb,
          realisticReasonArb,
          realisticCodeSnippetArb,
          (filePath, lineNumbers, reason, codeSnippet) => {
            const evidence = generateEvidence({
              filePath,
              lineNumbers,
              reason,
              codeSnippet,
            });
            
            // All fields should be present
            expect(evidence.filePath).toBeDefined();
            expect(evidence.lineNumbers).toBeDefined();
            expect(evidence.reason).toBeDefined();
            expect(evidence.codeSnippet).toBeDefined();
            expect(evidence.confidence).toBe('certain'); // Has all evidence
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  describe('assignConfidence correctly assigns confidence levels', () => {
    it('PROPERTY: "certain" when filePath + lineNumbers + codeSnippet are all present', () => {
      fc.assert(
        fc.property(
          validFilePathArb,
          validLineNumbersArb,
          validCodeSnippetArb,
          (filePath, lineNumbers, codeSnippet) => {
            const confidence = assignConfidence(filePath, lineNumbers, codeSnippet);
            expect(confidence).toBe('certain');
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: "likely" when filePath + lineNumbers (no codeSnippet)', () => {
      fc.assert(
        fc.property(
          validFilePathArb,
          validLineNumbersArb,
          (filePath, lineNumbers) => {
            const confidence = assignConfidence(filePath, lineNumbers, undefined);
            expect(confidence).toBe('likely');
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: "likely" when filePath + codeSnippet (no lineNumbers)', () => {
      fc.assert(
        fc.property(
          validFilePathArb,
          validCodeSnippetArb,
          (filePath, codeSnippet) => {
            const confidence = assignConfidence(filePath, undefined, codeSnippet);
            expect(confidence).toBe('likely');
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: "possible" when only filePath is present', () => {
      fc.assert(
        fc.property(
          validFilePathArb,
          (filePath) => {
            const confidence = assignConfidence(filePath, undefined, undefined);
            expect(confidence).toBe('possible');
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: "possible" when filePath is empty or whitespace', () => {
      fc.assert(
        fc.property(
          invalidFilePathArb,
          fc.option(validLineNumbersArb, { nil: undefined }),
          fc.option(validCodeSnippetArb, { nil: undefined }),
          (filePath, lineNumbers, codeSnippet) => {
            const confidence = assignConfidence(filePath, lineNumbers, codeSnippet);
            expect(confidence).toBe('possible');
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: "likely" when lineNumbers is empty array (treated as no lineNumbers)', () => {
      fc.assert(
        fc.property(
          validFilePathArb,
          validCodeSnippetArb,
          (filePath, codeSnippet) => {
            // Empty array should be treated as "no line numbers"
            const confidence = assignConfidence(filePath, [], codeSnippet);
            expect(confidence).toBe('likely'); // Has filePath + codeSnippet
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: "possible" when codeSnippet is empty or whitespace', () => {
      fc.assert(
        fc.property(
          validFilePathArb,
          fc.constantFrom('', '   ', '\t', '\n'),
          (filePath, emptySnippet) => {
            const confidence = assignConfidence(filePath, undefined, emptySnippet);
            expect(confidence).toBe('possible'); // Empty snippet doesn't count
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  describe('Line numbers are always positive integers and sorted', () => {
    it('PROPERTY: lineNumbers in Evidence are always positive integers', () => {
      fc.assert(
        fc.property(
          realisticFilePathArb,
          validLineNumbersArb,
          realisticReasonArb,
          (filePath, lineNumbers, reason) => {
            const evidence = generateEvidence({ filePath, lineNumbers, reason });
            
            if (evidence.lineNumbers) {
              for (const lineNum of evidence.lineNumbers) {
                expect(Number.isInteger(lineNum)).toBe(true);
                expect(lineNum).toBeGreaterThan(0);
              }
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: lineNumbers in Evidence are always sorted in ascending order', () => {
      fc.assert(
        fc.property(
          realisticFilePathArb,
          validLineNumbersArb,
          realisticReasonArb,
          (filePath, lineNumbers, reason) => {
            const evidence = generateEvidence({ filePath, lineNumbers, reason });
            
            if (evidence.lineNumbers && evidence.lineNumbers.length > 1) {
              for (let i = 1; i < evidence.lineNumbers.length; i++) {
                expect(evidence.lineNumbers[i]).toBeGreaterThanOrEqual(evidence.lineNumbers[i - 1]);
              }
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: invalid line numbers are filtered out', () => {
      fc.assert(
        fc.property(
          realisticFilePathArb,
          fc.array(
            fc.oneof(validLineNumberArb, invalidLineNumberArb),
            { minLength: 1, maxLength: 10 }
          ),
          realisticReasonArb,
          (filePath, mixedLineNumbers, reason) => {
            const evidence = generateEvidence({
              filePath,
              lineNumbers: mixedLineNumbers as number[],
              reason,
            });
            
            // If lineNumbers exists, all should be valid
            if (evidence.lineNumbers) {
              for (const lineNum of evidence.lineNumbers) {
                expect(Number.isInteger(lineNum)).toBe(true);
                expect(lineNum).toBeGreaterThan(0);
              }
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: createLineEvidence produces single positive line number', () => {
      fc.assert(
        fc.property(
          realisticFilePathArb,
          validLineNumberArb,
          realisticReasonArb,
          (filePath, lineNumber, reason) => {
            const evidence = createLineEvidence(filePath, lineNumber, reason);
            
            expect(evidence.lineNumbers).toBeDefined();
            expect(evidence.lineNumbers).toHaveLength(1);
            expect(evidence.lineNumbers![0]).toBe(lineNumber);
            expect(evidence.lineNumbers![0]).toBeGreaterThan(0);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: createRangeEvidence produces sorted consecutive line numbers', () => {
      fc.assert(
        fc.property(
          realisticFilePathArb,
          fc.integer({ min: 1, max: 1000 }),
          fc.integer({ min: 1, max: 50 }),
          realisticReasonArb,
          (filePath, startLine, rangeSize, reason) => {
            const endLine = startLine + rangeSize;
            const evidence = createRangeEvidence(filePath, startLine, endLine, reason);
            
            expect(evidence.lineNumbers).toBeDefined();
            expect(evidence.lineNumbers).toHaveLength(rangeSize + 1);
            
            // Check sorted and consecutive
            for (let i = 0; i < evidence.lineNumbers!.length; i++) {
              expect(evidence.lineNumbers![i]).toBe(startLine + i);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  describe('Evidence validation catches invalid inputs', () => {
    it('PROPERTY: generateEvidence throws for empty filePath', () => {
      fc.assert(
        fc.property(
          invalidFilePathArb,
          realisticReasonArb,
          (filePath, reason) => {
            expect(() => generateEvidence({ filePath, reason })).toThrow('Evidence requires a valid filePath');
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: generateEvidence throws for empty reason', () => {
      fc.assert(
        fc.property(
          realisticFilePathArb,
          invalidReasonArb,
          (filePath, reason) => {
            expect(() => generateEvidence({ filePath, reason })).toThrow('Evidence requires a valid reason');
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: validateEvidence returns true for valid Evidence', () => {
      fc.assert(
        fc.property(
          completeEvidenceOptionsArb,
          (options) => {
            const evidence = generateEvidence(options);
            expect(validateEvidence(evidence)).toBe(true);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: validateEvidence throws for Evidence with empty filePath', () => {
      fc.assert(
        fc.property(
          realisticReasonArb,
          confidenceLevelArb,
          (reason, confidence) => {
            const invalidEvidence: Evidence = {
              filePath: '',
              reason,
              confidence,
            };
            expect(() => validateEvidence(invalidEvidence)).toThrow('Evidence must have a valid filePath');
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: validateEvidence throws for Evidence with empty reason', () => {
      fc.assert(
        fc.property(
          realisticFilePathArb,
          confidenceLevelArb,
          (filePath, confidence) => {
            const invalidEvidence: Evidence = {
              filePath,
              reason: '',
              confidence,
            };
            expect(() => validateEvidence(invalidEvidence)).toThrow('Evidence must have a valid reason');
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: validateEvidence throws for Evidence with invalid confidence', () => {
      fc.assert(
        fc.property(
          realisticFilePathArb,
          realisticReasonArb,
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => !['certain', 'likely', 'possible'].includes(s)),
          (filePath, reason, invalidConfidence) => {
            const invalidEvidence = {
              filePath,
              reason,
              confidence: invalidConfidence,
            } as Evidence;
            expect(() => validateEvidence(invalidEvidence)).toThrow('Evidence confidence must be one of');
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: validateEvidence throws for Evidence with non-positive lineNumbers', () => {
      fc.assert(
        fc.property(
          realisticFilePathArb,
          realisticReasonArb,
          confidenceLevelArb,
          fc.array(fc.integer({ min: -100, max: 0 }), { minLength: 1, maxLength: 5 }),
          (filePath, reason, confidence, invalidLineNumbers) => {
            const invalidEvidence: Evidence = {
              filePath,
              reason,
              confidence,
              lineNumbers: invalidLineNumbers,
            };
            expect(() => validateEvidence(invalidEvidence)).toThrow('Evidence lineNumbers must be positive integers');
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  describe('Helper functions produce valid Evidence', () => {
    it('PROPERTY: createMinimalEvidence produces Evidence with "possible" confidence', () => {
      fc.assert(
        fc.property(
          realisticFilePathArb,
          realisticReasonArb,
          (filePath, reason) => {
            const evidence = createMinimalEvidence(filePath, reason);
            
            expect(evidence.filePath).toBe(filePath.trim());
            expect(evidence.reason).toBe(reason.trim());
            expect(evidence.confidence).toBe('possible');
            expect(evidence.lineNumbers).toBeUndefined();
            expect(evidence.codeSnippet).toBeUndefined();
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: createLineEvidence produces Evidence with "likely" confidence', () => {
      fc.assert(
        fc.property(
          realisticFilePathArb,
          validLineNumberArb,
          realisticReasonArb,
          (filePath, lineNumber, reason) => {
            const evidence = createLineEvidence(filePath, lineNumber, reason);
            
            expect(evidence.confidence).toBe('likely'); // Has filePath + lineNumbers
            expect(evidence.lineNumbers).toEqual([lineNumber]);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: createRangeEvidence produces Evidence with "likely" confidence', () => {
      fc.assert(
        fc.property(
          realisticFilePathArb,
          fc.integer({ min: 1, max: 500 }),
          fc.integer({ min: 1, max: 20 }),
          realisticReasonArb,
          (filePath, startLine, rangeSize, reason) => {
            const endLine = startLine + rangeSize;
            const evidence = createRangeEvidence(filePath, startLine, endLine, reason);
            
            expect(evidence.confidence).toBe('likely'); // Has filePath + lineNumbers
            expect(evidence.lineNumbers).toHaveLength(rangeSize + 1);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  describe('formatEvidence produces readable output', () => {
    it('PROPERTY: formatEvidence always includes filePath, confidence, and reason', () => {
      fc.assert(
        fc.property(
          completeEvidenceOptionsArb,
          (options) => {
            const evidence = generateEvidence(options);
            const formatted = formatEvidence(evidence);
            
            expect(formatted).toContain(`File: ${evidence.filePath}`);
            expect(formatted).toContain(`Confidence: ${evidence.confidence}`);
            expect(formatted).toContain(`Reason: ${evidence.reason}`);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: formatEvidence includes line numbers when present', () => {
      fc.assert(
        fc.property(
          realisticFilePathArb,
          validLineNumbersArb,
          realisticReasonArb,
          (filePath, lineNumbers, reason) => {
            const evidence = generateEvidence({ filePath, lineNumbers, reason });
            const formatted = formatEvidence(evidence);
            
            if (evidence.lineNumbers && evidence.lineNumbers.length === 1) {
              expect(formatted).toContain(`Line: ${evidence.lineNumbers[0]}`);
            } else if (evidence.lineNumbers && evidence.lineNumbers.length > 1) {
              expect(formatted).toContain('Lines:');
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: formatEvidence includes code snippet when present', () => {
      fc.assert(
        fc.property(
          realisticFilePathArb,
          realisticReasonArb,
          realisticCodeSnippetArb,
          (filePath, reason, codeSnippet) => {
            const evidence = generateEvidence({ filePath, reason, codeSnippet });
            const formatted = formatEvidence(evidence);
            
            expect(formatted).toContain('Code:');
            expect(formatted).toContain('```');
            expect(formatted).toContain(codeSnippet.trim());
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  describe('Edge cases', () => {
    it('PROPERTY: Evidence with duplicate line numbers are deduplicated and sorted', () => {
      fc.assert(
        fc.property(
          realisticFilePathArb,
          fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 2, maxLength: 20 }),
          realisticReasonArb,
          (filePath, lineNumbers, reason) => {
            // Create duplicates
            const withDuplicates = [...lineNumbers, ...lineNumbers];
            const evidence = generateEvidence({ filePath, lineNumbers: withDuplicates, reason });
            
            if (evidence.lineNumbers) {
              // Check sorted
              for (let i = 1; i < evidence.lineNumbers.length; i++) {
                expect(evidence.lineNumbers[i]).toBeGreaterThanOrEqual(evidence.lineNumbers[i - 1]);
              }
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Very long file paths are handled correctly', () => {
      fc.assert(
        fc.property(
          fc.array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz/'.split('')), { minLength: 100, maxLength: 500 }).map(chars => chars.join('')),
          realisticReasonArb,
          (longPath, reason) => {
            fc.pre(longPath.trim().length > 0);
            
            const evidence = generateEvidence({ filePath: longPath, reason });
            expect(evidence.filePath).toBe(longPath.trim());
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Very long reasons are handled correctly', () => {
      fc.assert(
        fc.property(
          realisticFilePathArb,
          fc.string({ minLength: 100, maxLength: 1000 }).filter(s => s.trim().length > 0),
          (filePath, longReason) => {
            const evidence = generateEvidence({ filePath, reason: longReason });
            expect(evidence.reason).toBe(longReason.trim());
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Whitespace-padded inputs are trimmed', () => {
      fc.assert(
        fc.property(
          realisticFilePathArb,
          realisticReasonArb,
          fc.constantFrom('  ', '\t', '\n', '  \t\n  '),
          (filePath, reason, padding) => {
            const paddedPath = padding + filePath + padding;
            const paddedReason = padding + reason + padding;
            
            const evidence = generateEvidence({ filePath: paddedPath, reason: paddedReason });
            
            expect(evidence.filePath).toBe(filePath.trim());
            expect(evidence.reason).toBe(reason.trim());
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });
});
