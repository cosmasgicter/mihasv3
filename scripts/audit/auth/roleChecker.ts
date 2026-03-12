/**
 * Role Enforcement Checker for MIHAS Frontend-Backend Forensic Audit
 * 
 * Scans admin pages to verify role checks are present and permission boundaries
 * are properly enforced. Identifies security issues related to role enforcement.
 * 
 * @requirements 4.4 - WHEN the Audit_System examines auth THEN it SHALL verify
 *                     role enforcement is consistent
 * @requirements 4.6 - WHEN the Audit_System examines auth THEN it SHALL verify
 *                     permission boundaries are enforced
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Evidence, SecurityIssue, SecuritySeverity } from '../types';

// =============================================================================
// Types
// =============================================================================

/**
 * Result of role enforcement check for a single admin page.
 */
export interface RoleEnforcementResult {
  /** Path to the admin page file */
  filePath: string;
  /** Component name */
  componentName: string;
  /** Whether the page has any role check */
  hasRoleCheck: boolean;
  /** Types of role checks found */
  roleCheckTypes: RoleCheckType[];
  /** Specific roles being checked */
  rolesChecked: string[];
  /** Whether permission boundaries are enforced */
  hasPermissionBoundary: boolean;
  /** Security issues found */
  securityIssues: SecurityIssue[];
  /** Evidence of findings */
  evidence: Evidence;
}

/**
 * Types of role checks that can be detected.
 */
export type RoleCheckType =
  | 'useAuth'
  | 'isAdmin'
  | 'hasAdminRole'
  | 'isAdminRole'
  | 'useOptimizedAuthState'
  | 'AdminRoute'
  | 'ProtectedRoute'
  | 'directRoleComparison'
  | 'roleArrayIncludes'
  | 'superAdminEmailCheck';

/**
 * Summary of role enforcement audit across all admin pages.
 */
export interface RoleEnforcementSummary {
  /** Total admin pages scanned */
  totalAdminPages: number;
  /** Pages with proper role checks */
  pagesWithRoleChecks: number;
  /** Pages missing role checks */
  pagesMissingRoleChecks: number;
  /** Pages with permission boundaries */
  pagesWithPermissionBoundaries: number;
  /** Total security issues found */
  totalSecurityIssues: number;
  /** Critical security issues */
  criticalIssues: number;
  /** High severity issues */
  highIssues: number;
  /** Individual page results */
  results: RoleEnforcementResult[];
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Known admin roles in the MIHAS system.
 */
export const ADMIN_ROLES = [
  'admin',
  'super_admin',
  'admissions_officer',
  'registrar',
  'finance_officer',
  'academic_head',
  'reviewer'
] as const;

/**
 * Admin pages that are protected at the route level via AdminRoute wrapper.
 * These pages don't need component-level role checks because the route guard
 * handles authentication and authorization.
 * 
 * Based on src/routes/config.tsx with guard: 'admin'
 */
export const ROUTE_PROTECTED_ADMIN_PAGES = new Set([
  'Dashboard',
  'AdminDashboard',
  'AdminSettings',
  'AdminApplications',
  'Applications',
  'ApplicationsAdmin',
  'AdminPrograms',
  'Programs',
  'AdminIntakes',
  'Intakes',
  'AdminUsers',
  'Users',
  'AuditTrail',
  'AuditTrailPage',
  'Settings',
  'Analytics',
  'AdminAnalytics',
  'ComplianceAnalytics',
  'RealtimeMetrics',
  'WorkflowAutomation',
  'ApplicationFlowAnalysis',
  'RoleManagement',
  'SystemHealthDashboard',
  'EnhancedDashboard',
  'EnhancedAdminDashboard',
  'BatchOperations',
  'BatchOperationsPage',
  'CacheMonitor',
  'CacheMonitorPage',
  'EligibilityManagement',
  'Monitoring',
  'MonitoringPage',
]);

/**
 * Patterns for detecting role check mechanisms.
 */
const ROLE_CHECK_PATTERNS: Record<RoleCheckType, RegExp> = {
  /** useAuth hook usage */
  useAuth: /useAuth\s*\(/,
  
  /** isAdmin property from hooks/context */
  isAdmin: /\bisAdmin\b(?!\s*[=:])/,
  
  /** hasAdminRole from useAuth */
  hasAdminRole: /\bhasAdminRole\b/,
  
  /** isAdminRole() function call */
  isAdminRole: /isAdminRole\s*\(/,
  
  /** useOptimizedAuthState with isAdmin */
  useOptimizedAuthState: /useOptimizedAuthState\s*\(\s*\)/,
  
  /** AdminRoute wrapper component */
  AdminRoute: /<AdminRoute[^>]*>|AdminRoute\s*\(/,
  
  /** ProtectedRoute wrapper component */
  ProtectedRoute: /<ProtectedRoute[^>]*>|ProtectedRoute\s*\(/,
  
  /** Direct role comparison: user.role === 'admin' */
  directRoleComparison: /(?:user|profile)\.role\s*===?\s*['"`](\w+)['"`]/,
  
  /** Role array includes check */
  roleArrayIncludes: /\[['"`][^'"`]+['"`](?:,\s*['"`][^'"`]+['"`])*\]\.includes\s*\(\s*(?:user|profile)\.role\s*\)/,
  
  /** Super admin email check (hardcoded) */
  superAdminEmailCheck: /user\.email\s*===?\s*['"`][^'"`]+['"`]/,
};

/**
 * Patterns for detecting permission boundary enforcement.
 */
const PERMISSION_BOUNDARY_PATTERNS = {
  /** Conditional rendering based on role */
  conditionalRender: /\{[^}]*isAdmin[^}]*\?[^}]*:[^}]*\}/,
  
  /** Early return for non-admin */
  earlyReturn: /if\s*\(\s*!isAdmin\s*\)\s*\{?\s*return/,
  
  /** Navigate/redirect for non-admin */
  redirectNonAdmin: /if\s*\(\s*!isAdmin\s*\)[\s\S]*?(?:Navigate|navigate\()/,
  
  /** Role-based feature gating */
  featureGating: /(?:isAdmin|hasAdminRole)\s*&&\s*[(<]/,
  
  /** Permission check before action */
  permissionCheck: /if\s*\(\s*(?:!isAdmin|!hasAdminRole)\s*\)/,
};

/**
 * Patterns that indicate potential cross-role data leakage.
 */
const DATA_LEAKAGE_PATTERNS = {
  /** Fetching all users without role filter */
  allUsersFetch: /useUsers\s*\(\s*\)|getUsers\s*\(\s*\)|fetchUsers\s*\(\s*\)/,
  
  /** Fetching all applications without filter */
  allApplicationsFetch: /useApplications\s*\(\s*\)|getApplications\s*\(\s*\)|fetchApplications\s*\(\s*\)/,
  
  /** Direct database query without role filter */
  unfiltered: /\.select\s*\(\s*['"`]\*['"`]\s*\)/,
  
  /** Exposing sensitive data in state */
  sensitiveState: /useState<[^>]*(?:password|token|secret|key)[^>]*>/i,
};

// =============================================================================
// Core Functions
// =============================================================================

/**
 * Extracts the component name from file content.
 * 
 * @param content - File content
 * @param filePath - Path to the file
 * @returns Component name or filename-based fallback
 */
function extractComponentName(content: string, filePath: string): string {
  // Try to find default export function name
  const defaultExportMatch = content.match(/export\s+default\s+function\s+(\w+)/);
  if (defaultExportMatch) {
    return defaultExportMatch[1];
  }
  
  // Try to find named export that's also default
  const namedDefaultMatch = content.match(/export\s+default\s+(\w+)/);
  if (namedDefaultMatch) {
    return namedDefaultMatch[1];
  }
  
  // Try to find any function component
  const functionMatch = content.match(/(?:export\s+)?function\s+(\w+)\s*\(/);
  if (functionMatch) {
    return functionMatch[1];
  }
  
  // Fallback to filename
  const fileName = path.basename(filePath, '.tsx');
  return fileName;
}

/**
 * Detects role check types present in the file content.
 * 
 * @param content - File content to analyze
 * @returns Array of detected role check types
 */
export function detectRoleCheckTypes(content: string): RoleCheckType[] {
  const types: RoleCheckType[] = [];
  
  for (const [type, pattern] of Object.entries(ROLE_CHECK_PATTERNS)) {
    if (pattern.test(content)) {
      types.push(type as RoleCheckType);
    }
  }
  
  return types;
}

/**
 * Extracts specific roles being checked in the content.
 * 
 * @param content - File content to analyze
 * @returns Array of role names found in checks
 */
export function extractCheckedRoles(content: string): string[] {
  const roles: Set<string> = new Set();
  
  // Extract from direct comparisons
  const directMatches = content.matchAll(/(?:user|profile)\.role\s*===?\s*['"`](\w+)['"`]/g);
  for (const match of directMatches) {
    if (match[1]) {
      roles.add(match[1]);
    }
  }
  
  // Extract from array includes
  const arrayMatches = content.matchAll(/\[([^\]]+)\]\.includes\s*\(\s*(?:user|profile)\.role\s*\)/g);
  for (const match of arrayMatches) {
    if (match[1]) {
      const roleList = match[1].matchAll(/['"`](\w+)['"`]/g);
      for (const roleMatch of roleList) {
        if (roleMatch[1]) {
          roles.add(roleMatch[1]);
        }
      }
    }
  }
  
  // If isAdmin/hasAdminRole is used, add common admin roles
  if (ROLE_CHECK_PATTERNS.isAdmin.test(content) || 
      ROLE_CHECK_PATTERNS.hasAdminRole.test(content) ||
      ROLE_CHECK_PATTERNS.isAdminRole.test(content)) {
    roles.add('admin');
    roles.add('super_admin');
  }
  
  return Array.from(roles);
}

/**
 * Checks if permission boundaries are enforced in the content.
 * 
 * @param content - File content to analyze
 * @returns True if permission boundaries are found
 */
export function hasPermissionBoundary(content: string): boolean {
  return Object.values(PERMISSION_BOUNDARY_PATTERNS).some(pattern => pattern.test(content));
}

/**
 * Detects security issues related to role enforcement.
 * 
 * @param filePath - Path to the file
 * @param content - File content
 * @param hasRoleCheck - Whether role check is present
 * @param roleCheckTypes - Types of role checks found
 * @returns Array of security issues
 */
export function detectSecurityIssues(
  filePath: string,
  content: string,
  hasRoleCheck: boolean,
  roleCheckTypes: RoleCheckType[]
): SecurityIssue[] {
  const issues: SecurityIssue[] = [];
  const lines = content.split('\n');
  
  // Issue 1: Missing role check on admin page
  if (!hasRoleCheck) {
    issues.push({
      type: 'MISSING_AUTH_CHECK',
      filePath,
      lineNumber: 1,
      evidence: 'Admin page has no role enforcement - any authenticated user could access',
      severity: 'critical',
    });
  }
  
  // Issue 2: Only using superAdminEmailCheck (hardcoded email)
  if (roleCheckTypes.includes('superAdminEmailCheck') && roleCheckTypes.length === 1) {
    const emailMatch = content.match(/user\.email\s*===?\s*['"`]([^'"`]+)['"`]/);
    const lineNumber = findLineNumber(content, emailMatch?.[0] || '');
    
    issues.push({
      type: 'PERMISSION_BYPASS',
      filePath,
      lineNumber,
      evidence: `Hardcoded email check found: ${emailMatch?.[1] || 'unknown'} - should use role-based check`,
      severity: 'high',
    });
  }
  
  // Issue 3: Potential cross-role data leakage
  for (const [patternName, pattern] of Object.entries(DATA_LEAKAGE_PATTERNS)) {
    if (pattern.test(content)) {
      const match = content.match(pattern);
      const lineNumber = findLineNumber(content, match?.[0] || '');
      
      // Only flag if there's no role-based filtering nearby
      const surroundingLines = getSurroundingLines(lines, lineNumber, 5);
      const hasRoleFilter = /\.filter\s*\([^)]*role|where.*role|role\s*[=:]/i.test(surroundingLines);
      
      if (!hasRoleFilter && patternName !== 'sensitiveState') {
        issues.push({
          type: 'CROSS_ROLE_LEAKAGE',
          filePath,
          lineNumber,
          evidence: `Potential data leakage: ${patternName} without role-based filtering`,
          severity: 'medium',
        });
      }
    }
  }
  
  // Issue 4: Role check exists but no permission boundary (conditional rendering/redirect)
  if (hasRoleCheck && !hasPermissionBoundary(content)) {
    // Check if the page has any data fetching
    const hasFetching = /useQuery|useMutation|fetch\(|axios\.|useEffect.*fetch/i.test(content);
    
    if (hasFetching) {
      issues.push({
        type: 'PERMISSION_BYPASS',
        filePath,
        lineNumber: 1,
        evidence: 'Role check exists but no permission boundary enforcement (early return/redirect for non-admin)',
        severity: 'low',
      });
    }
  }
  
  return issues;
}

/**
 * Finds the line number of a pattern in content.
 * 
 * @param content - Full file content
 * @param pattern - Pattern to find
 * @returns Line number (1-indexed)
 */
function findLineNumber(content: string, pattern: string): number {
  if (!pattern) return 1;
  
  const index = content.indexOf(pattern);
  if (index === -1) return 1;
  
  return content.substring(0, index).split('\n').length;
}

/**
 * Gets surrounding lines for context.
 * 
 * @param lines - Array of lines
 * @param lineNumber - Center line number (1-indexed)
 * @param range - Number of lines before and after
 * @returns Combined surrounding lines
 */
function getSurroundingLines(lines: string[], lineNumber: number, range: number): string {
  const start = Math.max(0, lineNumber - range - 1);
  const end = Math.min(lines.length, lineNumber + range);
  return lines.slice(start, end).join('\n');
}

/**
 * Generates evidence for a role enforcement check.
 * 
 * @param filePath - Path to the file
 * @param content - File content
 * @param hasRoleCheck - Whether role check is present
 * @param roleCheckTypes - Types of role checks found
 * @returns Evidence object
 */
function generateEvidence(
  filePath: string,
  content: string,
  hasRoleCheck: boolean,
  roleCheckTypes: RoleCheckType[]
): Evidence {
  const lines = content.split('\n');
  
  // Find the first role check line for snippet
  let snippetLineNumber = 1;
  let codeSnippet = '';
  
  if (hasRoleCheck && roleCheckTypes.length > 0) {
    // Find the first occurrence of any role check
    for (const type of roleCheckTypes) {
      const pattern = ROLE_CHECK_PATTERNS[type];
      const match = content.match(pattern);
      if (match) {
        snippetLineNumber = findLineNumber(content, match[0]);
        break;
      }
    }
    
    // Extract snippet around the role check
    const startLine = Math.max(0, snippetLineNumber - 2);
    const endLine = Math.min(lines.length, snippetLineNumber + 5);
    codeSnippet = lines.slice(startLine, endLine).join('\n');
  } else {
    // No role check - show the component definition
    const componentMatch = content.match(/(?:export\s+default\s+)?function\s+\w+\s*\([^)]*\)\s*\{/);
    if (componentMatch) {
      snippetLineNumber = findLineNumber(content, componentMatch[0]);
      const startLine = Math.max(0, snippetLineNumber - 1);
      const endLine = Math.min(lines.length, snippetLineNumber + 8);
      codeSnippet = lines.slice(startLine, endLine).join('\n');
    }
  }
  
  return {
    filePath,
    lineNumbers: [snippetLineNumber],
    codeSnippet,
    reason: hasRoleCheck 
      ? `Role enforcement found using: ${roleCheckTypes.join(', ')}`
      : 'No role enforcement detected - admin page accessible without role check',
    confidence: hasRoleCheck ? 'certain' : 'certain',
  };
}

// =============================================================================
// Main Analysis Functions
// =============================================================================

/**
 * Checks if a file is a barrel export (re-export file).
 * Barrel exports just re-export from other files and don't need their own protection.
 * 
 * @param content - File content
 * @returns True if this is a barrel export
 */
function isBarrelExport(content: string): boolean {
  const trimmed = content.trim();
  // Check for common barrel export patterns
  return /^(?:\/\/[^\n]*\n)*\s*export\s+\{[^}]*\}\s+from\s+['"][^'"]+['"]\s*;?\s*$/s.test(trimmed) ||
         /^(?:\/\/[^\n]*\n)*\s*export\s+\{\s*default\s*\}\s+from\s+['"][^'"]+['"]\s*;?\s*$/s.test(trimmed) ||
         /^(?:\/\/[^\n]*\n)*\s*export\s+default\s+from\s+['"][^'"]+['"]\s*;?\s*$/s.test(trimmed);
}

/**
 * Checks if a component is protected at the route level via AdminRoute.
 * 
 * @param componentName - Name of the component
 * @returns True if protected at route level
 */
export function isRouteProtected(componentName: string): boolean {
  return ROUTE_PROTECTED_ADMIN_PAGES.has(componentName);
}

/**
 * Checks if a file is a child component (not a page-level component).
 * Child components in subdirectories like 'components/' are typically
 * rendered within protected parent pages and inherit their protection.
 * 
 * @param filePath - Path to the file
 * @returns True if this is a child component
 */
function isChildComponent(filePath: string): boolean {
  const normalizedPath = filePath.replace(/\\/g, '/');
  // Check if the file is in a 'components' subdirectory
  return normalizedPath.includes('/components/') || 
         normalizedPath.includes('/shared/') ||
         normalizedPath.includes('/common/');
}

/**
 * Checks role enforcement for a single admin page.
 * 
 * @param filePath - Path to the admin page file (relative to project root)
 * @param projectRoot - Project root directory
 * @returns RoleEnforcementResult with verification details
 */
export function checkRoleEnforcement(
  filePath: string,
  projectRoot: string = process.cwd()
): RoleEnforcementResult {
  const fullPath = path.join(projectRoot, filePath);
  
  // Default result for files that can't be read
  const defaultResult: RoleEnforcementResult = {
    filePath,
    componentName: path.basename(filePath, '.tsx'),
    hasRoleCheck: false,
    roleCheckTypes: [],
    rolesChecked: [],
    hasPermissionBoundary: false,
    securityIssues: [],
    evidence: {
      filePath,
      reason: 'File could not be analyzed',
      confidence: 'possible',
    },
  };
  
  try {
    if (!fs.existsSync(fullPath)) {
      return {
        ...defaultResult,
        securityIssues: [{
          type: 'MISSING_AUTH_CHECK',
          filePath,
          lineNumber: 0,
          evidence: `File not found: ${filePath}`,
          severity: 'low',
        }],
      };
    }
    
    const content = fs.readFileSync(fullPath, 'utf-8');
    
    // Check if this is a barrel export (re-export file)
    if (isBarrelExport(content)) {
      return {
        filePath,
        componentName: 'barrel-export',
        hasRoleCheck: true, // Barrel exports inherit protection from the exported module
        roleCheckTypes: [],
        rolesChecked: ['admin', 'super_admin'],
        hasPermissionBoundary: true,
        securityIssues: [],
        evidence: {
          filePath,
          reason: 'Barrel export file - re-exports from protected module',
          confidence: 'certain',
        },
      };
    }
    
    // Extract component name
    const componentName = extractComponentName(content, filePath);
    
    // Check if this is a child component (inherits protection from parent)
    const isChild = isChildComponent(filePath);
    
    // Check if protected at route level (via AdminRoute wrapper in routes/config.tsx)
    const routeProtected = isRouteProtected(componentName);
    
    // Detect role check types in the component itself
    const roleCheckTypes = detectRoleCheckTypes(content);
    
    // Component has role check if either:
    // 1. It's protected at route level via AdminRoute
    // 2. It has component-level role checks
    // 3. It's a child component (inherits protection from parent page)
    const hasRoleCheck = routeProtected || roleCheckTypes.length > 0 || isChild;
    
    // Build effective role check types
    let effectiveRoleCheckTypes: RoleCheckType[] = [...roleCheckTypes];
    if (routeProtected) {
      effectiveRoleCheckTypes = ['AdminRoute', ...effectiveRoleCheckTypes];
    }
    
    // Extract checked roles
    const rolesChecked = extractCheckedRoles(content);
    
    // If route protected or child component, add admin roles
    if ((routeProtected || isChild) && !rolesChecked.includes('admin')) {
      rolesChecked.push('admin', 'super_admin');
    }
    
    // Check permission boundaries
    const hasPermBoundary = hasPermissionBoundary(content) || routeProtected || isChild;
    
    // Detect security issues
    let securityIssues: SecurityIssue[];
    if (routeProtected || isChild) {
      // Route-protected pages and child components only check for data leakage
      securityIssues = detectSecurityIssuesForRouteProtected(filePath, content);
    } else {
      securityIssues = detectSecurityIssues(filePath, content, hasRoleCheck, roleCheckTypes);
    }
    
    // Generate evidence
    const evidence = generateEvidence(filePath, content, hasRoleCheck, effectiveRoleCheckTypes);
    
    // Update evidence based on protection type
    if (routeProtected && effectiveRoleCheckTypes.includes('AdminRoute')) {
      evidence.reason = `Protected at route level via AdminRoute wrapper${roleCheckTypes.length > 0 ? `, plus component-level checks: ${roleCheckTypes.join(', ')}` : ''}`;
    } else if (isChild) {
      evidence.reason = `Child component - inherits protection from parent admin page${roleCheckTypes.length > 0 ? `, plus component-level checks: ${roleCheckTypes.join(', ')}` : ''}`;
      evidence.confidence = 'likely';
    }
    
    return {
      filePath,
      componentName,
      hasRoleCheck,
      roleCheckTypes: effectiveRoleCheckTypes,
      rolesChecked,
      hasPermissionBoundary: hasPermBoundary,
      securityIssues,
      evidence,
    };
  } catch (error) {
    return {
      ...defaultResult,
      securityIssues: [{
        type: 'MISSING_AUTH_CHECK',
        filePath,
        lineNumber: 0,
        evidence: error instanceof Error ? error.message : 'Unknown error reading file',
        severity: 'low',
      }],
    };
  }
}

/**
 * Detects security issues for route-protected pages.
 * These pages are already protected by AdminRoute, so we only check for
 * data leakage issues, not missing auth checks.
 * 
 * @param filePath - Path to the file
 * @param content - File content
 * @returns Array of security issues (only data leakage, not missing auth)
 */
function detectSecurityIssuesForRouteProtected(
  filePath: string,
  content: string
): SecurityIssue[] {
  const issues: SecurityIssue[] = [];
  const lines = content.split('\n');
  
  // Only check for potential cross-role data leakage
  for (const [patternName, pattern] of Object.entries(DATA_LEAKAGE_PATTERNS)) {
    if (pattern.test(content)) {
      const match = content.match(pattern);
      const lineNumber = findLineNumber(content, match?.[0] || '');
      
      // Only flag if there's no role-based filtering nearby
      const surroundingLines = getSurroundingLines(lines, lineNumber, 5);
      const hasRoleFilter = /\.filter\s*\([^)]*role|where.*role|role\s*[=:]/i.test(surroundingLines);
      
      if (!hasRoleFilter && patternName !== 'sensitiveState') {
        issues.push({
          type: 'CROSS_ROLE_LEAKAGE',
          filePath,
          lineNumber,
          evidence: `Potential data leakage: ${patternName} without role-based filtering`,
          severity: 'medium',
        });
      }
    }
  }
  
  return issues;
}

/**
 * Scans all admin pages for role enforcement.
 * 
 * @param projectRoot - Project root directory
 * @returns RoleEnforcementSummary with all results
 */
export function scanAdminPagesForRoleEnforcement(
  projectRoot: string = process.cwd()
): RoleEnforcementSummary {
  const adminPagesDir = path.join(projectRoot, 'src/pages/admin');
  const results: RoleEnforcementResult[] = [];
  
  try {
    if (!fs.existsSync(adminPagesDir)) {
      return {
        totalAdminPages: 0,
        pagesWithRoleChecks: 0,
        pagesMissingRoleChecks: 0,
        pagesWithPermissionBoundaries: 0,
        totalSecurityIssues: 0,
        criticalIssues: 0,
        highIssues: 0,
        results: [],
      };
    }
    
    // Recursively find all .tsx files in admin pages
    const adminPages = findAdminPages(adminPagesDir, projectRoot);
    
    // Check each page
    for (const pagePath of adminPages) {
      const result = checkRoleEnforcement(pagePath, projectRoot);
      results.push(result);
    }
    
    // Calculate summary statistics
    const pagesWithRoleChecks = results.filter(r => r.hasRoleCheck).length;
    const pagesMissingRoleChecks = results.filter(r => !r.hasRoleCheck).length;
    const pagesWithPermissionBoundaries = results.filter(r => r.hasPermissionBoundary).length;
    
    const allIssues = results.flatMap(r => r.securityIssues);
    const criticalIssues = allIssues.filter(i => i.severity === 'critical').length;
    const highIssues = allIssues.filter(i => i.severity === 'high').length;
    
    return {
      totalAdminPages: results.length,
      pagesWithRoleChecks,
      pagesMissingRoleChecks,
      pagesWithPermissionBoundaries,
      totalSecurityIssues: allIssues.length,
      criticalIssues,
      highIssues,
      results,
    };
  } catch (error) {
    console.error('Error scanning admin pages:', error);
    return {
      totalAdminPages: 0,
      pagesWithRoleChecks: 0,
      pagesMissingRoleChecks: 0,
      pagesWithPermissionBoundaries: 0,
      totalSecurityIssues: 0,
      criticalIssues: 0,
      highIssues: 0,
      results: [],
    };
  }
}

/**
 * Recursively finds all admin page files.
 * 
 * @param dir - Directory to scan
 * @param projectRoot - Project root for relative paths
 * @returns Array of relative file paths
 */
function findAdminPages(dir: string, projectRoot: string): string[] {
  const pages: string[] = [];
  
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        // Recursively scan subdirectories
        pages.push(...findAdminPages(fullPath, projectRoot));
      } else if (entry.isFile() && entry.name.endsWith('.tsx')) {
        // Add relative path
        const relativePath = path.relative(projectRoot, fullPath);
        pages.push(relativePath);
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dir}:`, error);
  }
  
  return pages;
}

// =============================================================================
// Report Generation
// =============================================================================

/**
 * Generates a human-readable report of role enforcement audit.
 * 
 * @param summary - Role enforcement summary
 * @returns Formatted report string
 */
export function generateRoleEnforcementReport(summary: RoleEnforcementSummary): string {
  const lines: string[] = [];
  
  lines.push('='.repeat(70));
  lines.push('MIHAS Admin Page Role Enforcement Audit Report');
  lines.push('='.repeat(70));
  lines.push('');
  
  // Summary Statistics
  lines.push('Summary');
  lines.push('-'.repeat(70));
  lines.push(`Total Admin Pages: ${summary.totalAdminPages}`);
  lines.push(`Pages with Role Checks: ${summary.pagesWithRoleChecks} ✓`);
  lines.push(`Pages Missing Role Checks: ${summary.pagesMissingRoleChecks} ${summary.pagesMissingRoleChecks > 0 ? '⚠️' : ''}`);
  lines.push(`Pages with Permission Boundaries: ${summary.pagesWithPermissionBoundaries}`);
  lines.push('');
  lines.push(`Total Security Issues: ${summary.totalSecurityIssues}`);
  lines.push(`  Critical: ${summary.criticalIssues} ${summary.criticalIssues > 0 ? '🔴' : ''}`);
  lines.push(`  High: ${summary.highIssues} ${summary.highIssues > 0 ? '🟠' : ''}`);
  lines.push('');
  
  // Pages Missing Role Checks
  const missingRoleChecks = summary.results.filter(r => !r.hasRoleCheck);
  if (missingRoleChecks.length > 0) {
    lines.push('Pages Missing Role Checks (CRITICAL)');
    lines.push('-'.repeat(70));
    for (const result of missingRoleChecks) {
      lines.push(`\n  🔴 ${result.componentName}`);
      lines.push(`     File: ${result.filePath}`);
      lines.push(`     Issue: No role enforcement - any authenticated user can access`);
    }
    lines.push('');
  }
  
  // Security Issues by Severity
  const allIssues = summary.results.flatMap(r => 
    r.securityIssues.map(issue => ({ ...issue, componentName: r.componentName }))
  );
  
  const criticalIssues = allIssues.filter(i => i.severity === 'critical');
  const highIssues = allIssues.filter(i => i.severity === 'high');
  const mediumIssues = allIssues.filter(i => i.severity === 'medium');
  
  if (criticalIssues.length > 0) {
    lines.push('Critical Security Issues');
    lines.push('-'.repeat(70));
    for (const issue of criticalIssues) {
      lines.push(`\n  🔴 ${(issue as any).componentName || 'Unknown'}`);
      lines.push(`     Type: ${issue.type}`);
      lines.push(`     File: ${issue.filePath}:${issue.lineNumber}`);
      lines.push(`     Evidence: ${issue.evidence}`);
    }
    lines.push('');
  }
  
  if (highIssues.length > 0) {
    lines.push('High Severity Issues');
    lines.push('-'.repeat(70));
    for (const issue of highIssues) {
      lines.push(`\n  🟠 ${(issue as any).componentName || 'Unknown'}`);
      lines.push(`     Type: ${issue.type}`);
      lines.push(`     File: ${issue.filePath}:${issue.lineNumber}`);
      lines.push(`     Evidence: ${issue.evidence}`);
    }
    lines.push('');
  }
  
  if (mediumIssues.length > 0) {
    lines.push('Medium Severity Issues');
    lines.push('-'.repeat(70));
    for (const issue of mediumIssues) {
      lines.push(`\n  🟡 ${(issue as any).componentName || 'Unknown'}`);
      lines.push(`     Type: ${issue.type}`);
      lines.push(`     File: ${issue.filePath}:${issue.lineNumber}`);
      lines.push(`     Evidence: ${issue.evidence}`);
    }
    lines.push('');
  }
  
  // Pages with Proper Role Enforcement
  const properlyProtected = summary.results.filter(r => r.hasRoleCheck && r.securityIssues.length === 0);
  if (properlyProtected.length > 0) {
    lines.push('Properly Protected Pages');
    lines.push('-'.repeat(70));
    for (const result of properlyProtected) {
      lines.push(`\n  ✓ ${result.componentName}`);
      lines.push(`    File: ${result.filePath}`);
      lines.push(`    Role Checks: ${result.roleCheckTypes.join(', ')}`);
      if (result.rolesChecked.length > 0) {
        lines.push(`    Roles Checked: ${result.rolesChecked.join(', ')}`);
      }
      lines.push(`    Permission Boundary: ${result.hasPermissionBoundary ? 'Yes' : 'No'}`);
    }
    lines.push('');
  }
  
  // Recommendations
  lines.push('Recommendations');
  lines.push('-'.repeat(70));
  
  if (summary.pagesMissingRoleChecks > 0) {
    lines.push('\n  1. CRITICAL: Add role checks to all admin pages');
    lines.push('     - Use useAuth() hook for isAdmin check');
    lines.push('     - Add early return or redirect for non-admin users');
    lines.push('     - Consider wrapping with AdminRoute component');
  }
  
  if (summary.criticalIssues > 0 || summary.highIssues > 0) {
    lines.push('\n  2. Address security issues by severity');
    lines.push('     - Fix critical issues immediately');
    lines.push('     - Replace hardcoded email checks with role-based checks');
  }
  
  const pagesWithoutBoundary = summary.results.filter(r => r.hasRoleCheck && !r.hasPermissionBoundary);
  if (pagesWithoutBoundary.length > 0) {
    lines.push('\n  3. Add permission boundaries to pages with role checks');
    lines.push('     - Add early return: if (!isAdmin) return <Navigate to="..." />');
    lines.push('     - Or use conditional rendering for admin-only features');
  }
  
  lines.push('');
  
  return lines.join('\n');
}

// =============================================================================
// CLI Execution
// =============================================================================

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('MIHAS Admin Page Role Enforcement Checker');
  console.log('=========================================');
  console.log('');
  
  const summary = scanAdminPagesForRoleEnforcement();
  console.log(generateRoleEnforcementReport(summary));
}
