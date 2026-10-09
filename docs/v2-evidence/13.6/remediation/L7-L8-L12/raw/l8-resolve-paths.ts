/**
 * L8: what do the frontend write paths actually RESOLVE to?
 *
 * Reading the source proves a literal is gone. It does not prove the replacement
 * resolves anywhere sensible — L5-L6's own instrument slip was a correct-looking
 * expression that resolved one directory too high and wrote 20 MB into
 * `apps/docs/v2-evidence/`. So this imports the **real** helper and the **real**
 * Playwright config and prints the paths they produce, in all three cases.
 *
 * usage (from apps/admissions):  bun run ../../docs/.../raw/l8-resolve-paths.ts
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Six levels out of raw/: raw -> L7-L8-L12 -> remediation -> 13.6 -> v2-evidence ->
// docs -> repo root. Counted, not guessed — see the note in l8-guard-discriminates.sh.
const REPO = '../../../../../..';
const HELPER = `${REPO}/apps/admissions/tests/harness-e2e/helpers/evidence-dir.ts`;

const ENV_KEYS = ['V2_EVIDENCE_DIR', 'V2_EVIDENCE_TASK_DIRS', 'V2_EVIDENCE_RUN_ID'] as const;

async function resolveWith(
  env: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>,
): Promise<{ label: string; rows: string[] }> {
  for (const key of ENV_KEYS) {
    if (env[key] === undefined) delete process.env[key];
    else process.env[key] = env[key];
  }
  // Re-import with a cache-busting query so the module re-reads process.env. The helper
  // reads env inside the functions, not at module scope, so this is belt and braces.
  const mod = await import(`${HELPER}?t=${Date.now()}${Math.random()}`);
  const rows: string[] = [];
  for (const task of ['0.4', '2.2', '11.1', '11.2', '11.3', '11.4', '11.5', '13.3']) {
    rows.push(`  ${task.padEnd(5)} -> ${mod.evidenceDir(task)}`);
  }
  rows.push(`  reporter (repo-relative) -> ${mod.evidenceDirRelative('0.4')}`);
  const label = ENV_KEYS.filter((k) => env[k] !== undefined)
    .map((k) => `${k}=${env[k]}`)
    .join(' ');
  return { label: label || '(no env — THE DEFAULT)', rows };
}

const cases = [
  {},
  { V2_EVIDENCE_TASK_DIRS: '1' },
  { V2_EVIDENCE_DIR: 'docs/v2-evidence/13.6/remediation/L5-L6' },
  { V2_EVIDENCE_RUN_ID: 'probe-run' },
];

console.log('## resolved write paths, from the real modules');
for (const env of cases) {
  const { label, rows } = await resolveWith(env);
  console.log(`\n${label}`);
  for (const row of rows) console.log(row);
}

// The off-by-one check L5-L6 paid for: every resolved path must sit inside the repo, and
// `apps/docs` must not exist.
const { rows } = await resolveWith({ V2_EVIDENCE_RUN_ID: 'probe-run' });
const repoRoot = resolve(import.meta.dirname, REPO);
const bad = rows.filter((r) => {
  const p = r.split('-> ')[1];
  return p.startsWith('/') && !p.startsWith(repoRoot);
});
console.log('');
console.log(`repo root resolved as       : ${repoRoot}`);
console.log(`paths escaping the repo     : ${bad.length}`);
console.log(`apps/docs/ exists (must be false): ${existsSync(resolve(repoRoot, 'apps/docs'))}`);

// And the config: import it and read the reporter entry it actually built.
delete process.env.V2_EVIDENCE_DIR;
delete process.env.V2_EVIDENCE_TASK_DIRS;
delete process.env.V2_EVIDENCE_RUN_ID;
const cfg = await import(`${REPO}/apps/admissions/playwright.harness.config.ts?t=${Date.now()}`);
const reporter = (cfg.default as { reporter?: unknown[] }).reporter ?? [];
const json = reporter.find(
  (entry) => Array.isArray(entry) && entry[0] === 'json',
) as [string, { outputFile: string }] | undefined;
const outputFile = json?.[1]?.outputFile ?? '<not found>';
console.log('');
console.log('## playwright.harness.config.ts, imported with NO env set');
console.log(`  reporter entries          : ${JSON.stringify(reporter)}`);
console.log(`  json reporter outputFile  : ${outputFile}`);
console.log(`  names docs/v2-evidence?   : ${outputFile.includes('docs/v2-evidence')}`);
console.log(`  V2_EVIDENCE_RUN_ID stamped: ${process.env.V2_EVIDENCE_RUN_ID ?? '<unset>'}`);
