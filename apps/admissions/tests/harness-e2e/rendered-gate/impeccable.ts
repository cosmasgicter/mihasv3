/**
 * impeccable's browser detector, run inside the Playwright page (platform-
 * simplification task 22.2, design 12.7, Requirement 19.1).
 *
 * The CLI's URL mode does the same thing internally (`page.evaluate(browserScript)`
 * then `window.impeccableScan()`), so the rule set is identical. The CLI is not used
 * because its URL mode always renders at 1280x800, cannot hold a signed-in session and
 * names no element.
 *
 * Run it LAST on a page: `scan()` draws overlay elements, and evaluating the script
 * also schedules one more scan 100 ms later, so nothing else may measure or photograph
 * the page after it.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { SELECTOR_SOURCE } from './selector';

export interface ImpeccableFinding {
  rule: string;
  detail: string;
  selector: string;
}

export const ENGINE_RELATIVE_PATH = 'impeccable/cli/engine/detect-antipatterns-browser.js';

/** `<npm root -g>/impeccable/cli/engine/detect-antipatterns-browser.js`, failing by path. */
export function engineBrowserPath(globalRoot?: string): string {
  const root = globalRoot ?? execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
  const path = join(root, ENGINE_RELATIVE_PATH);
  if (!existsSync(path)) {
    throw new Error(
      `impeccable's browser detector is missing: expected ${path}. ` +
        'Install it with `PUPPETEER_SKIP_DOWNLOAD=1 npm install -g impeccable@2.1.9`.',
    );
  }
  return path;
}

let cachedSource: string | null = null;

export async function runImpeccable(page: Page): Promise<ImpeccableFinding[]> {
  cachedSource ??= readFileSync(engineBrowserPath(), 'utf8');
  // Evaluated as an expression (not an injected script tag), so the page's CSP does
  // not apply to it.
  await page.evaluate(cachedSource);
  const expression = `(function () {
    var selectorFor = ${SELECTOR_SOURCE};
    var scan = window.impeccableScan;
    if (typeof scan !== 'function') return { error: 'window.impeccableScan is not defined' };
    var results = scan() || [];
    var out = [];
    results.forEach(function (entry) {
      var el = entry.el || document.body;
      (entry.findings || []).forEach(function (f) {
        out.push({ rule: 'impeccable/' + f.type, detail: String(f.detail || ''), selector: selectorFor(el) });
      });
    });
    return { findings: out };
  })()`;
  const result = (await page.evaluate(expression)) as
    | { findings: ImpeccableFinding[] }
    | { error: string };
  if ('error' in result) throw new Error(result.error);
  return result.findings;
}
