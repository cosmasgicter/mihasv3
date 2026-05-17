import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { APPLICATION_STATUSES, TERMINAL_STATUSES } from '@/types/applicationStatus'

const SERVICES_PY_PATH = path.resolve(__dirname, '../../../../backend/apps/applications/services.py')
const DUPLICATE_CHECKER_PATH = path.resolve(__dirname, '../../../../backend/apps/applications/duplicate_checker.py')

function parseAllowedTransitions(source: string): { sourceStatuses: Set<string>; targetStatuses: Set<string> } {
  const block = source.match(/ALLOWED_TRANSITIONS[^{]*\{([\s\S]*?)\n\}/)?.[1] ?? ''
  const sourceStatuses = new Set<string>()
  const targetStatuses = new Set<string>()

  for (const match of block.matchAll(/"([^"]+)":\s*\{([^}]+)\}/g)) {
    sourceStatuses.add(match[1])
    for (const target of match[2].matchAll(/"([^"]+)"/g)) {
      targetStatuses.add(target[1])
    }
  }
  return { sourceStatuses, targetStatuses }
}

function parseTerminalStatuses(source: string): Set<string> {
  const match = source.match(/TERMINAL_STATUSES\s*=\s*\{([^}]+)\}/)
  if (!match) return new Set()
  const statuses = new Set<string>()
  for (const m of match[1].matchAll(/"([^"]+)"/g)) {
    statuses.add(m[1])
  }
  return statuses
}

describe('Application status drift guard', () => {
  const servicesSrc = fs.readFileSync(SERVICES_PY_PATH, 'utf-8')
  const duplicateCheckerSrc = fs.readFileSync(DUPLICATE_CHECKER_PATH, 'utf-8')
  const { sourceStatuses, targetStatuses } = parseAllowedTransitions(servicesSrc)
  const tsStatuses = new Set(APPLICATION_STATUSES as readonly string[])
  const tsTerminal = new Set(TERMINAL_STATUSES as readonly string[])
  const backendTerminal = parseTerminalStatuses(duplicateCheckerSrc)

  it('all source statuses in ALLOWED_TRANSITIONS are in the TS union', () => {
    for (const status of sourceStatuses) {
      expect(tsStatuses.has(status), `Missing source status: ${status}`).toBe(true)
    }
  })

  it('all target statuses in ALLOWED_TRANSITIONS are in the TS union', () => {
    for (const status of targetStatuses) {
      expect(tsStatuses.has(status), `Missing target status: ${status}`).toBe(true)
    }
  })

  it('TERMINAL_STATUSES matches backend DuplicateChecker.TERMINAL_STATUSES', () => {
    expect([...tsTerminal].sort()).toEqual([...backendTerminal].sort())
  })

  it('all backend statuses (source + target) are covered by the TS union', () => {
    const allBackend = new Set([...sourceStatuses, ...targetStatuses])
    for (const status of allBackend) {
      expect(tsStatuses.has(status), `TS union missing: ${status}`).toBe(true)
    }
  })
})
