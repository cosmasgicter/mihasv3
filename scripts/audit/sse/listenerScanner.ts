/**
 * SSE Listener Scanner
 * Scans src/ directory for EventSource usage and SSE listeners.
 * Validates: Requirements 5.2
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, extname } from 'node:path';
import type { SSEListener } from '../types';

const SCAN_DIRECTORIES = ['src'];
const SCAN_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];
const SKIP_DIRECTORIES = ['node_modules', '.git', 'dist', 'build', '.test-fixtures'];

const PATTERNS = {
  eventSourceConstructor: /new\s+EventSource\s*\(\s*['"]([^'"]+)['"]/g,
  eventSourceVariable: /new\s+EventSource\s*\(\s*(\w+)\s*\)/g,
  addEventListener: /\.addEventListener\s*\(\s*['"](\w+)['"]/g,
  onMessageHandler: /\.onmessage\s*=/,
  onErrorHandler: /\.onerror\s*=/,
  onOpenHandler: /\.onopen\s*=/,
  reconnectPatterns: [/reconnect/i, /retry/i, /setTimeout[\s\S]*?EventSource/],
  backoffPatterns: [/backoff/i, /exponential/i, /retryDelay\s*\*\s*\d/, /\*\s*2\s*[,)]/],
  customSSEHook: /use(?:SSE|EventSource|Realtime)\s*\(/,
  endpointVariable: /(?:const|let|var)\s+(?:url|endpoint|sseUrl)\s*=\s*['"]([^'"]+)['"]/g,
};

export interface SSEListenerScanResult {
  listeners: SSEListener[];
  totalListeners: number;
  withReconnect: number;
  withBackoff: number;
  errors: { filePath: string; error: string }[];
}

function hasReconnectLogic(content: string): boolean {
  return PATTERNS.reconnectPatterns.some(pattern => pattern.test(content));
}

function hasBackoffLogic(content: string): boolean {
  return PATTERNS.backoffPatterns.some(pattern => pattern.test(content));
}

function extractEventTypes(content: string): string[] {
  const events: string[] = [];
  const seen = new Set<string>();
  PATTERNS.addEventListener.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = PATTERNS.addEventListener.exec(content)) !== null) {
    if (!seen.has(match[1])) { seen.add(match[1]); events.push(match[1]); }
  }
  if (PATTERNS.onMessageHandler.test(content) && !seen.has('message')) events.push('message');
  if (PATTERNS.onErrorHandler.test(content) && !seen.has('error')) events.push('error');
  if (PATTERNS.onOpenHandler.test(content) && !seen.has('open')) events.push('open');
  return events;
}

function extractEndpoint(content: string, lineContent: string): string {
  PATTERNS.eventSourceConstructor.lastIndex = 0;
  const lineMatch = PATTERNS.eventSourceConstructor.exec(lineContent);
  if (lineMatch) return lineMatch[1];
  PATTERNS.endpointVariable.lastIndex = 0;
  const varMatch = PATTERNS.endpointVariable.exec(content);
  if (varMatch) return varMatch[1];
  PATTERNS.eventSourceVariable.lastIndex = 0;
  const refMatch = PATTERNS.eventSourceVariable.exec(lineContent);
  if (refMatch) return `[dynamic: ${refMatch[1]}]`;
  return '[unknown]';
}

function findLineNumber(content: string, pattern: RegExp): number {
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (pattern.test(lines[i])) return i + 1;
  }
  return 1;
}

async function parseFile(filePath: string, projectRoot: string): Promise<SSEListener | null> {
  const content = await readFile(filePath, 'utf-8');
  const relativePath = relative(projectRoot, filePath);
  const hasEventSource = 
    PATTERNS.eventSourceConstructor.test(content) ||
    PATTERNS.eventSourceVariable.test(content) ||
    PATTERNS.customSSEHook.test(content);
  if (!hasEventSource) return null;
  PATTERNS.eventSourceConstructor.lastIndex = 0;
  PATTERNS.eventSourceVariable.lastIndex = 0;
  const lineNumber = findLineNumber(content, /new\s+EventSource|use(?:SSE|EventSource|Realtime)/);
  const lines = content.split('\n');
  const lineContent = lines[lineNumber - 1] || '';
  return {
    filePath: relativePath,
    lineNumber,
    endpoint: extractEndpoint(content, lineContent),
    events: extractEventTypes(content),
    hasReconnect: hasReconnectLogic(content),
    hasBackoff: hasBackoffLogic(content),
  };
}

async function scanDirectory(
  dirPath: string,
  projectRoot: string
): Promise<{ listeners: SSEListener[]; errors: { filePath: string; error: string }[] }> {
  const listeners: SSEListener[] = [];
  const errors: { filePath: string; error: string }[] = [];
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRECTORIES.includes(entry.name)) continue;
        const subResult = await scanDirectory(fullPath, projectRoot);
        listeners.push(...subResult.listeners);
        errors.push(...subResult.errors);
      } else if (entry.isFile() && SCAN_EXTENSIONS.includes(extname(entry.name))) {
        try {
          const listener = await parseFile(fullPath, projectRoot);
          if (listener) listeners.push(listener);
        } catch (error) {
          errors.push({ filePath: relative(projectRoot, fullPath), error: String(error) });
        }
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      errors.push({ filePath: relative(projectRoot, dirPath), error: String(error) });
    }
  }
  return { listeners, errors };
}

export async function scanSSEListeners(projectRoot: string = process.cwd()): Promise<SSEListenerScanResult> {
  const allListeners: SSEListener[] = [];
  const allErrors: { filePath: string; error: string }[] = [];
  for (const directory of SCAN_DIRECTORIES) {
    const dirPath = join(projectRoot, directory);
    try {
      await stat(dirPath);
      const result = await scanDirectory(dirPath, projectRoot);
      allListeners.push(...result.listeners);
      allErrors.push(...result.errors);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        allErrors.push({ filePath: directory, error: String(error) });
      }
    }
  }
  allListeners.sort((a, b) => a.filePath.localeCompare(b.filePath));
  return {
    listeners: allListeners,
    totalListeners: allListeners.length,
    withReconnect: allListeners.filter(l => l.hasReconnect).length,
    withBackoff: allListeners.filter(l => l.hasBackoff).length,
    errors: allErrors,
  };
}

export function getMissingReconnect(listeners: SSEListener[]): SSEListener[] {
  return listeners.filter(l => !l.hasReconnect);
}

export function getMissingBackoff(listeners: SSEListener[]): SSEListener[] {
  return listeners.filter(l => !l.hasBackoff);
}

export function getSSEListenerSummary(result: SSEListenerScanResult): {
  totalListeners: number;
  withReconnect: number;
  withBackoff: number;
  missingReconnect: number;
  missingBackoff: number;
  uniqueEndpoints: string[];
  uniqueEvents: string[];
} {
  const allEndpoints = new Set<string>();
  const allEvents = new Set<string>();
  for (const listener of result.listeners) {
    allEndpoints.add(listener.endpoint);
    listener.events.forEach(event => allEvents.add(event));
  }
  return {
    totalListeners: result.totalListeners,
    withReconnect: result.withReconnect,
    withBackoff: result.withBackoff,
    missingReconnect: result.totalListeners - result.withReconnect,
    missingBackoff: result.totalListeners - result.withBackoff,
    uniqueEndpoints: Array.from(allEndpoints).sort(),
    uniqueEvents: Array.from(allEvents).sort(),
  };
}
