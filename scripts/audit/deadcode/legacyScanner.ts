/**
 * Legacy Integration Scanner
 * Finds stale references to deprecated providers/integrations.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { DeadCodeItem } from '../types';

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const EXCLUDED = new Set(['node_modules', '.git', 'dist', 'build', 'coverage']);
const SCAN_DIRS = ['src', 'api', 'lib', 'scripts', 'supabase', 'infra'];

const LEGACY_PATTERNS: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /from\s+['\"]@supabase\/supabase-js['\"]/i, name: 'Supabase SDK import' },
  { pattern: /supabase\./i, name: 'Supabase client usage' },
  { pattern: /wrangler|cloudflare/i, name: 'Cloudflare legacy reference' },
];

export interface LegacyIntegrationScanResult {
  deadCodeItems: DeadCodeItem[];
  filesScanned: number;
  errors: { filePath: string; error: string }[];
}

function collectFiles(projectRoot: string): string[] {
  const files: string[] = [];

  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (EXCLUDED.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) files.push(path.relative(projectRoot, full));
    }
  };

  for (const scanDir of SCAN_DIRS) walk(path.join(projectRoot, scanDir));
  return files;
}

export function scanLegacyIntegrationsFull(projectRoot: string = process.cwd()): LegacyIntegrationScanResult {
  const files = collectFiles(projectRoot);
  const errors: { filePath: string; error: string }[] = [];
  const deadCodeItems: DeadCodeItem[] = [];

  for (const filePath of files) {
    try {
      const content = fs.readFileSync(path.join(projectRoot, filePath), 'utf-8');
      const lines = content.split('\n');

      lines.forEach((line, idx) => {
        for (const candidate of LEGACY_PATTERNS) {
          if (candidate.pattern.test(line)) {
            deadCodeItems.push({
              type: 'LEGACY_INTEGRATION',
              filePath,
              name: candidate.name,
              evidence: `Legacy reference in ${filePath}:${idx + 1} -> ${line.trim()}`,
              safeToRemove: false,
              dependencies: [],
            });
          }
        }
      });
    } catch (error) {
      errors.push({ filePath, error: error instanceof Error ? error.message : String(error) });
    }
  }

  return { deadCodeItems, filesScanned: files.length, errors };
}

export function scanLegacyIntegrations(projectRoot: string = process.cwd()): DeadCodeItem[] {
  return scanLegacyIntegrationsFull(projectRoot).deadCodeItems;
}
