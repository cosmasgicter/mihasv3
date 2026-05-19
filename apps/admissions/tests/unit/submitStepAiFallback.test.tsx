/**
 * @vitest-environment node
 *
 * Task 6 regression: SubmitStep now shows fallback summaries (source !== 'ai')
 * as long as they pass the `summaryLooksComplete` predicate. The old
 * `&& data?.source === 'ai'` gate has been removed.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

import { summaryLooksComplete } from '@/pages/student/applicationWizard/steps/SubmitStep'

const submitStepSource = fs.readFileSync(
  path.resolve(__dirname, '../../src/pages/student/applicationWizard/steps/SubmitStep.tsx'),
  'utf-8',
)

describe('summaryLooksComplete — predicate', () => {
  it('accepts a 50+ char string ending with a period', () => {
    const text = 'Cosmas, your application is looking great. Once submitted, the team will review it.'
    expect(summaryLooksComplete(text)).toBe(true)
  })

  it('accepts a string ending with exclamation mark', () => {
    const text = 'A'.repeat(49) + '!'
    expect(summaryLooksComplete(text)).toBe(true)
  })

  it('accepts a string ending with question mark', () => {
    const text = 'A'.repeat(49) + '?'
    expect(summaryLooksComplete(text)).toBe(true)
  })

  it('rejects strings shorter than 50 chars', () => {
    expect(summaryLooksComplete('Short summary.')).toBe(false)
  })

  it('rejects strings not ending with sentence punctuation', () => {
    const text = 'A'.repeat(60) // no punctuation at end
    expect(summaryLooksComplete(text)).toBe(false)
  })

  it('rejects null and undefined', () => {
    expect(summaryLooksComplete(null)).toBe(false)
    expect(summaryLooksComplete(undefined)).toBe(false)
  })

  it('rejects empty string', () => {
    expect(summaryLooksComplete('')).toBe(false)
  })

  it('trims whitespace before checking', () => {
    const text = '  ' + 'A'.repeat(49) + '.  '
    expect(summaryLooksComplete(text)).toBe(true)
  })
})

describe('SubmitStep — source gate removed', () => {
  it('does NOT gate aiSummary display on source === "ai"', () => {
    // The old code had: `if (looksComplete && data?.source === 'ai')`
    // After the fix, only `looksComplete` matters.
    expect(submitStepSource).not.toMatch(/source\s*===?\s*['"]ai['"]/)
  })

  it('sets aiSummary when looksComplete is true regardless of source', () => {
    // The setAiSummary call should be inside `if (looksComplete)` only
    const lines = submitStepSource.split('\n')
    const setLine = lines.findIndex(l => l.includes('setAiSummary(summary)'))
    expect(setLine).toBeGreaterThan(-1)
    // The preceding conditional should be `if (looksComplete)` not `if (looksComplete && ...source...)`
    const preceding = lines.slice(Math.max(0, setLine - 3), setLine).join(' ')
    expect(preceding).toContain('if (looksComplete)')
    expect(preceding).not.toContain('source')
  })
})
