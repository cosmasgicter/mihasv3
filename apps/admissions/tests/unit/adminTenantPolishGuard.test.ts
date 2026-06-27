import { describe, expect, it } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const SRC_ROOT = path.resolve(__dirname, '../../src')

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(SRC_ROOT, relativePath), 'utf-8')
}

describe('admin tenant polish guard', () => {
  it('keeps settlement data responsive instead of forcing a mobile table scroll', () => {
    const source = readSource('pages/admin/tenants/SettlementPanel.tsx')

    expect(source).toContain('md:hidden')
    expect(source).toContain('role="list"')
    expect(source).toContain('hidden md:block')
    expect(source).not.toContain('overflow-x-auto')
    expect(source).not.toContain('min-w-[32rem]')
  })

  it('keeps tenant onboarding header controls mobile-first', () => {
    const source = readSource('pages/admin/tenants/TenantOnboardingWizard.tsx')

    expect(source).toContain('flex flex-col gap-3 sm:flex-row')
    expect(source).toContain('Back to console')
    expect(source).toContain('w-full sm:w-auto')
  })

  it('keeps the tenant selector empty state flat instead of nesting cards', () => {
    const source = readSource('pages/admin/tenants/TenantListPanel.tsx')

    expect(source).not.toContain('<SectionCard')
    expect(source).toContain('border-dashed')
    expect(source).toContain('No schools have been onboarded yet.')
  })
})
