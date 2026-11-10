/**
 * Rendered design gate (platform-simplification tasks 22.1-22.4 and 22.6, design 12.7,
 * Requirement 19).
 *
 * One test per page and viewport of the Audited_Page_Set, through the harness edge.
 * On each page, in this order: wait for the network to go idle, take the screenshot,
 * run axe, run the measurements (390x844 only), run impeccable's browser detector last
 * (it draws overlays and schedules one more scan 100 ms later).
 *
 * The spec only RECORDS findings, keyed by `selectorFor`, into
 * `test-results/rendered-gate/findings.jsonl`. `scripts/rendered-gate-compare.ts`
 * compares them with `scripts/rendered-design-baseline.json` and fails on a new finding,
 * on an entry without a reason and on an entry that no longer matches (Requirement
 * 19.4). The one thing this spec fails on by itself is the build badge outside
 * diagnostics (task 22.6), which is a defect, not a baselinable finding.
 *
 * Screenshots are viewport-only (the first screen at the page top, device scale factor 1) so
 * no capture exceeds the image-size limit; they are saved for the sign-off task and never
 * committed.
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { createRequire } from 'node:module';
import type { Finding, Measurements } from '../../../../../scripts/rendered-gate-rules';
import { test, expect, type Page } from '../harness-fixtures';
import { allowHarnessNoise } from '../helpers/surfaces-13-3';
import { runImpeccable } from './impeccable';
import { MEASURE_SOURCE, ROLE_SOURCE } from './measure';
import { SELECTOR_SOURCE } from './selector';
import {
  AUDITED_PAGES,
  buildGateWorld,
  credentialsFor,
  isStudentRoute,
  signIn,
  type GateWorld,
} from './pages';

const HERE = dirname(fileURLToPath(import.meta.url));
// `scripts/` has no `"type": "module"`, so Node loads the classifier as CommonJS and
// offers no named exports to an ES import; `require` returns the whole module.
const { classifyMeasurements } = createRequire(import.meta.url)(
  '../../../../../scripts/rendered-gate-rules.ts',
) as typeof import('../../../../../scripts/rendered-gate-rules');
const OUT = join(HERE, '..', '..', '..', 'test-results', 'rendered-gate');
const FINDINGS = join(OUT, 'findings.jsonl');
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const VIEWPORT_LABEL: Record<string, string> = { desktop: '1440x900', mobile: '390x844' };

interface Row {
  rule: string;
  page: string;
  viewport: string;
  selector: string;
  detail?: string;
  inRunningText?: boolean;
  inNav?: boolean;
}

function write(line: object): void {
  appendFileSync(FINDINGS, `${JSON.stringify(line)}\n`);
}

let world: GateWorld | undefined;

test.beforeAll(async () => {
  mkdirSync(join(OUT, 'screenshots'), { recursive: true });
  write({ audited: AUDITED_PAGES.length });
  world = await buildGateWorld();
});

test.afterAll(async () => {
  if (world) {
    await world.admin.ctx.dispose();
    world = undefined;
  }
});

async function axeFindings(page: Page, pageId: string, viewport: string): Promise<{ rows: Row[]; ms: number }> {
  const started = Date.now();
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  const ms = Date.now() - started;
  const targets: string[] = [];
  const owners: { rule: string; detail: string }[] = [];
  for (const violation of results.violations) {
    for (const node of violation.nodes) {
      const first = node.target[0];
      targets.push(typeof first === 'string' ? first : String(first));
      owners.push({ rule: `axe/${violation.id}`, detail: `${violation.impact ?? ''}: ${violation.help}` });
    }
  }
  if (targets.length === 0) return { rows: [], ms };
  const selectors = (await page.evaluate(`(function () {
    var selectorFor = ${SELECTOR_SOURCE};
    return ${JSON.stringify(targets)}.map(function (t) {
      var el = null;
      try { el = document.querySelector(t); } catch (e) { el = null; }
      return el ? selectorFor(el) : 'body';
    });
  })()`)) as string[];
  return {
    rows: owners.map((o, i) => ({ ...o, page: pageId, viewport, selector: selectors[i] ?? 'body' })),
    ms,
  };
}

async function measure(page: Page, pageId: string, viewport: string): Promise<Row[]> {
  const size = page.viewportSize()!;
  await page.evaluate('window.scrollTo(0, 0)');
  const measurements = (await page.evaluate(
    `(${MEASURE_SOURCE})(${SELECTOR_SOURCE}, ${ROLE_SOURCE}, ${JSON.stringify({
      viewportWidth: size.width,
      viewportHeight: size.height,
    })})`,
  )) as Measurements;
  const findings: Finding[] = classifyMeasurements(measurements, { studentRoute: isStudentRoute(pageId) });
  return findings.map((f) => ({ ...f, page: pageId, viewport }));
}

for (const spec of AUDITED_PAGES) {
  test(spec.id, async ({ page, gate }, testInfo) => {
    // The gate measures design, not the harness's known console noise.
    allowHarnessNoise(gate);
    gate.allowRequest('/__lenco/');
    gate.allowConsole('/__lenco/');

    const viewport = VIEWPORT_LABEL[testInfo.project.name] ?? testInfo.project.name;
    const creds = credentialsFor(world!, spec.auth);
    if (creds) await signIn(page, creds);

    await page.goto(spec.url(world!), { waitUntil: 'domcontentloaded' });
    await spec.ready(page, world!);
    if (spec.prepare) await spec.prepare(page, world!);
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => undefined);

    const slug = spec.id.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'root';
    mkdirSync(join(OUT, 'screenshots', viewport), { recursive: true });
    await page.screenshot({ path: join(OUT, 'screenshots', viewport, `${slug}.png`), fullPage: false });

    const rows: Row[] = [];

    const axe = await axeFindings(page, spec.id, viewport);
    rows.push(...axe.rows);

    if (testInfo.project.name === 'mobile') {
      rows.push(...(await measure(page, spec.id, viewport)));
    }

    // Task 22.6: the badge's own element, matched by its accessible attributes, never
    // by visible text. After Spec A's fix nothing renders it outside the dev server.
    const badge = await page.locator('[aria-label^="Frontend build"], [title^="Frontend build"]').count();

    const impeccable = await runImpeccable(page);
    rows.push(...impeccable.map((f) => ({ ...f, page: spec.id, viewport })));

    for (const row of rows) write(row);
    write({ visited: spec.id, viewport, axeMs: axe.ms, counts: rows.length });

    expect(badge, 'the frontend build badge must not render outside diagnostics').toBe(0);
  });
}
