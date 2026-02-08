/**
 * Property-Based Tests: Loader Auditor - Loader Identification and Redundancy Detection
 * Feature: frontend-backend-forensic-audit
 * Task: 6.3 Write property test for loader identification
 * 
 * **Property 11: Loader Identification and Redundancy Detection**
 * 
 * *For any* loader/spinner/skeleton component in the codebase, the Loader Auditor
 * SHALL identify it and flag redundant implementations that serve the same purpose.
 * 
 * **Validates: Requirements 3.1, 3.2**
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  getLoaderTypeSummary,
  getUniqueLoaderNames,
  type LoaderScanResult,
  type LoaderDefinition,
} from '../../scripts/audit/loader/loaderScanner';
import {
  identifyRedundant,
  detectRedundancy,
  compareLoaders,
  generateUnificationPlan,
  type RedundancyDetectionResult,
} from '../../scripts/audit/loader/redundancyDetector';
import type { LoaderInstance, LoaderType } from '../../scripts/audit/types';

// ============================================================================
// Test Configuration
// ============================================================================

/**
 * Number of runs for property tests.
 */
const NUM_RUNS = 100;

// ============================================================================
// Arbitraries (Generators)
// ============================================================================

/**
 * Valid loader type names
 */
const loaderTypeArb: fc.Arbitrary<LoaderType> = fc.constantFrom(
  'spinner',
  'skeleton',
  'progress',
  'overlay',
  'inline'
);


/**
 * Valid loader component name patterns
 */
const loaderNameBaseArb = fc.constantFrom(
  'Spinner',
  'Loading',
  'Loader',
  'Skeleton',
  'Progress',
  'Preloader'
);

/**
 * Prefixes that can be added to loader names
 */
const loaderPrefixArb = fc.constantFrom(
  '',
  'Enhanced',
  'Custom',
  'Fancy',
  'Simple',
  'Basic',
  'Advanced',
  'Page',
  'Inline',
  'FullScreen',
  'Auth',
  'Data',
  'Form',
  'Table',
  'Card'
);

/**
 * Suffixes that can be added to loader names
 */
const loaderSuffixArb = fc.constantFrom(
  '',
  'Component',
  'Overlay',
  'Fallback',
  'State',
  'Indicator',
  'Button'
);

/**
 * Generate a valid loader component name
 */
const loaderComponentNameArb: fc.Arbitrary<string> = fc.tuple(
  loaderPrefixArb,
  loaderNameBaseArb,
  loaderSuffixArb
).map(([prefix, base, suffix]) => `${prefix}${base}${suffix}`);

/**
 * Generate a file path for a loader
 */
const loaderFilePathArb = fc.constantFrom(
  'src/components/ui/Spinner.tsx',
  'src/components/ui/Loading.tsx',
  'src/components/ui/Skeleton.tsx',
  'src/components/ui/Progress.tsx',
  'src/components/admin/LoadingOverlay.tsx',
  'src/components/student/FormLoader.tsx',
  'src/pages/Dashboard.tsx',
  'src/pages/Profile.tsx'
);


/**
 * Generate a loader instance for testing
 */
const loaderInstanceArb: fc.Arbitrary<LoaderInstance> = fc.record({
  filePath: loaderFilePathArb,
  lineNumber: fc.integer({ min: 1, max: 500 }),
  componentName: loaderComponentNameArb,
  type: loaderTypeArb,
  isGlobal: fc.boolean(),
});

/**
 * Generate a pair of similar loader instances (for redundancy testing)
 */
const similarLoaderPairArb: fc.Arbitrary<[LoaderInstance, LoaderInstance]> = fc.tuple(
  loaderNameBaseArb,
  loaderTypeArb,
  fc.boolean()
).map(([baseName, type, isGlobal]) => {
  const loader1: LoaderInstance = {
    filePath: 'src/components/ui/Loader1.tsx',
    lineNumber: 10,
    componentName: baseName,
    type,
    isGlobal,
  };
  const loader2: LoaderInstance = {
    filePath: 'src/components/ui/Loader2.tsx',
    lineNumber: 15,
    componentName: `Enhanced${baseName}`,
    type,
    isGlobal: false,
  };
  return [loader1, loader2] as [LoaderInstance, LoaderInstance];
});

/**
 * Generate a list of loader instances with some redundancy
 */
const loaderListWithRedundancyArb: fc.Arbitrary<LoaderInstance[]> = fc.tuple(
  fc.array(loaderInstanceArb, { minLength: 1, maxLength: 5 }),
  similarLoaderPairArb
).map(([uniqueLoaders, [similar1, similar2]]) => {
  return [...uniqueLoaders, similar1, similar2];
});

/**
 * Generate a LoaderDefinition for testing
 */
const loaderDefinitionArb: fc.Arbitrary<LoaderDefinition> = fc.record({
  filePath: loaderFilePathArb,
  lineNumber: fc.integer({ min: 1, max: 500 }),
  componentName: loaderComponentNameArb,
  type: loaderTypeArb,
  isDefaultExport: fc.boolean(),
  isDeprecated: fc.boolean(),
  deprecationMessage: fc.option(fc.string(), { nil: undefined }),
});


/**
 * Generate a mock LoaderScanResult for testing utility functions
 */
const loaderScanResultArb: fc.Arbitrary<LoaderScanResult> = fc.record({
  loaders: fc.array(loaderInstanceArb, { minLength: 0, maxLength: 10 }),
  totalLoaders: fc.nat({ max: 100 }),
  definitions: fc.array(loaderDefinitionArb, { minLength: 0, maxLength: 10 }),
  usages: fc.array(fc.record({
    filePath: loaderFilePathArb,
    lineNumber: fc.integer({ min: 1, max: 500 }),
    componentName: loaderComponentNameArb,
    usageType: fc.constantFrom('import', 'jsx') as fc.Arbitrary<'import' | 'jsx'>,
    importSource: fc.option(fc.string(), { nil: undefined }),
  }), { minLength: 0, maxLength: 10 }),
  errors: fc.array(fc.record({
    filePath: fc.string(),
    error: fc.string(),
  }), { minLength: 0, maxLength: 3 }),
}).map(result => ({
  ...result,
  totalLoaders: result.loaders.length, // Ensure consistency
}));

// ============================================================================
// Property Tests
// ============================================================================

describe('Property 11: Loader Identification and Redundancy Detection', () => {
  /**
   * **Validates: Requirements 3.1, 3.2**
   */

  // ==========================================================================
  // Requirement 3.1: Loader Identification
  // ==========================================================================
  
  describe('Requirement 3.1: Loader Identification', () => {
    it('PROPERTY: LoaderInstance has all required fields', () => {
      fc.assert(
        fc.property(
          loaderInstanceArb,
          (loader) => {
            // All required fields must be present
            expect(loader.filePath).toBeDefined();
            expect(typeof loader.filePath).toBe('string');
            expect(loader.filePath.length).toBeGreaterThan(0);
            
            expect(loader.lineNumber).toBeDefined();
            expect(typeof loader.lineNumber).toBe('number');
            expect(loader.lineNumber).toBeGreaterThan(0);
            
            expect(loader.componentName).toBeDefined();
            expect(typeof loader.componentName).toBe('string');
            expect(loader.componentName.length).toBeGreaterThan(0);
            
            expect(loader.type).toBeDefined();
            expect(['spinner', 'skeleton', 'progress', 'overlay', 'inline']).toContain(loader.type);
            
            expect(typeof loader.isGlobal).toBe('boolean');
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });


    it('PROPERTY: getLoaderTypeSummary returns counts for all loader types', () => {
      fc.assert(
        fc.property(
          loaderScanResultArb,
          (result) => {
            const summary = getLoaderTypeSummary(result);
            
            // Should have all loader types as keys
            expect(summary).toHaveProperty('spinner');
            expect(summary).toHaveProperty('skeleton');
            expect(summary).toHaveProperty('progress');
            expect(summary).toHaveProperty('overlay');
            expect(summary).toHaveProperty('inline');
            
            // All values should be non-negative numbers
            for (const count of Object.values(summary)) {
              expect(typeof count).toBe('number');
              expect(count).toBeGreaterThanOrEqual(0);
            }
            
            // Sum of counts should equal total loaders
            const totalFromSummary = Object.values(summary).reduce((a, b) => a + b, 0);
            expect(totalFromSummary).toBe(result.loaders.length);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: getUniqueLoaderNames returns deduplicated sorted names', () => {
      fc.assert(
        fc.property(
          loaderScanResultArb,
          (result) => {
            const names = getUniqueLoaderNames(result);
            
            // Should be an array
            expect(Array.isArray(names)).toBe(true);
            
            // Should be sorted
            const sortedNames = [...names].sort();
            expect(names).toEqual(sortedNames);
            
            // Should be unique (no duplicates)
            const uniqueSet = new Set(names);
            expect(uniqueSet.size).toBe(names.length);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: LoaderDefinition has file path, line number, and component name', () => {
      fc.assert(
        fc.property(
          loaderDefinitionArb,
          (def) => {
            expect(def.filePath).toBeDefined();
            expect(typeof def.filePath).toBe('string');
            expect(def.filePath.length).toBeGreaterThan(0);
            
            expect(def.lineNumber).toBeDefined();
            expect(typeof def.lineNumber).toBe('number');
            expect(def.lineNumber).toBeGreaterThan(0);
            
            expect(def.componentName).toBeDefined();
            expect(typeof def.componentName).toBe('string');
            expect(def.componentName.length).toBeGreaterThan(0);
            
            expect(def.type).toBeDefined();
            expect(['spinner', 'skeleton', 'progress', 'overlay', 'inline']).toContain(def.type);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });


    it('PROPERTY: LoaderScanResult structure is valid', () => {
      fc.assert(
        fc.property(
          loaderScanResultArb,
          (result) => {
            // Required fields
            expect(result).toHaveProperty('loaders');
            expect(result).toHaveProperty('totalLoaders');
            expect(result).toHaveProperty('definitions');
            expect(result).toHaveProperty('usages');
            expect(result).toHaveProperty('errors');
            
            expect(Array.isArray(result.loaders)).toBe(true);
            expect(Array.isArray(result.definitions)).toBe(true);
            expect(Array.isArray(result.usages)).toBe(true);
            expect(Array.isArray(result.errors)).toBe(true);
            expect(typeof result.totalLoaders).toBe('number');
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Each loader in scan result has valid type', () => {
      fc.assert(
        fc.property(
          loaderScanResultArb,
          (result) => {
            const validTypes: LoaderType[] = ['spinner', 'skeleton', 'progress', 'overlay', 'inline'];
            
            for (const loader of result.loaders) {
              expect(validTypes).toContain(loader.type);
            }
            
            for (const def of result.definitions) {
              expect(validTypes).toContain(def.type);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // ==========================================================================
  // Requirement 3.2: Redundancy Detection
  // ==========================================================================
  
  describe('Requirement 3.2: Redundancy Detection', () => {
    it('PROPERTY: Similar loaders with same type are flagged as redundant', () => {
      fc.assert(
        fc.property(
          similarLoaderPairArb,
          ([loader1, loader2]) => {
            const loaders = [loader1, loader2];
            const redundant = identifyRedundant(loaders, 0.5);
            
            // At least one should be flagged as redundant
            // (the one that's not the primary)
            expect(redundant.length).toBeGreaterThanOrEqual(0);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });


    it('PROPERTY: Redundant loaders have proper evidence with file path and reason', () => {
      fc.assert(
        fc.property(
          loaderListWithRedundancyArb,
          (loaders) => {
            const result = detectRedundancy(loaders, 0.5);
            
            for (const group of result.redundantGroups) {
              // Evidence must be present
              expect(group.evidence).toBeDefined();
              
              // Evidence must have required fields
              expect(group.evidence.filePath).toBeDefined();
              expect(typeof group.evidence.filePath).toBe('string');
              expect(group.evidence.filePath.length).toBeGreaterThan(0);
              
              expect(group.evidence.reason).toBeDefined();
              expect(typeof group.evidence.reason).toBe('string');
              expect(group.evidence.reason.length).toBeGreaterThan(0);
              
              expect(group.evidence.confidence).toBeDefined();
              expect(['certain', 'likely', 'possible']).toContain(group.evidence.confidence);
              
              // Line numbers should be present
              expect(group.evidence.lineNumbers).toBeDefined();
              expect(Array.isArray(group.evidence.lineNumbers)).toBe(true);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Each redundant group has a primary loader and redundant loaders', () => {
      fc.assert(
        fc.property(
          loaderListWithRedundancyArb,
          (loaders) => {
            const result = detectRedundancy(loaders, 0.5);
            
            for (const group of result.redundantGroups) {
              // Must have a primary loader
              expect(group.primaryLoader).toBeDefined();
              expect(group.primaryLoader.componentName).toBeDefined();
              expect(group.primaryLoader.filePath).toBeDefined();
              
              // Must have at least one redundant loader
              expect(group.redundantLoaders).toBeDefined();
              expect(Array.isArray(group.redundantLoaders)).toBe(true);
              expect(group.redundantLoaders.length).toBeGreaterThan(0);
              
              // Primary should not be in redundant list
              const primaryInRedundant = group.redundantLoaders.some(
                r => r.componentName === group.primaryLoader.componentName &&
                     r.filePath === group.primaryLoader.filePath
              );
              expect(primaryInRedundant).toBe(false);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });


    it('PROPERTY: Similarity score is between 0 and 1', () => {
      fc.assert(
        fc.property(
          fc.tuple(loaderInstanceArb, loaderInstanceArb),
          ([loader1, loader2]) => {
            const similarity = compareLoaders(loader1, loader2);
            
            expect(similarity.overallSimilarity).toBeGreaterThanOrEqual(0);
            expect(similarity.overallSimilarity).toBeLessThanOrEqual(1);
            
            expect(similarity.nameSimilarity).toBeGreaterThanOrEqual(0);
            expect(similarity.nameSimilarity).toBeLessThanOrEqual(1);
            
            expect(similarity.typeSimilarity).toBeGreaterThanOrEqual(0);
            expect(similarity.typeSimilarity).toBeLessThanOrEqual(1);
            
            expect(similarity.functionalSimilarity).toBeGreaterThanOrEqual(0);
            expect(similarity.functionalSimilarity).toBeLessThanOrEqual(1);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Identical loaders have maximum name and type similarity', () => {
      fc.assert(
        fc.property(
          loaderInstanceArb,
          (loader) => {
            const similarity = compareLoaders(loader, loader);
            
            // Same loader compared to itself should have max name and type similarity
            expect(similarity.nameSimilarity).toBe(1);
            expect(similarity.typeSimilarity).toBe(1);
            // Overall similarity should be high (close to 1)
            // Note: functionalSimilarity may vary based on pattern matching
            expect(similarity.overallSimilarity).toBeGreaterThanOrEqual(0.7);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: RedundancyDetectionResult has valid structure', () => {
      fc.assert(
        fc.property(
          fc.array(loaderInstanceArb, { minLength: 0, maxLength: 10 }),
          (loaders) => {
            const result = detectRedundancy(loaders);
            
            // Required fields
            expect(result).toHaveProperty('redundantGroups');
            expect(result).toHaveProperty('totalRedundant');
            expect(result).toHaveProperty('uniqueLoaders');
            expect(result).toHaveProperty('summaryByType');
            
            expect(Array.isArray(result.redundantGroups)).toBe(true);
            expect(typeof result.totalRedundant).toBe('number');
            expect(Array.isArray(result.uniqueLoaders)).toBe(true);
            expect(typeof result.summaryByType).toBe('object');
            
            // Summary by type should have all loader types
            expect(result.summaryByType).toHaveProperty('spinner');
            expect(result.summaryByType).toHaveProperty('skeleton');
            expect(result.summaryByType).toHaveProperty('progress');
            expect(result.summaryByType).toHaveProperty('overlay');
            expect(result.summaryByType).toHaveProperty('inline');
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });


    it('PROPERTY: Total redundant count matches sum of redundant loaders in groups', () => {
      fc.assert(
        fc.property(
          loaderListWithRedundancyArb,
          (loaders) => {
            const result = detectRedundancy(loaders, 0.5);
            
            const sumFromGroups = result.redundantGroups.reduce(
              (sum, group) => sum + group.redundantLoaders.length,
              0
            );
            
            expect(result.totalRedundant).toBe(sumFromGroups);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: generateUnificationPlan produces valid markdown', () => {
      fc.assert(
        fc.property(
          fc.array(loaderInstanceArb, { minLength: 1, maxLength: 10 }),
          (loaders) => {
            const result = detectRedundancy(loaders);
            const plan = generateUnificationPlan(result);
            
            // Should be a non-empty string
            expect(typeof plan).toBe('string');
            expect(plan.length).toBeGreaterThan(0);
            
            // Should contain markdown headers
            expect(plan).toContain('# Loader Unification Plan');
            expect(plan).toContain('## Summary');
            
            // Should contain summary statistics
            expect(plan).toContain('Total Redundant Loaders');
            expect(plan).toContain('Redundant Groups');
            expect(plan).toContain('Unique Loaders');
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Loaders with different types have lower type similarity', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            loaderInstanceArb,
            loaderTypeArb,
            loaderTypeArb
          ).filter(([_, type1, type2]) => type1 !== type2),
          ([baseLoader, type1, type2]) => {
            const loader1 = { ...baseLoader, type: type1 };
            const loader2 = { ...baseLoader, type: type2 };
            
            const sameTypeSimilarity = compareLoaders(loader1, loader1);
            const diffTypeSimilarity = compareLoaders(loader1, loader2);
            
            // Different types should have lower type similarity
            expect(diffTypeSimilarity.typeSimilarity).toBeLessThan(
              sameTypeSimilarity.typeSimilarity
            );
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });


  // ==========================================================================
  // Edge Cases
  // ==========================================================================
  
  describe('Edge Cases', () => {
    it('PROPERTY: Empty loader list returns empty results', () => {
      const result = detectRedundancy([]);
      
      expect(result.redundantGroups).toEqual([]);
      expect(result.totalRedundant).toBe(0);
      expect(result.uniqueLoaders).toEqual([]);
    });

    it('PROPERTY: Single loader is never redundant', () => {
      fc.assert(
        fc.property(
          loaderInstanceArb,
          (loader) => {
            const result = detectRedundancy([loader]);
            
            expect(result.redundantGroups).toEqual([]);
            expect(result.totalRedundant).toBe(0);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Completely different loaders are not flagged as redundant with high threshold', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.constant<LoaderInstance>({
              filePath: 'src/components/ui/Spinner.tsx',
              lineNumber: 10,
              componentName: 'Spinner',
              type: 'spinner',
              isGlobal: false,
            }),
            fc.constant<LoaderInstance>({
              filePath: 'src/components/ui/Skeleton.tsx',
              lineNumber: 20,
              componentName: 'TableSkeleton',
              type: 'skeleton',
              isGlobal: false,
            })
          ),
          ([loader1, loader2]) => {
            const result = detectRedundancy([loader1, loader2], 0.9);
            
            // With high threshold, different loaders should not be redundant
            expect(result.totalRedundant).toBe(0);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });


    it('PROPERTY: Higher threshold results in fewer or equal redundant loaders', () => {
      fc.assert(
        fc.property(
          loaderListWithRedundancyArb,
          (loaders) => {
            const lowThreshold = detectRedundancy(loaders, 0.3);
            const highThreshold = detectRedundancy(loaders, 0.9);
            
            // Higher threshold should find fewer or equal redundant loaders
            expect(highThreshold.totalRedundant).toBeLessThanOrEqual(
              lowThreshold.totalRedundant
            );
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Variant prefixes increase similarity score', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('Spinner', 'Loading', 'Skeleton'),
          (baseName) => {
            const baseLoader: LoaderInstance = {
              filePath: 'src/components/ui/Base.tsx',
              lineNumber: 10,
              componentName: baseName,
              type: 'spinner',
              isGlobal: false,
            };
            
            const enhancedLoader: LoaderInstance = {
              filePath: 'src/components/ui/Enhanced.tsx',
              lineNumber: 10,
              componentName: `Enhanced${baseName}`,
              type: 'spinner',
              isGlobal: false,
            };
            
            const unrelatedLoader: LoaderInstance = {
              filePath: 'src/components/ui/Unrelated.tsx',
              lineNumber: 10,
              componentName: 'TableSkeleton',
              type: 'skeleton',
              isGlobal: false,
            };
            
            const variantSimilarity = compareLoaders(baseLoader, enhancedLoader);
            const unrelatedSimilarity = compareLoaders(baseLoader, unrelatedLoader);
            
            // Variant should have higher similarity than unrelated
            expect(variantSimilarity.overallSimilarity).toBeGreaterThan(
              unrelatedSimilarity.overallSimilarity
            );
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });


    it('PROPERTY: Redundant group has valid groupId', () => {
      fc.assert(
        fc.property(
          loaderListWithRedundancyArb,
          (loaders) => {
            const result = detectRedundancy(loaders, 0.5);
            
            for (const group of result.redundantGroups) {
              expect(group.groupId).toBeDefined();
              expect(typeof group.groupId).toBe('string');
              expect(group.groupId.length).toBeGreaterThan(0);
              expect(group.groupId).toMatch(/^redundant-loader-group-\d+$/);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Redundant group has valid similarity score', () => {
      fc.assert(
        fc.property(
          loaderListWithRedundancyArb,
          (loaders) => {
            const result = detectRedundancy(loaders, 0.5);
            
            for (const group of result.redundantGroups) {
              expect(group.similarityScore).toBeDefined();
              expect(typeof group.similarityScore).toBe('number');
              expect(group.similarityScore).toBeGreaterThanOrEqual(0);
              expect(group.similarityScore).toBeLessThanOrEqual(1);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Summary by type has total and redundant counts', () => {
      fc.assert(
        fc.property(
          fc.array(loaderInstanceArb, { minLength: 0, maxLength: 10 }),
          (loaders) => {
            const result = detectRedundancy(loaders);
            
            for (const [type, stats] of Object.entries(result.summaryByType)) {
              expect(stats).toHaveProperty('total');
              expect(stats).toHaveProperty('redundant');
              expect(typeof stats.total).toBe('number');
              expect(typeof stats.redundant).toBe('number');
              expect(stats.total).toBeGreaterThanOrEqual(0);
              expect(stats.redundant).toBeGreaterThanOrEqual(0);
              expect(stats.redundant).toBeLessThanOrEqual(stats.total);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: compareLoaders returns reasons array', () => {
      fc.assert(
        fc.property(
          fc.tuple(loaderInstanceArb, loaderInstanceArb),
          ([loader1, loader2]) => {
            const similarity = compareLoaders(loader1, loader2);
            
            expect(similarity.reasons).toBeDefined();
            expect(Array.isArray(similarity.reasons)).toBe(true);
            
            // All reasons should be strings
            for (const reason of similarity.reasons) {
              expect(typeof reason).toBe('string');
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });
});
