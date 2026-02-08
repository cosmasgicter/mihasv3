/**
 * Security Issue Detector for MIHAS Frontend-Backend Forensic Audit
 * 
 * Scans the codebase to detect security issues related to authentication,
 * including cross-role data leakage, stale session assumptions, and
 * broken workflow transitions.
 * 
 * @requirements 4.7 - IF cross-role data leakage is possible THEN the Audit_System SHALL flag it as SECURITY_ISSUE
 * @requirements 4.8 - IF broken workflow transitions exist THEN the Audit_System SHALL flag them with evidence
 * @requirements 4.9 - IF stale session assumptions exist THEN the Audit_System SHALL flag them with evidence
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { 
  Evidence, 
  SecurityIssue, 
  SecurityIssueType, 
  SecuritySeverity,
  BrokenTransition,
  AuthAuditResult 
} from '../types';
import { analyzeAuthState, type AuthStateAnalysisResult } from './stateAnalyzer';
import { scanAdminPagesForRoleEnforcement, type RoleEnforcementSummary } from './roleChecker';
import { analyzeRedirects, type RedirectAnalysisResult } from './redirectAnalyzer';
import { mapWorkflows, type WorkflowMappingResult } from './workflowMapper';

// =============================================================================
// Types
// =============================================================================

/**
 * Result of security issue detection.
 */
export interface SecurityDetectionResult {
  /** All security issues found */
  securityIssues: SecurityIssue[];
  /** Cross-role data leakage issues */
  crossRoleLeakage: SecurityIssue[];
  /** Stale session assumption issues */
  staleSessionIssues: SecurityIssue[];
  /** Missing auth check issues */
  missingAuthChecks: SecurityIssue[];
  /** Permission bypass issues */
  permissionBypassIssues: SecurityIssue[];
  /** Broken workflow transitions */
  brokenTransitions: BrokenTransition[];
  /** Stale session risks identified */
  staleSessionRisks: string[];
  /** Summary statistics */
  summary: SecuritySummary;
}


/**
 * Summary statistics for security detection.
 */
export interface SecuritySummary {
  /** Total security issues found */
  totalIssues: number;
  /** Critical severity issues */
  criticalCount: number;
  /** High severity issues */
  highCount: number;
  /** Medium severity issues */
  mediumCount: number;
  /** Low severity issues */
  lowCount: number;
  /** Files scanned */
  filesScanned: number;
  /** Issues by type */
  byType: Record<SecurityIssueType, number>;
}

/**
 * Stale session pattern detected in code.
 */
export interface StaleSessionPattern {
  /** File path where pattern was found */
  filePath: string;
  /** Line number */
  lineNumber: number;
  /** Type of stale session pattern */
  patternType: 'cached-auth' | 'no-refresh' | 'local-storage-token' | 'stale-user-state';
  /** Description of the issue */
  description: string;
  /** Evidence */
  evidence: Evidence;
}

/**
 * Cross-role leakage pattern detected in code.
 */
export interface CrossRoleLeakagePattern {
  /** File path where pattern was found */
  filePath: string;
  /** Line number */
  lineNumber: number;
  /** Type of leakage */
  leakageType: 'unfiltered-query' | 'shared-state' | 'exposed-admin-data' | 'missing-role-filter';
  /** Description of the issue */
  description: string;
  /** Evidence */
  evidence: Evidence;
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Patterns for detecting stale session assumptions.
 */
const STALE_SESSION_PATTERNS = {
  /** Using cached auth state without validation */
  cachedAuthState: /(?:localStorage|sessionStorage)\.getItem\s*\(\s*['"`](?:user|auth|token|session)['"`]\s*\)/g,
  
  /** Using auth state without checking expiry */
  noExpiryCheck: /(?:const|let)\s+(?:user|auth|session)\s*=\s*(?:localStorage|sessionStorage)\.getItem/g,
  
  /** Storing tokens in localStorage (security risk) */
  localStorageToken: /localStorage\.setItem\s*\(\s*['"`](?:token|accessToken|refreshToken)['"`]/g,
  
  /** Using stale user state from store without refresh */
  staleUserState: /useAuthStore\s*\(\s*\)\s*(?:\.user|\.isAuthenticated)(?!\s*&&\s*(?:refresh|validate|check))/g,
  
  /** Missing token refresh logic */
  missingRefresh: /(?:const|let)\s+\{\s*(?:user|isAuthenticated)[^}]*\}\s*=\s*useAuth\s*\(\s*\)(?![\s\S]*?refresh)/g,
  
  /** Assuming session is valid without server check */
  assumedValidSession: /if\s*\(\s*(?:user|isAuthenticated|session)\s*\)\s*\{(?![\s\S]*?(?:validate|verify|check|refresh))/g,
};

/**
 * Patterns for detecting cross-role data leakage.
 */
const CROSS_ROLE_LEAKAGE_PATTERNS = {
  /** Fetching all users without role filter */
  unfilteredUserQuery: /(?:useQuery|fetch|axios)\s*\([^)]*['"`](?:\/api\/admin\/users|\/api\/users)['"`][^)]*\)(?![\s\S]*?role)/g,
  
  /** Fetching all applications without ownership filter */
  unfilteredApplicationQuery: /(?:useQuery|fetch|axios)\s*\([^)]*['"`](?:\/api\/applications)['"`][^)]*\)(?![\s\S]*?(?:userId|user_id|owner))/g,
  
  /** Exposing admin data in shared state */
  adminDataInSharedState: /(?:useStore|useState)\s*<[^>]*(?:AdminData|AllUsers|AllApplications)[^>]*>/g,
  
  /** Missing role check before data access */
  missingRoleCheckBeforeData: /(?:const|let)\s+(?:users|applications|adminData)\s*=\s*(?:useQuery|useMutation)(?![\s\S]*?(?:isAdmin|hasAdminRole|role))/g,
  
  /** Rendering admin-only data without role check */
  adminDataWithoutRoleCheck: /\{(?:users|adminData|allApplications)\.map\s*\((?![\s\S]*?(?:isAdmin|hasAdminRole))/g,
  
  /** Direct database query without role filter */
  unfilteredDbQuery: /\.select\s*\(\s*['"`]\*['"`]\s*\)\.from\s*\(\s*['"`](?:users|applications|profiles)['"`]\s*\)(?![\s\S]*?where)/g,
};

/**
 * Directories to scan for security issues.
 */
const SCAN_DIRECTORIES = [
  'src/pages',
  'src/components',
  'src/hooks',
  'src/services',
  'src/stores',
];

/**
 * File extensions to scan.
 */
const FILE_EXTENSIONS = ['.tsx', '.ts'];


// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Finds the line number of a match in content.
 * 
 * @param content - Full file content
 * @param matchIndex - Index of the match in content
 * @returns Line number (1-indexed)
 */
function getLineNumber(content: string, matchIndex: number): number {
  return content.substring(0, matchIndex).split('\n').length;
}

/**
 * Gets surrounding lines for context.
 * 
 * @param content - Full file content
 * @param lineNumber - Center line number (1-indexed)
 * @param range - Number of lines before and after
 * @returns Combined surrounding lines
 */
function getSurroundingLines(content: string, lineNumber: number, range: number): string {
  const lines = content.split('\n');
  const start = Math.max(0, lineNumber - range - 1);
  const end = Math.min(lines.length, lineNumber + range);
  return lines.slice(start, end).join('\n');
}

/**
 * Recursively finds all files in a directory.
 * 
 * @param dir - Directory to scan
 * @param projectRoot - Project root for relative paths
 * @param extensions - File extensions to include
 * @returns Array of relative file paths
 */
function findFiles(
  dir: string,
  projectRoot: string,
  extensions: string[] = FILE_EXTENSIONS
): string[] {
  const files: string[] = [];
  const fullDir = path.join(projectRoot, dir);
  
  try {
    if (!fs.existsSync(fullDir)) {
      return files;
    }
    
    const entries = fs.readdirSync(fullDir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(fullDir, entry.name);
      const relativePath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        files.push(...findFiles(relativePath, projectRoot, extensions));
      } else if (entry.isFile() && extensions.some(ext => entry.name.endsWith(ext))) {
        files.push(relativePath);
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dir}:`, error);
  }
  
  return files;
}


// =============================================================================
// Stale Session Detection
// =============================================================================

/**
 * Scans a file for stale session patterns.
 * 
 * @param filePath - Path to the file (relative to project root)
 * @param projectRoot - Project root directory
 * @returns Array of StaleSessionPattern objects
 */
export function scanFileForStaleSessionPatterns(
  filePath: string,
  projectRoot: string = process.cwd()
): StaleSessionPattern[] {
  const fullPath = path.join(projectRoot, filePath);
  const patterns: StaleSessionPattern[] = [];
  
  try {
    if (!fs.existsSync(fullPath)) {
      return patterns;
    }
    
    const content = fs.readFileSync(fullPath, 'utf-8');
    
    // Check for cached auth state
    const cachedAuthPattern = new RegExp(STALE_SESSION_PATTERNS.cachedAuthState.source, 'g');
    let match;
    
    while ((match = cachedAuthPattern.exec(content)) !== null) {
      const lineNumber = getLineNumber(content, match.index);
      const surroundingCode = getSurroundingLines(content, lineNumber, 3);
      
      // Check if there's validation nearby
      const hasValidation = /validate|verify|check|refresh|isValid|expired/i.test(surroundingCode);
      
      if (!hasValidation) {
        patterns.push({
          filePath,
          lineNumber,
          patternType: 'cached-auth',
          description: 'Using cached auth state from storage without validation',
          evidence: {
            filePath,
            lineNumbers: [lineNumber],
            codeSnippet: surroundingCode,
            reason: 'Auth state retrieved from storage should be validated against server',
            confidence: 'likely',
          },
        });
      }
    }
    
    // Check for localStorage token storage
    const localStorageTokenPattern = new RegExp(STALE_SESSION_PATTERNS.localStorageToken.source, 'g');
    
    while ((match = localStorageTokenPattern.exec(content)) !== null) {
      const lineNumber = getLineNumber(content, match.index);
      const surroundingCode = getSurroundingLines(content, lineNumber, 3);
      
      patterns.push({
        filePath,
        lineNumber,
        patternType: 'local-storage-token',
        description: 'Storing auth tokens in localStorage (security risk - use HTTP-only cookies)',
        evidence: {
          filePath,
          lineNumbers: [lineNumber],
          codeSnippet: surroundingCode,
          reason: 'Tokens in localStorage are vulnerable to XSS attacks',
          confidence: 'certain',
        },
      });
    }
    
    // Check for assumed valid session
    const assumedValidPattern = new RegExp(STALE_SESSION_PATTERNS.assumedValidSession.source, 'g');
    
    while ((match = assumedValidPattern.exec(content)) !== null) {
      const lineNumber = getLineNumber(content, match.index);
      const surroundingCode = getSurroundingLines(content, lineNumber, 5);
      
      // Check if there's server validation in the component
      const hasServerCheck = /useQuery|fetch|axios|api|refresh/i.test(surroundingCode);
      
      if (!hasServerCheck) {
        patterns.push({
          filePath,
          lineNumber,
          patternType: 'stale-user-state',
          description: 'Assuming session is valid without server-side verification',
          evidence: {
            filePath,
            lineNumbers: [lineNumber],
            codeSnippet: surroundingCode,
            reason: 'Session validity should be verified with the server',
            confidence: 'possible',
          },
        });
      }
    }
    
    return patterns;
  } catch (error) {
    console.error(`Error scanning file ${filePath}:`, error);
    return patterns;
  }
}


// =============================================================================
// Cross-Role Leakage Detection
// =============================================================================

/**
 * Scans a file for cross-role data leakage patterns.
 * 
 * @param filePath - Path to the file (relative to project root)
 * @param projectRoot - Project root directory
 * @returns Array of CrossRoleLeakagePattern objects
 */
export function scanFileForCrossRoleLeakage(
  filePath: string,
  projectRoot: string = process.cwd()
): CrossRoleLeakagePattern[] {
  const fullPath = path.join(projectRoot, filePath);
  const patterns: CrossRoleLeakagePattern[] = [];
  
  try {
    if (!fs.existsSync(fullPath)) {
      return patterns;
    }
    
    const content = fs.readFileSync(fullPath, 'utf-8');
    
    // Check for unfiltered user queries
    const unfilteredUserPattern = new RegExp(CROSS_ROLE_LEAKAGE_PATTERNS.unfilteredUserQuery.source, 'g');
    let match;
    
    while ((match = unfilteredUserPattern.exec(content)) !== null) {
      const lineNumber = getLineNumber(content, match.index);
      const surroundingCode = getSurroundingLines(content, lineNumber, 5);
      
      // Check if there's a role check nearby
      const hasRoleCheck = /isAdmin|hasAdminRole|role\s*===?\s*['"`]admin/i.test(surroundingCode);
      
      if (!hasRoleCheck) {
        patterns.push({
          filePath,
          lineNumber,
          leakageType: 'unfiltered-query',
          description: 'Fetching all users without role-based filtering',
          evidence: {
            filePath,
            lineNumbers: [lineNumber],
            codeSnippet: surroundingCode,
            reason: 'User data should be filtered based on requester role',
            confidence: 'likely',
          },
        });
      }
    }
    
    // Check for unfiltered application queries
    const unfilteredAppPattern = new RegExp(CROSS_ROLE_LEAKAGE_PATTERNS.unfilteredApplicationQuery.source, 'g');
    
    while ((match = unfilteredAppPattern.exec(content)) !== null) {
      const lineNumber = getLineNumber(content, match.index);
      const surroundingCode = getSurroundingLines(content, lineNumber, 5);
      
      // Check if there's ownership or role filtering
      const hasFiltering = /userId|user_id|owner|isAdmin|hasAdminRole/i.test(surroundingCode);
      
      if (!hasFiltering) {
        patterns.push({
          filePath,
          lineNumber,
          leakageType: 'unfiltered-query',
          description: 'Fetching applications without ownership or role filtering',
          evidence: {
            filePath,
            lineNumbers: [lineNumber],
            codeSnippet: surroundingCode,
            reason: 'Applications should be filtered by owner for students or role for admins',
            confidence: 'likely',
          },
        });
      }
    }
    
    // Check for admin data in shared state
    const adminDataPattern = new RegExp(CROSS_ROLE_LEAKAGE_PATTERNS.adminDataInSharedState.source, 'g');
    
    while ((match = adminDataPattern.exec(content)) !== null) {
      const lineNumber = getLineNumber(content, match.index);
      const surroundingCode = getSurroundingLines(content, lineNumber, 3);
      
      patterns.push({
        filePath,
        lineNumber,
        leakageType: 'shared-state',
        description: 'Admin-only data stored in shared state accessible to all roles',
        evidence: {
          filePath,
          lineNumbers: [lineNumber],
          codeSnippet: surroundingCode,
          reason: 'Admin data should not be stored in globally accessible state',
          confidence: 'possible',
        },
      });
    }
    
    return patterns;
  } catch (error) {
    console.error(`Error scanning file ${filePath}:`, error);
    return patterns;
  }
}


// =============================================================================
// Broken Workflow Transition Detection
// =============================================================================

/**
 * Detects broken workflow transitions from workflow mapping.
 * 
 * @param workflowResult - Result from workflow mapper
 * @returns Array of BrokenTransition objects
 */
export function detectBrokenTransitions(
  workflowResult: WorkflowMappingResult
): BrokenTransition[] {
  const brokenTransitions: BrokenTransition[] = [];
  
  // Check student workflow transitions
  for (let i = 0; i < workflowResult.studentWorkflow.length - 1; i++) {
    const currentStep = workflowResult.studentWorkflow[i];
    const nextStep = workflowResult.studentWorkflow[i + 1];
    
    // Check if current step has a path to next step
    if (currentStep.filePath.includes('[NOT FOUND')) {
      brokenTransitions.push({
        fromStep: currentStep.action,
        toStep: nextStep.action,
        reason: `Component for "${currentStep.action}" step not found`,
        evidence: {
          filePath: currentStep.filePath,
          reason: `Missing component breaks workflow transition from ${currentStep.action} to ${nextStep.action}`,
          confidence: 'certain',
        },
      });
    }
    
    // Check for missing auth on protected steps
    if (currentStep.requiresAuth && !currentStep.guard) {
      brokenTransitions.push({
        fromStep: currentStep.action,
        toStep: nextStep.action,
        reason: `Step "${currentStep.action}" requires auth but has no route guard`,
        evidence: {
          filePath: currentStep.filePath,
          reason: 'Missing route guard could allow unauthorized access',
          confidence: 'likely',
        },
      });
    }
  }
  
  // Check admin workflow transitions
  for (let i = 0; i < workflowResult.adminWorkflow.length - 1; i++) {
    const currentStep = workflowResult.adminWorkflow[i];
    const nextStep = workflowResult.adminWorkflow[i + 1];
    
    // Check if current step has a path to next step
    if (currentStep.filePath.includes('[NOT FOUND')) {
      brokenTransitions.push({
        fromStep: currentStep.action,
        toStep: nextStep.action,
        reason: `Component for "${currentStep.action}" step not found`,
        evidence: {
          filePath: currentStep.filePath,
          reason: `Missing component breaks admin workflow transition from ${currentStep.action} to ${nextStep.action}`,
          confidence: 'certain',
        },
      });
    }
    
    // Check for missing admin role requirement
    if (currentStep.guard === 'admin' && (!currentStep.roleRequired || currentStep.roleRequired.length === 0)) {
      brokenTransitions.push({
        fromStep: currentStep.action,
        toStep: nextStep.action,
        reason: `Admin step "${currentStep.action}" has admin guard but no explicit role requirement`,
        evidence: {
          filePath: currentStep.filePath,
          reason: 'Admin routes should explicitly check for admin/super_admin roles',
          confidence: 'possible',
        },
      });
    }
  }
  
  return brokenTransitions;
}


// =============================================================================
// Security Issue Aggregation
// =============================================================================

/**
 * Converts stale session patterns to security issues.
 * 
 * @param patterns - Stale session patterns found
 * @returns Array of SecurityIssue objects
 */
function staleSessionPatternsToSecurityIssues(patterns: StaleSessionPattern[]): SecurityIssue[] {
  return patterns.map(pattern => {
    let severity: SecuritySeverity = 'medium';
    
    // localStorage token storage is high severity
    if (pattern.patternType === 'local-storage-token') {
      severity = 'high';
    } else if (pattern.patternType === 'cached-auth') {
      severity = 'medium';
    } else {
      severity = 'low';
    }
    
    return {
      type: 'STALE_TOKEN' as SecurityIssueType,
      filePath: pattern.filePath,
      lineNumber: pattern.lineNumber,
      evidence: pattern.description,
      severity,
    };
  });
}

/**
 * Converts cross-role leakage patterns to security issues.
 * 
 * @param patterns - Cross-role leakage patterns found
 * @returns Array of SecurityIssue objects
 */
function crossRoleLeakagePatternsToSecurityIssues(patterns: CrossRoleLeakagePattern[]): SecurityIssue[] {
  return patterns.map(pattern => {
    let severity: SecuritySeverity = 'medium';
    
    // Unfiltered queries are high severity
    if (pattern.leakageType === 'unfiltered-query') {
      severity = 'high';
    } else if (pattern.leakageType === 'exposed-admin-data') {
      severity = 'critical';
    } else {
      severity = 'medium';
    }
    
    return {
      type: 'CROSS_ROLE_LEAKAGE' as SecurityIssueType,
      filePath: pattern.filePath,
      lineNumber: pattern.lineNumber,
      evidence: pattern.description,
      severity,
    };
  });
}

/**
 * Aggregates security issues from all auth auditors.
 * 
 * @param stateAnalysis - Result from auth state analyzer
 * @param roleEnforcement - Result from role enforcement checker
 * @param redirectAnalysis - Result from redirect analyzer
 * @returns Aggregated array of SecurityIssue objects
 */
export function aggregateSecurityIssues(
  stateAnalysis: AuthStateAnalysisResult,
  roleEnforcement: RoleEnforcementSummary,
  redirectAnalysis: RedirectAnalysisResult
): SecurityIssue[] {
  const issues: SecurityIssue[] = [];
  
  // Add issues from role enforcement checker
  for (const result of roleEnforcement.results) {
    issues.push(...result.securityIssues);
  }
  
  // Add issues from redirect analyzer
  issues.push(...redirectAnalysis.securityIssues);
  
  // Add issues from state fragmentation
  if (stateAnalysis.isFragmented) {
    for (const fragIssue of stateAnalysis.fragmentationIssues) {
      if (fragIssue.severity === 'high') {
        issues.push({
          type: 'PERMISSION_BYPASS',
          filePath: fragIssue.evidence.filePath,
          lineNumber: fragIssue.evidence.lineNumbers?.[0] || 1,
          evidence: fragIssue.description,
          severity: 'medium',
        });
      }
    }
  }
  
  return issues;
}


// =============================================================================
// Main Analysis Function
// =============================================================================

/**
 * Performs comprehensive security issue detection.
 * 
 * Scans the codebase for:
 * - Cross-role data leakage (Requirement 4.7)
 * - Stale session assumptions (Requirement 4.9)
 * - Broken workflow transitions (Requirement 4.8)
 * - Aggregates issues from other auth auditors
 * 
 * @param projectRoot - Project root directory
 * @returns Complete security detection result
 * 
 * @requirements 4.7 - Flag cross-role data leakage as SECURITY_ISSUE
 * @requirements 4.8 - Flag broken workflow transitions with evidence
 * @requirements 4.9 - Flag stale session assumptions with evidence
 */
export function detectSecurityIssues(
  projectRoot: string = process.cwd()
): SecurityDetectionResult {
  const allStaleSessionPatterns: StaleSessionPattern[] = [];
  const allCrossRolePatterns: CrossRoleLeakagePattern[] = [];
  let filesScanned = 0;
  
  // Scan all directories for security patterns
  for (const dir of SCAN_DIRECTORIES) {
    const files = findFiles(dir, projectRoot);
    
    for (const file of files) {
      filesScanned++;
      
      // Scan for stale session patterns
      const stalePatterns = scanFileForStaleSessionPatterns(file, projectRoot);
      allStaleSessionPatterns.push(...stalePatterns);
      
      // Scan for cross-role leakage patterns
      const leakagePatterns = scanFileForCrossRoleLeakage(file, projectRoot);
      allCrossRolePatterns.push(...leakagePatterns);
    }
  }
  
  // Run other auth auditors
  const stateAnalysis = analyzeAuthState(projectRoot);
  const roleEnforcement = scanAdminPagesForRoleEnforcement(projectRoot);
  const redirectAnalysis = analyzeRedirects(projectRoot);
  const workflowResult = mapWorkflows(projectRoot);
  
  // Detect broken workflow transitions
  const brokenTransitions = detectBrokenTransitions(workflowResult);
  
  // Convert patterns to security issues
  const staleSessionIssues = staleSessionPatternsToSecurityIssues(allStaleSessionPatterns);
  const crossRoleLeakage = crossRoleLeakagePatternsToSecurityIssues(allCrossRolePatterns);
  
  // Aggregate issues from other auditors
  const aggregatedIssues = aggregateSecurityIssues(stateAnalysis, roleEnforcement, redirectAnalysis);
  
  // Combine all security issues
  const allSecurityIssues = [
    ...staleSessionIssues,
    ...crossRoleLeakage,
    ...aggregatedIssues,
  ];
  
  // Deduplicate issues by file path and line number
  const uniqueIssues = deduplicateIssues(allSecurityIssues);
  
  // Categorize issues by type
  const missingAuthChecks = uniqueIssues.filter(i => i.type === 'MISSING_AUTH_CHECK');
  const permissionBypassIssues = uniqueIssues.filter(i => i.type === 'PERMISSION_BYPASS');
  const crossRoleLeakageIssues = uniqueIssues.filter(i => i.type === 'CROSS_ROLE_LEAKAGE');
  const staleTokenIssues = uniqueIssues.filter(i => i.type === 'STALE_TOKEN');
  
  // Generate stale session risks from patterns
  const staleSessionRisks = allStaleSessionPatterns.map(p => 
    `${p.filePath}:${p.lineNumber} - ${p.description}`
  );
  
  // Calculate summary statistics
  const summary = calculateSummary(uniqueIssues, filesScanned);
  
  return {
    securityIssues: uniqueIssues,
    crossRoleLeakage: crossRoleLeakageIssues,
    staleSessionIssues: staleTokenIssues,
    missingAuthChecks,
    permissionBypassIssues,
    brokenTransitions,
    staleSessionRisks,
    summary,
  };
}

/**
 * Deduplicates security issues by file path and line number.
 * 
 * @param issues - Array of security issues
 * @returns Deduplicated array
 */
function deduplicateIssues(issues: SecurityIssue[]): SecurityIssue[] {
  const seen = new Set<string>();
  const unique: SecurityIssue[] = [];
  
  for (const issue of issues) {
    const key = `${issue.filePath}:${issue.lineNumber}:${issue.type}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(issue);
    }
  }
  
  return unique;
}

/**
 * Calculates summary statistics for security issues.
 * 
 * @param issues - Array of security issues
 * @param filesScanned - Number of files scanned
 * @returns SecuritySummary object
 */
function calculateSummary(issues: SecurityIssue[], filesScanned: number): SecuritySummary {
  const byType: Record<SecurityIssueType, number> = {
    'CROSS_ROLE_LEAKAGE': 0,
    'MISSING_AUTH_CHECK': 0,
    'STALE_TOKEN': 0,
    'PERMISSION_BYPASS': 0,
  };
  
  let criticalCount = 0;
  let highCount = 0;
  let mediumCount = 0;
  let lowCount = 0;
  
  for (const issue of issues) {
    byType[issue.type]++;
    
    switch (issue.severity) {
      case 'critical':
        criticalCount++;
        break;
      case 'high':
        highCount++;
        break;
      case 'medium':
        mediumCount++;
        break;
      case 'low':
        lowCount++;
        break;
    }
  }
  
  return {
    totalIssues: issues.length,
    criticalCount,
    highCount,
    mediumCount,
    lowCount,
    filesScanned,
    byType,
  };
}


// =============================================================================
// Report Generation
// =============================================================================

/**
 * Generates a human-readable security report.
 * 
 * @param result - Security detection result
 * @returns Formatted report string
 */
export function generateSecurityReport(result: SecurityDetectionResult): string {
  const lines: string[] = [];
  
  lines.push('='.repeat(70));
  lines.push('MIHAS Security Issue Detection Report');
  lines.push('='.repeat(70));
  lines.push('');
  
  // Summary
  lines.push('Summary');
  lines.push('-'.repeat(70));
  lines.push(`Files Scanned: ${result.summary.filesScanned}`);
  lines.push(`Total Security Issues: ${result.summary.totalIssues}`);
  lines.push('');
  lines.push('By Severity:');
  lines.push(`  🔴 Critical: ${result.summary.criticalCount}`);
  lines.push(`  🟠 High: ${result.summary.highCount}`);
  lines.push(`  🟡 Medium: ${result.summary.mediumCount}`);
  lines.push(`  🟢 Low: ${result.summary.lowCount}`);
  lines.push('');
  lines.push('By Type:');
  lines.push(`  Cross-Role Leakage: ${result.summary.byType['CROSS_ROLE_LEAKAGE']}`);
  lines.push(`  Missing Auth Check: ${result.summary.byType['MISSING_AUTH_CHECK']}`);
  lines.push(`  Stale Token/Session: ${result.summary.byType['STALE_TOKEN']}`);
  lines.push(`  Permission Bypass: ${result.summary.byType['PERMISSION_BYPASS']}`);
  lines.push('');
  
  // Critical Issues
  const criticalIssues = result.securityIssues.filter(i => i.severity === 'critical');
  if (criticalIssues.length > 0) {
    lines.push('🔴 CRITICAL ISSUES (Immediate Action Required)');
    lines.push('-'.repeat(70));
    for (const issue of criticalIssues) {
      lines.push(`\n  Type: ${issue.type}`);
      lines.push(`  File: ${issue.filePath}:${issue.lineNumber}`);
      lines.push(`  Evidence: ${issue.evidence}`);
    }
    lines.push('');
  }
  
  // High Severity Issues
  const highIssues = result.securityIssues.filter(i => i.severity === 'high');
  if (highIssues.length > 0) {
    lines.push('🟠 HIGH SEVERITY ISSUES');
    lines.push('-'.repeat(70));
    for (const issue of highIssues) {
      lines.push(`\n  Type: ${issue.type}`);
      lines.push(`  File: ${issue.filePath}:${issue.lineNumber}`);
      lines.push(`  Evidence: ${issue.evidence}`);
    }
    lines.push('');
  }
  
  // Cross-Role Leakage Issues
  if (result.crossRoleLeakage.length > 0) {
    lines.push('Cross-Role Data Leakage Issues');
    lines.push('-'.repeat(70));
    for (const issue of result.crossRoleLeakage) {
      const icon = issue.severity === 'critical' ? '🔴' : issue.severity === 'high' ? '🟠' : '🟡';
      lines.push(`\n  ${icon} ${issue.filePath}:${issue.lineNumber}`);
      lines.push(`     ${issue.evidence}`);
    }
    lines.push('');
  }
  
  // Stale Session Issues
  if (result.staleSessionIssues.length > 0) {
    lines.push('Stale Session/Token Issues');
    lines.push('-'.repeat(70));
    for (const issue of result.staleSessionIssues) {
      const icon = issue.severity === 'high' ? '🟠' : '🟡';
      lines.push(`\n  ${icon} ${issue.filePath}:${issue.lineNumber}`);
      lines.push(`     ${issue.evidence}`);
    }
    lines.push('');
  }
  
  // Broken Workflow Transitions
  if (result.brokenTransitions.length > 0) {
    lines.push('Broken Workflow Transitions');
    lines.push('-'.repeat(70));
    for (const transition of result.brokenTransitions) {
      lines.push(`\n  ⚠️ ${transition.fromStep} → ${transition.toStep}`);
      lines.push(`     Reason: ${transition.reason}`);
      lines.push(`     File: ${transition.evidence.filePath}`);
    }
    lines.push('');
  }
  
  // Stale Session Risks
  if (result.staleSessionRisks.length > 0) {
    lines.push('Stale Session Risks');
    lines.push('-'.repeat(70));
    for (const risk of result.staleSessionRisks.slice(0, 10)) {
      lines.push(`  • ${risk}`);
    }
    if (result.staleSessionRisks.length > 10) {
      lines.push(`  ... and ${result.staleSessionRisks.length - 10} more`);
    }
    lines.push('');
  }
  
  // Recommendations
  lines.push('Recommendations');
  lines.push('-'.repeat(70));
  
  if (result.summary.criticalCount > 0) {
    lines.push('\n  1. IMMEDIATE: Address all critical security issues');
    lines.push('     - These represent potential data breaches or unauthorized access');
  }
  
  if (result.crossRoleLeakage.length > 0) {
    lines.push('\n  2. Add role-based filtering to all data queries');
    lines.push('     - Students should only see their own data');
    lines.push('     - Admin data should be filtered by role permissions');
  }
  
  if (result.staleSessionIssues.length > 0) {
    lines.push('\n  3. Implement proper session validation');
    lines.push('     - Use HTTP-only cookies instead of localStorage for tokens');
    lines.push('     - Validate session with server before trusting cached state');
    lines.push('     - Implement token refresh logic');
  }
  
  if (result.brokenTransitions.length > 0) {
    lines.push('\n  4. Fix broken workflow transitions');
    lines.push('     - Ensure all workflow steps have corresponding components');
    lines.push('     - Add proper route guards to protected steps');
  }
  
  if (result.summary.byType['MISSING_AUTH_CHECK'] > 0) {
    lines.push('\n  5. Add auth checks to all protected pages');
    lines.push('     - Use useAuth() or useOptimizedAuthState() hooks');
    lines.push('     - Wrap admin routes with AdminRoute component');
  }
  
  lines.push('');
  
  return lines.join('\n');
}


// =============================================================================
// Export for Auth Audit Result
// =============================================================================

/**
 * Converts security detection result to the format expected by AuthAuditResult.
 * 
 * @param result - Security detection result
 * @returns Partial AuthAuditResult with security-related fields
 */
export function toAuthAuditSecurityFields(
  result: SecurityDetectionResult
): Pick<AuthAuditResult, 'securityIssues' | 'brokenTransitions' | 'staleSessionRisks'> {
  return {
    securityIssues: result.securityIssues,
    brokenTransitions: result.brokenTransitions,
    staleSessionRisks: result.staleSessionRisks,
  };
}

// =============================================================================
// CLI Execution
// =============================================================================

// Check if running as main module
const isMainModule = import.meta.url === `file://${process.argv[1]}` ||
                     process.argv[1]?.endsWith('securityDetector.ts');

if (isMainModule) {
  console.log('MIHAS Security Issue Detector');
  console.log('==============================');
  console.log('');
  
  const result = detectSecurityIssues();
  console.log(generateSecurityReport(result));
}
