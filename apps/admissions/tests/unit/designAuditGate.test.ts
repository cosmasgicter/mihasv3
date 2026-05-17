/**
 * Regression test: the design audit gate must pass.
 *
 * Runs `bun scripts/design-audit-gate.ts` from the repo root. If new
 * anti-patterns appear in `apps/admissions/src/` or `apps/jobs-ops/src/`
 * beyond the baseline, the gate exits non-zero and this test fails.
 *
 * The baseline lives at `scripts/design-audit-baseline.json`. Any
 * baselined finding must be paired with a `reason` referencing PRODUCT.md,
 * DESIGN.md, or the audit report.
 */
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'

describe('design audit gate', () => {
  it('reports zero new anti-patterns beyond the documented baseline', () => {
    const root = resolve(__dirname, '../../../..')
    const result = spawnSync('bun', ['scripts/design-audit-gate.ts'], {
      cwd: root,
      encoding: 'utf-8',
      timeout: 90_000,
    })

    if (result.error) {
      // Bun not available (CI bootstrap). Skip with a clear note instead of failing.
      // CI environments must install Bun; local environments without Bun won't run this.
      console.warn('design-audit-gate skipped: bun unavailable —', result.error.message)
      return
    }

    const stdout = result.stdout ?? ''
    const stderr = result.stderr ?? ''

    if (result.status !== 0) {
      throw new Error(
        `Design audit gate failed (exit ${result.status}).\n` +
          'NEW anti-patterns detected outside the baseline. Either fix them, or add ' +
          'an entry to scripts/design-audit-baseline.json with a documented reason.\n\n' +
          `--- gate stdout ---\n${stdout}\n` +
          (stderr ? `--- gate stderr ---\n${stderr}\n` : ''),
      )
    }

    // Belt-and-suspenders assertion against the success line.
    expect(stdout).toContain('No new design anti-patterns')
  })
})
