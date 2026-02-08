/**
 * Race Condition Detector for MIHAS Frontend-Backend Forensic Audit
 * 
 * Analyzes page files to detect potential race conditions in concurrent data fetches.
 * Identifies missing dependency arrays, stale closures, and improperly sequenced fetches.
 * 
 * @requirements 2.6 - WHEN the Audit_System examines a page THEN it SHALL identify
 *                     potential race conditions in concurrent data fetches
 * 
 * Property 8: Race Condition Detection
 * *For any* page with concurrent data fetches, the Page Auditor SHALL identify
 * potential race conditions by analyzing hook dependencies and state updates.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Evidence, RaceConditionRisk } from '../types';

// =============================================================================
// Types
// =============================================================================

/**
 * Types of race condition risks that can be detected.
 */
export type RaceConditionType =
  | 'missing-dependency-array'
  | 'empty-dependency-array'
  | 'stale-closure'
  | 'concurrent-state-update'
  | 'unsequenced-dependent-fetches'
  | 'async-state-update'
  | 'missing-cleanup';

/**
 * Information about a detected useEffect hook.
 */
export interface UseEffectInfo {
  /** Line number where the hook is defined */
  lineNumber: number;
  /** Code snippet of the hook */
  codeSnippet: string;
  /** Whether it has a dependency array */
  hasDependencyArray: boolean;
  /** Dependencies in the array (if present) */
  dependencies: string[];
  /** Whether it has async operations */
  hasAsyncOperation: boolean;
  /** Whether it has state updates */
  hasStateUpdate: boolean;
  /** Whether it has cleanup function */
  hasCleanup: boolean;
  /** Variables used inside the effect */
  usedVariables: string[];
}


/**
 * Information about a detected data fetching hook.
 */
export interface DataFetchHookInfo {
  /** Type of hook (useQuery, useMutation, etc.) */
  type: 'useQuery' | 'useMutation' | 'useInfiniteQuery' | 'customHook';
  /** Line number where the hook is defined */
  lineNumber: number;
  /** Code snippet */
  codeSnippet: string;
  /** Query key or identifier */
  queryKey: string;
  /** Dependencies (enabled condition, etc.) */
  dependencies: string[];
  /** Whether it depends on other queries */
  dependsOnOtherQueries: boolean;
}

/**
 * Information about a detected state update.
 */
export interface StateUpdateInfo {
  /** Line number of the state update */
  lineNumber: number;
  /** Code snippet */
  codeSnippet: string;
  /** State setter function name */
  setterName: string;
  /** Whether it's inside an async callback */
  isInAsyncCallback: boolean;
  /** Whether it's inside a useEffect */
  isInUseEffect: boolean;
  /** Whether it's inside a then/catch block */
  isInPromiseChain: boolean;
}

/**
 * Result of detecting race conditions in a page file.
 */
export interface RaceConditionResult {
  /** Detected race condition risks */
  raceConditions: RaceConditionRisk[];
  /** Total number of risks found */
  totalRisks: number;
  /** Whether the page has concurrent data fetches */
  hasConcurrentFetches: boolean;
}

/**
 * Extended result with detailed analysis information.
 */
export interface ExtendedRaceConditionResult extends RaceConditionResult {
  /** Detected useEffect hooks */
  useEffects: UseEffectInfo[];
  /** Detected data fetching hooks */
  dataFetchHooks: DataFetchHookInfo[];
  /** Detected state updates */
  stateUpdates: StateUpdateInfo[];
  /** Issues found during analysis */
  issues: string[];
}


// =============================================================================
// Detection Patterns
// =============================================================================

/**
 * Patterns for detecting useEffect hooks.
 */
const USE_EFFECT_PATTERNS = {
  /** useEffect with dependency array */
  withDeps: /useEffect\s*\(\s*(?:async\s*)?\(\s*\)\s*=>\s*\{([\s\S]*?)\}\s*,\s*\[([\s\S]*?)\]\s*\)/g,
  
  /** useEffect without dependency array (runs every render) */
  withoutDeps: /useEffect\s*\(\s*(?:async\s*)?\(\s*\)\s*=>\s*\{([\s\S]*?)\}\s*\)/g,
  
  /** useEffect with empty dependency array */
  emptyDeps: /useEffect\s*\(\s*(?:async\s*)?\(\s*\)\s*=>\s*\{[\s\S]*?\}\s*,\s*\[\s*\]\s*\)/g,
};

/**
 * Patterns for detecting data fetching hooks.
 */
const DATA_FETCH_PATTERNS = {
  /** React Query useQuery */
  useQuery: /(?:const|let)\s*\{([^}]*)\}\s*=\s*useQuery\s*\(\s*\{([^}]*queryKey[^}]*)\}/g,
  
  /** React Query useMutation */
  useMutation: /(?:const|let)\s*\{([^}]*)\}\s*=\s*useMutation\s*\(/g,
  
  /** React Query useInfiniteQuery */
  useInfiniteQuery: /(?:const|let)\s*\{([^}]*)\}\s*=\s*useInfiniteQuery\s*\(/g,
  
  /** Custom data hooks */
  customHook: /(?:const|let)\s*\{([^}]*)\}\s*=\s*use(?:Auth|Profile|Applications?|Users?|Dashboard|Notifications?|Sessions?|Documents?|Payments?)\w*\s*\(/g,
};

/**
 * Patterns for detecting state updates.
 */
const STATE_UPDATE_PATTERNS = {
  /** useState setter calls */
  setState: /\bset[A-Z]\w*\s*\(/g,
  
  /** Direct state setter in async callback */
  asyncSetState: /(?:async|await|\.then\s*\(|\.catch\s*\()[\s\S]*?set[A-Z]\w*\s*\(/g,
  
  /** State update in promise chain */
  promiseSetState: /\.then\s*\([^)]*set[A-Z]\w*\s*\(/g,
};

/**
 * Patterns for detecting async operations.
 */
const ASYNC_PATTERNS = {
  /** async keyword */
  asyncKeyword: /\basync\b/,
  
  /** await keyword */
  awaitKeyword: /\bawait\b/,
  
  /** fetch call */
  fetch: /\bfetch\s*\(/,
  
  /** Promise chain */
  promiseChain: /\.then\s*\(|\.catch\s*\(/,
  
  /** axios call */
  axios: /\baxios\s*\./,
};

/**
 * Patterns for detecting cleanup functions.
 */
const CLEANUP_PATTERNS = {
  /** Return statement with function */
  returnCleanup: /return\s*(?:\(\s*\)\s*=>|\(\s*\)\s*=>\s*\{|function\s*\()/,
  
  /** AbortController usage */
  abortController: /AbortController|\.abort\s*\(/,
  
  /** Cleanup variable */
  cleanupVar: /(?:let|const)\s+(?:cleanup|cancelled|isMounted|isSubscribed)\s*=/,
};


// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Gets line number from character index in content.
 */
function getLineNumber(content: string, index: number): number {
  const beforeMatch = content.substring(0, index);
  return (beforeMatch.match(/\n/g) || []).length + 1;
}

/**
 * Extracts a code snippet around a given index.
 */
function extractCodeSnippet(content: string, index: number, contextLines: number = 2): string {
  const lines = content.split('\n');
  const lineNumber = getLineNumber(content, index);
  const startLine = Math.max(0, lineNumber - contextLines - 1);
  const endLine = Math.min(lines.length, lineNumber + contextLines);
  
  return lines.slice(startLine, endLine).join('\n').trim();
}

/**
 * Extracts variables from a dependency array string.
 */
function extractDependencies(depsString: string): string[] {
  if (!depsString || depsString.trim() === '') {
    return [];
  }
  
  // Split by comma and clean up
  return depsString
    .split(',')
    .map(dep => dep.trim())
    .filter(dep => dep.length > 0 && dep !== '');
}

/**
 * Extracts variables used inside a code block.
 */
function extractUsedVariables(codeBlock: string): string[] {
  const variables = new Set<string>();
  
  // Match variable references (identifiers)
  const identifierPattern = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\b/g;
  let match: RegExpExecArray | null;
  
  while ((match = identifierPattern.exec(codeBlock)) !== null) {
    const identifier = match[1];
    // Filter out keywords and common globals
    const keywords = new Set([
      'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while',
      'async', 'await', 'try', 'catch', 'finally', 'throw', 'new', 'this',
      'true', 'false', 'null', 'undefined', 'console', 'window', 'document',
      'Promise', 'Error', 'Array', 'Object', 'String', 'Number', 'Boolean',
      'JSON', 'Math', 'Date', 'RegExp', 'Map', 'Set', 'fetch', 'setTimeout',
      'setInterval', 'clearTimeout', 'clearInterval', 'useEffect', 'useState',
      'useCallback', 'useMemo', 'useRef', 'useContext', 'useReducer',
    ]);
    
    if (!keywords.has(identifier)) {
      variables.add(identifier);
    }
  }
  
  return Array.from(variables);
}

/**
 * Checks if a code block contains async operations.
 */
function hasAsyncOperations(codeBlock: string): boolean {
  return (
    ASYNC_PATTERNS.asyncKeyword.test(codeBlock) ||
    ASYNC_PATTERNS.awaitKeyword.test(codeBlock) ||
    ASYNC_PATTERNS.fetch.test(codeBlock) ||
    ASYNC_PATTERNS.promiseChain.test(codeBlock) ||
    ASYNC_PATTERNS.axios.test(codeBlock)
  );
}

/**
 * Checks if a code block contains state updates.
 */
function hasStateUpdates(codeBlock: string): boolean {
  return STATE_UPDATE_PATTERNS.setState.test(codeBlock);
}

/**
 * Checks if a code block has cleanup function.
 */
function hasCleanupFunction(codeBlock: string): boolean {
  return (
    CLEANUP_PATTERNS.returnCleanup.test(codeBlock) ||
    CLEANUP_PATTERNS.abortController.test(codeBlock) ||
    CLEANUP_PATTERNS.cleanupVar.test(codeBlock)
  );
}


// =============================================================================
// Detection Functions
// =============================================================================

/**
 * Detects useEffect hooks in the content.
 */
function detectUseEffects(content: string): UseEffectInfo[] {
  const effects: UseEffectInfo[] = [];
  const seenLines = new Set<number>();
  
  // Find all useEffect calls with a more flexible pattern
  const useEffectPattern = /useEffect\s*\(\s*(async\s*)?\(\s*\)\s*=>\s*\{/g;
  let match: RegExpExecArray | null;
  
  while ((match = useEffectPattern.exec(content)) !== null) {
    const lineNumber = getLineNumber(content, match.index);
    if (seenLines.has(lineNumber)) continue;
    seenLines.add(lineNumber);
    
    // Extract the full useEffect call by finding matching braces
    const startIndex = match.index;
    let braceDepth = 0;
    let effectEnd = startIndex;
    let foundFirstBrace = false;
    
    for (let i = startIndex; i < content.length; i++) {
      if (content[i] === '{') {
        braceDepth++;
        foundFirstBrace = true;
      } else if (content[i] === '}') {
        braceDepth--;
        if (foundFirstBrace && braceDepth === 0) {
          effectEnd = i + 1;
          break;
        }
      }
    }
    
    // Look for dependency array after the effect body
    const afterEffect = content.substring(effectEnd, effectEnd + 100);
    const depsMatch = afterEffect.match(/^\s*,\s*\[([\s\S]*?)\]/);
    
    const hasDependencyArray = depsMatch !== null;
    const dependencies = hasDependencyArray ? extractDependencies(depsMatch![1]) : [];
    
    // Extract the effect body
    const effectBody = content.substring(startIndex, effectEnd);
    
    effects.push({
      lineNumber,
      codeSnippet: extractCodeSnippet(content, match.index, 3),
      hasDependencyArray,
      dependencies,
      hasAsyncOperation: hasAsyncOperations(effectBody),
      hasStateUpdate: hasStateUpdates(effectBody),
      hasCleanup: hasCleanupFunction(effectBody),
      usedVariables: extractUsedVariables(effectBody),
    });
  }
  
  return effects;
}

/**
 * Detects data fetching hooks in the content.
 */
function detectDataFetchHooks(content: string): DataFetchHookInfo[] {
  const hooks: DataFetchHookInfo[] = [];
  const seenLines = new Set<number>();
  
  // Detect useQuery hooks
  const useQueryPattern = /(?:const|let)\s*\{([^}]*)\}\s*=\s*useQuery\s*\(\s*\{([^}]*)\}/g;
  let match: RegExpExecArray | null;
  
  while ((match = useQueryPattern.exec(content)) !== null) {
    const lineNumber = getLineNumber(content, match.index);
    if (seenLines.has(lineNumber)) continue;
    seenLines.add(lineNumber);
    
    const configBlock = match[2];
    
    // Extract query key
    const queryKeyMatch = configBlock.match(/queryKey\s*:\s*\[([^\]]*)\]/);
    const queryKey = queryKeyMatch ? queryKeyMatch[1].trim() : 'unknown';
    
    // Check for enabled condition (dependency on other data)
    const enabledMatch = configBlock.match(/enabled\s*:\s*([^,}]+)/);
    const dependencies: string[] = [];
    let dependsOnOtherQueries = false;
    
    if (enabledMatch) {
      const enabledCondition = enabledMatch[1].trim();
      dependencies.push(enabledCondition);
      // Check if it depends on other query data
      dependsOnOtherQueries = /\bdata\b|\.data\b/.test(enabledCondition);
    }
    
    hooks.push({
      type: 'useQuery',
      lineNumber,
      codeSnippet: extractCodeSnippet(content, match.index, 2),
      queryKey,
      dependencies,
      dependsOnOtherQueries,
    });
  }
  
  // Detect useMutation hooks
  const useMutationPattern = /(?:const|let)\s*\{([^}]*)\}\s*=\s*useMutation\s*\(/g;
  while ((match = useMutationPattern.exec(content)) !== null) {
    const lineNumber = getLineNumber(content, match.index);
    if (seenLines.has(lineNumber)) continue;
    seenLines.add(lineNumber);
    
    hooks.push({
      type: 'useMutation',
      lineNumber,
      codeSnippet: extractCodeSnippet(content, match.index, 2),
      queryKey: 'mutation',
      dependencies: [],
      dependsOnOtherQueries: false,
    });
  }
  
  // Detect useInfiniteQuery hooks
  const useInfiniteQueryPattern = /(?:const|let)\s*\{([^}]*)\}\s*=\s*useInfiniteQuery\s*\(/g;
  while ((match = useInfiniteQueryPattern.exec(content)) !== null) {
    const lineNumber = getLineNumber(content, match.index);
    if (seenLines.has(lineNumber)) continue;
    seenLines.add(lineNumber);
    
    hooks.push({
      type: 'useInfiniteQuery',
      lineNumber,
      codeSnippet: extractCodeSnippet(content, match.index, 2),
      queryKey: 'infinite',
      dependencies: [],
      dependsOnOtherQueries: false,
    });
  }
  
  // Detect custom data hooks
  const customHookPattern = /(?:const|let)\s*\{([^}]*)\}\s*=\s*use(Auth|Profile|Applications?|Users?|Dashboard|Notifications?|Sessions?|Documents?|Payments?)\w*\s*\(/g;
  while ((match = customHookPattern.exec(content)) !== null) {
    const lineNumber = getLineNumber(content, match.index);
    if (seenLines.has(lineNumber)) continue;
    seenLines.add(lineNumber);
    
    hooks.push({
      type: 'customHook',
      lineNumber,
      codeSnippet: extractCodeSnippet(content, match.index, 2),
      queryKey: match[2].toLowerCase(),
      dependencies: [],
      dependsOnOtherQueries: false,
    });
  }
  
  return hooks;
}


/**
 * Detects state updates in the content.
 */
function detectStateUpdates(content: string): StateUpdateInfo[] {
  const updates: StateUpdateInfo[] = [];
  const seenLines = new Set<number>();
  
  // Find all setState calls
  const setStatePattern = /\b(set[A-Z][a-zA-Z0-9]*)\s*\(/g;
  let match: RegExpExecArray | null;
  
  while ((match = setStatePattern.exec(content)) !== null) {
    const lineNumber = getLineNumber(content, match.index);
    if (seenLines.has(lineNumber)) continue;
    seenLines.add(lineNumber);
    
    const setterName = match[1];
    
    // Check context around the state update
    const contextStart = Math.max(0, match.index - 500);
    const contextBefore = content.substring(contextStart, match.index);
    
    // Check if inside async callback
    const isInAsyncCallback = 
      /async\s*\([^)]*\)\s*=>\s*\{[^}]*$/.test(contextBefore) ||
      /async\s+function[^{]*\{[^}]*$/.test(contextBefore);
    
    // Check if inside useEffect
    const isInUseEffect = /useEffect\s*\([^)]*\{[^}]*$/.test(contextBefore);
    
    // Check if inside promise chain
    const isInPromiseChain = 
      /\.then\s*\([^)]*$/.test(contextBefore) ||
      /\.catch\s*\([^)]*$/.test(contextBefore);
    
    updates.push({
      lineNumber,
      codeSnippet: extractCodeSnippet(content, match.index, 1),
      setterName,
      isInAsyncCallback,
      isInUseEffect,
      isInPromiseChain,
    });
  }
  
  return updates;
}

/**
 * Creates evidence for a race condition risk.
 */
function createEvidence(
  filePath: string,
  lineNumbers: number[],
  codeSnippet: string,
  reason: string,
  confidence: 'certain' | 'likely' | 'possible'
): Evidence {
  return {
    filePath,
    lineNumbers,
    codeSnippet: codeSnippet.substring(0, 500), // Limit snippet length
    reason,
    confidence,
  };
}


// =============================================================================
// Race Condition Analysis
// =============================================================================

/**
 * Analyzes useEffect hooks for race condition risks.
 */
function analyzeUseEffectRisks(
  effects: UseEffectInfo[],
  filePath: string
): RaceConditionRisk[] {
  const risks: RaceConditionRisk[] = [];
  
  for (const effect of effects) {
    // Risk 1: Missing dependency array
    if (!effect.hasDependencyArray) {
      risks.push({
        description: 'useEffect without dependency array runs on every render, potentially causing race conditions',
        hooks: ['useEffect'],
        severity: 'high',
        evidence: createEvidence(
          filePath,
          [effect.lineNumber],
          effect.codeSnippet,
          'useEffect missing dependency array - will run on every render',
          'certain'
        ),
      });
    }
    
    // Risk 2: Empty dependency array with state/prop references
    if (effect.hasDependencyArray && effect.dependencies.length === 0) {
      // Check if the effect uses variables that should be dependencies
      const potentialMissingDeps = effect.usedVariables.filter(v => 
        !v.startsWith('set') && // Not a setter
        !['console', 'window', 'document', 'fetch'].includes(v)
      );
      
      if (potentialMissingDeps.length > 0 && effect.hasAsyncOperation) {
        risks.push({
          description: `useEffect with empty dependency array uses variables that may become stale: ${potentialMissingDeps.slice(0, 3).join(', ')}`,
          hooks: ['useEffect'],
          severity: 'medium',
          evidence: createEvidence(
            filePath,
            [effect.lineNumber],
            effect.codeSnippet,
            'Empty dependency array with external variable references - potential stale closure',
            'likely'
          ),
        });
      }
    }
    
    // Risk 3: Async effect without cleanup
    if (effect.hasAsyncOperation && effect.hasStateUpdate && !effect.hasCleanup) {
      risks.push({
        description: 'Async useEffect with state updates but no cleanup - may update unmounted component',
        hooks: ['useEffect'],
        severity: 'high',
        evidence: createEvidence(
          filePath,
          [effect.lineNumber],
          effect.codeSnippet,
          'Async operation with state update but no cleanup/cancellation mechanism',
          'likely'
        ),
      });
    }
  }
  
  return risks;
}

/**
 * Analyzes data fetch hooks for race condition risks.
 */
function analyzeDataFetchRisks(
  hooks: DataFetchHookInfo[],
  filePath: string
): RaceConditionRisk[] {
  const risks: RaceConditionRisk[] = [];
  
  // Check for multiple concurrent queries that might depend on each other
  if (hooks.length >= 2) {
    const dependentHooks = hooks.filter(h => h.dependsOnOtherQueries);
    const independentHooks = hooks.filter(h => !h.dependsOnOtherQueries);
    
    // Risk: Multiple independent queries that might need sequencing
    if (independentHooks.length >= 2) {
      // Check if any hook's query key references another hook's data
      for (const hook of independentHooks) {
        for (const otherHook of independentHooks) {
          if (hook === otherHook) continue;
          
          // Check if query key contains reference to other data
          if (hook.queryKey.includes(otherHook.queryKey)) {
            risks.push({
              description: `Query '${hook.queryKey}' may depend on '${otherHook.queryKey}' but lacks explicit dependency`,
              hooks: [hook.type, otherHook.type],
              severity: 'medium',
              evidence: createEvidence(
                filePath,
                [hook.lineNumber, otherHook.lineNumber],
                hook.codeSnippet,
                'Potential unsequenced dependent fetches',
                'possible'
              ),
            });
          }
        }
      }
    }
    
    // Risk: Dependent hooks without proper enabled condition
    if (dependentHooks.length > 0) {
      for (const hook of dependentHooks) {
        if (hook.dependencies.length === 0) {
          risks.push({
            description: `Query depends on other data but has no enabled condition`,
            hooks: [hook.type],
            severity: 'medium',
            evidence: createEvidence(
              filePath,
              [hook.lineNumber],
              hook.codeSnippet,
              'Dependent query without enabled condition may cause race condition',
              'possible'
            ),
          });
        }
      }
    }
  }
  
  return risks;
}


/**
 * Analyzes state updates for race condition risks.
 */
function analyzeStateUpdateRisks(
  updates: StateUpdateInfo[],
  effects: UseEffectInfo[],
  filePath: string
): RaceConditionRisk[] {
  const risks: RaceConditionRisk[] = [];
  
  for (const update of updates) {
    // Risk: State update in async callback without proper handling
    if (update.isInAsyncCallback || update.isInPromiseChain) {
      // Check if there's a corresponding cleanup in the effect
      const relatedEffect = effects.find(e => 
        Math.abs(e.lineNumber - update.lineNumber) < 20 // Within 20 lines
      );
      
      if (relatedEffect && !relatedEffect.hasCleanup) {
        risks.push({
          description: `State update '${update.setterName}' in async callback without cleanup mechanism`,
          hooks: ['useState', 'useEffect'],
          severity: 'high',
          evidence: createEvidence(
            filePath,
            [update.lineNumber],
            update.codeSnippet,
            'Async state update may execute after component unmount',
            'likely'
          ),
        });
      }
    }
    
    // Risk: Multiple state updates in same async flow
    const nearbyUpdates = updates.filter(u => 
      u !== update && 
      Math.abs(u.lineNumber - update.lineNumber) < 5 &&
      (u.isInAsyncCallback || u.isInPromiseChain)
    );
    
    if (nearbyUpdates.length > 0 && (update.isInAsyncCallback || update.isInPromiseChain)) {
      // Only flag once per group
      if (update.lineNumber < nearbyUpdates[0].lineNumber) {
        risks.push({
          description: 'Multiple state updates in async flow may cause batching issues',
          hooks: ['useState'],
          severity: 'low',
          evidence: createEvidence(
            filePath,
            [update.lineNumber, ...nearbyUpdates.map(u => u.lineNumber)],
            update.codeSnippet,
            'Multiple async state updates - consider using reducer or batching',
            'possible'
          ),
        });
      }
    }
  }
  
  return risks;
}

/**
 * Checks for stale closure risks.
 */
function analyzeStaleClosureRisks(
  effects: UseEffectInfo[],
  filePath: string
): RaceConditionRisk[] {
  const risks: RaceConditionRisk[] = [];
  
  for (const effect of effects) {
    if (!effect.hasDependencyArray) continue;
    
    // Find variables used in effect but not in dependency array
    const missingDeps = effect.usedVariables.filter(v => {
      // Skip setters, they're stable
      if (v.startsWith('set')) return false;
      // Skip common stable references
      if (['ref', 'current', 'navigate', 'location', 'history'].some(s => v.includes(s))) return false;
      // Check if in dependencies
      return !effect.dependencies.some(d => d.includes(v));
    });
    
    // Only flag if there are async operations (where stale closures matter most)
    if (missingDeps.length > 0 && effect.hasAsyncOperation) {
      risks.push({
        description: `Potential stale closure: variables [${missingDeps.slice(0, 3).join(', ')}] used but not in dependency array`,
        hooks: ['useEffect'],
        severity: 'medium',
        evidence: createEvidence(
          filePath,
          [effect.lineNumber],
          effect.codeSnippet,
          `Variables may be stale in async callback: ${missingDeps.slice(0, 3).join(', ')}`,
          'possible'
        ),
      });
    }
  }
  
  return risks;
}


// =============================================================================
// Main Detection Functions
// =============================================================================

/**
 * Detects race conditions in a single page file.
 * 
 * @param filePath - Path to the page file (relative to project root)
 * @param baseDir - Base directory (defaults to process.cwd())
 * @returns RaceConditionResult with detected risks
 */
export function detectRaceConditions(
  filePath: string,
  baseDir: string = process.cwd()
): RaceConditionResult {
  const fullPath = path.join(baseDir, filePath);
  
  // Default result for files that can't be read
  const defaultResult: RaceConditionResult = {
    raceConditions: [],
    totalRisks: 0,
    hasConcurrentFetches: false,
  };
  
  try {
    if (!fs.existsSync(fullPath)) {
      return defaultResult;
    }
    
    const content = fs.readFileSync(fullPath, 'utf-8');
    
    // Detect patterns
    const effects = detectUseEffects(content);
    const dataFetchHooks = detectDataFetchHooks(content);
    const stateUpdates = detectStateUpdates(content);
    
    // Analyze for race conditions
    const allRisks: RaceConditionRisk[] = [
      ...analyzeUseEffectRisks(effects, filePath),
      ...analyzeDataFetchRisks(dataFetchHooks, filePath),
      ...analyzeStateUpdateRisks(stateUpdates, effects, filePath),
      ...analyzeStaleClosureRisks(effects, filePath),
    ];
    
    // Determine if there are concurrent fetches
    const hasConcurrentFetches = dataFetchHooks.length >= 2 || 
      effects.filter(e => e.hasAsyncOperation).length >= 2;
    
    return {
      raceConditions: allRisks,
      totalRisks: allRisks.length,
      hasConcurrentFetches,
    };
  } catch (error) {
    return defaultResult;
  }
}

/**
 * Detects race conditions with extended details for analysis.
 * 
 * @param filePath - Path to the page file (relative to project root)
 * @param baseDir - Base directory (defaults to process.cwd())
 * @returns ExtendedRaceConditionResult with detailed analysis
 */
export function detectRaceConditionsExtended(
  filePath: string,
  baseDir: string = process.cwd()
): ExtendedRaceConditionResult {
  const fullPath = path.join(baseDir, filePath);
  
  // Default result for files that can't be read
  const defaultResult: ExtendedRaceConditionResult = {
    raceConditions: [],
    totalRisks: 0,
    hasConcurrentFetches: false,
    useEffects: [],
    dataFetchHooks: [],
    stateUpdates: [],
    issues: [],
  };
  
  try {
    if (!fs.existsSync(fullPath)) {
      return {
        ...defaultResult,
        issues: [`File not found: ${filePath}`],
      };
    }
    
    const content = fs.readFileSync(fullPath, 'utf-8');
    
    // Detect patterns
    const effects = detectUseEffects(content);
    const dataFetchHooks = detectDataFetchHooks(content);
    const stateUpdates = detectStateUpdates(content);
    
    // Analyze for race conditions
    const allRisks: RaceConditionRisk[] = [
      ...analyzeUseEffectRisks(effects, filePath),
      ...analyzeDataFetchRisks(dataFetchHooks, filePath),
      ...analyzeStateUpdateRisks(stateUpdates, effects, filePath),
      ...analyzeStaleClosureRisks(effects, filePath),
    ];
    
    // Generate issues list
    const issues: string[] = [];
    for (const risk of allRisks) {
      issues.push(`[${risk.severity.toUpperCase()}] ${risk.description}`);
    }
    
    // Determine if there are concurrent fetches
    const hasConcurrentFetches = dataFetchHooks.length >= 2 || 
      effects.filter(e => e.hasAsyncOperation).length >= 2;
    
    return {
      raceConditions: allRisks,
      totalRisks: allRisks.length,
      hasConcurrentFetches,
      useEffects: effects,
      dataFetchHooks,
      stateUpdates,
      issues,
    };
  } catch (error) {
    return {
      ...defaultResult,
      issues: [error instanceof Error ? error.message : 'Unknown error reading file'],
    };
  }
}


/**
 * Detects race conditions for multiple page files.
 * 
 * @param filePaths - Array of file paths to analyze
 * @param baseDir - Base directory (defaults to process.cwd())
 * @returns Map of file paths to RaceConditionResult
 */
export function detectRaceConditionsMultiple(
  filePaths: string[],
  baseDir: string = process.cwd()
): Map<string, RaceConditionResult> {
  const results = new Map<string, RaceConditionResult>();
  
  for (const filePath of filePaths) {
    results.set(filePath, detectRaceConditions(filePath, baseDir));
  }
  
  return results;
}

/**
 * Gets a summary of race condition detection for a file.
 * 
 * @param filePath - Path to the file
 * @param result - RaceConditionResult or ExtendedRaceConditionResult to summarize
 * @returns Human-readable summary string
 */
export function getRaceConditionSummary(
  filePath: string,
  result: RaceConditionResult | ExtendedRaceConditionResult
): string {
  const lines: string[] = [];
  
  lines.push(`File: ${filePath}`);
  lines.push(`  Total Risks: ${result.totalRisks}`);
  lines.push(`  Concurrent Fetches: ${result.hasConcurrentFetches ? 'Yes' : 'No'}`);
  
  if (result.raceConditions.length > 0) {
    lines.push(`  Race Condition Risks:`);
    
    // Group by severity
    const highRisks = result.raceConditions.filter(r => r.severity === 'high');
    const mediumRisks = result.raceConditions.filter(r => r.severity === 'medium');
    const lowRisks = result.raceConditions.filter(r => r.severity === 'low');
    
    if (highRisks.length > 0) {
      lines.push(`    HIGH (${highRisks.length}):`);
      for (const risk of highRisks) {
        lines.push(`      - ${risk.description}`);
      }
    }
    
    if (mediumRisks.length > 0) {
      lines.push(`    MEDIUM (${mediumRisks.length}):`);
      for (const risk of mediumRisks) {
        lines.push(`      - ${risk.description}`);
      }
    }
    
    if (lowRisks.length > 0) {
      lines.push(`    LOW (${lowRisks.length}):`);
      for (const risk of lowRisks) {
        lines.push(`      - ${risk.description}`);
      }
    }
  }
  
  // Extended result details
  if ('useEffects' in result) {
    lines.push(`  useEffect Hooks: ${result.useEffects.length}`);
    lines.push(`  Data Fetch Hooks: ${result.dataFetchHooks.length}`);
    lines.push(`  State Updates: ${result.stateUpdates.length}`);
  }
  
  return lines.join('\n');
}


/**
 * Generates a report of race condition detection for all pages.
 * 
 * @param results - Map of file paths to RaceConditionResult
 * @returns Formatted report string
 */
export function generateRaceConditionReport(
  results: Map<string, RaceConditionResult | ExtendedRaceConditionResult>
): string {
  const lines: string[] = [];
  const pagesWithRisks: [string, RaceConditionResult | ExtendedRaceConditionResult][] = [];
  const pagesWithConcurrentFetches: [string, RaceConditionResult | ExtendedRaceConditionResult][] = [];
  
  let totalHighRisks = 0;
  let totalMediumRisks = 0;
  let totalLowRisks = 0;
  
  // Categorize pages and count risks
  for (const [filePath, result] of results) {
    if (result.totalRisks > 0) {
      pagesWithRisks.push([filePath, result]);
    }
    if (result.hasConcurrentFetches) {
      pagesWithConcurrentFetches.push([filePath, result]);
    }
    
    for (const risk of result.raceConditions) {
      if (risk.severity === 'high') totalHighRisks++;
      else if (risk.severity === 'medium') totalMediumRisks++;
      else totalLowRisks++;
    }
  }
  
  lines.push('='.repeat(60));
  lines.push('Race Condition Detection Report');
  lines.push('='.repeat(60));
  lines.push('');
  
  lines.push(`Total Pages Analyzed: ${results.size}`);
  lines.push(`Pages with Concurrent Fetches: ${pagesWithConcurrentFetches.length}`);
  lines.push(`Pages with Race Condition Risks: ${pagesWithRisks.length}`);
  lines.push('');
  
  lines.push('Risk Summary:');
  lines.push(`  HIGH: ${totalHighRisks}`);
  lines.push(`  MEDIUM: ${totalMediumRisks}`);
  lines.push(`  LOW: ${totalLowRisks}`);
  lines.push('');
  
  if (pagesWithRisks.length > 0) {
    // Sort by risk count (highest first)
    pagesWithRisks.sort((a, b) => b[1].totalRisks - a[1].totalRisks);
    
    lines.push('-'.repeat(60));
    lines.push('Pages with Race Condition Risks:');
    lines.push('-'.repeat(60));
    
    for (const [filePath, result] of pagesWithRisks) {
      lines.push('');
      lines.push(getRaceConditionSummary(filePath, result));
    }
  }
  
  if (pagesWithConcurrentFetches.length > 0) {
    lines.push('');
    lines.push('-'.repeat(60));
    lines.push('Pages with Concurrent Fetches (Review Recommended):');
    lines.push('-'.repeat(60));
    
    for (const [filePath, result] of pagesWithConcurrentFetches) {
      // Skip if already shown in risks section
      if (!pagesWithRisks.some(([p]) => p === filePath)) {
        lines.push(`  - ${filePath}`);
      }
    }
  }
  
  return lines.join('\n');
}

// =============================================================================
// CLI Execution Support
// =============================================================================

if (import.meta.url === `file://${process.argv[1]}`) {
  const testFile = process.argv[2] || 'src/pages/student/Dashboard.tsx';
  
  console.log('Race Condition Detector');
  console.log('=======================');
  console.log(`Analyzing: ${testFile}`);
  console.log('');
  
  const result = detectRaceConditionsExtended(testFile);
  console.log(getRaceConditionSummary(testFile, result));
  
  if (result.useEffects.length > 0) {
    console.log('\n\nuseEffect Hooks Detected:');
    console.log('-------------------------');
    for (const effect of result.useEffects) {
      const depsStatus = effect.hasDependencyArray 
        ? `deps: [${effect.dependencies.join(', ')}]` 
        : 'NO DEPS ARRAY';
      const asyncStatus = effect.hasAsyncOperation ? 'async' : 'sync';
      const cleanupStatus = effect.hasCleanup ? 'has cleanup' : 'no cleanup';
      console.log(`  Line ${effect.lineNumber}: ${depsStatus}, ${asyncStatus}, ${cleanupStatus}`);
    }
  }
  
  if (result.dataFetchHooks.length > 0) {
    console.log('\n\nData Fetch Hooks Detected:');
    console.log('--------------------------');
    for (const hook of result.dataFetchHooks) {
      const depStatus = hook.dependsOnOtherQueries ? 'depends on other queries' : 'independent';
      console.log(`  Line ${hook.lineNumber}: ${hook.type} (${hook.queryKey}) - ${depStatus}`);
    }
  }
  
  if (result.stateUpdates.length > 0) {
    console.log('\n\nState Updates Detected:');
    console.log('-----------------------');
    for (const update of result.stateUpdates) {
      const context: string[] = [];
      if (update.isInAsyncCallback) context.push('async callback');
      if (update.isInUseEffect) context.push('useEffect');
      if (update.isInPromiseChain) context.push('promise chain');
      const contextStr = context.length > 0 ? `in ${context.join(', ')}` : 'direct';
      console.log(`  Line ${update.lineNumber}: ${update.setterName} - ${contextStr}`);
    }
  }
}
