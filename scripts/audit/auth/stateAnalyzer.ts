/**
 * Auth State Analyzer for MIHAS Frontend-Backend Forensic Audit
 * 
 * Scans the codebase to find all auth state sources (Zustand stores, React contexts)
 * and detects fragmentation across multiple sources.
 * 
 * @requirements 4.3 - WHEN the Audit_System examines auth THEN it SHALL verify auth state
 *                     propagates correctly across all components
 * @requirements 4.10 - IF auth state management is fragmented THEN the Audit_System SHALL
 *                      recommend unification
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Evidence, AuthAuditResult } from '../types';

// =============================================================================
// Types
// =============================================================================

/**
 * Information about an auth state source (store or context).
 */
export interface AuthStateSource {
  /** Type of state source */
  type: 'store' | 'context' | 'hook';
  /** Name of the store/context/hook */
  name: string;
  /** File path where it's defined */
  filePath: string;
  /** Line number where it's defined */
  lineNumber: number;
  /** State fields managed */
  stateFields: string[];
  /** Actions/methods provided */
  actions: string[];
  /** Whether it persists state */
  isPersisted: boolean;
  /** Evidence of the finding */
  evidence: Evidence;
}

/**
 * Result of auth state analysis.
 */
export interface AuthStateAnalysisResult {
  /** Zustand stores managing auth state */
  stores: AuthStateSource[];
  /** React contexts managing auth state */
  contexts: AuthStateSource[];
  /** Hooks that manage auth state (not just consume) */
  stateHooks: AuthStateSource[];
  /** Whether auth state is fragmented across multiple sources */
  isFragmented: boolean;
  /** Fragmentation issues found */
  fragmentationIssues: FragmentationIssue[];
  /** Recommendations for unification */
  recommendations: string[];
}

/**
 * A fragmentation issue detected in auth state management.
 */
export interface FragmentationIssue {
  /** Description of the issue */
  description: string;
  /** Sources involved */
  sources: string[];
  /** Severity of the issue */
  severity: 'high' | 'medium' | 'low';
  /** Evidence supporting the finding */
  evidence: Evidence;
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Patterns for detecting Zustand stores.
 */
const ZUSTAND_PATTERNS = {
  /** create() call from zustand */
  createStore: /(?:export\s+)?(?:const|let)\s+(\w+)\s*=\s*create\s*<[^>]*>\s*\(\s*\)/,
  /** create() with persist middleware */
  createWithPersist: /create\s*<[^>]*>\s*\(\s*\n?\s*persist\s*\(/,
  /** State interface definition */
  stateInterface: /interface\s+(\w*(?:State|Store)\w*)\s*\{([^}]+)\}/g,
  /** Actions in store */
  storeActions: /(\w+):\s*\([^)]*\)\s*=>\s*(?:void|Promise|{)/g,
};

/**
 * Patterns for detecting React contexts.
 */
const CONTEXT_PATTERNS = {
  /** createContext call */
  createContext: /(?:const|let)\s+(\w+)\s*=\s*createContext\s*<([^>]+)>\s*\(/,
  /** Context provider component */
  contextProvider: /(?:export\s+)?function\s+(\w+Provider)\s*\(/,
  /** useContext hook usage */
  useContext: /useContext\s*\(\s*(\w+)\s*\)/,
  /** Context type interface */
  contextType: /interface\s+(\w*Context\w*Type)\s*\{([^}]+)\}/g,
};

/**
 * Patterns for detecting auth-related state.
 */
const AUTH_STATE_PATTERNS = {
  /** User state field */
  userField: /\buser\s*:/,
  /** Auth/authenticated state */
  authField: /\b(?:isAuthenticated|isAuth|authenticated)\s*:/,
  /** Loading state for auth */
  loadingField: /\b(?:isLoading|loading|authLoading)\s*:/,
  /** Profile state */
  profileField: /\bprofile\s*:/,
  /** Role/permission state */
  roleField: /\b(?:role|isAdmin|permissions)\s*:/,
  /** Token state */
  tokenField: /\b(?:token|accessToken|refreshToken)\s*:/,
  /** Session state */
  sessionField: /\bsession\s*:/,
  /** Auth error state */
  errorField: /\b(?:error|authError)\s*:/,
};

/**
 * Patterns for detecting auth-related actions.
 */
const AUTH_ACTION_PATTERNS = {
  /** Sign in action */
  signIn: /\b(?:signIn|login|authenticate)\s*:/,
  /** Sign out action */
  signOut: /\b(?:signOut|logout|clearAuth)\s*:/,
  /** Sign up action */
  signUp: /\b(?:signUp|register)\s*:/,
  /** Set user action */
  setUser: /\b(?:setUser|updateUser)\s*:/,
  /** Refresh token action */
  refresh: /\b(?:refresh|refreshToken|refreshSession)\s*:/,
  /** Password reset action */
  passwordReset: /\b(?:resetPassword|requestPasswordReset|updatePassword)\s*:/,
};

// =============================================================================
// Store Scanner
// =============================================================================

/**
 * Scans a file for Zustand store definitions related to auth.
 * 
 * @param filePath - Path to the file
 * @param content - File content
 * @returns AuthStateSource if auth store found, null otherwise
 */
function scanForAuthStore(filePath: string, content: string): AuthStateSource | null {
  // Check if this is a Zustand store file
  if (!content.includes('from \'zustand\'') && !content.includes('from "zustand"')) {
    return null;
  }
  
  // Check if it contains auth-related state
  const hasAuthState = Object.values(AUTH_STATE_PATTERNS).some(pattern => pattern.test(content));
  if (!hasAuthState) {
    return null;
  }
  
  // Extract store name
  const storeMatch = content.match(ZUSTAND_PATTERNS.createStore);
  if (!storeMatch) {
    return null;
  }
  
  const storeName = storeMatch[1];
  const lineNumber = content.substring(0, storeMatch.index).split('\n').length;
  
  // Extract state fields
  const stateFields: string[] = [];
  for (const [fieldName, pattern] of Object.entries(AUTH_STATE_PATTERNS)) {
    if (pattern.test(content)) {
      stateFields.push(fieldName.replace('Field', ''));
    }
  }
  
  // Extract actions
  const actions: string[] = [];
  for (const [actionName, pattern] of Object.entries(AUTH_ACTION_PATTERNS)) {
    if (pattern.test(content)) {
      actions.push(actionName);
    }
  }
  
  // Check if persisted
  const isPersisted = ZUSTAND_PATTERNS.createWithPersist.test(content);
  
  // Extract code snippet around the store definition
  const lines = content.split('\n');
  const startLine = Math.max(0, lineNumber - 2);
  const endLine = Math.min(lines.length, lineNumber + 8);
  const codeSnippet = lines.slice(startLine, endLine).join('\n');
  
  return {
    type: 'store',
    name: storeName,
    filePath,
    lineNumber,
    stateFields,
    actions,
    isPersisted,
    evidence: {
      filePath,
      lineNumbers: [lineNumber],
      codeSnippet,
      reason: `Zustand store managing auth state: ${stateFields.join(', ')}`,
      confidence: 'certain',
    },
  };
}

/**
 * Scans the stores directory for auth-related Zustand stores.
 * 
 * @param projectRoot - Project root directory
 * @returns Array of AuthStateSource for stores
 */
export function scanAuthStores(projectRoot: string = process.cwd()): AuthStateSource[] {
  const storesDir = path.join(projectRoot, 'src/stores');
  const stores: AuthStateSource[] = [];
  
  try {
    if (!fs.existsSync(storesDir)) {
      return stores;
    }
    
    const files = fs.readdirSync(storesDir);
    
    for (const file of files) {
      if (!file.endsWith('.ts') && !file.endsWith('.tsx')) {
        continue;
      }
      
      const filePath = path.join('src/stores', file);
      const fullPath = path.join(projectRoot, filePath);
      
      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const store = scanForAuthStore(filePath, content);
        
        if (store) {
          stores.push(store);
        }
      } catch (error) {
        console.error(`Error reading store file ${filePath}:`, error);
      }
    }
    
    return stores;
  } catch (error) {
    console.error('Error scanning stores directory:', error);
    return stores;
  }
}

// =============================================================================
// Context Scanner
// =============================================================================

/**
 * Scans a file for React context definitions related to auth.
 * 
 * @param filePath - Path to the file
 * @param content - File content
 * @returns AuthStateSource if auth context found, null otherwise
 */
function scanForAuthContext(filePath: string, content: string): AuthStateSource | null {
  // Check if this is a React context file
  if (!content.includes('createContext')) {
    return null;
  }
  
  // Check if it contains auth-related state
  const hasAuthState = Object.values(AUTH_STATE_PATTERNS).some(pattern => pattern.test(content));
  const hasAuthActions = Object.values(AUTH_ACTION_PATTERNS).some(pattern => pattern.test(content));
  
  if (!hasAuthState && !hasAuthActions) {
    return null;
  }
  
  // Extract context name
  const contextMatch = content.match(CONTEXT_PATTERNS.createContext);
  if (!contextMatch) {
    return null;
  }
  
  const contextName = contextMatch[1];
  const lineNumber = content.substring(0, contextMatch.index).split('\n').length;
  
  // Extract state fields
  const stateFields: string[] = [];
  for (const [fieldName, pattern] of Object.entries(AUTH_STATE_PATTERNS)) {
    if (pattern.test(content)) {
      stateFields.push(fieldName.replace('Field', ''));
    }
  }
  
  // Extract actions
  const actions: string[] = [];
  for (const [actionName, pattern] of Object.entries(AUTH_ACTION_PATTERNS)) {
    if (pattern.test(content)) {
      actions.push(actionName);
    }
  }
  
  // Extract code snippet around the context definition
  const lines = content.split('\n');
  const startLine = Math.max(0, lineNumber - 2);
  const endLine = Math.min(lines.length, lineNumber + 8);
  const codeSnippet = lines.slice(startLine, endLine).join('\n');
  
  return {
    type: 'context',
    name: contextName,
    filePath,
    lineNumber,
    stateFields,
    actions,
    isPersisted: false, // Contexts don't persist by default
    evidence: {
      filePath,
      lineNumbers: [lineNumber],
      codeSnippet,
      reason: `React context managing auth state: ${stateFields.join(', ')}`,
      confidence: 'certain',
    },
  };
}

/**
 * Scans the contexts directory for auth-related React contexts.
 * 
 * @param projectRoot - Project root directory
 * @returns Array of AuthStateSource for contexts
 */
export function scanAuthContexts(projectRoot: string = process.cwd()): AuthStateSource[] {
  const contextsDir = path.join(projectRoot, 'src/contexts');
  const contexts: AuthStateSource[] = [];
  
  try {
    if (!fs.existsSync(contextsDir)) {
      return contexts;
    }
    
    const files = fs.readdirSync(contextsDir);
    
    for (const file of files) {
      if (!file.endsWith('.ts') && !file.endsWith('.tsx')) {
        continue;
      }
      
      const filePath = path.join('src/contexts', file);
      const fullPath = path.join(projectRoot, filePath);
      
      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const context = scanForAuthContext(filePath, content);
        
        if (context) {
          contexts.push(context);
        }
      } catch (error) {
        console.error(`Error reading context file ${filePath}:`, error);
      }
    }
    
    return contexts;
  } catch (error) {
    console.error('Error scanning contexts directory:', error);
    return contexts;
  }
}

// =============================================================================
// Hook Scanner
// =============================================================================

/**
 * Scans a file for hooks that manage auth state (not just consume).
 * 
 * @param filePath - Path to the file
 * @param content - File content
 * @returns AuthStateSource if auth state hook found, null otherwise
 */
function scanForAuthStateHook(filePath: string, content: string): AuthStateSource | null {
  // Check if this is a hook file that manages state
  const hookMatch = content.match(/(?:export\s+)?function\s+(use\w+)\s*\(/);
  if (!hookMatch) {
    return null;
  }
  
  // Check if it uses React Query or useState to manage auth state
  const usesReactQuery = content.includes('useQuery') && content.includes('queryKey');
  const usesState = content.includes('useState');
  
  if (!usesReactQuery && !usesState) {
    return null;
  }
  
  // Check if it contains auth-related state
  const hasAuthState = Object.values(AUTH_STATE_PATTERNS).some(pattern => pattern.test(content));
  
  // Check for auth-related query keys
  const hasAuthQueryKey = /queryKey:\s*\[['"`](?:auth|session|user|profile)['"`]/.test(content);
  
  if (!hasAuthState && !hasAuthQueryKey) {
    return null;
  }
  
  const hookName = hookMatch[1];
  const lineNumber = content.substring(0, hookMatch.index).split('\n').length;
  
  // Extract state fields
  const stateFields: string[] = [];
  for (const [fieldName, pattern] of Object.entries(AUTH_STATE_PATTERNS)) {
    if (pattern.test(content)) {
      stateFields.push(fieldName.replace('Field', ''));
    }
  }
  
  // Extract actions
  const actions: string[] = [];
  for (const [actionName, pattern] of Object.entries(AUTH_ACTION_PATTERNS)) {
    if (pattern.test(content)) {
      actions.push(actionName);
    }
  }
  
  // Extract code snippet
  const lines = content.split('\n');
  const startLine = Math.max(0, lineNumber - 2);
  const endLine = Math.min(lines.length, lineNumber + 8);
  const codeSnippet = lines.slice(startLine, endLine).join('\n');
  
  return {
    type: 'hook',
    name: hookName,
    filePath,
    lineNumber,
    stateFields,
    actions,
    isPersisted: false,
    evidence: {
      filePath,
      lineNumbers: [lineNumber],
      codeSnippet,
      reason: `Hook managing auth state via ${usesReactQuery ? 'React Query' : 'useState'}`,
      confidence: 'certain',
    },
  };
}

/**
 * Scans the hooks directory for auth-related state hooks.
 * 
 * @param projectRoot - Project root directory
 * @returns Array of AuthStateSource for hooks
 */
export function scanAuthStateHooks(projectRoot: string = process.cwd()): AuthStateSource[] {
  const hooksDir = path.join(projectRoot, 'src/hooks/auth');
  const hooks: AuthStateSource[] = [];
  
  try {
    if (!fs.existsSync(hooksDir)) {
      return hooks;
    }
    
    const files = fs.readdirSync(hooksDir);
    
    for (const file of files) {
      if (!file.endsWith('.ts') && !file.endsWith('.tsx')) {
        continue;
      }
      
      const filePath = path.join('src/hooks/auth', file);
      const fullPath = path.join(projectRoot, filePath);
      
      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const hook = scanForAuthStateHook(filePath, content);
        
        if (hook) {
          hooks.push(hook);
        }
      } catch (error) {
        console.error(`Error reading hook file ${filePath}:`, error);
      }
    }
    
    return hooks;
  } catch (error) {
    console.error('Error scanning hooks directory:', error);
    return hooks;
  }
}

// =============================================================================
// Fragmentation Detection
// =============================================================================

/**
 * Detects fragmentation issues in auth state management.
 * 
 * @param stores - Auth stores found
 * @param contexts - Auth contexts found
 * @param hooks - Auth state hooks found
 * @returns Array of fragmentation issues
 */
export function detectFragmentation(
  stores: AuthStateSource[],
  contexts: AuthStateSource[],
  hooks: AuthStateSource[]
): FragmentationIssue[] {
  const issues: FragmentationIssue[] = [];
  const allSources = [...stores, ...contexts, ...hooks];
  
  // Issue 1: Multiple sources managing the same state field
  const fieldSources: Map<string, AuthStateSource[]> = new Map();
  
  for (const source of allSources) {
    for (const field of source.stateFields) {
      const existing = fieldSources.get(field) || [];
      existing.push(source);
      fieldSources.set(field, existing);
    }
  }
  
  for (const [field, sources] of fieldSources) {
    if (sources.length > 1) {
      issues.push({
        description: `Auth state field '${field}' is managed by multiple sources`,
        sources: sources.map(s => `${s.type}:${s.name}`),
        severity: field === 'user' || field === 'auth' ? 'high' : 'medium',
        evidence: {
          filePath: sources[0].filePath,
          lineNumbers: sources.map(s => s.lineNumber),
          reason: `Field '${field}' found in: ${sources.map(s => s.name).join(', ')}`,
          confidence: 'certain',
        },
      });
    }
  }
  
  // Issue 2: Both store and context managing auth
  if (stores.length > 0 && contexts.length > 0) {
    issues.push({
      description: 'Auth state is split between Zustand store and React context',
      sources: [...stores.map(s => `store:${s.name}`), ...contexts.map(c => `context:${c.name}`)],
      severity: 'high',
      evidence: {
        filePath: stores[0].filePath,
        reason: 'Both Zustand store and React context are managing auth state, which can lead to synchronization issues',
        confidence: 'certain',
      },
    });
  }
  
  // Issue 3: Multiple hooks managing auth state independently
  if (hooks.length > 1) {
    const hookNames = hooks.map(h => h.name);
    issues.push({
      description: 'Multiple hooks independently manage auth state',
      sources: hookNames.map(n => `hook:${n}`),
      severity: 'medium',
      evidence: {
        filePath: hooks[0].filePath,
        reason: `Hooks ${hookNames.join(', ')} each manage auth state, which may cause inconsistencies`,
        confidence: 'likely',
      },
    });
  }
  
  // Issue 4: Persisted store alongside non-persisted context
  const persistedStores = stores.filter(s => s.isPersisted);
  if (persistedStores.length > 0 && contexts.length > 0) {
    issues.push({
      description: 'Persisted auth store may conflict with context state on page reload',
      sources: [...persistedStores.map(s => `store:${s.name}`), ...contexts.map(c => `context:${c.name}`)],
      severity: 'medium',
      evidence: {
        filePath: persistedStores[0].filePath,
        reason: 'Persisted store state may be stale compared to context state after page reload',
        confidence: 'likely',
      },
    });
  }
  
  return issues;
}

/**
 * Generates recommendations for unifying auth state.
 * 
 * @param stores - Auth stores found
 * @param contexts - Auth contexts found
 * @param hooks - Auth state hooks found
 * @param issues - Fragmentation issues found
 * @returns Array of recommendation strings
 */
export function generateRecommendations(
  stores: AuthStateSource[],
  contexts: AuthStateSource[],
  hooks: AuthStateSource[],
  issues: FragmentationIssue[]
): string[] {
  const recommendations: string[] = [];
  
  if (issues.length === 0) {
    recommendations.push('Auth state management appears to be well-organized with no fragmentation detected.');
    return recommendations;
  }
  
  // Recommendation based on current architecture
  if (stores.length > 0 && contexts.length > 0) {
    recommendations.push(
      'CRITICAL: Consolidate auth state into a single source of truth. ' +
      'Consider using either the Zustand store OR the React context, not both.'
    );
    
    // Recommend based on what each does
    const storeHasActions = stores.some(s => s.actions.length > 0);
    const contextHasActions = contexts.some(c => c.actions.length > 0);
    
    if (contextHasActions && !storeHasActions) {
      recommendations.push(
        'The AuthContext provides auth actions (signIn, signOut, etc.). ' +
        'Consider removing the authStore or using it only for UI state like loading indicators.'
      );
    } else if (storeHasActions && !contextHasActions) {
      recommendations.push(
        'The authStore provides auth actions. ' +
        'Consider removing the AuthContext or using it only as a provider wrapper.'
      );
    }
  }
  
  // Recommendation for multiple hooks
  if (hooks.length > 1) {
    recommendations.push(
      'Multiple auth hooks manage state independently. ' +
      'Consider creating a single useAuth hook that composes the others, ' +
      'or ensure hooks share state through a common store/context.'
    );
  }
  
  // Recommendation for persistence issues
  const hasPersistenceIssue = issues.some(i => i.description.includes('Persisted'));
  if (hasPersistenceIssue) {
    recommendations.push(
      'Persisted auth state may become stale. ' +
      'Ensure the persisted store is validated against the server session on app load.'
    );
  }
  
  // General recommendations
  recommendations.push(
    'Ensure all components consume auth state from the same source to prevent inconsistencies.'
  );
  
  return recommendations;
}

// =============================================================================
// Main Analysis Function
// =============================================================================

/**
 * Analyzes auth state management across the codebase.
 * 
 * @param projectRoot - Project root directory
 * @returns Complete auth state analysis result
 * 
 * @requirements 4.3 - Verify auth state propagates correctly
 * @requirements 4.10 - Detect fragmentation and recommend unification
 */
export function analyzeAuthState(projectRoot: string = process.cwd()): AuthStateAnalysisResult {
  // Scan for auth state sources
  const stores = scanAuthStores(projectRoot);
  const contexts = scanAuthContexts(projectRoot);
  const stateHooks = scanAuthStateHooks(projectRoot);
  
  // Detect fragmentation
  const fragmentationIssues = detectFragmentation(stores, contexts, stateHooks);
  
  // Determine if fragmented
  const isFragmented = fragmentationIssues.length > 0 || 
    (stores.length > 0 && contexts.length > 0) ||
    stores.length > 1 ||
    contexts.length > 1;
  
  // Generate recommendations
  const recommendations = generateRecommendations(stores, contexts, stateHooks, fragmentationIssues);
  
  return {
    stores,
    contexts,
    stateHooks,
    isFragmented,
    fragmentationIssues,
    recommendations,
  };
}

/**
 * Converts analysis result to the format expected by AuthAuditResult.
 * 
 * @param result - Auth state analysis result
 * @returns State management portion of AuthAuditResult
 */
export function toAuthAuditStateManagement(
  result: AuthStateAnalysisResult
): AuthAuditResult['stateManagement'] {
  return {
    stores: result.stores.map(s => s.name),
    contexts: result.contexts.map(c => c.name),
    isFragmented: result.isFragmented,
  };
}

// =============================================================================
// Report Generation
// =============================================================================

/**
 * Generates a human-readable report of the auth state analysis.
 * 
 * @param result - Auth state analysis result
 * @returns Formatted report string
 */
export function generateAuthStateReport(result: AuthStateAnalysisResult): string {
  const lines: string[] = [];
  
  lines.push('='.repeat(70));
  lines.push('MIHAS Auth State Analysis Report');
  lines.push('='.repeat(70));
  lines.push('');
  
  // Summary
  lines.push('Summary');
  lines.push('-'.repeat(70));
  lines.push(`Zustand Stores: ${result.stores.length}`);
  lines.push(`React Contexts: ${result.contexts.length}`);
  lines.push(`State Hooks: ${result.stateHooks.length}`);
  lines.push(`Fragmented: ${result.isFragmented ? 'YES ⚠️' : 'NO ✓'}`);
  lines.push(`Fragmentation Issues: ${result.fragmentationIssues.length}`);
  lines.push('');
  
  // Stores
  if (result.stores.length > 0) {
    lines.push('Zustand Stores');
    lines.push('-'.repeat(70));
    for (const store of result.stores) {
      lines.push(`\n  ${store.name}`);
      lines.push(`    File: ${store.filePath}:${store.lineNumber}`);
      lines.push(`    State Fields: ${store.stateFields.join(', ') || 'none'}`);
      lines.push(`    Actions: ${store.actions.join(', ') || 'none'}`);
      lines.push(`    Persisted: ${store.isPersisted ? 'Yes' : 'No'}`);
    }
    lines.push('');
  }
  
  // Contexts
  if (result.contexts.length > 0) {
    lines.push('React Contexts');
    lines.push('-'.repeat(70));
    for (const context of result.contexts) {
      lines.push(`\n  ${context.name}`);
      lines.push(`    File: ${context.filePath}:${context.lineNumber}`);
      lines.push(`    State Fields: ${context.stateFields.join(', ') || 'none'}`);
      lines.push(`    Actions: ${context.actions.join(', ') || 'none'}`);
    }
    lines.push('');
  }
  
  // State Hooks
  if (result.stateHooks.length > 0) {
    lines.push('State Management Hooks');
    lines.push('-'.repeat(70));
    for (const hook of result.stateHooks) {
      lines.push(`\n  ${hook.name}`);
      lines.push(`    File: ${hook.filePath}:${hook.lineNumber}`);
      lines.push(`    State Fields: ${hook.stateFields.join(', ') || 'none'}`);
      lines.push(`    Actions: ${hook.actions.join(', ') || 'none'}`);
    }
    lines.push('');
  }
  
  // Fragmentation Issues
  if (result.fragmentationIssues.length > 0) {
    lines.push('Fragmentation Issues');
    lines.push('-'.repeat(70));
    for (const issue of result.fragmentationIssues) {
      const severityIcon = issue.severity === 'high' ? '🔴' : issue.severity === 'medium' ? '🟡' : '🟢';
      lines.push(`\n  ${severityIcon} ${issue.description}`);
      lines.push(`    Sources: ${issue.sources.join(', ')}`);
      lines.push(`    Severity: ${issue.severity}`);
    }
    lines.push('');
  }
  
  // Recommendations
  if (result.recommendations.length > 0) {
    lines.push('Recommendations');
    lines.push('-'.repeat(70));
    for (const rec of result.recommendations) {
      lines.push(`\n  • ${rec}`);
    }
    lines.push('');
  }
  
  return lines.join('\n');
}

// =============================================================================
// CLI Execution
// =============================================================================

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('MIHAS Auth State Analyzer');
  console.log('=========================');
  console.log('');
  
  const result = analyzeAuthState();
  console.log(generateAuthStateReport(result));
}
