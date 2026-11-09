/**
 * R3 exploration: a refused request is never shown as an empty catalogue.
 *
 * Spec: student-journey-repair task 1.3, clause 1.15 (design R3-d).
 *
 * At HEAD `ProgramStep` derives its empty state from `programs.length === 0`, so
 * a 429 on the programme or intake query reads "No programmes available for the
 * current intake". The API client drops `Retry-After`, so no surface can say when
 * to retry, and the dashboard shows the raw error text.
 *
 * The markers were removed at the R3 checkpoint (task 3.12); these now run unmarked.
 */
import { render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { useForm } from 'react-hook-form'
import { afterEach, describe, expect, it, vi } from 'vitest'

import ProgramStep from '@/pages/student/applicationWizard/steps/ProgramStep'
import type { WizardFormData } from '@/pages/student/applicationWizard/types'

const RATE_LIMITED = { message: 'Too many requests', retryAfterSeconds: 120 }

function Harness(props: Record<string, unknown>) {
  const form = useForm<WizardFormData>({ defaultValues: {} as WizardFormData })
  return (
    <ProgramStep
      form={form}
      programs={[]}
      programsLoading={false}
      intakes={[]}
      title="Programme and intake"
      {...(props as object)}
    />
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ProgramStep (clause 1.15)', () => {
  it('shows the retry copy, not the empty helper, when the programmes query is rate limited', () => {
    render(<Harness programsError={RATE_LIMITED} />)

    expect(screen.queryByText(/No programmes available for the current intake/i)).toBeNull()
    expect(screen.getByText(/Try again in about 2 minutes/i)).toBeTruthy()
  })

  it('shows the retry copy, not the empty helper, when the intakes query is rate limited', () => {
    render(<Harness intakesError={RATE_LIMITED} />)

    expect(screen.queryByText(/Intakes will appear here/i)).toBeNull()
    expect(screen.getByText(/Try again in about 2 minutes/i)).toBeTruthy()
  })
})

describe('shared copy and client error (clause 1.15)', () => {
  it('rateLimitMessage rounds up to whole minutes and has an unknown-time form', async () => {
    // `import.meta.glob` resolves to nothing while the module does not exist,
    // so the test fails on its assertion rather than on the build.
    const loaders = import.meta.glob('../../src/lib/rateLimitCopy.ts')
    const loader = Object.values(loaders)[0]
    expect(loader, 'src/lib/rateLimitCopy.ts must exist').toBeDefined()
    const { rateLimitMessage } = (await loader()) as {
      rateLimitMessage: (seconds: number | null) => string
    }

    expect(rateLimitMessage(120)).toBe('Too many requests right now. Try again in about 2 minutes.')
    expect(rateLimitMessage(61)).toBe('Too many requests right now. Try again in about 2 minutes.')
    expect(rateLimitMessage(1)).toBe('Too many requests right now. Try again in about 1 minute.')
    expect(rateLimitMessage(null)).toBe('Too many requests right now. Try again in a few minutes.')
  })

  it('a 429 with Retry-After exposes retryAfterSeconds and the RATE_LIMITED code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ success: false, error: 'Rate limit exceeded', code: 'RATE_LIMITED' }),
            { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '120' } },
          ),
      ),
    )
    const { apiClient } = await import('@/services/client')

    const error = await apiClient.request('/catalog/programs/', { retries: 0 }).then(
      () => null,
      (caught: unknown) => caught,
    )

    expect(error).toMatchObject({ code: 'RATE_LIMITED', retryAfterSeconds: 120 })
  })

  /**
   * A source-shape check, in the style of the repo's dashboard guards: the
   * dashboard builds its three error strings inline, and the rate-limited case
   * must go through the shared copy instead of the raw message.
   */
  it('the student dashboard builds rate-limited errors from rateLimitMessage', () => {
    const source = readFileSync(
      resolve(__dirname, '../../src/pages/student/Dashboard.tsx'),
      'utf8',
    )
    expect(source).toMatch(/from '@\/lib\/rateLimitCopy'/)
    expect(source).toContain('RATE_LIMITED')
    expect(source).toContain('rateLimitMessage(')
  })
})
