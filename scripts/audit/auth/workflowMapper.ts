/**
 * Workflow Mapper for MIHAS Frontend-Backend Forensic Audit
 * 
 * Maps the complete authentication and user workflows for both students and admins.
 * Scans the codebase to identify auth flow steps, transitions, and role requirements.
 * 
 * Student Workflow: Registration → Email Verification → Profile Setup → Application Wizard → Payment → Interview → Decision
 * Admin Workflow: Login → Dashboard → Actions (review, approve, reject, etc.)
 * 
 * @requirements 4.1 - WHEN the Audit_System examines auth THEN it SHALL map the complete student workflow step-by-step
 * @requirements 4.2 - WHEN the Audit_System examines auth THEN it SHALL map the complete admin workflow step-by-step
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AuthFlowStep, Evidence } from '../types';

// =============================================================================
// Types
// =============================================================================

/**
 * Extended workflow step with additional metadata for analysis.
 */
export interface WorkflowStepInfo extends AuthFlowStep {
  /** Route path for this step */
  routePath?: string;
  /** Guard type from route config */
  guard?: 'public' | 'auth' | 'student' | 'admin';
  /** Whether this step requires authentication */
  requiresAuth: boolean;
  /** Evidence of where this step was found */
  evidence: Evidence;
}

/**
 * Result of workflow mapping.
 */
export interface WorkflowMappingResult {
  /** Student workflow steps in order */
  studentWorkflow: WorkflowStepInfo[];
  /** Admin workflow steps in order */
  adminWorkflow: WorkflowStepInfo[];
  /** All discovered routes */
  discoveredRoutes: RouteInfo[];
  /** Mapping errors encountered */
  errors: { step: string; error: string }[];
}

/**
 * Route information extracted from route config.
 */
export interface RouteInfo {
  path: string;
  componentName: string;
  guard: 'public' | 'auth' | 'student' | 'admin';
  filePath: string;
  lazy: boolean;
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Expected student workflow steps based on product requirements.
 * Order: Registration → Email Verification → Profile Setup → Application Wizard → Payment → Interview → Decision
 */
const STUDENT_WORKFLOW_STEPS = [
  {
    action: 'Registration',
    expectedComponent: 'SignUpPage',
    expectedRoute: '/auth/signup',
    description: 'Student creates account with personal information',
  },
  {
    action: 'Email Verification',
    expectedComponent: 'AuthCallbackPage',
    expectedRoute: '/auth/callback',
    description: 'Student verifies email via callback link',
  },
  {
    action: 'Profile Setup',
    expectedComponent: 'StudentSettings',
    expectedRoute: '/student/settings',
    description: 'Student completes profile information',
  },
  {
    action: 'Application Wizard',
    expectedComponent: 'ApplicationWizard',
    expectedRoute: '/apply',
    description: 'Student fills out application (4 steps: Personal Info, Academic History, Program Selection, Document Upload)',
  },
  {
    action: 'Payment',
    expectedComponent: 'StudentPayment',
    expectedRoute: '/student/payment',
    description: 'Student submits payment (K153 application fee)',
  },
  {
    action: 'Interview',
    expectedComponent: 'StudentInterview',
    expectedRoute: '/student/interview',
    description: 'Student attends scheduled interview',
  },
  {
    action: 'Decision',
    expectedComponent: 'ApplicationStatus',
    expectedRoute: '/student/status',
    description: 'Student views application decision (approved/rejected)',
  },
];

/**
 * Expected admin workflow steps.
 * Order: Login → Dashboard → Actions
 */
const ADMIN_WORKFLOW_STEPS = [
  {
    action: 'Login',
    expectedComponent: 'SignInPage',
    expectedRoute: '/auth/signin',
    description: 'Admin authenticates with credentials',
  },
  {
    action: 'Dashboard',
    expectedComponent: 'AdminDashboard',
    expectedRoute: '/admin/dashboard',
    description: 'Admin views system overview and metrics',
  },
  {
    action: 'Review Applications',
    expectedComponent: 'AdminApplications',
    expectedRoute: '/admin/applications',
    description: 'Admin reviews submitted applications',
  },
  {
    action: 'Manage Users',
    expectedComponent: 'AdminUsers',
    expectedRoute: '/admin/users',
    description: 'Admin manages user accounts',
  },
  {
    action: 'Manage Programs',
    expectedComponent: 'AdminPrograms',
    expectedRoute: '/admin/programs',
    description: 'Admin manages available programs',
  },
  {
    action: 'View Analytics',
    expectedComponent: 'AdminAnalytics',
    expectedRoute: '/admin/analytics',
    description: 'Admin views system analytics',
  },
  {
    action: 'System Settings',
    expectedComponent: 'AdminSettings',
    expectedRoute: '/admin/settings',
    description: 'Admin configures system settings',
  },
];

/**
 * Patterns for detecting navigation/redirect logic in components.
 */
const NAVIGATION_PATTERNS = {
  /** React Router navigate function */
  navigate: /navigate\s*\(\s*['"`]([^'"`]+)['"`]/g,
  /** React Router Navigate component */
  navigateComponent: /<Navigate\s+to\s*=\s*['"`]([^'"`]+)['"`]/g,
  /** React Router Link component */
  link: /<Link\s+to\s*=\s*['"`]([^'"`]+)['"`]/g,
  /** Window location redirect */
  windowLocation: /window\.location\.href\s*=\s*['"`]([^'"`]+)['"`]/g,
  /** useNavigate hook */
  useNavigate: /const\s+navigate\s*=\s*useNavigate\s*\(\s*\)/,
};

/**
 * Patterns for detecting role requirements in components.
 */
const ROLE_PATTERNS = {
  /** isAdmin check */
  isAdmin: /\bisAdmin\b/,
  /** Role comparison */
  roleCheck: /(?:user|profile)\.role\s*===?\s*['"`](\w+)['"`]/g,
  /** requireRole wrapper */
  requireRole: /requireRole\s*\(\s*\[([^\]]+)\]/,
  /** Admin route guard */
  adminGuard: /guard:\s*['"`]admin['"`]/,
  /** Student route guard */
  studentGuard: /guard:\s*['"`]student['"`]/,
};

// =============================================================================
// Route Parser
// =============================================================================

/**
 * Parses the route configuration file to extract route information.
 * 
 * @param projectRoot - Project root directory
 * @returns Array of RouteInfo objects
 */
export function parseRouteConfig(projectRoot: string = process.cwd()): RouteInfo[] {
  const routeConfigPath = path.join(projectRoot, 'src/routes/config.tsx');
  const routes: RouteInfo[] = [];
  
  try {
    if (!fs.existsSync(routeConfigPath)) {
      console.warn(`Route config not found at: ${routeConfigPath}`);
      return routes;
    }
    
    const content = fs.readFileSync(routeConfigPath, 'utf-8');
    
    // Extract route definitions from the routes array
    // Pattern: { path: '/...', element: ComponentName, guard: '...', lazy?: true }
    const routePattern = /\{\s*path:\s*['"`]([^'"`]+)['"`]\s*,\s*element:\s*(?:<)?(\w+)(?:\s*\/>)?\s*,\s*guard:\s*['"`](\w+)['"`](?:\s*,\s*lazy:\s*(true|false))?\s*\}/g;
    
    let match;
    while ((match = routePattern.exec(content)) !== null) {
      const [, routePath, componentName, guard, lazy] = match;
      
      // Find the component's file path from lazy import
      const importPattern = new RegExp(`const\\s+${componentName}\\s*=\\s*React\\.lazy\\s*\\(\\s*\\(\\s*\\)\\s*=>\\s*import\\s*\\(\\s*['"\`]([^'"\`]+)['"\`]\\s*\\)\\s*\\)`);
      const importMatch = content.match(importPattern);
      
      let filePath = '';
      if (importMatch && importMatch[1]) {
        // Convert @/ alias to src/
        filePath = importMatch[1].replace('@/', 'src/');
        // Add .tsx extension if not present
        if (!filePath.endsWith('.tsx') && !filePath.endsWith('.ts')) {
          filePath += '.tsx';
        }
      }
      
      routes.push({
        path: routePath,
        componentName,
        guard: guard as RouteInfo['guard'],
        filePath,
        lazy: lazy === 'true',
      });
    }
    
    return routes;
  } catch (error) {
    console.error('Error parsing route config:', error);
    return routes;
  }
}

// =============================================================================
// Component Analyzer
// =============================================================================

/**
 * Analyzes a component file to extract workflow-related information.
 * 
 * @param filePath - Path to the component file
 * @param projectRoot - Project root directory
 * @returns Analysis result with navigation targets and role requirements
 */
export function analyzeComponent(
  filePath: string,
  projectRoot: string = process.cwd()
): {
  navigationTargets: string[];
  roleRequired: string[];
  redirectOnFail: string | undefined;
  hasAuthCheck: boolean;
} {
  const fullPath = path.join(projectRoot, filePath);
  
  const result = {
    navigationTargets: [] as string[],
    roleRequired: [] as string[],
    redirectOnFail: undefined as string | undefined,
    hasAuthCheck: false,
  };
  
  try {
    if (!fs.existsSync(fullPath)) {
      return result;
    }
    
    const content = fs.readFileSync(fullPath, 'utf-8');
    
    // Extract navigation targets
    const navigateMatches = content.matchAll(NAVIGATION_PATTERNS.navigate);
    for (const match of navigateMatches) {
      if (match[1] && !result.navigationTargets.includes(match[1])) {
        result.navigationTargets.push(match[1]);
      }
    }
    
    const navigateComponentMatches = content.matchAll(NAVIGATION_PATTERNS.navigateComponent);
    for (const match of navigateComponentMatches) {
      if (match[1] && !result.navigationTargets.includes(match[1])) {
        result.navigationTargets.push(match[1]);
      }
    }
    
    const linkMatches = content.matchAll(NAVIGATION_PATTERNS.link);
    for (const match of linkMatches) {
      if (match[1] && !result.navigationTargets.includes(match[1])) {
        result.navigationTargets.push(match[1]);
      }
    }
    
    // Extract role requirements
    if (ROLE_PATTERNS.isAdmin.test(content)) {
      result.roleRequired.push('admin', 'super_admin');
    }
    
    const roleCheckMatches = content.matchAll(ROLE_PATTERNS.roleCheck);
    for (const match of roleCheckMatches) {
      if (match[1] && !result.roleRequired.includes(match[1])) {
        result.roleRequired.push(match[1]);
      }
    }
    
    const requireRoleMatch = content.match(ROLE_PATTERNS.requireRole);
    if (requireRoleMatch && requireRoleMatch[1]) {
      const roles = requireRoleMatch[1].matchAll(/['"`](\w+)['"`]/g);
      for (const roleMatch of roles) {
        if (roleMatch[1] && !result.roleRequired.includes(roleMatch[1])) {
          result.roleRequired.push(roleMatch[1]);
        }
      }
    }
    
    // Check for auth-related patterns
    result.hasAuthCheck = /useAuth\s*\(|useOptimizedAuthState\s*\(|ProtectedRoute|requireAuth/.test(content);
    
    // Find redirect on auth failure
    const redirectMatch = content.match(/navigate\s*\(\s*['"`](\/auth\/signin|\/login|\/signin)['"`]/);
    if (redirectMatch) {
      result.redirectOnFail = redirectMatch[1];
    }
    
    return result;
  } catch (error) {
    console.error(`Error analyzing component ${filePath}:`, error);
    return result;
  }
}

// =============================================================================
// Workflow Mapper
// =============================================================================

/**
 * Maps the student workflow by scanning the codebase.
 * 
 * @param routes - Discovered routes from route config
 * @param projectRoot - Project root directory
 * @returns Array of WorkflowStepInfo for student workflow
 * 
 * @requirements 4.1 - Map complete student workflow step-by-step
 */
export function mapStudentWorkflow(
  routes: RouteInfo[],
  projectRoot: string = process.cwd()
): WorkflowStepInfo[] {
  const workflow: WorkflowStepInfo[] = [];
  
  for (let i = 0; i < STUDENT_WORKFLOW_STEPS.length; i++) {
    const step = STUDENT_WORKFLOW_STEPS[i];
    const nextStep = STUDENT_WORKFLOW_STEPS[i + 1];
    
    // Find matching route - prioritize exact matches and student guard routes
    let matchingRoute = routes.find(r => r.path === step.expectedRoute);
    
    // If no exact path match, try component name match with student/public guard preference
    if (!matchingRoute) {
      matchingRoute = routes.find(r => 
        r.componentName === step.expectedComponent && 
        (r.guard === 'student' || r.guard === 'public')
      );
    }
    
    // Fallback to any component name match
    if (!matchingRoute) {
      matchingRoute = routes.find(r => r.componentName === step.expectedComponent);
    }
    
    // Analyze the component if found
    let componentAnalysis = {
      navigationTargets: [] as string[],
      roleRequired: [] as string[],
      redirectOnFail: undefined as string | undefined,
      hasAuthCheck: false,
    };
    
    let filePath = matchingRoute?.filePath || '';
    
    if (filePath) {
      componentAnalysis = analyzeComponent(filePath, projectRoot);
    } else {
      // Try to find the file by expected component name
      const possiblePaths = [
        `src/pages/auth/${step.expectedComponent}.tsx`,
        `src/pages/student/${step.expectedComponent}.tsx`,
        `src/pages/student/${step.expectedComponent.replace('Student', '')}.tsx`,
        `src/pages/${step.expectedComponent}.tsx`,
      ];
      
      for (const possiblePath of possiblePaths) {
        const fullPath = path.join(projectRoot, possiblePath);
        if (fs.existsSync(fullPath)) {
          filePath = possiblePath;
          componentAnalysis = analyzeComponent(possiblePath, projectRoot);
          break;
        }
      }
    }
    
    // Determine if auth is required based on route guard
    const requiresAuth = matchingRoute?.guard === 'student' || matchingRoute?.guard === 'auth';
    
    // Create workflow step
    const workflowStep: WorkflowStepInfo = {
      action: step.action,
      component: matchingRoute?.componentName || step.expectedComponent,
      filePath: filePath || `[NOT FOUND: ${step.expectedComponent}]`,
      nextStep: nextStep?.action,
      roleRequired: componentAnalysis.roleRequired.length > 0 ? componentAnalysis.roleRequired : undefined,
      redirectOnFail: componentAnalysis.redirectOnFail || '/auth/signin',
      routePath: matchingRoute?.path || step.expectedRoute,
      guard: matchingRoute?.guard,
      requiresAuth,
      evidence: {
        filePath: filePath || 'unknown',
        reason: `Student workflow step: ${step.description}`,
        confidence: filePath ? 'certain' : 'possible',
      },
    };
    
    workflow.push(workflowStep);
  }
  
  return workflow;
}

/**
 * Maps the admin workflow by scanning the codebase.
 * 
 * @param routes - Discovered routes from route config
 * @param projectRoot - Project root directory
 * @returns Array of WorkflowStepInfo for admin workflow
 * 
 * @requirements 4.2 - Map complete admin workflow step-by-step
 */
export function mapAdminWorkflow(
  routes: RouteInfo[],
  projectRoot: string = process.cwd()
): WorkflowStepInfo[] {
  const workflow: WorkflowStepInfo[] = [];
  
  for (let i = 0; i < ADMIN_WORKFLOW_STEPS.length; i++) {
    const step = ADMIN_WORKFLOW_STEPS[i];
    const nextStep = ADMIN_WORKFLOW_STEPS[i + 1];
    
    // Find matching route - prioritize exact matches and admin guard routes
    let matchingRoute = routes.find(r => r.path === step.expectedRoute);
    
    // If no exact path match, try component name match with admin guard preference
    if (!matchingRoute) {
      matchingRoute = routes.find(r => 
        r.componentName === step.expectedComponent && 
        (r.guard === 'admin' || step.action === 'Login')
      );
    }
    
    // Fallback to any component name match
    if (!matchingRoute) {
      matchingRoute = routes.find(r => r.componentName === step.expectedComponent);
    }
    
    // Analyze the component if found
    let componentAnalysis = {
      navigationTargets: [] as string[],
      roleRequired: [] as string[],
      redirectOnFail: undefined as string | undefined,
      hasAuthCheck: false,
    };
    
    let filePath = matchingRoute?.filePath || '';
    
    if (filePath) {
      componentAnalysis = analyzeComponent(filePath, projectRoot);
    } else {
      // Try to find the file by expected component name
      const possiblePaths = [
        `src/pages/auth/${step.expectedComponent}.tsx`,
        `src/pages/admin/${step.expectedComponent}.tsx`,
        `src/pages/admin/${step.expectedComponent.replace('Admin', '')}.tsx`,
        `src/pages/${step.expectedComponent}.tsx`,
      ];
      
      for (const possiblePath of possiblePaths) {
        const fullPath = path.join(projectRoot, possiblePath);
        if (fs.existsSync(fullPath)) {
          filePath = possiblePath;
          componentAnalysis = analyzeComponent(possiblePath, projectRoot);
          break;
        }
      }
    }
    
    // Determine if auth is required based on route guard
    const requiresAuth = matchingRoute?.guard === 'admin' || matchingRoute?.guard === 'auth';
    
    // Admin routes should require admin role
    const roleRequired = matchingRoute?.guard === 'admin' 
      ? ['admin', 'super_admin']
      : componentAnalysis.roleRequired;
    
    // Create workflow step
    const workflowStep: WorkflowStepInfo = {
      action: step.action,
      component: matchingRoute?.componentName || step.expectedComponent,
      filePath: filePath || `[NOT FOUND: ${step.expectedComponent}]`,
      nextStep: nextStep?.action,
      roleRequired: roleRequired.length > 0 ? roleRequired : undefined,
      redirectOnFail: componentAnalysis.redirectOnFail || '/auth/signin',
      routePath: matchingRoute?.path || step.expectedRoute,
      guard: matchingRoute?.guard,
      requiresAuth,
      evidence: {
        filePath: filePath || 'unknown',
        reason: `Admin workflow step: ${step.description}`,
        confidence: filePath ? 'certain' : 'possible',
      },
    };
    
    workflow.push(workflowStep);
  }
  
  return workflow;
}

/**
 * Main function to map all workflows.
 * 
 * @param projectRoot - Project root directory
 * @returns Complete workflow mapping result
 * 
 * @requirements 4.1, 4.2 - Map complete student and admin workflows
 */
export function mapWorkflows(projectRoot: string = process.cwd()): WorkflowMappingResult {
  const errors: { step: string; error: string }[] = [];
  
  // Parse route configuration
  const discoveredRoutes = parseRouteConfig(projectRoot);
  
  if (discoveredRoutes.length === 0) {
    errors.push({
      step: 'Route Parsing',
      error: 'No routes discovered from route config',
    });
  }
  
  // Map student workflow
  let studentWorkflow: WorkflowStepInfo[] = [];
  try {
    studentWorkflow = mapStudentWorkflow(discoveredRoutes, projectRoot);
  } catch (error) {
    errors.push({
      step: 'Student Workflow',
      error: error instanceof Error ? error.message : 'Unknown error mapping student workflow',
    });
  }
  
  // Map admin workflow
  let adminWorkflow: WorkflowStepInfo[] = [];
  try {
    adminWorkflow = mapAdminWorkflow(discoveredRoutes, projectRoot);
  } catch (error) {
    errors.push({
      step: 'Admin Workflow',
      error: error instanceof Error ? error.message : 'Unknown error mapping admin workflow',
    });
  }
  
  return {
    studentWorkflow,
    adminWorkflow,
    discoveredRoutes,
    errors,
  };
}

// =============================================================================
// Report Generation
// =============================================================================

/**
 * Generates a human-readable report of the workflow mapping.
 * 
 * @param result - Workflow mapping result
 * @returns Formatted report string
 */
export function generateWorkflowReport(result: WorkflowMappingResult): string {
  const lines: string[] = [];
  
  lines.push('='.repeat(70));
  lines.push('MIHAS Auth Workflow Mapping Report');
  lines.push('='.repeat(70));
  lines.push('');
  
  // Summary
  lines.push('Summary');
  lines.push('-'.repeat(70));
  lines.push(`Total Routes Discovered: ${result.discoveredRoutes.length}`);
  lines.push(`Student Workflow Steps: ${result.studentWorkflow.length}`);
  lines.push(`Admin Workflow Steps: ${result.adminWorkflow.length}`);
  lines.push(`Mapping Errors: ${result.errors.length}`);
  lines.push('');
  
  // Student Workflow
  lines.push('Student Workflow');
  lines.push('-'.repeat(70));
  lines.push('Registration → Email Verification → Profile Setup → Application Wizard → Payment → Interview → Decision');
  lines.push('');
  
  for (const step of result.studentWorkflow) {
    const status = step.filePath.includes('[NOT FOUND') ? '❌' : '✓';
    lines.push(`${status} ${step.action}`);
    lines.push(`    Component: ${step.component}`);
    lines.push(`    Route: ${step.routePath || 'N/A'}`);
    lines.push(`    File: ${step.filePath}`);
    lines.push(`    Guard: ${step.guard || 'none'}`);
    lines.push(`    Requires Auth: ${step.requiresAuth ? 'Yes' : 'No'}`);
    if (step.roleRequired && step.roleRequired.length > 0) {
      lines.push(`    Roles Required: ${step.roleRequired.join(', ')}`);
    }
    if (step.nextStep) {
      lines.push(`    Next Step: ${step.nextStep}`);
    }
    lines.push(`    Redirect on Fail: ${step.redirectOnFail || 'N/A'}`);
    lines.push('');
  }
  
  // Admin Workflow
  lines.push('Admin Workflow');
  lines.push('-'.repeat(70));
  lines.push('Login → Dashboard → Actions (review, approve, reject, etc.)');
  lines.push('');
  
  for (const step of result.adminWorkflow) {
    const status = step.filePath.includes('[NOT FOUND') ? '❌' : '✓';
    lines.push(`${status} ${step.action}`);
    lines.push(`    Component: ${step.component}`);
    lines.push(`    Route: ${step.routePath || 'N/A'}`);
    lines.push(`    File: ${step.filePath}`);
    lines.push(`    Guard: ${step.guard || 'none'}`);
    lines.push(`    Requires Auth: ${step.requiresAuth ? 'Yes' : 'No'}`);
    if (step.roleRequired && step.roleRequired.length > 0) {
      lines.push(`    Roles Required: ${step.roleRequired.join(', ')}`);
    }
    if (step.nextStep) {
      lines.push(`    Next Step: ${step.nextStep}`);
    }
    lines.push(`    Redirect on Fail: ${step.redirectOnFail || 'N/A'}`);
    lines.push('');
  }
  
  // Discovered Routes
  lines.push('Discovered Routes');
  lines.push('-'.repeat(70));
  
  const routesByGuard = {
    public: result.discoveredRoutes.filter(r => r.guard === 'public'),
    auth: result.discoveredRoutes.filter(r => r.guard === 'auth'),
    student: result.discoveredRoutes.filter(r => r.guard === 'student'),
    admin: result.discoveredRoutes.filter(r => r.guard === 'admin'),
  };
  
  for (const [guard, routes] of Object.entries(routesByGuard)) {
    if (routes.length > 0) {
      lines.push(`\n${guard.toUpperCase()} Routes (${routes.length}):`);
      for (const route of routes) {
        lines.push(`  ${route.path} → ${route.componentName}`);
      }
    }
  }
  
  // Errors
  if (result.errors.length > 0) {
    lines.push('');
    lines.push('Errors');
    lines.push('-'.repeat(70));
    for (const error of result.errors) {
      lines.push(`  [${error.step}] ${error.error}`);
    }
  }
  
  return lines.join('\n');
}

/**
 * Converts workflow steps to the AuthFlowStep format expected by the audit types.
 * 
 * @param steps - WorkflowStepInfo array
 * @returns AuthFlowStep array
 */
export function toAuthFlowSteps(steps: WorkflowStepInfo[]): AuthFlowStep[] {
  return steps.map(step => ({
    action: step.action,
    component: step.component,
    filePath: step.filePath,
    nextStep: step.nextStep,
    roleRequired: step.roleRequired,
    redirectOnFail: step.redirectOnFail,
  }));
}

// =============================================================================
// CLI Execution
// =============================================================================

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('MIHAS Auth Workflow Mapper');
  console.log('==========================');
  console.log('');
  
  const result = mapWorkflows();
  console.log(generateWorkflowReport(result));
}
