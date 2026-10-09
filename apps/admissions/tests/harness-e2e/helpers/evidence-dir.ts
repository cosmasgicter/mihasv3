/**
 * Where a harness run writes its artifacts — **run-scoped by default**.
 *
 * Spec: `.kiro/specs/admissions-v2-canonical-rebuild/`, item **L8** of
 * `docs/v2-evidence/13.6/README.md` §8.1.
 * Requirements: **R2.7** (an evidence artifact is immutable), **R18.5** (an evidence
 * artifact is a run record, not a claim).
 * Finding: **GATE-13.1-07** — three instruments write into `docs/v2-evidence/**`, so
 * five earlier tasks' Required_Evidence artifacts are not immutable.
 * Evidence: `docs/v2-evidence/13.6/remediation/L7-L8-L12/README.md` §5.
 *
 * ## The property this buys
 *
 * An **incidental** run cannot silently overwrite a recorded artifact, and a
 * **deliberate** regeneration is still one command. Before L8, a bare
 * `bunx playwright test -c playwright.harness.config.ts` — the ordinary way to run the
 * required profile — rewrote task 0.4's `playwright-report.json` and tasks 11.1–11.5'
 * screenshots, because those paths were hard-coded literals. Nothing announced it; the
 * only way to notice was to look at mtimes afterwards, which is how 13.1 found it.
 *
 * ## The three cases, in resolution order
 *
 * | env | resolves to | when you want it |
 * |---|---|---|
 * | `V2_EVIDENCE_DIR=<repo-relative path>` | `<repo>/<path>` | a task re-measuring these surfaces into **its own** directory — L5-L6's case, semantics unchanged |
 * | `V2_EVIDENCE_TASK_DIRS=1` | `<repo>/docs/v2-evidence/<canonicalTaskDir>` | regenerating the artifacts **in their own canonical homes**, on purpose |
 * | *(neither)* | `<repo>/apps/admissions/test-results/harness-evidence/<runId>/<canonicalTaskDir>` | **the default** — an ordinary run, writing nowhere that is anyone's evidence |
 *
 * `V2_EVIDENCE_DIR` is **L5-L6's variable with L5-L6's meaning**: one home for the
 * whole run. It is not redefined here, and this module adds no second path override.
 *
 * `V2_EVIDENCE_TASK_DIRS` exists because a single path cannot express the
 * canonical-home case: five specs have five different homes (`11.1` … `11.5`) and the
 * report has a sixth (`0.4`), so `V2_EVIDENCE_DIR=docs/v2-evidence/11.1` would send all
 * six to one of them. The alternatives were worse — five path variables (five
 * conventions), or overloading `V2_EVIDENCE_DIR` with per-spec magic (one convention
 * that means two things). A boolean "yes, write the canonical homes" is the smallest
 * thing that says exactly what it means, and it is `false` unless someone types it.
 *
 * ## Why the run-scoped root is under `test-results/`
 *
 * `test-results/` is already gitignored (`.gitignore:54`) and is already Playwright's
 * own scratch convention, so the default writes into a directory the repo already
 * treats as disposable. It is deliberately **not** under `docs/v2-evidence/`: a
 * throwaway run directory sitting in the evidence tree would eventually be read as
 * evidence, which is the same confusion in the other direction.
 */
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Repository root, resolved from this file.
 *
 * Five levels: `helpers` -> `harness-e2e` -> `tests` -> `apps/admissions` -> `apps` ->
 * repo root. L5-L6 got this wrong by one and produced a plausible-looking
 * `apps/docs/v2-evidence/…` tree, 20 MB in the wrong place, found by looking for the
 * files rather than by any check (`../L5-L6/README.md` §8.4). It is asserted by
 * `tests/unit/harnessEvidenceDir.test.ts`, not remembered.
 */
function repoRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '../../../../..');
}

/** Repo-relative parent of every run-scoped evidence directory. */
export const RUN_SCOPED_EVIDENCE_ROOT = 'apps/admissions/test-results/harness-evidence';

/** The env var L5-L6 established: one repo-relative home for the whole run. */
export const EVIDENCE_DIR_ENV = 'V2_EVIDENCE_DIR';

/** The env var that opts a run into writing the canonical `docs/v2-evidence/<task>/`. */
export const EVIDENCE_TASK_DIRS_ENV = 'V2_EVIDENCE_TASK_DIRS';

/** The env var that names the run, so every writer in one run agrees. */
export const EVIDENCE_RUN_ID_ENV = 'V2_EVIDENCE_RUN_ID';

/** `'1' | 'true' | 'yes' | 'on'`, case-insensitively — anything else is off. */
export function isTruthyFlag(value: string | undefined): boolean {
  return ['1', 'true', 'yes', 'on'].includes((value ?? '').trim().toLowerCase());
}

/**
 * The id of the current run.
 *
 * A Playwright config sets `V2_EVIDENCE_RUN_ID` in the **main** process; worker
 * processes inherit `process.env`, so every writer in one run resolves the same
 * directory. A spec run without a config that sets it lands in `current/`, which is a
 * stable scratch directory rather than a per-process one — deliberately, because a
 * timestamp computed independently per worker would scatter one run's artifacts across
 * several directories, and a scattered scratch run is harder to read than an
 * overwritten one.
 */
export function evidenceRunId(): string {
  const explicit = process.env[EVIDENCE_RUN_ID_ENV]?.trim();
  return explicit && explicit.length > 0 ? explicit : 'current';
}

/**
 * The absolute directory this run writes `canonicalTaskDir`'s artifacts into.
 *
 * @param canonicalTaskDir the evidence directory this artifact **belongs** to, relative
 *   to `docs/v2-evidence/` — e.g. `'11.1'`, `'0.4'`, `'13.3'`. It is used as the
 *   canonical home under `V2_EVIDENCE_TASK_DIRS`, and as the per-task subdirectory of
 *   the run-scoped default so five specs in one run do not share a directory.
 */
export function evidenceDir(canonicalTaskDir: string): string {
  const override = process.env[EVIDENCE_DIR_ENV]?.trim();
  if (override) return insideRepo(join(repoRoot(), override));
  if (isTruthyFlag(process.env[EVIDENCE_TASK_DIRS_ENV])) {
    return join(repoRoot(), 'docs/v2-evidence', canonicalTaskDir);
  }
  return join(repoRoot(), RUN_SCOPED_EVIDENCE_ROOT, evidenceRunId(), canonicalTaskDir);
}

/**
 * Reject a resolved path that escapes the repository.
 *
 * Added after L8's own slip: a `V2_EVIDENCE_DIR` of `'../docs/v2-evidence/…'`
 * (repo-relative, but written as though it were cwd-relative) resolved outside the repo
 * and wrote a plausible-looking evidence tree into the parent directory. The resolver had
 * done exactly what the convention says; nothing complained. L5-L6 hit the same class of
 * slip from the other side (§8.4). A directory nobody will ever look in is the failure
 * GATE-13.1-07 is about, so a resolver that can silently produce one is worth one
 * comparison. Recorded in
 * `docs/v2-evidence/13.6/remediation/L7-L8-L12/raw/23-l8-own-instrument-slip.txt`.
 */
function insideRepo(candidate: string): string {
  const root = resolve(repoRoot());
  const resolved = resolve(candidate);
  if (resolved !== root && !resolved.startsWith(`${root}/`)) {
    throw new Error(
      `${EVIDENCE_DIR_ENV} resolves outside the repository: ${resolved}. It is a path ` +
        `relative to the REPOSITORY ROOT (${root}), not to the current working directory.`,
    );
  }
  return candidate;
}

/**
 * The same resolution as a **repo-relative** path, for a Playwright `reporter` /
 * `outputDir` entry, which is resolved against the config's own directory rather than
 * against the repo root. The existing configs spell that as `../../<repo-relative>`, so
 * this returns the repo-relative half and the caller keeps the prefix it already had.
 *
 * Kept next to `evidenceDir()` on purpose: two spellings of one rule in two files is
 * how the rule drifts.
 */
export function evidenceDirRelative(canonicalTaskDir: string): string {
  const override = process.env[EVIDENCE_DIR_ENV]?.trim();
  if (override) {
    // Same escape check as evidenceDir(), so the reporter path and the spec paths cannot
    // disagree about whether a value is acceptable.
    insideRepo(join(repoRoot(), override));
    return override;
  }
  if (isTruthyFlag(process.env[EVIDENCE_TASK_DIRS_ENV])) {
    return `docs/v2-evidence/${canonicalTaskDir}`;
  }
  return `${RUN_SCOPED_EVIDENCE_ROOT}/${evidenceRunId()}/${canonicalTaskDir}`;
}
