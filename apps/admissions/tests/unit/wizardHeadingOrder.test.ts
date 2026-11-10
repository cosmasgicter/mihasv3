/**
 * Heading order on the wizard (task 25.4, R15.5).
 *
 * The page H1 is the step title, rendered by `PageShell`. Nothing before it may be a
 * heading, and nothing a step renders may be an H1 or start below H2.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src')
const read = (relative: string) => readFileSync(path.join(SRC, relative), 'utf8')
const STEP_DIR = 'pages/student/applicationWizard/steps'
const STEP_FILES = [
  'ProgramStep',
  'AssignedSchoolStep',
  'AssignmentRecoveryPanel',
  'BasicKycStep',
  'EducationStep',
  'PaymentStep',
  'SubmitStep',
].map(name => `${STEP_DIR}/${name}.tsx`)

describe('wizard heading order', () => {
  it('renders the app header account name as labelled text, not a heading', () => {
    const header = read('components/navigation/Header.tsx')
    expect(header).not.toMatch(/<h[1-6]\b/)
    expect(header).toContain('aria-label=')
  })

  it.each(STEP_FILES)('%s starts its headings at H2', file => {
    const levels = Array.from(read(file).matchAll(/<h([1-6])\b/g)).map(match => Number(match[1]))
    expect(levels).not.toContain(1)
    // The first heading a step opens with is H2; deeper ones follow without a gap.
    if (levels.length > 0) expect(Math.min(...levels)).toBe(2)
  })

  it('has the error summary open at H2, directly under the page H1', () => {
    const summary = read('pages/student/applicationWizard/components/WizardErrorSummary.tsx')
    expect(summary).toMatch(/<h2\b/)
    expect(summary).not.toMatch(/<h3\b/)
  })
})
