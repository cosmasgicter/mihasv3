#!/usr/bin/env bun
/**
 * Unreachable-module check (platform-simplification task 3.2, Requirements 2.4, 2.5).
 *
 * Walks reachability from `apps/admissions/src/main.tsx` over non-test imports,
 * using the first-party import graph that `scripts/module-size-report.ts` already
 * builds (`collect`, `resolveTsSpecifier`). A module nothing reachable imports is
 * unreachable. It fails unless the module is in one of two lists:
 *
 *   scripts/unreferenced-modules-allowlist.json   files loaded by convention
 *       ({module, reason}; `module` is a path or a glob with `*`)
 *   scripts/unreferenced-modules-baseline.json    known-unreachable modules, each
 *       with the reason it has not been deleted yet ({module, reason, decision?})
 *
 * A stale entry in either list (the module is gone, or is now reachable) also
 * fails, so a list can only shrink.
 *
 * What it cannot see. Reachability is per module. It misses an unused export in
 * a reachable module, a callback that no caller invokes, and a module that stays
 * reachable only through a barrel re-export (`components/smoothui/index.ts` keeps
 * `animated-counter.tsx` reachable for as long as the landing imports the
 * barrel). `module-size-report.ts` also runs `tsc --noUnusedLocals`, which finds
 * unused locals and imports, not unused exports. Such items are listed by hand
 * (D15 item (i), task 33.2).
 *
 * Usage:
 *   bun scripts/unreferenced-modules.ts            # human report, exit 1 on a problem
 *   bun scripts/unreferenced-modules.ts --json
 */
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { collect } from './module-size-report'

const REPO_ROOT = resolve(import.meta.dirname, '..')
export const ENTRY = 'apps/admissions/src/main.tsx'
export const SURFACE = 'admissions-frontend'
const ALLOWLIST_FILE = join(REPO_ROOT, 'scripts/unreferenced-modules-allowlist.json')
const BASELINE_FILE = join(REPO_ROOT, 'scripts/unreferenced-modules-baseline.json')

export interface ListEntry {
  module: string
  reason: string
  decision?: string
}

export interface GraphNode {
  path: string
  imports: string[]
}

export interface Verdict {
  /** Unreachable, not allowlisted, not baselined. */
  offenders: string[]
  /** Baseline entries whose module is gone or is now reachable. */
  staleBaseline: string[]
  /** Allowlist entries that match no module. */
  staleAllowlist: string[]
  /** Entries without a module or a non-empty reason. */
  invalidEntries: string[]
  /** Every unreachable module, before the lists are applied. */
  unreachable: string[]
}

const isTestFile = (path: string): boolean => /\.(test|spec)\.[tj]sx?$/.test(path) || path.includes('/__tests__/')

/** Modules reachable from the entries, following only non-test imports. */
export function reachableFrom(nodes: GraphNode[], entries: string[]): Set<string> {
  const graph = new Map(nodes.map((n) => [n.path, n.imports]))
  const seen = new Set<string>()
  const work = entries.filter((e) => graph.has(e))
  for (const e of work) seen.add(e)
  while (work.length > 0) {
    const current = work.pop() as string
    for (const next of graph.get(current) ?? []) {
      if (seen.has(next) || isTestFile(next) || !graph.has(next)) continue
      seen.add(next)
      work.push(next)
    }
  }
  return seen
}

/** `*` matches any run of characters, including `/`; everything else is literal. */
export function globToRegExp(glob: string): RegExp {
  const escaped = glob.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
  return new RegExp(`^${escaped}$`)
}

export function matchesEntry(entry: ListEntry, modulePath: string): boolean {
  return entry.module.includes('*') ? globToRegExp(entry.module).test(modulePath) : entry.module === modulePath
}

function validEntry(entry: unknown): entry is ListEntry {
  if (typeof entry !== 'object' || entry === null) return false
  const { module, reason } = entry as Record<string, unknown>
  return typeof module === 'string' && module.trim() !== '' && typeof reason === 'string' && reason.trim() !== ''
}

/** Apply the two lists to a graph. Pure: no file access. */
export function evaluate(
  nodes: GraphNode[],
  entries: string[],
  allowlist: unknown[],
  baseline: unknown[]
): Verdict {
  const verdict: Verdict = { offenders: [], staleBaseline: [], staleAllowlist: [], invalidEntries: [], unreachable: [] }
  const allow: ListEntry[] = []
  const base: ListEntry[] = []
  for (const [name, list, sink] of [
    ['allowlist', allowlist, allow],
    ['baseline', baseline, base],
  ] as const) {
    for (const entry of list) {
      if (validEntry(entry)) sink.push(entry)
      else verdict.invalidEntries.push(`${name} entry needs a module and a non-empty reason: ${JSON.stringify(entry)}`)
    }
  }

  const reachable = reachableFrom(nodes, entries)
  const modules = nodes.map((n) => n.path).filter((p) => !isTestFile(p))
  verdict.unreachable = modules.filter((p) => !reachable.has(p)).sort()

  for (const modulePath of verdict.unreachable) {
    const covered = allow.some((e) => matchesEntry(e, modulePath)) || base.some((e) => e.module === modulePath)
    if (!covered) verdict.offenders.push(modulePath)
  }
  for (const entry of allow) {
    // An allowlisted module may be reachable; it is stale only when it names nothing that exists.
    if (!modules.some((p) => matchesEntry(entry, p))) verdict.staleAllowlist.push(`${entry.module}: matches no module`)
  }
  for (const entry of base) {
    if (!modules.includes(entry.module)) verdict.staleBaseline.push(`${entry.module}: module no longer exists`)
    else if (reachable.has(entry.module)) verdict.staleBaseline.push(`${entry.module}: now reachable, remove the entry`)
    else if (allow.some((e) => matchesEntry(e, entry.module)))
      verdict.staleBaseline.push(`${entry.module}: allowlisted, remove the baseline entry`)
  }
  return verdict
}

export const isOk = (v: Verdict): boolean =>
  v.offenders.length + v.staleBaseline.length + v.staleAllowlist.length + v.invalidEntries.length === 0

function readList(path: string): unknown[] {
  if (!existsSync(path)) return []
  const data = JSON.parse(readFileSync(path, 'utf-8')) as { entries?: unknown[] } | unknown[]
  return Array.isArray(data) ? data : (data.entries ?? [])
}

function main(): void {
  const records = collect(REPO_ROOT, 0).filter((r) => r.surface === SURFACE)
  const verdict = evaluate(
    records.map((r) => ({ path: r.path, imports: r.imports })),
    [ENTRY],
    readList(ALLOWLIST_FILE),
    readList(BASELINE_FILE)
  )
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(verdict, null, 2))
  } else {
    console.log(`modules: ${records.length}  unreachable: ${verdict.unreachable.length}  offenders: ${verdict.offenders.length}`)
    for (const [title, items] of [
      ['OFFENDERS (unreachable, not allowlisted, not baselined)', verdict.offenders],
      ['STALE BASELINE', verdict.staleBaseline],
      ['STALE ALLOWLIST', verdict.staleAllowlist],
      ['INVALID ENTRIES', verdict.invalidEntries],
    ] as const) {
      if (items.length === 0) continue
      console.log(`\n${title}:`)
      for (const item of items) console.log(`  ${item}`)
    }
  }
  process.exit(isOk(verdict) ? 0 : 1)
}

if (import.meta.main) main()
