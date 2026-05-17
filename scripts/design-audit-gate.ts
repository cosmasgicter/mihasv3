#!/usr/bin/env bun
/**
 * Design audit gate.
 *
 * Runs `impeccable detect` against both frontend apps and fails CI if any
 * NEW anti-patterns appear beyond the documented baseline.
 *
 * Baseline lives in `scripts/design-audit-baseline.json` and lists the
 * accepted-deviation findings (Inter font in admissions, Space Grotesk in
 * jobs-ops — both documented in DESIGN.md).
 *
 * Run via: `bun run lint:design` (root) or `bun scripts/design-audit-gate.ts`.
 */

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

interface BaselineEntry {
  rule: string
  file: string
  reason: string
}

interface DetectorFinding {
  rule: string
  file: string
  line: number
  message: string
}

const ROOT = resolve(import.meta.dir, '..')
const BASELINE_PATH = resolve(ROOT, 'scripts/design-audit-baseline.json')

function loadBaseline(): BaselineEntry[] {
  try {
    return JSON.parse(readFileSync(BASELINE_PATH, 'utf-8'))
  } catch {
    return []
  }
}

function runDetector(target: string): { findings: DetectorFinding[]; raw: string } {
  // Use spawnSync so we capture stdout regardless of exit code.
  const result = spawnSync('impeccable', ['detect', target], {
    encoding: 'utf-8',
    cwd: ROOT,
  })
  const raw = (result.stdout ?? '') + (result.stderr ?? '')
  if (result.error) {
    console.error(`Failed to run impeccable on ${target}:`, result.error)
    process.exit(2)
  }

  const findings: DetectorFinding[] = []
  let currentFile = ''
  for (const line of raw.split('\n')) {
    const fileMatch = line.match(/^(\/[^\s]+\.\w+)/)
    if (fileMatch) {
      currentFile = fileMatch[1].replace(`${ROOT}/`, '')
      continue
    }
    const findingMatch = line.match(/^\s+line (\d+): \[([^\]]+)\] (.+)$/)
    if (findingMatch && currentFile) {
      findings.push({
        file: currentFile,
        line: Number(findingMatch[1]),
        rule: findingMatch[2],
        message: findingMatch[3].trim(),
      })
    }
  }
  return { findings, raw }
}

function isBaseline(finding: DetectorFinding, baseline: BaselineEntry[]): BaselineEntry | undefined {
  return baseline.find(
    (b) => b.rule === finding.rule && (b.file === finding.file || finding.file.endsWith(b.file)),
  )
}

const targets = [
  'apps/admissions/src/',
  'apps/jobs-ops/src/',
]

const baseline = loadBaseline()
const newFindings: DetectorFinding[] = []
const baselineHits: { finding: DetectorFinding; entry: BaselineEntry }[] = []

console.log('🎨 Design audit gate — running impeccable detect across frontends\n')

for (const target of targets) {
  const { findings } = runDetector(target)
  for (const finding of findings) {
    const baselineMatch = isBaseline(finding, baseline)
    if (baselineMatch) {
      baselineHits.push({ finding, entry: baselineMatch })
    } else {
      newFindings.push(finding)
    }
  }
}

console.log(`Baseline accepted-deviation findings: ${baselineHits.length}`)
for (const { finding, entry } of baselineHits) {
  console.log(`  ✓ ${finding.file}:${finding.line} [${finding.rule}] — accepted: ${entry.reason}`)
}

console.log()

if (newFindings.length === 0) {
  console.log('✅ No new design anti-patterns. Audit gate clean.')
  process.exit(0)
}

console.log(`❌ ${newFindings.length} new anti-pattern(s) detected:\n`)
for (const f of newFindings) {
  console.log(`  ${f.file}:${f.line} [${f.rule}]`)
  console.log(`    ${f.message}\n`)
}
console.log(
  'Either fix the finding, or add it to scripts/design-audit-baseline.json with a documented reason.',
)
process.exit(1)
