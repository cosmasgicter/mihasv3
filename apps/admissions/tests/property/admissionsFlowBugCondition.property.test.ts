/**
 * Bug Condition Exploration — Admissions Flow Bugs
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9**
 *
 * These tests encode the EXPECTED (fixed) behavior. They MUST FAIL on
 * unfixed code — failure confirms the bugs exist.
 */
import React, { act } from 'react'
import { describe, it, expect, vi } from 'vitest'
import * as fc from 'fast-check'
import { createRoot, type Root } from 'react-dom/client'
import * as fs from 'fs'
import * as path from 'path'

// ---------------------------------------------------------------------------
// Bug 1 — Auth failure stops retries
// ---------------------------------------------------------------------------
describe('[PBT] Bug 1 — Auth failure immediately stops retries', () => {
  it('useAutoSave source contains AuthenticationError handling', () => {
    const hookPath = path.resolve(__dirname, '../../src/hooks/useAutoSave.ts')
    const source = fs.readFileSync(hookPath, 'utf-8')
    expect(source).toMatch(/AuthenticationError/)
    expect(source).toMatch(/import.*AuthenticationError.*from/)
  })

  it('useAutoSave sets session-expired message', () => {
    const hookPath = path.resolve(__dirname, '../../src/hooks/useAutoSave.ts')
    const source = fs.readFileSync(hookPath, 'utf-8')
    expect(/SESSION_EXPIRED/i.test(source)).toBe(true)
  })

  it('property: instanceof AuthenticationError check exists', () => {
    const hookPath = path.resolve(__dirname, '../../src/hooks/useAutoSave.ts')
    const source = fs.readFileSync(hookPath, 'utf-8')
    fc.assert(
      fc.property(
        fc.constantFrom('instanceof AuthenticationError', 'AuthenticationError'),
        (pattern) => { expect(source).toContain(pattern) }
      ),
      { numRuns: 2 }
    )
  })
})

// ---------------------------------------------------------------------------
// Bug 2 — Phone normalization
// ---------------------------------------------------------------------------
describe('[PBT] Bug 2 — Phone with spaces normalized, placeholder no spaces', () => {
  it('Zod schema accepts spaced phone and strips spaces', async () => {
    const { wizardSchema } = await import('@/pages/student/applicationWizard/types')
    const input = {
      full_name: 'Test User',
      nrc_number: '123456/78/9',
      date_of_birth: '2000-01-01',
      sex: 'Male' as const,
      phone: '+260 97 123 4567',
      email: 'test@example.com',
      residence_town: 'Lusaka',
      program: 'any-program',
      intake: 'any-intake',
    }
    const result = wizardSchema.safeParse(input)
    if (!result.success) {
      fs.writeFileSync(
        path.resolve(__dirname, '../../zod-debug.txt'),
        JSON.stringify(result.error.issues, null, 2)
      )
    }
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.phone).toBe('+260971234567')
    }
  })

  it('BasicKycStep placeholder matches no-spaces format', () => {
    const basicKycPath = path.resolve(
      __dirname, '../../src/pages/student/applicationWizard/steps/BasicKycStep.tsx'
    )
    const source = fs.readFileSync(basicKycPath, 'utf-8')
    const placeholderMatch = source.match(/register\('phone'\)[\s\S]*?placeholder="([^"]+)"/)
    expect(placeholderMatch).toBeTruthy()
    const placeholder = placeholderMatch![1]
    const phoneInPlaceholder = placeholder.replace(/^e\.g\.,?\s*/, '')
    expect(phoneInPlaceholder).toMatch(/^\+260\d{9}$/)
  })

  it('property: spaced Zambian phones are accepted by Zod schema', async () => {
    const { wizardSchema } = await import('@/pages/student/applicationWizard/types')
    const arbPrefix = fc.constantFrom('97', '96', '95', '77', '76', '75')
    const arbDigit = fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9')
    const arbSevenDigits = fc.tuple(
      arbDigit, arbDigit, arbDigit, arbDigit, arbDigit, arbDigit, arbDigit
    ).map(ds => ds.join(''))
    const arbSpacedPhone = fc.tuple(arbPrefix, arbSevenDigits).map(
      ([prefix, digits]) => '+260 ' + prefix + ' ' + digits.slice(0, 3) + ' ' + digits.slice(3)
    )
    await fc.assert(
      fc.asyncProperty(arbSpacedPhone, async (spacedPhone) => {
        const input = {
          full_name: 'Test User',
          nrc_number: '123456/78/9',
          date_of_birth: '2000-01-01',
          sex: 'Male' as const,
          phone: spacedPhone,
          email: 'test@example.com',
          residence_town: 'Lusaka',
          program: 'any-program',
          intake: 'any-intake',
        }
        const result = wizardSchema.safeParse(input)
        expect(result.success).toBe(true)
        if (result.success) { expect(result.data.phone).not.toContain(' ') }
      }),
      { numRuns: 10 }
    )
  })
})

// ---------------------------------------------------------------------------
// Bug 3 — Dev payment bypass
// ---------------------------------------------------------------------------
describe('[PBT] Bug 3 — Dev payment bypass button in development mode', () => {
  it('PaymentStep source contains dev bypass logic', () => {
    const paymentStepPath = path.resolve(
      __dirname, '../../src/pages/student/applicationWizard/steps/PaymentStep.tsx'
    )
    const source = fs.readFileSync(paymentStepPath, 'utf-8')
    const hasDevBypassCheck =
      source.includes('VITE_PAYMENT_DEV_BYPASS') ||
      source.includes('devBypass') ||
      source.includes('isDevBypass')
    expect(hasDevBypassCheck).toBe(true)
  })

  it('PaymentStep source contains a bypass/simulate button element', () => {
    const paymentStepPath = path.resolve(
      __dirname, '../../src/pages/student/applicationWizard/steps/PaymentStep.tsx'
    )
    const source = fs.readFileSync(paymentStepPath, 'utf-8')
    const hasBypassButton =
      /[Bb]ypass/i.test(source) ||
      /[Ss]imulate\s*[Pp]ayment/i.test(source) ||
      /dev-bypass/i.test(source)
    expect(hasBypassButton).toBe(true)
  })

  it('property: PaymentStep dev bypass is gated on env checks', () => {
    const paymentStepPath = path.resolve(
      __dirname, '../../src/pages/student/applicationWizard/steps/PaymentStep.tsx'
    )
    const source = fs.readFileSync(paymentStepPath, 'utf-8')
    fc.assert(
      fc.property(
        fc.constantFrom('import.meta.env.DEV', 'VITE_PAYMENT_DEV_BYPASS'),
        (envCheck) => { expect(source).toContain(envCheck) }
      ),
      { numRuns: 2 }
    )
  })
})

// ---------------------------------------------------------------------------
// Bug 4 — Admin draft/not_paid controls
// ---------------------------------------------------------------------------
describe('[PBT] Bug 4 — Admin controls for draft and not_paid states', () => {
  let container: HTMLDivElement
  let root: Root

  function setup(): void {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  }

  function teardown(): void {
    act(() => { root.unmount() })
    document.body.removeChild(container)
  }

  it('renders "Force Submit" for draft status', async () => {
    const { ApplicationApprovalActions } = await import(
      '@/components/admin/applications/ApplicationApprovalActions'
    )
    setup()
    act(() => {
      root.render(
        React.createElement(ApplicationApprovalActions, {
          applicationId: 'app-123',
          currentStatus: 'draft',
          currentPaymentStatus: 'not_paid',
          onStatusUpdate: vi.fn(),
          onPaymentStatusUpdate: vi.fn(),
        })
      )
    })
    const allButtons = container.querySelectorAll('button')
    const forceSubmitButton = Array.from(allButtons).find(
      (btn) => btn.textContent?.toLowerCase().includes('force submit')
    )
    expect(forceSubmitButton).toBeTruthy()
    teardown()
  })

  it('renders "Mark as Paid" for not_paid payment status', async () => {
    const { ApplicationApprovalActions } = await import(
      '@/components/admin/applications/ApplicationApprovalActions'
    )
    setup()
    act(() => {
      root.render(
        React.createElement(ApplicationApprovalActions, {
          applicationId: 'app-123',
          currentStatus: 'submitted',
          currentPaymentStatus: 'not_paid',
          onStatusUpdate: vi.fn(),
          onPaymentStatusUpdate: vi.fn(),
        })
      )
    })
    const allButtons = container.querySelectorAll('button')
    const markAsPaidButton = Array.from(allButtons).find(
      (btn) => btn.textContent?.toLowerCase().includes('mark as paid')
    )
    expect(markAsPaidButton).toBeTruthy()
    teardown()
  })

  it('property: draft status always has Force Submit button', async () => {
    const { ApplicationApprovalActions } = await import(
      '@/components/admin/applications/ApplicationApprovalActions'
    )
    const arbPaymentStatus = fc.constantFrom('not_paid', 'pending_review')
    fc.assert(
      fc.property(arbPaymentStatus, (paymentStatus) => {
        setup()
        act(() => {
          root.render(
            React.createElement(ApplicationApprovalActions, {
              applicationId: 'test-app-id',
              currentStatus: 'draft',
              currentPaymentStatus: paymentStatus,
              onStatusUpdate: vi.fn(),
              onPaymentStatusUpdate: vi.fn(),
            })
          )
        })
        const allButtons = container.querySelectorAll('button')
        const forceSubmitButton = Array.from(allButtons).find(
          (btn) => btn.textContent?.toLowerCase().includes('force submit')
        )
        expect(forceSubmitButton).toBeTruthy()
        teardown()
      }),
      { numRuns: 2 }
    )
  })
})
