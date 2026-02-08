/**
 * Page Validation Matrix Report Generator
 * 
 * Generates a comprehensive Markdown report of all page audit results,
 * including data loading, auth checks, error handling, state handling,
 * race conditions, and mobile responsiveness.
 * 
 * Validates: Requirements 2.1-2.12
 * 
 * @module scripts/audit/page/reportGenerator
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import type { 
  PageAuditResult,
  DataLoadStep,
  AuthCheckResult,
  ErrorHandlingResult,
  RaceConditionRisk,
  DeadCodeItem,
  DuplicateItem,
  OverFetchItem
} from '../types';
import { scanPages, type PageInfo } from './pageScanner';
import { traceDataLoadPath, type DataLoadTraceResult } from './dataLoadTracer';
import { verifyAuthCheck } from './authVerifier';
import { verifyErrorHandling } from './errorVerifier';
import { verifyStateHandling } from './stateVerifier';
import { detectRaceConditions } from './raceDetector';
import { checkMobileResponsiveness } from './mobileChecker';

/**
 * Default output path for the page validation matrix report
 */
const DEFAULT_OUTPUT_PATH = 'forensic_reports/page-validation-matrix.md';

/**
 * Report metadata
 */
interface ReportMetadata {
  timestamp: string;
  version: string;
  projectRoot: string;
}

/**
 * Generates the current timestamp in ISO format
 */
function getTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Gets severity emoji for display
 */
function getSeverityEmoji(severity: 'high' | 'medium' | 'low' | 'none'): string {
  switch (severity) {
    case 'high':
      return '🔴';
    case 'medium':
      return '🟡';
    case 'low':
      return '🟢';
    case 'none':
      return '✅';
    default:
      return '⚪';
  }
}

/**
 * Gets status emoji for boolean checks
 */
function getStatusEmoji(status: boolean): string {
  return status ? '✅' : '❌';
}

/**
 * Calculates overall page health based on audit results
 */
function calculatePageHealth(result: PageAuditResult): 'healthy' | 'warning' | 'critical' {
  const criticalIssues = 
    !result.authCheck.hasAuthCheck && result.pagePath.includes('admin') ||
    !result.authCheck.hasAuthCheck && result.pagePath.includes('student') ||
    result.raceConditions.filter(r => r.severity === 'high').length > 0;
  
  const warningIssues =
    !result.errorHandling.hasErrorHandling ||
    !result.loadingStates ||
    !result.emptyStates ||
    result.raceConditions.filter(r => r.severity === 'medium').length > 0 ||
    !result.mobileResponsive;
  
  if (criticalIssues) return 'critical';
  if (warningIssues) return 'warning';
  return 'healthy';
}

/**
 * Gets health status emoji
 */
function getHealthEmoji(health: 'healthy' | 'warning' | 'critical'): string {
  switch (health) {
    case 'healthy':
      return '🟢';
    case 'warning':
      return '🟡';
    case 'critical':
      return '🔴';
    default:
      return '⚪';
  }
}

/**
 * Audits a single page file and returns the complete audit result.
 * 
 * @param filePath - Path to the page file (relative to project root)
 * @param baseDir - Base directory (defaults to process.cwd())
 * @returns PageAuditResult with all audit findings
 */
export function auditPage(filePath: string, baseDir: string = process.cwd()): PageAuditResult {
  // Get component name from file path
  const componentName = filePath
    .split('/')
    .pop()
    ?.replace('.tsx', '')
    ?.replace(/[-_]/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('') || 'Unknown';

  // Trace data load path
  const dataLoadResult = traceDataLoadPath(filePath, baseDir);
  const dataLoadPath: DataLoadStep[] = dataLoadResult.steps;

  // Verify auth check
  const authCheck = verifyAuthCheck(filePath, baseDir);

  // Verify error handling
  const errorHandling = verifyErrorHandling(filePath, baseDir);

  // Verify state handling
  const stateHandling = verifyStateHandling(filePath, baseDir);

  // Detect race conditions
  const raceResult = detectRaceConditions(filePath, baseDir);

  // Check mobile responsiveness
  const mobileResult = checkMobileResponsiveness(filePath, baseDir);

  // Build the complete audit result
  const result: PageAuditResult = {
    pagePath: filePath,
    componentName,
    dataLoadPath,
    authCheck,
    errorHandling,
    emptyStates: stateHandling.hasEmptyStateHandling,
    loadingStates: stateHandling.hasLoadingStateHandling,
    raceConditions: raceResult.raceConditions,
    mobileResponsive: mobileResult.isMobileResponsive,
    networkRecovery: errorHandling.hasErrorHandling, // Network recovery is part of error handling
    deadCode: [], // Would require additional analysis
    duplicateLogic: [], // Would require additional analysis
    unusedHooks: [], // Would require additional analysis
    overFetching: [], // Would require additional analysis
  };

  return result;
}

/**
 * Audits all pages in the src/pages/ directory.
 * 
 * @param baseDir - Base directory (defaults to process.cwd())
 * @returns Array of PageAuditResult for all pages
 */
export function auditAllPages(baseDir: string = process.cwd()): PageAuditResult[] {
  const scanResult = scanPages(baseDir);
  const results: PageAuditResult[] = [];

  for (const page of scanResult.pages) {
    try {
      const result = auditPage(page.filePath, baseDir);
      results.push(result);
    } catch (error) {
      // Log error but continue with other pages
      console.error(`Error auditing ${page.filePath}:`, error);
    }
  }

  return results;
}

/**
 * Generates summary statistics from audit results
 */
function generateSummaryStats(results: PageAuditResult[]): {
  totalPages: number;
  pagesWithIssues: number;
  healthyPages: number;
  warningPages: number;
  criticalPages: number;
  authIssues: number;
  errorHandlingIssues: number;
  stateHandlingIssues: number;
  raceConditionIssues: number;
  mobileIssues: number;
} {
  let healthyPages = 0;
  let warningPages = 0;
  let criticalPages = 0;
  let authIssues = 0;
  let errorHandlingIssues = 0;
  let stateHandlingIssues = 0;
  let raceConditionIssues = 0;
  let mobileIssues = 0;

  for (const result of results) {
    const health = calculatePageHealth(result);
    
    if (health === 'healthy') healthyPages++;
    else if (health === 'warning') warningPages++;
    else criticalPages++;

    // Count specific issues
    if (result.authCheck.issues.length > 0) authIssues++;
    if (!result.errorHandling.hasErrorHandling) errorHandlingIssues++;
    if (!result.loadingStates || !result.emptyStates) stateHandlingIssues++;
    if (result.raceConditions.length > 0) raceConditionIssues++;
    if (!result.mobileResponsive) mobileIssues++;
  }

  return {
    totalPages: results.length,
    pagesWithIssues: warningPages + criticalPages,
    healthyPages,
    warningPages,
    criticalPages,
    authIssues,
    errorHandlingIssues,
    stateHandlingIssues,
    raceConditionIssues,
    mobileIssues,
  };
}

/**
 * Generates the executive summary section of the report
 */
function generateExecutiveSummary(
  results: PageAuditResult[],
  stats: ReturnType<typeof generateSummaryStats>
): string {
  const healthStatus = stats.criticalPages > 0
    ? '🔴 **CRITICAL** - Immediate action required'
    : stats.warningPages > 0
      ? '🟡 **WARNING** - Issues need attention'
      : '🟢 **HEALTHY** - All pages pass validation';

  return `## Executive Summary

**Report Generated**: ${getTimestamp()}

### Page Health Status

${healthStatus}

### Overview

| Metric | Count |
|--------|-------|
| Total Pages Analyzed | ${stats.totalPages} |
| Pages with Issues | ${stats.pagesWithIssues} |
| Healthy Pages | ${stats.healthyPages} |
| Warning Pages | ${stats.warningPages} |
| Critical Pages | ${stats.criticalPages} |

### Issues by Category

| Category | Pages Affected | Status |
|----------|----------------|--------|
| Auth Issues | ${stats.authIssues} | ${stats.authIssues === 0 ? '✅' : '⚠️'} |
| Error Handling | ${stats.errorHandlingIssues} | ${stats.errorHandlingIssues === 0 ? '✅' : '⚠️'} |
| State Handling | ${stats.stateHandlingIssues} | ${stats.stateHandlingIssues === 0 ? '✅' : '⚠️'} |
| Race Conditions | ${stats.raceConditionIssues} | ${stats.raceConditionIssues === 0 ? '✅' : '⚠️'} |
| Mobile Responsiveness | ${stats.mobileIssues} | ${stats.mobileIssues === 0 ? '✅' : '⚠️'} |

`;
}

/**
 * Generates the validation matrix table
 */
function generateValidationMatrix(results: PageAuditResult[]): string {
  const lines: string[] = [];
  
  lines.push('## Page Validation Matrix');
  lines.push('');
  lines.push('| Page | Health | Auth | Error | Loading | Empty | Race | Mobile |');
  lines.push('|------|--------|------|-------|---------|-------|------|--------|');

  // Sort results by health status (critical first, then warning, then healthy)
  const sortedResults = [...results].sort((a, b) => {
    const healthOrder = { critical: 0, warning: 1, healthy: 2 };
    return healthOrder[calculatePageHealth(a)] - healthOrder[calculatePageHealth(b)];
  });

  for (const result of sortedResults) {
    const health = calculatePageHealth(result);
    const healthEmoji = getHealthEmoji(health);
    const authStatus = getStatusEmoji(result.authCheck.hasAuthCheck || result.authCheck.issues.length === 0);
    const errorStatus = getStatusEmoji(result.errorHandling.hasErrorHandling);
    const loadingStatus = getStatusEmoji(result.loadingStates);
    const emptyStatus = getStatusEmoji(result.emptyStates);
    const raceStatus = getStatusEmoji(result.raceConditions.length === 0);
    const mobileStatus = getStatusEmoji(result.mobileResponsive);

    // Truncate long paths for readability
    const displayPath = result.pagePath.length > 40 
      ? '...' + result.pagePath.slice(-37) 
      : result.pagePath;

    lines.push(`| \`${displayPath}\` | ${healthEmoji} | ${authStatus} | ${errorStatus} | ${loadingStatus} | ${emptyStatus} | ${raceStatus} | ${mobileStatus} |`);
  }

  lines.push('');
  lines.push('**Legend**: ✅ Pass | ❌ Fail | 🟢 Healthy | 🟡 Warning | 🔴 Critical');
  lines.push('');

  return lines.join('\n');
}

/**
 * Generates detailed findings for pages with issues
 */
function generateDetailedFindings(results: PageAuditResult[]): string {
  const lines: string[] = [];
  
  // Filter to only pages with issues
  const pagesWithIssues = results.filter(r => calculatePageHealth(r) !== 'healthy');

  if (pagesWithIssues.length === 0) {
    lines.push('## Detailed Findings');
    lines.push('');
    lines.push('✅ **No issues found!** All pages pass validation checks.');
    lines.push('');
    return lines.join('\n');
  }

  lines.push('## Detailed Findings');
  lines.push('');

  // Sort by severity (critical first)
  const sortedPages = [...pagesWithIssues].sort((a, b) => {
    const healthOrder = { critical: 0, warning: 1, healthy: 2 };
    return healthOrder[calculatePageHealth(a)] - healthOrder[calculatePageHealth(b)];
  });

  for (const result of sortedPages) {
    const health = calculatePageHealth(result);
    const healthEmoji = getHealthEmoji(health);

    lines.push(`### ${healthEmoji} ${result.componentName}`);
    lines.push('');
    lines.push(`**File**: \`${result.pagePath}\``);
    lines.push(`**Status**: ${health.toUpperCase()}`);
    lines.push('');

    // Auth issues
    if (result.authCheck.issues.length > 0) {
      lines.push('#### Auth Issues');
      lines.push('');
      for (const issue of result.authCheck.issues) {
        lines.push(`- ${issue}`);
      }
      lines.push('');
    }

    // Error handling issues
    if (!result.errorHandling.hasErrorHandling || result.errorHandling.unhandledCalls.length > 0) {
      lines.push('#### Error Handling Issues');
      lines.push('');
      if (!result.errorHandling.hasErrorHandling) {
        lines.push('- No error handling mechanisms detected');
      }
      for (const call of result.errorHandling.unhandledCalls) {
        lines.push(`- Unhandled: ${call}`);
      }
      lines.push('');
    }

    // State handling issues
    if (!result.loadingStates || !result.emptyStates) {
      lines.push('#### State Handling Issues');
      lines.push('');
      if (!result.loadingStates) {
        lines.push('- Missing loading state handling');
      }
      if (!result.emptyStates) {
        lines.push('- Missing empty state handling');
      }
      lines.push('');
    }

    // Race condition issues
    if (result.raceConditions.length > 0) {
      lines.push('#### Race Condition Risks');
      lines.push('');
      for (const risk of result.raceConditions) {
        const severityEmoji = getSeverityEmoji(risk.severity);
        lines.push(`- ${severityEmoji} **${risk.severity.toUpperCase()}**: ${risk.description}`);
      }
      lines.push('');
    }

    // Mobile responsiveness issues
    if (!result.mobileResponsive) {
      lines.push('#### Mobile Responsiveness Issues');
      lines.push('');
      lines.push('- Page lacks responsive styling (Tailwind breakpoints or media queries)');
      lines.push('');
    }

    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Generates recommendations section
 */
function generateRecommendations(
  results: PageAuditResult[],
  stats: ReturnType<typeof generateSummaryStats>
): string {
  const lines: string[] = [];
  
  lines.push('## Recommendations');
  lines.push('');
  lines.push('### Priority Actions');
  lines.push('');

  let priority = 1;

  // Critical: Auth issues on protected pages
  const authIssuePages = results.filter(r => 
    r.authCheck.issues.length > 0 && 
    (r.pagePath.includes('admin') || r.pagePath.includes('student'))
  );
  if (authIssuePages.length > 0) {
    lines.push(`**${priority}. Fix Authentication Issues (Critical)**`);
    lines.push('');
    lines.push('The following protected pages have authentication issues:');
    lines.push('');
    for (const page of authIssuePages) {
      lines.push(`- \`${page.pagePath}\`: ${page.authCheck.issues[0]}`);
    }
    lines.push('');
    lines.push('**Action**: Add appropriate auth checks using `useAuth`, `ProtectedRoute`, or `AdminRoute`.');
    lines.push('');
    priority++;
  }

  // High: Race conditions
  const raceConditionPages = results.filter(r => 
    r.raceConditions.filter(rc => rc.severity === 'high').length > 0
  );
  if (raceConditionPages.length > 0) {
    lines.push(`**${priority}. Fix High-Severity Race Conditions (High)**`);
    lines.push('');
    lines.push('The following pages have high-severity race condition risks:');
    lines.push('');
    for (const page of raceConditionPages) {
      const highRisks = page.raceConditions.filter(rc => rc.severity === 'high');
      lines.push(`- \`${page.pagePath}\`: ${highRisks.length} high-severity risk(s)`);
    }
    lines.push('');
    lines.push('**Action**: Add cleanup functions to async useEffects, use AbortController for fetch cancellation.');
    lines.push('');
    priority++;
  }

  // Medium: Error handling
  const errorHandlingPages = results.filter(r => !r.errorHandling.hasErrorHandling);
  if (errorHandlingPages.length > 0) {
    lines.push(`**${priority}. Add Error Handling (Medium)**`);
    lines.push('');
    lines.push('The following pages lack error handling:');
    lines.push('');
    for (const page of errorHandlingPages.slice(0, 10)) {
      lines.push(`- \`${page.pagePath}\``);
    }
    if (errorHandlingPages.length > 10) {
      lines.push(`- ... and ${errorHandlingPages.length - 10} more`);
    }
    lines.push('');
    lines.push('**Action**: Add try-catch blocks, .catch() handlers, or onError callbacks to API calls.');
    lines.push('');
    priority++;
  }

  // Medium: State handling
  const stateHandlingPages = results.filter(r => !r.loadingStates || !r.emptyStates);
  if (stateHandlingPages.length > 0) {
    lines.push(`**${priority}. Add Loading/Empty State Handling (Medium)**`);
    lines.push('');
    lines.push('The following pages lack proper state handling:');
    lines.push('');
    for (const page of stateHandlingPages.slice(0, 10)) {
      const issues: string[] = [];
      if (!page.loadingStates) issues.push('loading');
      if (!page.emptyStates) issues.push('empty');
      lines.push(`- \`${page.pagePath}\`: Missing ${issues.join(', ')} state handling`);
    }
    if (stateHandlingPages.length > 10) {
      lines.push(`- ... and ${stateHandlingPages.length - 10} more`);
    }
    lines.push('');
    lines.push('**Action**: Add isLoading conditionals with Skeleton/Spinner components, and empty state UI.');
    lines.push('');
    priority++;
  }

  // Low: Mobile responsiveness
  const mobileIssuePages = results.filter(r => !r.mobileResponsive);
  if (mobileIssuePages.length > 0) {
    lines.push(`**${priority}. Improve Mobile Responsiveness (Low)**`);
    lines.push('');
    lines.push('The following pages lack responsive styling:');
    lines.push('');
    for (const page of mobileIssuePages.slice(0, 10)) {
      lines.push(`- \`${page.pagePath}\``);
    }
    if (mobileIssuePages.length > 10) {
      lines.push(`- ... and ${mobileIssuePages.length - 10} more`);
    }
    lines.push('');
    lines.push('**Action**: Add Tailwind responsive prefixes (sm:, md:, lg:) for mobile-first design.');
    lines.push('');
  }

  if (priority === 1) {
    lines.push('✅ **No recommendations** - All pages pass validation checks!');
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Generates the data load paths appendix
 */
function generateDataLoadPathsAppendix(results: PageAuditResult[]): string {
  const lines: string[] = [];
  
  lines.push('## Appendix: Data Load Paths');
  lines.push('');
  lines.push('This section documents the data loading patterns for each page.');
  lines.push('');

  // Filter to pages with data loading
  const pagesWithDataLoading = results.filter(r => r.dataLoadPath.length > 0);

  if (pagesWithDataLoading.length === 0) {
    lines.push('No data loading patterns detected in any pages.');
    lines.push('');
    return lines.join('\n');
  }

  for (const result of pagesWithDataLoading) {
    lines.push(`### ${result.componentName}`);
    lines.push('');
    lines.push(`**File**: \`${result.pagePath}\``);
    lines.push('');
    lines.push('| Hook | Endpoint | Cache Strategy |');
    lines.push('|------|----------|----------------|');
    
    for (const step of result.dataLoadPath) {
      const endpoint = step.endpoint.length > 40 
        ? step.endpoint.slice(0, 37) + '...' 
        : step.endpoint;
      lines.push(`| ${step.hook} | \`${endpoint}\` | ${step.cacheStrategy} |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Generates the full page validation matrix report as a Markdown string.
 * 
 * @param results - Array of PageAuditResult to include in the report
 * @returns Markdown formatted report string
 */
export function generatePageValidationMatrix(results: PageAuditResult[]): string {
  const stats = generateSummaryStats(results);
  
  const sections: string[] = [];

  // Header
  sections.push('# Page Validation Matrix Report');
  sections.push('');
  sections.push('> Forensic audit of all page components for data loading, auth, error handling, state management, race conditions, and mobile responsiveness.');
  sections.push('');
  sections.push(`**Generated**: ${getTimestamp()}`);
  sections.push(`**Audit Version**: 1.0.0`);
  sections.push('');

  // Table of Contents
  sections.push('## Table of Contents');
  sections.push('');
  sections.push('1. [Executive Summary](#executive-summary)');
  sections.push('2. [Page Validation Matrix](#page-validation-matrix)');
  sections.push('3. [Detailed Findings](#detailed-findings)');
  sections.push('4. [Recommendations](#recommendations)');
  sections.push('5. [Appendix: Data Load Paths](#appendix-data-load-paths)');
  sections.push('');

  // Executive Summary
  sections.push(generateExecutiveSummary(results, stats));

  // Validation Matrix
  sections.push(generateValidationMatrix(results));

  // Detailed Findings
  sections.push(generateDetailedFindings(results));

  // Recommendations
  sections.push(generateRecommendations(results, stats));

  // Appendix: Data Load Paths
  sections.push(generateDataLoadPathsAppendix(results));

  // Footer
  sections.push('---');
  sections.push('');
  sections.push('*This report was generated by the MIHAS Frontend-Backend Forensic Audit System.*');
  sections.push('');
  sections.push('**Validates**: Requirements 2.1-2.12 - Page-by-Page Functional Audit');

  return sections.join('\n');
}

/**
 * Writes the page validation report to a file.
 * 
 * @param results - Array of PageAuditResult to include in the report
 * @param outputPath - Path to write the report (relative to project root)
 * @returns Promise that resolves when the report is written
 */
export async function writePageValidationReport(
  results: PageAuditResult[],
  outputPath: string = DEFAULT_OUTPUT_PATH
): Promise<void> {
  const report = generatePageValidationMatrix(results);
  
  // Ensure output directory exists
  const outputDir = dirname(outputPath);
  
  if (!existsSync(outputDir)) {
    await mkdir(outputDir, { recursive: true });
  }

  // Write report
  await writeFile(outputPath, report, 'utf-8');
}

/**
 * Runs the full page audit and generates the report.
 * 
 * @param projectRoot - Root directory of the project
 * @param outputPath - Path to write the report (relative to project root)
 * @returns The generated report content
 */
export async function generatePageValidationReport(
  projectRoot: string = process.cwd(),
  outputPath: string = DEFAULT_OUTPUT_PATH
): Promise<string> {
  console.log('🔍 Running page audit...\n');

  // Scan and audit all pages
  const results = auditAllPages(projectRoot);
  
  console.log(`   Found ${results.length} pages`);

  // Calculate stats for logging
  const stats = generateSummaryStats(results);
  console.log(`   Healthy: ${stats.healthyPages}, Warning: ${stats.warningPages}, Critical: ${stats.criticalPages}`);

  // Generate report
  const report = generatePageValidationMatrix(results);

  // Ensure output directory exists
  const fullOutputPath = join(projectRoot, outputPath);
  const outputDir = dirname(fullOutputPath);
  
  if (!existsSync(outputDir)) {
    await mkdir(outputDir, { recursive: true });
  }

  // Write report
  await writeFile(fullOutputPath, report, 'utf-8');
  console.log(`\n✅ Report written to: ${outputPath}`);

  return report;
}

/**
 * Gets a summary of the page audit without generating a full report.
 */
export function getPageAuditSummary(projectRoot: string = process.cwd()): {
  totalPages: number;
  pagesWithIssues: number;
  healthStatus: 'healthy' | 'warning' | 'critical';
  issuesByCategory: {
    auth: number;
    errorHandling: number;
    stateHandling: number;
    raceConditions: number;
    mobile: number;
  };
} {
  const results = auditAllPages(projectRoot);
  const stats = generateSummaryStats(results);

  let healthStatus: 'healthy' | 'warning' | 'critical' = 'healthy';
  if (stats.criticalPages > 0) {
    healthStatus = 'critical';
  } else if (stats.warningPages > 0) {
    healthStatus = 'warning';
  }

  return {
    totalPages: stats.totalPages,
    pagesWithIssues: stats.pagesWithIssues,
    healthStatus,
    issuesByCategory: {
      auth: stats.authIssues,
      errorHandling: stats.errorHandlingIssues,
      stateHandling: stats.stateHandlingIssues,
      raceConditions: stats.raceConditionIssues,
      mobile: stats.mobileIssues,
    },
  };
}

// CLI entry point
if (import.meta.main) {
  const args = process.argv.slice(2);
  const outputPath = args[0] || DEFAULT_OUTPUT_PATH;
  const projectRoot = process.cwd();

  console.log('📋 Page Validation Matrix Report Generator');
  console.log('==========================================\n');

  generatePageValidationReport(projectRoot, outputPath)
    .then(report => {
      // Print summary to console
      const lines = report.split('\n');
      const summaryStart = lines.findIndex(l => l.includes('## Executive Summary'));
      const summaryEnd = lines.findIndex((l, i) => i > summaryStart && l.startsWith('## ') && !l.includes('Executive Summary'));
      
      if (summaryStart !== -1) {
        const summaryLines = lines.slice(summaryStart, summaryEnd !== -1 ? summaryEnd : summaryStart + 35);
        console.log('\n' + summaryLines.join('\n'));
      }
    })
    .catch(error => {
      console.error('❌ Error generating report:', error);
      process.exit(1);
    });
}
