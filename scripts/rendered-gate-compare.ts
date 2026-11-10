#!/usr/bin/env bun
/**
 * Rendered design gate: compare recorded findings with the committed baseline
 * (platform-simplification task 22.5, Requirement 19.4).
 *
 *   bun scripts/rendered-gate-compare.ts                 # fail on new, stale, unexplained entries
 *   bun scripts/rendered-gate-compare.ts --write-baseline # first run: create the baseline
 *   bun scripts/rendered-gate-compare.ts --exit-list     # list entries a P2 exit may not keep (19.9)
 *
 * Input: apps/admissions/test-results/rendered-gate/findings.jsonl, written by the
 * Playwright spec. Every finding is keyed by rule, page, viewport and selector.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  compareWithBaseline,
  findingKey,
  isHardGuardrailEntry,
  type BaselineEntry,
  type KeyedFinding,
} from './rendered-gate-rules';

const ROOT = resolve(import.meta.dir, '..');
const FINDINGS = resolve(ROOT, 'apps/admissions/test-results/rendered-gate/findings.jsonl');
const BASELINE = resolve(ROOT, 'scripts/rendered-design-baseline.json');

interface Line {
  audited?: number;
  visited?: string;
  viewport?: string;
  rule?: string;
  page?: string;
  selector?: string;
  detail?: string;
  inRunningText?: boolean;
  inNav?: boolean;
}

function readLines(): Line[] {
  if (!existsSync(FINDINGS)) {
    console.error(`No findings file at ${FINDINGS}. Run the Playwright rendered-gate config first.`);
    process.exit(2);
  }
  return readFileSync(FINDINGS, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Line);
}

function readBaseline(): BaselineEntry[] {
  return existsSync(BASELINE) ? (JSON.parse(readFileSync(BASELINE, 'utf8')) as BaselineEntry[]) : [];
}

/** The reason written beside a first-run entry: what fixes it, or why it stays. */
export function firstRunReason(f: KeyedFinding): string {
  if (f.rule === 'measure/hit-area') {
    return f.inRunningText
      ? 'Link inside running text; waits for decision D17 (task 24.8).'
      : "Today's finding; fixed by task 24.6 (admin queue rows and checkboxes by task 30.4).";
  }
  if (f.rule === 'measure/font-size') return "Today's finding; fixed by tasks 24.1, 24.2 and 24.7.";
  if (f.rule === 'measure/overflow') return "Today's finding; fixed by the task that rebuilds the surface (24.6, 30.6, 31.1).";
  if (f.rule === 'measure/clipped-text') return "Today's finding; fixed by task 31.1 (navigation labels) or the surface's own task.";
  if (f.rule === 'measure/first-control') return "Today's finding; fixed by task 25.5 (wizard) or 33.1 (landing).";
  if (f.rule === 'measure/action-width') return "Today's finding; fixed by task 29.3.";
  if (f.rule === 'axe/color-contrast') return "Today's finding; fixed by tasks 23.1 to 23.4.";
  if (f.rule === 'impeccable/low-contrast') return "Today's finding; fixed by tasks 23.1 to 23.4.";
  if (f.rule === 'impeccable/nested-cards') return "Today's finding; fixed by task 31.3 (landing: task 33.1).";
  if (f.rule === 'impeccable/overused-font') return 'Inter is the documented product font (DESIGN.md; the tech steering fixes its fallback chain).';
  if (f.rule === 'impeccable/ai-color-palette') {
    return 'Matches --color-link-visited (#7c3aed, 4.54:1), the visited-link token in design-tokens.css; not a purple accent. Existing token, left as is.';
  }
  if (f.rule === 'impeccable/gradient-text') {
    return 'Page-level match on the boot-screen preloader shimmer style in index.html (before-JS wordmark). Not owned by tasks 22 to 24; reported to the user as an open item.';
  }
  if (f.rule === 'impeccable/single-font') return 'Inter is the single documented product font (DESIGN.md; tech steering fixes its fallback chain).';
  if (f.rule === 'impeccable/line-length') return "Today's finding; running text gets max-w-prose in task 24.5 where it is student or public copy.";
  if (f.rule === 'impeccable/tiny-text') return "Today's finding; sizes move to the scale in tasks 24.2 and 24.7 or the surface is rebuilt in task 33.1.";
  if (f.rule === 'impeccable/skipped-heading') return "Today's finding; heading order is fixed by task 25.4 (wizard) or the surface's own task.";
  if (f.rule === 'impeccable/body-text-viewport-edge') return "Today's finding on the admin review modal; replaced by tasks 30.2 and 30.3.";
  if (f.rule === 'axe/label') return "Today's finding on the admin queue controls; labelled by task 30.4.";
  if (f.rule === 'axe/link-in-text-block') return 'Link inside running text; waits for decision D17 (task 24.8).';
  return `Recorded by the first rendered-gate run (task 22.5); later tasks delete it when the surface is rebuilt.`;
}

const args = new Set(process.argv.slice(2));
const lines = readLines();
const findings: KeyedFinding[] = lines
  .filter((l) => l.rule && l.page && l.viewport && l.selector)
  .map((l) => ({
    rule: l.rule!,
    page: l.page!,
    viewport: l.viewport!,
    selector: l.selector!,
    detail: l.detail,
    inRunningText: l.inRunningText,
    inNav: l.inNav,
  }));

const audited = Math.max(0, ...lines.map((l) => l.audited ?? 0));
const visits = new Set(lines.filter((l) => l.visited).map((l) => `${l.visited}\u0001${l.viewport}`));
const problems: string[] = [];
if (audited === 0) problems.push('The findings file records no audited page count.');
else if (visits.size < audited * 2) {
  problems.push(`Only ${visits.size} of ${audited * 2} page and viewport visits were recorded.`);
}

if (args.has('--write-baseline')) {
  const seen = new Set<string>();
  const entries: BaselineEntry[] = [];
  for (const f of findings) {
    const k = findingKey(f);
    if (seen.has(k)) continue;
    seen.add(k);
    const entry: BaselineEntry = {
      rule: f.rule,
      page: f.page,
      viewport: f.viewport,
      selector: f.selector,
      reason: firstRunReason(f),
    };
    if (f.inRunningText) entry.inRunningText = true;
    if (f.inNav) entry.inNav = true;
    entries.push(entry);
  }
  entries.sort((a, b) => findingKey(a).localeCompare(findingKey(b)));
  writeFileSync(BASELINE, `${JSON.stringify(entries, null, 2)}\n`);
  console.log(`Wrote ${entries.length} baseline entries to ${BASELINE}`);
  process.exit(0);
}

const baseline = readBaseline();

if (args.has('--exit-list')) {
  const hard = baseline.filter(isHardGuardrailEntry);
  console.log(`${hard.length} baseline entries are hard guardrails (Requirement 19.9):`);
  const byRule = new Map<string, number>();
  for (const e of hard) byRule.set(e.rule, (byRule.get(e.rule) ?? 0) + 1);
  for (const [rule, n] of byRule) console.log(`  ${rule}: ${n}`);
  process.exit(hard.length === 0 ? 0 : 1);
}

const result = compareWithBaseline(findings, baseline);
for (const f of result.newFindings) {
  problems.push(`NEW  ${f.rule} on ${f.page} @${f.viewport} ${f.selector}${f.detail ? ` (${f.detail})` : ''}`);
}
for (const e of result.staleEntries) {
  problems.push(`STALE  ${e.rule} on ${e.page} @${e.viewport} ${e.selector}`);
}
for (const e of result.missingReasons) {
  problems.push(`NO REASON  ${e.rule} on ${e.page} @${e.viewport} ${e.selector}`);
}
for (const e of result.badPrefix) {
  problems.push(`BAD RULE PREFIX  ${e.rule}`);
}

if (problems.length > 0) {
  console.error(`Rendered design gate failed (${problems.length}):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`Rendered design gate passed: ${findings.length} findings, ${baseline.length} baseline entries.`);
