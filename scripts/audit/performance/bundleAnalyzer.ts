/**
 * Bundle Analyzer for MIHAS Frontend-Backend Forensic Audit
 * 
 * Analyzes Vite build output to:
 * - Calculate total bundle size
 * - Identify largest chunks
 * - Flag chunks exceeding thresholds
 * - Provide optimization recommendations
 * 
 * @requirements 7.5 - THE Frontend SHALL minimize JS bundle impact
 * 
 * Property 21: Bundle Size Threshold
 * *For any* build output, the total JS bundle size SHALL be below 500KB,
 * and the auditor SHALL flag any chunks exceeding reasonable thresholds.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { PerformanceIssue, PerformanceAuditResult } from '../types';

// =============================================================================
// Types
// =============================================================================

/**
 * Information about a single chunk in the build output.
 */
export interface ChunkInfo {
  /** Name of the chunk file */
  name: string;
  /** Full path to the chunk file */
  filePath: string;
  /** Size in bytes */
  size: number;
  /** Size in kilobytes (formatted) */
  sizeKB: number;
  /** Whether this chunk exceeds the threshold */
  exceedsThreshold: boolean;
  /** Type of chunk (entry, vendor, lazy, etc.) */
  chunkType: ChunkType;
  /** Gzipped size estimate (if available) */
  gzipSize?: number;
}

/**
 * Types of chunks that can be identified.
 */
export type ChunkType = 
  | 'entry'      // Main entry point
  | 'vendor'     // Third-party vendor chunk
  | 'lazy'       // Lazy-loaded page/component
  | 'shared'     // Shared code between chunks
  | 'css'        // CSS file
  | 'asset'      // Other assets
  | 'unknown';

/**
 * Thresholds for bundle size analysis.
 */
export interface BundleThresholds {
  /** Maximum total JS bundle size in bytes (default: 500KB) */
  totalBundleSize: number;
  /** Maximum individual chunk size in bytes (default: 100KB) */
  individualChunkSize: number;
  /** Maximum entry chunk size in bytes (default: 200KB) */
  entryChunkSize: number;
  /** Maximum vendor chunk size in bytes (default: 150KB) */
  vendorChunkSize: number;
  /** Warning threshold for lazy chunks in bytes (default: 50KB) */
  lazyChunkWarning: number;
}

/**
 * Result of bundle analysis.
 */
export interface BundleAnalysisResult {
  /** Total size of all JS files in bytes */
  totalSize: number;
  /** Total size in kilobytes */
  totalSizeKB: number;
  /** Total size of CSS files in bytes */
  totalCSSSize: number;
  /** All chunks found */
  chunks: ChunkInfo[];
  /** Largest chunks sorted by size */
  largestChunks: ChunkInfo[];
  /** Chunks that exceed thresholds */
  oversizedChunks: ChunkInfo[];
  /** Whether total bundle exceeds threshold */
  exceedsTotalThreshold: boolean;
  /** Performance issues found */
  performanceIssues: PerformanceIssue[];
  /** Optimization recommendations */
  recommendations: string[];
  /** Thresholds used for analysis */
  thresholds: BundleThresholds;
  /** Summary statistics */
  summary: {
    totalChunks: number;
    entryChunks: number;
    vendorChunks: number;
    lazyChunks: number;
    cssFiles: number;
  };
  /** Any errors encountered during analysis */
  errors: { filePath: string; error: string }[];
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Default thresholds based on project requirements.
 * From tech.md: Main bundle size target is <500KB
 */
export const DEFAULT_THRESHOLDS: BundleThresholds = {
  totalBundleSize: 500 * 1024,      // 500KB total
  individualChunkSize: 100 * 1024,   // 100KB per chunk
  entryChunkSize: 200 * 1024,        // 200KB for entry
  vendorChunkSize: 150 * 1024,       // 150KB for vendor
  lazyChunkWarning: 50 * 1024,       // 50KB warning for lazy chunks
};

/**
 * Patterns for identifying chunk types.
 */
const CHUNK_TYPE_PATTERNS = {
  /** Entry point chunks (index, main) */
  entry: /^(?:index|main|app)[-.].*\.js$/i,
  
  /** Vendor chunks */
  vendor: /^vendor[-.].*\.js$/i,
  
  /** Known vendor chunk names from Vite config */
  vendorSpecific: /^vendor-(?:excel|pdf|ocr|charts)[-.].*\.js$/i,
  
  /** Lazy-loaded page components */
  lazyPage: /^(?:[A-Z][a-zA-Z]+(?:Page|Dashboard|Admin|Settings|Detail|List))[-.].*\.js$/i,
  
  /** Shared utility chunks */
  shared: /^(?:use[A-Z]|api|format|schema|storage|catalog).*\.js$/i,
  
  /** CSS files */
  css: /\.css$/i,
};

/**
 * Recommendations for different chunk types.
 */
const CHUNK_RECOMMENDATIONS: Record<ChunkType, string> = {
  entry: 'Consider code splitting to reduce entry chunk size. Move non-critical code to lazy-loaded chunks.',
  vendor: 'Review vendor dependencies. Consider tree-shaking or replacing heavy libraries.',
  lazy: 'Lazy chunk is larger than expected. Consider further splitting or optimizing imports.',
  shared: 'Shared chunk is large. Review for unused exports or consider splitting.',
  css: 'CSS file is large. Consider purging unused styles or splitting critical CSS.',
  asset: 'Asset file is large. Consider compression or lazy loading.',
  unknown: 'Review this chunk for optimization opportunities.',
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Converts bytes to kilobytes with 2 decimal places.
 */
function bytesToKB(bytes: number): number {
  return Math.round((bytes / 1024) * 100) / 100;
}

/**
 * Formats bytes to human-readable string.
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${bytesToKB(bytes)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Determines the type of a chunk based on its filename.
 */
function determineChunkType(filename: string): ChunkType {
  if (CHUNK_TYPE_PATTERNS.css.test(filename)) {
    return 'css';
  }
  if (CHUNK_TYPE_PATTERNS.entry.test(filename)) {
    return 'entry';
  }
  if (CHUNK_TYPE_PATTERNS.vendorSpecific.test(filename) || CHUNK_TYPE_PATTERNS.vendor.test(filename)) {
    return 'vendor';
  }
  if (CHUNK_TYPE_PATTERNS.lazyPage.test(filename)) {
    return 'lazy';
  }
  if (CHUNK_TYPE_PATTERNS.shared.test(filename)) {
    return 'shared';
  }
  
  // Default to lazy for other JS files (likely lazy-loaded components)
  if (filename.endsWith('.js')) {
    return 'lazy';
  }
  
  return 'unknown';
}

/**
 * Gets the threshold for a specific chunk type.
 */
function getThresholdForChunkType(chunkType: ChunkType, thresholds: BundleThresholds): number {
  switch (chunkType) {
    case 'entry':
      return thresholds.entryChunkSize;
    case 'vendor':
      return thresholds.vendorChunkSize;
    case 'lazy':
    case 'shared':
      return thresholds.lazyChunkWarning;
    case 'css':
      return thresholds.individualChunkSize;
    default:
      return thresholds.individualChunkSize;
  }
}

/**
 * Recursively finds all files in a directory.
 */
function findAllFiles(dir: string): string[] {
  const files: string[] = [];
  
  if (!fs.existsSync(dir)) {
    return files;
  }
  
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      files.push(...findAllFiles(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  
  return files;
}

/**
 * Estimates gzip size (rough approximation).
 * Actual gzip compression varies, but JS typically compresses to ~30-40% of original.
 */
function estimateGzipSize(size: number): number {
  return Math.round(size * 0.35);
}

// =============================================================================
// Analysis Functions
// =============================================================================

/**
 * Analyzes a single chunk file.
 */
function analyzeChunk(
  filePath: string,
  baseDir: string,
  thresholds: BundleThresholds
): ChunkInfo | null {
  try {
    const stats = fs.statSync(filePath);
    const filename = path.basename(filePath);
    const relativePath = path.relative(baseDir, filePath);
    const chunkType = determineChunkType(filename);
    const threshold = getThresholdForChunkType(chunkType, thresholds);
    
    return {
      name: filename,
      filePath: relativePath,
      size: stats.size,
      sizeKB: bytesToKB(stats.size),
      exceedsThreshold: stats.size > threshold,
      chunkType,
      gzipSize: estimateGzipSize(stats.size),
    };
  } catch {
    return null;
  }
}

/**
 * Generates performance issues for oversized chunks.
 */
function generatePerformanceIssues(
  chunks: ChunkInfo[],
  totalSize: number,
  thresholds: BundleThresholds
): PerformanceIssue[] {
  const issues: PerformanceIssue[] = [];
  
  // Check total bundle size
  if (totalSize > thresholds.totalBundleSize) {
    issues.push({
      type: 'LARGE_BUNDLE',
      filePath: 'dist/assets/js/',
      evidence: `Total JS bundle size is ${formatBytes(totalSize)}, exceeding the ${formatBytes(thresholds.totalBundleSize)} threshold`,
      impact: 'high',
      recommendation: 'Review and optimize bundle. Consider code splitting, tree shaking, and removing unused dependencies.',
    });
  }
  
  // Check individual chunks
  for (const chunk of chunks) {
    if (chunk.exceedsThreshold && chunk.chunkType !== 'css') {
      const threshold = getThresholdForChunkType(chunk.chunkType, thresholds);
      const impact = chunk.chunkType === 'entry' ? 'high' : 
                     chunk.chunkType === 'vendor' ? 'high' : 'medium';
      
      issues.push({
        type: 'LARGE_BUNDLE',
        filePath: chunk.filePath,
        evidence: `Chunk "${chunk.name}" is ${formatBytes(chunk.size)}, exceeding the ${formatBytes(threshold)} threshold for ${chunk.chunkType} chunks`,
        impact,
        recommendation: CHUNK_RECOMMENDATIONS[chunk.chunkType],
      });
    }
  }
  
  return issues;
}

/**
 * Generates optimization recommendations based on analysis.
 */
function generateRecommendations(
  chunks: ChunkInfo[],
  totalSize: number,
  thresholds: BundleThresholds
): string[] {
  const recommendations: string[] = [];
  
  // Total size recommendation
  if (totalSize > thresholds.totalBundleSize) {
    const overBy = totalSize - thresholds.totalBundleSize;
    recommendations.push(
      `Total bundle exceeds target by ${formatBytes(overBy)}. Priority: reduce bundle size.`
    );
  }
  
  // Entry chunk recommendations
  const entryChunks = chunks.filter(c => c.chunkType === 'entry');
  const largeEntryChunks = entryChunks.filter(c => c.exceedsThreshold);
  if (largeEntryChunks.length > 0) {
    recommendations.push(
      'Entry chunks are large. Consider lazy-loading non-critical routes and components.'
    );
  }
  
  // Vendor chunk recommendations
  const vendorChunks = chunks.filter(c => c.chunkType === 'vendor');
  const largeVendorChunks = vendorChunks.filter(c => c.exceedsThreshold);
  if (largeVendorChunks.length > 0) {
    recommendations.push(
      `${largeVendorChunks.length} vendor chunk(s) exceed threshold. Review dependencies for lighter alternatives.`
    );
  }
  
  // Lazy chunk recommendations
  const lazyChunks = chunks.filter(c => c.chunkType === 'lazy');
  const largeLazyChunks = lazyChunks.filter(c => c.size > thresholds.lazyChunkWarning);
  if (largeLazyChunks.length > 5) {
    recommendations.push(
      `${largeLazyChunks.length} lazy chunks exceed ${formatBytes(thresholds.lazyChunkWarning)}. Consider further code splitting.`
    );
  }
  
  // Check for potential duplicate code
  const similarSizedChunks = chunks.filter(c => 
    c.chunkType === 'lazy' && 
    chunks.some(other => 
      other !== c && 
      Math.abs(other.size - c.size) < 1000 && 
      other.chunkType === 'lazy'
    )
  );
  if (similarSizedChunks.length > 4) {
    recommendations.push(
      'Multiple chunks have similar sizes. Check for duplicate code that could be extracted to shared chunks.'
    );
  }
  
  // CSS recommendations
  const cssChunks = chunks.filter(c => c.chunkType === 'css');
  const totalCSSSize = cssChunks.reduce((sum, c) => sum + c.size, 0);
  if (totalCSSSize > 100 * 1024) {
    recommendations.push(
      `Total CSS is ${formatBytes(totalCSSSize)}. Consider purging unused Tailwind classes.`
    );
  }
  
  // General recommendations if bundle is healthy
  if (recommendations.length === 0) {
    recommendations.push('Bundle size is within acceptable limits. Continue monitoring for regressions.');
  }
  
  return recommendations;
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Analyzes the Vite build output for bundle size issues.
 * 
 * @param distDir - Path to the dist directory (default: 'dist')
 * @param thresholds - Custom thresholds (optional)
 * @returns BundleAnalysisResult containing all analysis findings
 * 
 * **Validates: Requirements 7.5**
 */
export function analyzeBundle(
  distDir: string = 'dist',
  thresholds: BundleThresholds = DEFAULT_THRESHOLDS
): BundleAnalysisResult {
  const projectRoot = process.cwd();
  const fullDistDir = path.join(projectRoot, distDir);
  const assetsDir = path.join(fullDistDir, 'assets');
  const jsDir = path.join(assetsDir, 'js');
  
  const errors: { filePath: string; error: string }[] = [];
  const chunks: ChunkInfo[] = [];
  
  // Check if dist directory exists
  if (!fs.existsSync(fullDistDir)) {
    return {
      totalSize: 0,
      totalSizeKB: 0,
      totalCSSSize: 0,
      chunks: [],
      largestChunks: [],
      oversizedChunks: [],
      exceedsTotalThreshold: false,
      performanceIssues: [{
        type: 'LARGE_BUNDLE',
        filePath: distDir,
        evidence: `Build output directory "${distDir}" not found. Run "bun run build" first.`,
        impact: 'high',
        recommendation: 'Run the build command to generate the dist directory.',
      }],
      recommendations: ['Run "bun run build" to generate the build output.'],
      thresholds,
      summary: {
        totalChunks: 0,
        entryChunks: 0,
        vendorChunks: 0,
        lazyChunks: 0,
        cssFiles: 0,
      },
      errors: [{ filePath: distDir, error: 'Directory not found' }],
    };
  }
  
  // Analyze JS files
  if (fs.existsSync(jsDir)) {
    const jsFiles = findAllFiles(jsDir).filter(f => f.endsWith('.js'));
    
    for (const filePath of jsFiles) {
      const chunk = analyzeChunk(filePath, fullDistDir, thresholds);
      if (chunk) {
        chunks.push(chunk);
      } else {
        errors.push({ filePath, error: 'Failed to analyze chunk' });
      }
    }
  }
  
  // Analyze CSS files
  if (fs.existsSync(assetsDir)) {
    const cssFiles = findAllFiles(assetsDir).filter(f => f.endsWith('.css'));
    
    for (const filePath of cssFiles) {
      const chunk = analyzeChunk(filePath, fullDistDir, thresholds);
      if (chunk) {
        chunks.push(chunk);
      }
    }
  }
  
  // Calculate totals
  const jsChunks = chunks.filter(c => c.chunkType !== 'css');
  const cssChunks = chunks.filter(c => c.chunkType === 'css');
  const totalSize = jsChunks.reduce((sum, c) => sum + c.size, 0);
  const totalCSSSize = cssChunks.reduce((sum, c) => sum + c.size, 0);
  
  // Sort and filter
  const sortedChunks = [...jsChunks].sort((a, b) => b.size - a.size);
  const largestChunks = sortedChunks.slice(0, 10);
  const oversizedChunks = chunks.filter(c => c.exceedsThreshold);
  
  // Generate issues and recommendations
  const performanceIssues = generatePerformanceIssues(chunks, totalSize, thresholds);
  const recommendations = generateRecommendations(chunks, totalSize, thresholds);
  
  // Calculate summary
  const summary = {
    totalChunks: chunks.length,
    entryChunks: chunks.filter(c => c.chunkType === 'entry').length,
    vendorChunks: chunks.filter(c => c.chunkType === 'vendor').length,
    lazyChunks: chunks.filter(c => c.chunkType === 'lazy').length,
    cssFiles: cssChunks.length,
  };
  
  return {
    totalSize,
    totalSizeKB: bytesToKB(totalSize),
    totalCSSSize,
    chunks,
    largestChunks,
    oversizedChunks,
    exceedsTotalThreshold: totalSize > thresholds.totalBundleSize,
    performanceIssues,
    recommendations,
    thresholds,
    summary,
    errors,
  };
}

/**
 * Gets bundle analysis in the format expected by PerformanceAuditResult.
 * 
 * @param distDir - Path to the dist directory (default: 'dist')
 * @returns Bundle analysis in PerformanceAuditResult format
 * 
 * **Validates: Requirements 7.5**
 */
export function getBundleAnalysisForReport(
  distDir: string = 'dist'
): PerformanceAuditResult['bundleAnalysis'] {
  const result = analyzeBundle(distDir);
  
  return {
    totalSize: result.totalSize,
    largestChunks: result.largestChunks.map(c => ({
      name: c.name,
      size: c.size,
    })),
  };
}

/**
 * Checks if the bundle meets the size threshold.
 * 
 * @param distDir - Path to the dist directory (default: 'dist')
 * @param maxSize - Maximum allowed size in bytes (default: 500KB)
 * @returns true if bundle is within threshold
 * 
 * **Validates: Requirements 7.5**
 */
export function isBundleWithinThreshold(
  distDir: string = 'dist',
  maxSize: number = DEFAULT_THRESHOLDS.totalBundleSize
): boolean {
  const result = analyzeBundle(distDir);
  return result.totalSize <= maxSize;
}

/**
 * Gets a summary of the bundle analysis.
 * 
 * @param result - BundleAnalysisResult to summarize
 * @returns Human-readable summary string
 */
export function getBundleSummary(result: BundleAnalysisResult): string {
  const lines: string[] = [];
  
  lines.push('Bundle Analyzer Summary');
  lines.push('=======================\n');
  
  // Overall status
  const status = result.exceedsTotalThreshold ? '❌ EXCEEDS THRESHOLD' : '✅ WITHIN THRESHOLD';
  lines.push(`Status: ${status}`);
  lines.push(`Total JS Size: ${formatBytes(result.totalSize)} (target: <${formatBytes(result.thresholds.totalBundleSize)})`);
  lines.push(`Total CSS Size: ${formatBytes(result.totalCSSSize)}`);
  lines.push(`Estimated Gzip: ~${formatBytes(estimateGzipSize(result.totalSize))}`);
  lines.push('');
  
  // Summary stats
  lines.push('Chunk Summary:');
  lines.push(`  Total chunks: ${result.summary.totalChunks}`);
  lines.push(`  Entry chunks: ${result.summary.entryChunks}`);
  lines.push(`  Vendor chunks: ${result.summary.vendorChunks}`);
  lines.push(`  Lazy chunks: ${result.summary.lazyChunks}`);
  lines.push(`  CSS files: ${result.summary.cssFiles}`);
  lines.push('');
  
  // Largest chunks
  lines.push('Top 10 Largest Chunks:');
  for (let i = 0; i < result.largestChunks.length; i++) {
    const chunk = result.largestChunks[i];
    const marker = chunk.exceedsThreshold ? '⚠️' : '  ';
    lines.push(`${marker} ${i + 1}. ${chunk.name} - ${formatBytes(chunk.size)} (${chunk.chunkType})`);
  }
  lines.push('');
  
  // Oversized chunks
  if (result.oversizedChunks.length > 0) {
    lines.push(`Oversized Chunks (${result.oversizedChunks.length}):`);
    for (const chunk of result.oversizedChunks) {
      const threshold = getThresholdForChunkType(chunk.chunkType, result.thresholds);
      lines.push(`  ⚠️ ${chunk.name}: ${formatBytes(chunk.size)} (threshold: ${formatBytes(threshold)})`);
    }
    lines.push('');
  }
  
  // Recommendations
  lines.push('Recommendations:');
  for (const rec of result.recommendations) {
    lines.push(`  • ${rec}`);
  }
  
  // Errors
  if (result.errors.length > 0) {
    lines.push('');
    lines.push('Errors:');
    for (const error of result.errors) {
      lines.push(`  - ${error.filePath}: ${error.error}`);
    }
  }
  
  return lines.join('\n');
}

// =============================================================================
// CLI Execution
// =============================================================================

/**
 * Runs the bundle analyzer and prints results to console.
 * Can be called directly or via CLI.
 */
export function runBundleAnalyzerCLI(): void {
  console.log('Bundle Analyzer for MIHAS Frontend-Backend Forensic Audit');
  console.log('==========================================================\n');
  
  const result = analyzeBundle();
  console.log(getBundleSummary(result));
  
  // Detailed output for performance issues
  if (result.performanceIssues.length > 0) {
    console.log('\nPerformance Issues:');
    console.log('-------------------');
    
    for (const issue of result.performanceIssues) {
      console.log(`\n[${issue.impact.toUpperCase()}] ${issue.filePath}`);
      console.log(`  Evidence: ${issue.evidence}`);
      console.log(`  Recommendation: ${issue.recommendation}`);
    }
  }
}

// Check if running as main module
const isMainModule = (): boolean => {
  const scriptPath = process.argv[1];
  if (!scriptPath) return false;
  
  const normalizedScript = scriptPath.replace(/\\/g, '/');
  const normalizedMeta = import.meta.url.replace(/\\/g, '/').replace('file:///', '').replace('file://', '');
  
  return normalizedScript.includes('bundleAnalyzer') || normalizedMeta.includes(normalizedScript);
};

if (isMainModule()) {
  runBundleAnalyzerCLI();
}
