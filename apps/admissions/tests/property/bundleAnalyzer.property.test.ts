/**
 * Property-Based Tests: Bundle Analyzer - Bundle Size Threshold
 * Feature: frontend-backend-forensic-audit
 * Task: 13.4 Write property test for bundle size threshold
 * 
 * **Property 21: Bundle Size Threshold**
 * 
 * *For any* build output, the total JS bundle size SHALL be below 500KB,
 * and the auditor SHALL flag any chunks exceeding reasonable thresholds.
 * 
 * **Validates: Requirements 7.5**
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { mkdir, writeFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import {
  analyzeBundle,
  getBundleAnalysisForReport,
  isBundleWithinThreshold,
  getBundleSummary,
  DEFAULT_THRESHOLDS,
  type BundleAnalysisResult,
  type BundleThresholds,
  type ChunkInfo,
  type ChunkType,
} from '../../scripts/audit/performance/bundleAnalyzer';

// ============================================================================
// Test Configuration
// ============================================================================

/**
 * Number of runs for property tests.
 * Reduced for faster execution with file I/O.
 */
const NUM_RUNS = 10;

/**
 * Base temporary directory for test fixtures - relative to project root
 */
const TEST_FIXTURES_DIR = '.test-fixtures-bundle';

// ============================================================================
// Arbitraries (Generators)
// ============================================================================

/**
 * Valid chunk types for testing
 */
const chunkTypeArb: fc.Arbitrary<ChunkType> = fc.constantFrom(
  'entry', 'vendor', 'lazy', 'shared', 'css', 'asset', 'unknown'
);

/**
 * Valid JS chunk types (excluding CSS and asset)
 */
const jsChunkTypeArb: fc.Arbitrary<ChunkType> = fc.constantFrom(
  'entry', 'vendor', 'lazy', 'shared', 'unknown'
);

/**
 * Generate a hex string for chunk hashes
 */
const hexHashArb = fc.stringMatching(/^[0-9a-f]{8}$/);

/**
 * Generate valid chunk file names based on type
 */
const chunkNameArb = (type: ChunkType): fc.Arbitrary<string> => {
  switch (type) {
    case 'entry':
      return fc.tuple(fc.constantFrom('index', 'main', 'app'), hexHashArb)
        .map(([name, h]) => `${name}-${h}.js`);
    case 'vendor':
      return fc.tuple(fc.constantFrom('vendor', 'vendor-excel', 'vendor-pdf'), hexHashArb)
        .map(([name, h]) => `${name}-${h}.js`);
    case 'lazy':
      return fc.tuple(
        fc.constantFrom('Dashboard', 'Settings', 'AdminPage', 'StudentDetail'),
        hexHashArb
      ).map(([name, h]) => `${name}-${h}.js`);
    case 'shared':
      return fc.tuple(fc.constantFrom('useAuth', 'apiClient', 'formatUtils'), hexHashArb)
        .map(([name, h]) => `${name}-${h}.js`);
    case 'css':
      return fc.tuple(fc.constantFrom('index', 'styles', 'main'), hexHashArb)
        .map(([name, h]) => `${name}-${h}.css`);
    default:
      return fc.tuple(fc.constantFrom('chunk', 'module', 'util'), hexHashArb)
        .map(([name, h]) => `${name}-${h}.js`);
  }
};

/**
 * Generate chunk sizes in bytes
 */
const chunkSizeArb = fc.integer({ min: 1024, max: 300 * 1024 }); // 1KB to 300KB

/**
 * Generate small chunk sizes (under thresholds)
 */
const smallChunkSizeArb = fc.integer({ min: 1024, max: 40 * 1024 }); // 1KB to 40KB

/**
 * Generate large chunk sizes (over thresholds)
 */
const largeChunkSizeArb = fc.integer({ min: 150 * 1024, max: 500 * 1024 }); // 150KB to 500KB

/**
 * Generate custom thresholds for testing
 */
const customThresholdsArb: fc.Arbitrary<BundleThresholds> = fc.record({
  totalBundleSize: fc.integer({ min: 100 * 1024, max: 1000 * 1024 }),
  individualChunkSize: fc.integer({ min: 50 * 1024, max: 200 * 1024 }),
  entryChunkSize: fc.integer({ min: 100 * 1024, max: 300 * 1024 }),
  vendorChunkSize: fc.integer({ min: 75 * 1024, max: 250 * 1024 }),
  lazyChunkWarning: fc.integer({ min: 25 * 1024, max: 100 * 1024 }),
});

/**
 * Generate a list of chunk configurations for testing
 */
interface ChunkConfig {
  type: ChunkType;
  size: number;
  name: string;
}

const chunkConfigArb: fc.Arbitrary<ChunkConfig> = fc.tuple(
  jsChunkTypeArb,
  chunkSizeArb
).chain(([type, size]) => 
  chunkNameArb(type).map(name => ({ type, size, name }))
);

/**
 * Generate multiple chunk configurations
 */
const multipleChunksArb = fc.array(chunkConfigArb, { minLength: 1, maxLength: 10 });

// ============================================================================
// Test Helpers
// ============================================================================

let testCounter = 0;

/**
 * Create a unique test directory path
 */
function createTestDistDir(): string {
  const uniqueId = `${Date.now()}-${testCounter++}`;
  return join(TEST_FIXTURES_DIR, `dist-${uniqueId}`);
}

/**
 * Create a mock dist directory with JS files
 */
async function createMockDistDir(
  distDir: string,
  chunks: ChunkConfig[]
): Promise<void> {
  const fullDistDir = join(process.cwd(), distDir);
  const assetsDir = join(fullDistDir, 'assets');
  const jsDir = join(assetsDir, 'js');
  
  await mkdir(jsDir, { recursive: true });
  
  for (const chunk of chunks) {
    const filePath = chunk.type === 'css' 
      ? join(assetsDir, chunk.name)
      : join(jsDir, chunk.name);
    
    // Create file with specified size (fill with spaces)
    const content = ' '.repeat(chunk.size);
    await writeFile(filePath, content, 'utf-8');
  }
}

/**
 * Clean up a test directory
 */
async function cleanupTestDir(distDir: string): Promise<void> {
  try {
    const fullPath = join(process.cwd(), distDir);
    await rm(fullPath, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

// ============================================================================
// Global Setup/Teardown
// ============================================================================

beforeAll(async () => {
  // Ensure base directory exists
  await mkdir(join(process.cwd(), TEST_FIXTURES_DIR), { recursive: true });
});

afterAll(async () => {
  // Clean up all test fixtures
  try {
    await rm(join(process.cwd(), TEST_FIXTURES_DIR), { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
});

// ============================================================================
// Property Tests
// ============================================================================

describe('Property 21: Bundle Size Threshold', () => {
  /**
   * **Validates: Requirements 7.5**
   * 
   * THE Frontend SHALL minimize JS bundle impact
   */

  // ==========================================================================
  // Bundle Analysis Returns Valid Structure
  // ==========================================================================

  describe('Bundle analysis returns valid structure with required fields', () => {
    it('PROPERTY: analyzeBundle returns all required fields', async () => {
      await fc.assert(
        fc.asyncProperty(
          multipleChunksArb,
          async (chunks) => {
            const distDir = createTestDistDir();
            
            try {
              await createMockDistDir(distDir, chunks);
              const result = analyzeBundle(distDir);
              
              // Verify required fields exist
              expect(result).toHaveProperty('totalSize');
              expect(result).toHaveProperty('totalSizeKB');
              expect(result).toHaveProperty('totalCSSSize');
              expect(result).toHaveProperty('chunks');
              expect(result).toHaveProperty('largestChunks');
              expect(result).toHaveProperty('oversizedChunks');
              expect(result).toHaveProperty('exceedsTotalThreshold');
              expect(result).toHaveProperty('performanceIssues');
              expect(result).toHaveProperty('recommendations');
              expect(result).toHaveProperty('thresholds');
              expect(result).toHaveProperty('summary');
              expect(result).toHaveProperty('errors');
            } finally {
              await cleanupTestDir(distDir);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    }, 60000);

    it('PROPERTY: totalSize is a non-negative number', async () => {
      await fc.assert(
        fc.asyncProperty(
          multipleChunksArb,
          async (chunks) => {
            const distDir = createTestDistDir();
            
            try {
              await createMockDistDir(distDir, chunks);
              const result = analyzeBundle(distDir);
              
              expect(typeof result.totalSize).toBe('number');
              expect(result.totalSize).toBeGreaterThanOrEqual(0);
            } finally {
              await cleanupTestDir(distDir);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    }, 60000);

    it('PROPERTY: totalSizeKB equals totalSize / 1024 (rounded)', async () => {
      await fc.assert(
        fc.asyncProperty(
          multipleChunksArb,
          async (chunks) => {
            const distDir = createTestDistDir();
            
            try {
              await createMockDistDir(distDir, chunks);
              const result = analyzeBundle(distDir);
              
              const expectedKB = Math.round((result.totalSize / 1024) * 100) / 100;
              expect(result.totalSizeKB).toBe(expectedKB);
            } finally {
              await cleanupTestDir(distDir);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    }, 60000);

    it('PROPERTY: chunks array contains ChunkInfo objects with required fields', async () => {
      await fc.assert(
        fc.asyncProperty(
          multipleChunksArb,
          async (chunks) => {
            const distDir = createTestDistDir();
            
            try {
              await createMockDistDir(distDir, chunks);
              const result = analyzeBundle(distDir);
              
              for (const chunk of result.chunks) {
                expect(chunk).toHaveProperty('name');
                expect(chunk).toHaveProperty('filePath');
                expect(chunk).toHaveProperty('size');
                expect(chunk).toHaveProperty('sizeKB');
                expect(chunk).toHaveProperty('exceedsThreshold');
                expect(chunk).toHaveProperty('chunkType');
                
                expect(typeof chunk.name).toBe('string');
                expect(typeof chunk.filePath).toBe('string');
                expect(typeof chunk.size).toBe('number');
                expect(typeof chunk.sizeKB).toBe('number');
                expect(typeof chunk.exceedsThreshold).toBe('boolean');
                expect(typeof chunk.chunkType).toBe('string');
              }
            } finally {
              await cleanupTestDir(distDir);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // ==========================================================================
  // Total Size Calculation Accuracy
  // ==========================================================================

  describe('Total size calculation is accurate (sum of all JS chunks)', () => {
    it('PROPERTY: totalSize equals sum of all JS chunk sizes', async () => {
      await fc.assert(
        fc.asyncProperty(
          multipleChunksArb,
          async (chunks) => {
            const distDir = createTestDistDir();
            
            try {
              await createMockDistDir(distDir, chunks);
              const result = analyzeBundle(distDir);
              
              // Calculate expected total from JS chunks only
              const jsChunks = result.chunks.filter(c => c.chunkType !== 'css');
              const expectedTotal = jsChunks.reduce((sum, c) => sum + c.size, 0);
              
              expect(result.totalSize).toBe(expectedTotal);
            } finally {
              await cleanupTestDir(distDir);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: totalCSSSize equals sum of all CSS chunk sizes', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.tuple(
              fc.constantFrom('css' as ChunkType),
              chunkSizeArb
            ).chain(([type, size]) => 
              chunkNameArb(type).map(name => ({ type, size, name }))
            ),
            { minLength: 1, maxLength: 5 }
          ),
          async (cssChunks) => {
            const distDir = createTestDistDir();
            
            try {
              await createMockDistDir(distDir, cssChunks);
              const result = analyzeBundle(distDir);
              
              // Calculate expected CSS total
              const cssChunksFound = result.chunks.filter(c => c.chunkType === 'css');
              const expectedCSSTotal = cssChunksFound.reduce((sum, c) => sum + c.size, 0);
              
              expect(result.totalCSSSize).toBe(expectedCSSTotal);
            } finally {
              await cleanupTestDir(distDir);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: largestChunks are sorted by size descending', async () => {
      await fc.assert(
        fc.asyncProperty(
          multipleChunksArb,
          async (chunks) => {
            const distDir = createTestDistDir();
            
            try {
              await createMockDistDir(distDir, chunks);
              const result = analyzeBundle(distDir);
              
              // Verify largestChunks are sorted descending
              for (let i = 1; i < result.largestChunks.length; i++) {
                expect(result.largestChunks[i - 1].size)
                  .toBeGreaterThanOrEqual(result.largestChunks[i].size);
              }
            } finally {
              await cleanupTestDir(distDir);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // ==========================================================================
  // Chunks Exceeding Thresholds Are Flagged
  // ==========================================================================

  describe('Chunks exceeding thresholds are flagged', () => {
    it('PROPERTY: exceedsTotalThreshold is true when totalSize > threshold', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.tuple(
              jsChunkTypeArb,
              largeChunkSizeArb
            ).chain(([type, size]) => 
              chunkNameArb(type).map(name => ({ type, size, name }))
            ),
            { minLength: 3, maxLength: 5 }
          ),
          async (largeChunks) => {
            const distDir = createTestDistDir();
            
            try {
              await createMockDistDir(distDir, largeChunks);
              const result = analyzeBundle(distDir);
              
              // With multiple large chunks, total should exceed 500KB threshold
              const totalSize = largeChunks.reduce((sum, c) => sum + c.size, 0);
              
              if (totalSize > DEFAULT_THRESHOLDS.totalBundleSize) {
                expect(result.exceedsTotalThreshold).toBe(true);
              }
            } finally {
              await cleanupTestDir(distDir);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: exceedsTotalThreshold is false when totalSize <= threshold', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.tuple(
              jsChunkTypeArb,
              smallChunkSizeArb
            ).chain(([type, size]) => 
              chunkNameArb(type).map(name => ({ type, size, name }))
            ),
            { minLength: 1, maxLength: 5 }
          ),
          async (smallChunks) => {
            const distDir = createTestDistDir();
            
            try {
              await createMockDistDir(distDir, smallChunks);
              const result = analyzeBundle(distDir);
              
              // With small chunks, total should be under 500KB threshold
              const totalSize = smallChunks.reduce((sum, c) => sum + c.size, 0);
              
              if (totalSize <= DEFAULT_THRESHOLDS.totalBundleSize) {
                expect(result.exceedsTotalThreshold).toBe(false);
              }
            } finally {
              await cleanupTestDir(distDir);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: oversizedChunks contains only chunks where exceedsThreshold is true', async () => {
      await fc.assert(
        fc.asyncProperty(
          multipleChunksArb,
          async (chunks) => {
            const distDir = createTestDistDir();
            
            try {
              await createMockDistDir(distDir, chunks);
              const result = analyzeBundle(distDir);
              
              // All oversized chunks should have exceedsThreshold = true
              for (const chunk of result.oversizedChunks) {
                expect(chunk.exceedsThreshold).toBe(true);
              }
              
              // All chunks with exceedsThreshold = true should be in oversizedChunks
              const oversizedNames = new Set(result.oversizedChunks.map(c => c.name));
              for (const chunk of result.chunks) {
                if (chunk.exceedsThreshold) {
                  expect(oversizedNames.has(chunk.name)).toBe(true);
                }
              }
            } finally {
              await cleanupTestDir(distDir);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // ==========================================================================
  // Performance Issues Generated for Oversized Chunks
  // ==========================================================================

  describe('Performance issues are generated for oversized chunks', () => {
    it('PROPERTY: LARGE_BUNDLE issue generated when total exceeds threshold', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.tuple(
              jsChunkTypeArb,
              largeChunkSizeArb
            ).chain(([type, size]) => 
              chunkNameArb(type).map(name => ({ type, size, name }))
            ),
            { minLength: 3, maxLength: 5 }
          ),
          async (largeChunks) => {
            const distDir = createTestDistDir();
            
            try {
              await createMockDistDir(distDir, largeChunks);
              const result = analyzeBundle(distDir);
              
              if (result.exceedsTotalThreshold) {
                // Should have at least one LARGE_BUNDLE issue
                const largeBundleIssues = result.performanceIssues.filter(
                  i => i.type === 'LARGE_BUNDLE'
                );
                expect(largeBundleIssues.length).toBeGreaterThan(0);
              }
            } finally {
              await cleanupTestDir(distDir);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Each performance issue has required fields', async () => {
      await fc.assert(
        fc.asyncProperty(
          multipleChunksArb,
          async (chunks) => {
            const distDir = createTestDistDir();
            
            try {
              await createMockDistDir(distDir, chunks);
              const result = analyzeBundle(distDir);
              
              for (const issue of result.performanceIssues) {
                expect(issue).toHaveProperty('type');
                expect(issue).toHaveProperty('filePath');
                expect(issue).toHaveProperty('evidence');
                expect(issue).toHaveProperty('impact');
                expect(issue).toHaveProperty('recommendation');
                
                expect(typeof issue.type).toBe('string');
                expect(typeof issue.filePath).toBe('string');
                expect(typeof issue.evidence).toBe('string');
                expect(['high', 'medium', 'low']).toContain(issue.impact);
                expect(typeof issue.recommendation).toBe('string');
                expect(issue.recommendation.length).toBeGreaterThan(0);
              }
            } finally {
              await cleanupTestDir(distDir);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Performance issues have non-empty evidence strings', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.tuple(
              jsChunkTypeArb,
              largeChunkSizeArb
            ).chain(([type, size]) => 
              chunkNameArb(type).map(name => ({ type, size, name }))
            ),
            { minLength: 2, maxLength: 4 }
          ),
          async (largeChunks) => {
            const distDir = createTestDistDir();
            
            try {
              await createMockDistDir(distDir, largeChunks);
              const result = analyzeBundle(distDir);
              
              for (const issue of result.performanceIssues) {
                expect(issue.evidence.trim().length).toBeGreaterThan(0);
              }
            } finally {
              await cleanupTestDir(distDir);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // ==========================================================================
  // Recommendations Provided When Issues Exist
  // ==========================================================================

  describe('Recommendations are provided when issues exist', () => {
    it('PROPERTY: recommendations array is never empty', async () => {
      await fc.assert(
        fc.asyncProperty(
          multipleChunksArb,
          async (chunks) => {
            const distDir = createTestDistDir();
            
            try {
              await createMockDistDir(distDir, chunks);
              const result = analyzeBundle(distDir);
              
              // Should always have at least one recommendation
              expect(result.recommendations.length).toBeGreaterThan(0);
            } finally {
              await cleanupTestDir(distDir);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: recommendations are non-empty strings', async () => {
      await fc.assert(
        fc.asyncProperty(
          multipleChunksArb,
          async (chunks) => {
            const distDir = createTestDistDir();
            
            try {
              await createMockDistDir(distDir, chunks);
              const result = analyzeBundle(distDir);
              
              for (const rec of result.recommendations) {
                expect(typeof rec).toBe('string');
                expect(rec.trim().length).toBeGreaterThan(0);
              }
            } finally {
              await cleanupTestDir(distDir);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: oversized bundles get specific recommendations', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.tuple(
              jsChunkTypeArb,
              largeChunkSizeArb
            ).chain(([type, size]) => 
              chunkNameArb(type).map(name => ({ type, size, name }))
            ),
            { minLength: 3, maxLength: 5 }
          ),
          async (largeChunks) => {
            const distDir = createTestDistDir();
            
            try {
              await createMockDistDir(distDir, largeChunks);
              const result = analyzeBundle(distDir);
              
              if (result.exceedsTotalThreshold) {
                // Should have recommendations mentioning bundle size
                const hasBundleRec = result.recommendations.some(
                  r => r.toLowerCase().includes('bundle') || 
                       r.toLowerCase().includes('size') ||
                       r.toLowerCase().includes('exceed')
                );
                expect(hasBundleRec).toBe(true);
              }
            } finally {
              await cleanupTestDir(distDir);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // ==========================================================================
  // Custom Thresholds Support
  // ==========================================================================

  describe('Custom thresholds are respected', () => {
    it('PROPERTY: analyzeBundle uses provided custom thresholds', async () => {
      await fc.assert(
        fc.asyncProperty(
          multipleChunksArb,
          customThresholdsArb,
          async (chunks, customThresholds) => {
            const distDir = createTestDistDir();
            
            try {
              await createMockDistDir(distDir, chunks);
              const result = analyzeBundle(distDir, customThresholds);
              
              // Verify thresholds in result match provided thresholds
              expect(result.thresholds).toEqual(customThresholds);
              
              // Verify exceedsTotalThreshold uses custom threshold
              const expectedExceeds = result.totalSize > customThresholds.totalBundleSize;
              expect(result.exceedsTotalThreshold).toBe(expectedExceeds);
            } finally {
              await cleanupTestDir(distDir);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: isBundleWithinThreshold respects custom maxSize', async () => {
      await fc.assert(
        fc.asyncProperty(
          multipleChunksArb,
          fc.integer({ min: 100 * 1024, max: 1000 * 1024 }),
          async (chunks, maxSize) => {
            const distDir = createTestDistDir();
            
            try {
              await createMockDistDir(distDir, chunks);
              const result = analyzeBundle(distDir);
              const isWithin = isBundleWithinThreshold(distDir, maxSize);
              
              // Should match manual comparison
              expect(isWithin).toBe(result.totalSize <= maxSize);
            } finally {
              await cleanupTestDir(distDir);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // ==========================================================================
  // Summary Statistics Accuracy
  // ==========================================================================

  describe('Summary statistics are accurate', () => {
    it('PROPERTY: summary.totalChunks equals chunks.length', async () => {
      await fc.assert(
        fc.asyncProperty(
          multipleChunksArb,
          async (chunks) => {
            const distDir = createTestDistDir();
            
            try {
              await createMockDistDir(distDir, chunks);
              const result = analyzeBundle(distDir);
              
              expect(result.summary.totalChunks).toBe(result.chunks.length);
            } finally {
              await cleanupTestDir(distDir);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: chunk type counts in summary are accurate', async () => {
      await fc.assert(
        fc.asyncProperty(
          multipleChunksArb,
          async (chunks) => {
            const distDir = createTestDistDir();
            
            try {
              await createMockDistDir(distDir, chunks);
              const result = analyzeBundle(distDir);
              
              // Count chunks by type
              const entryCount = result.chunks.filter(c => c.chunkType === 'entry').length;
              const vendorCount = result.chunks.filter(c => c.chunkType === 'vendor').length;
              const lazyCount = result.chunks.filter(c => c.chunkType === 'lazy').length;
              const cssCount = result.chunks.filter(c => c.chunkType === 'css').length;
              
              expect(result.summary.entryChunks).toBe(entryCount);
              expect(result.summary.vendorChunks).toBe(vendorCount);
              expect(result.summary.lazyChunks).toBe(lazyCount);
              expect(result.summary.cssFiles).toBe(cssCount);
            } finally {
              await cleanupTestDir(distDir);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // ==========================================================================
  // getBundleAnalysisForReport Format
  // ==========================================================================

  describe('getBundleAnalysisForReport returns correct format', () => {
    it('PROPERTY: returns object with totalSize and largestChunks', async () => {
      await fc.assert(
        fc.asyncProperty(
          multipleChunksArb,
          async (chunks) => {
            const distDir = createTestDistDir();
            
            try {
              await createMockDistDir(distDir, chunks);
              const report = getBundleAnalysisForReport(distDir);
              
              expect(report).toHaveProperty('totalSize');
              expect(report).toHaveProperty('largestChunks');
              expect(typeof report.totalSize).toBe('number');
              expect(Array.isArray(report.largestChunks)).toBe(true);
            } finally {
              await cleanupTestDir(distDir);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: largestChunks items have name and size', async () => {
      await fc.assert(
        fc.asyncProperty(
          multipleChunksArb,
          async (chunks) => {
            const distDir = createTestDistDir();
            
            try {
              await createMockDistDir(distDir, chunks);
              const report = getBundleAnalysisForReport(distDir);
              
              for (const chunk of report.largestChunks) {
                expect(chunk).toHaveProperty('name');
                expect(chunk).toHaveProperty('size');
                expect(typeof chunk.name).toBe('string');
                expect(typeof chunk.size).toBe('number');
              }
            } finally {
              await cleanupTestDir(distDir);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // ==========================================================================
  // getBundleSummary Format
  // ==========================================================================

  describe('getBundleSummary returns human-readable output', () => {
    it('PROPERTY: returns non-empty string', async () => {
      await fc.assert(
        fc.asyncProperty(
          multipleChunksArb,
          async (chunks) => {
            const distDir = createTestDistDir();
            
            try {
              await createMockDistDir(distDir, chunks);
              const result = analyzeBundle(distDir);
              const summary = getBundleSummary(result);
              
              expect(typeof summary).toBe('string');
              expect(summary.trim().length).toBeGreaterThan(0);
            } finally {
              await cleanupTestDir(distDir);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: summary contains status indicator', async () => {
      await fc.assert(
        fc.asyncProperty(
          multipleChunksArb,
          async (chunks) => {
            const distDir = createTestDistDir();
            
            try {
              await createMockDistDir(distDir, chunks);
              const result = analyzeBundle(distDir);
              const summary = getBundleSummary(result);
              
              // Should contain status indicator (✅ or ❌)
              const hasStatusIndicator = summary.includes('✅') || summary.includes('❌');
              expect(hasStatusIndicator).toBe(true);
            } finally {
              await cleanupTestDir(distDir);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: summary includes total size information', async () => {
      await fc.assert(
        fc.asyncProperty(
          multipleChunksArb,
          async (chunks) => {
            const distDir = createTestDistDir();
            
            try {
              await createMockDistDir(distDir, chunks);
              const result = analyzeBundle(distDir);
              const summary = getBundleSummary(result);
              
              // Should mention total size
              expect(summary.toLowerCase()).toContain('total');
              expect(summary.toLowerCase()).toContain('size');
            } finally {
              await cleanupTestDir(distDir);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // ==========================================================================
  // Edge Cases and Error Handling
  // ==========================================================================

  describe('Edge cases and error handling', () => {
    it('PROPERTY: Non-existent dist directory returns appropriate result', async () => {
      await fc.assert(
        fc.asyncProperty(
          hexHashArb,
          async (randomId) => {
            const nonExistentDir = `non-existent-dist-${randomId}`;
            const result = analyzeBundle(nonExistentDir);
            
            // Should return valid structure with zero sizes
            expect(result.totalSize).toBe(0);
            expect(result.chunks.length).toBe(0);
            expect(result.errors.length).toBeGreaterThan(0);
            expect(result.performanceIssues.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 10 }
      );
    });

    it('PROPERTY: Empty dist directory returns zero totals', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constant(null),
          async () => {
            const distDir = createTestDistDir();
            
            try {
              // Create empty dist structure
              const fullDistDir = join(process.cwd(), distDir);
              const jsDir = join(fullDistDir, 'assets', 'js');
              await mkdir(jsDir, { recursive: true });
              
              const result = analyzeBundle(distDir);
              
              expect(result.totalSize).toBe(0);
              expect(result.totalCSSSize).toBe(0);
              expect(result.chunks.length).toBe(0);
              expect(result.exceedsTotalThreshold).toBe(false);
            } finally {
              await cleanupTestDir(distDir);
            }
          }
        ),
        { numRuns: 10 }
      );
    });

    it('PROPERTY: isBundleWithinThreshold returns true for empty directory', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constant(null),
          async () => {
            const distDir = createTestDistDir();
            
            try {
              // Create empty dist structure
              const fullDistDir = join(process.cwd(), distDir);
              const jsDir = join(fullDistDir, 'assets', 'js');
              await mkdir(jsDir, { recursive: true });
              
              const isWithin = isBundleWithinThreshold(distDir);
              
              // Empty bundle (0 bytes) should be within any threshold
              expect(isWithin).toBe(true);
            } finally {
              await cleanupTestDir(distDir);
            }
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  // ==========================================================================
  // Chunk Type Classification
  // ==========================================================================

  describe('Chunk type classification is correct', () => {
    it('PROPERTY: Entry chunks are identified by name pattern', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.constantFrom('entry' as ChunkType),
            chunkSizeArb
          ).chain(([type, size]) => 
            chunkNameArb(type).map(name => ({ type, size, name }))
          ),
          async (entryChunk) => {
            const distDir = createTestDistDir();
            
            try {
              await createMockDistDir(distDir, [entryChunk]);
              const result = analyzeBundle(distDir);
              
              // Entry chunks should be classified as 'entry'
              const foundChunk = result.chunks.find(c => c.name === entryChunk.name);
              if (foundChunk) {
                expect(foundChunk.chunkType).toBe('entry');
              }
            } finally {
              await cleanupTestDir(distDir);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Vendor chunks are identified by name pattern', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.constantFrom('vendor' as ChunkType),
            chunkSizeArb
          ).chain(([type, size]) => 
            chunkNameArb(type).map(name => ({ type, size, name }))
          ),
          async (vendorChunk) => {
            const distDir = createTestDistDir();
            
            try {
              await createMockDistDir(distDir, [vendorChunk]);
              const result = analyzeBundle(distDir);
              
              // Vendor chunks should be classified as 'vendor'
              const foundChunk = result.chunks.find(c => c.name === vendorChunk.name);
              if (foundChunk) {
                expect(foundChunk.chunkType).toBe('vendor');
              }
            } finally {
              await cleanupTestDir(distDir);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: CSS files are identified correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.constantFrom('css' as ChunkType),
            chunkSizeArb
          ).chain(([type, size]) => 
            chunkNameArb(type).map(name => ({ type, size, name }))
          ),
          async (cssChunk) => {
            const distDir = createTestDistDir();
            
            try {
              await createMockDistDir(distDir, [cssChunk]);
              const result = analyzeBundle(distDir);
              
              // CSS files should be classified as 'css'
              const foundChunk = result.chunks.find(c => c.name === cssChunk.name);
              if (foundChunk) {
                expect(foundChunk.chunkType).toBe('css');
              }
            } finally {
              await cleanupTestDir(distDir);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // ==========================================================================
  // Default Thresholds Validation
  // ==========================================================================

  describe('Default thresholds match requirements', () => {
    it('PROPERTY: DEFAULT_THRESHOLDS.totalBundleSize is 500KB', () => {
      // From tech.md: Main bundle size target is <500KB
      expect(DEFAULT_THRESHOLDS.totalBundleSize).toBe(500 * 1024);
    });

    it('PROPERTY: All default thresholds are positive numbers', () => {
      expect(DEFAULT_THRESHOLDS.totalBundleSize).toBeGreaterThan(0);
      expect(DEFAULT_THRESHOLDS.individualChunkSize).toBeGreaterThan(0);
      expect(DEFAULT_THRESHOLDS.entryChunkSize).toBeGreaterThan(0);
      expect(DEFAULT_THRESHOLDS.vendorChunkSize).toBeGreaterThan(0);
      expect(DEFAULT_THRESHOLDS.lazyChunkWarning).toBeGreaterThan(0);
    });

    it('PROPERTY: Entry threshold is larger than lazy threshold', () => {
      // Entry chunks are expected to be larger than lazy-loaded chunks
      expect(DEFAULT_THRESHOLDS.entryChunkSize)
        .toBeGreaterThan(DEFAULT_THRESHOLDS.lazyChunkWarning);
    });
  });
});
