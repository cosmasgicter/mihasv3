// @vitest-environment node
/**
 * Property Test P27: No hardcoded credentials in source code
 *
 * Scans scripts/, api-src/, lib/, src/lib/ for known removed credentials.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const KNOWN_CREDENTIALS = ['Beanola2025', 'test@mihas.edu.zm', 'cosmas@beanola.com'];
const SCAN_DIRS = ['scripts', 'api-src', 'lib', 'src/lib'];
const EXTS = new Set(['.ts', '.tsx', '.js', '.mjs']);

function collect(dir: string): string[] {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  const out: string[] = [];
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const full = path.join(abs, e.name);
    if (e.isDirectory()) out.push(...collect(path.relative(ROOT, full)));
    else if (EXTS.has(path.extname(e.name))) out.push(full);
  }
  return out;
}

describe('P27: No hardcoded credentials in source', () => {
  const files = SCAN_DIRS.flatMap(collect);

  it('finds source files to scan', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(KNOWN_CREDENTIALS)('no occurrence of "%s"', (cred) => {
    const hits: string[] = [];
    for (const f of files) {
      if (fs.readFileSync(f, 'utf-8').includes(cred)) {
        hits.push(path.relative(ROOT, f));
      }
    }
    expect(hits).toEqual([]);
  });
});
