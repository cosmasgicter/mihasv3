/**
 * Storage/log secret scan for the tenant staff-invitation flow (task 4.2).
 *
 * Spec: .kiro/specs/admissions-v2-canonical-rebuild task 4.2 (R4.3, R6.3).
 * Findings: TEN-01 (wizard displayed + persisted an operator-set password in
 * localStorage; non-atomic user+membership create) and TEN-05 (raw UUID entry).
 *
 * These are deterministic source-level guards that fail if the fixed flow ever
 * regresses to persisting a password in browser storage, showing an initial
 * password field, or reintroducing raw-UUID staff entry. They are the durable
 * regression proxy for the "storage/log secret scan proving no plaintext
 * password is persisted" evidence.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const src = (p: string) => readFileSync(resolve(here, '../../src', p), 'utf8')

const wizard = src('pages/admin/tenants/TenantOnboardingWizard.tsx')
const staffPanel = src('pages/admin/tenants/TenantStaffPanel.tsx')
const acceptPage = src('pages/auth/AcceptInvitationPage.tsx')

describe('TEN-01: onboarding wizard never persists an invitation password', () => {
  it('invite draft state has no password field', () => {
    // The invite step is email-only; the admin never sets a password.
    expect(wizard).not.toMatch(/inviteDraft[^\n]*password/i)
    expect(wizard).toMatch(/setInviteDraft\(\{ full_name: '', email: '' \}\)/)
  })

  it('no "Initial password" input is rendered on the invite step', () => {
    expect(wizard).not.toMatch(/Initial password/i)
    expect(wizard).not.toMatch(/aria-label="Tenant admin initial password"/)
  })

  it('the localStorage onboarding draft never includes invite input', () => {
    // The persisted draft object must not carry inviteDraft (which previously
    // carried the plaintext password) into browser storage.
    const persistBlock = wizard.slice(
      wizard.indexOf('const draft = {'),
      wizard.indexOf('window.localStorage.setItem(ONBOARDING_DRAFT_KEY'),
    )
    expect(persistBlock).not.toMatch(/inviteDraft/)
    expect(persistBlock).not.toMatch(/password/i)
  })

  it('invite uses the atomic server command, not the fragile two-call flow', () => {
    expect(wizard).toMatch(/tenantAdminService\.inviteStaff\(/)
    // The old flow created a user then a membership across two calls.
    expect(wizard).not.toMatch(/userService\.create\(/)
  })
})

describe('TEN-05: staff panel invites by email search selector, not raw UUID', () => {
  it('uses an accessible candidate search selector', () => {
    expect(staffPanel).toMatch(/searchStaffCandidates/)
    expect(staffPanel).toMatch(/list="tenant-staff-candidates"/)
    expect(staffPanel).toMatch(/<datalist id="tenant-staff-candidates">/)
  })

  it('does not ask the operator to paste a raw profile UUID', () => {
    expect(staffPanel).not.toMatch(/User\/Profile ID/)
    expect(staffPanel).not.toMatch(/placeholder="User\/Profile ID"/)
  })

  it('invites through the atomic server command', () => {
    expect(staffPanel).toMatch(/tenantAdminService\.inviteStaff\(/)
  })
})

describe('R4.3: accept-invitation page is the password handoff', () => {
  it('the invitee sets their own password via the emailed token', () => {
    expect(acceptPage).toMatch(/acceptStaffInvitation\(/)
  })

  it('strips the token from the URL and never persists it to storage', () => {
    expect(acceptPage).toMatch(/history\.replaceState/)
    expect(acceptPage).not.toMatch(/localStorage/)
  })
})
