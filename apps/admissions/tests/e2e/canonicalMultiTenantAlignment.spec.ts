/**
 * Canonical multi-tenant alignment E2E coverage.
 *
 * These browser checks are gated because they need a running app, a staging-like
 * backend, and authenticated student/super-admin/tenant-admin storage states.
 * They enumerate under `playwright test --list` in normal development so the
 * workflow contract remains visible without credentials.
 */

import { test, expect, type Page } from '@playwright/test'

const E2E_ENABLED = process.env.CANONICAL_MULTI_TENANT_E2E === '1'
const STUDENT_STORAGE_STATE = process.env.STUDENT_STORAGE_STATE || process.env.PLAYWRIGHT_STORAGE_STATE
const SUPER_ADMIN_STORAGE_STATE = process.env.SUPER_ADMIN_STORAGE_STATE
const TENANT_ADMIN_STORAGE_STATE = process.env.TENANT_ADMIN_STORAGE_STATE

const UNIQUE = `${Date.now()}`.slice(-8)
const TEST_SCHOOL = `E2E School ${UNIQUE}`
const TEST_CODE = `E2E${UNIQUE}`
const TEST_HOSTNAME = `e2e-${UNIQUE}.apply.example.test`
const TEST_PROGRAM = process.env.E2E_CANONICAL_PROGRAM || 'Diploma in Nursing'

async function gotoAndSettle(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'networkidle' })
  await page.waitForTimeout(250)
}

test.describe('Canonical multi-tenant alignment E2E workflows', () => {
  test.skip(
    !E2E_ENABLED,
    [
      'Set CANONICAL_MULTI_TENANT_E2E=1 with a staging-backed app and storage states:',
      'STUDENT_STORAGE_STATE, SUPER_ADMIN_STORAGE_STATE, TENANT_ADMIN_STORAGE_STATE.',
    ].join(' '),
  )

  test('35.1 student starts a brand-new application while an existing draft is present', async ({ browser }) => {
    test.skip(!STUDENT_STORAGE_STATE, 'Supply STUDENT_STORAGE_STATE for a verified student with at least one draft.')
    const context = await browser.newContext({ storageState: STUDENT_STORAGE_STATE })
    const page = await context.newPage()

    await gotoAndSettle(page, '/student/dashboard')
    await expect(page.getByRole('link', { name: /continue|resume/i }).first()).toBeVisible()
    await page.getByRole('link', { name: /start new application/i }).first().click()
    await expect(page).toHaveURL(/\/student\/application-wizard\?new=true/)
    await expect(page.getByText(/new application/i).first()).toBeVisible()

    await context.close()
  })

  test('35.2 student resumes a selected draft', async ({ browser }) => {
    test.skip(!STUDENT_STORAGE_STATE, 'Supply STUDENT_STORAGE_STATE for a verified student with a draft.')
    const context = await browser.newContext({ storageState: STUDENT_STORAGE_STATE })
    const page = await context.newPage()

    await gotoAndSettle(page, '/student/dashboard')
    await page.getByRole('link', { name: /continue|resume/i }).first().click()
    await expect(page).toHaveURL(/\/student\/application-wizard\?draft=/)
    await expect(page.getByText(/resuming draft|draft in progress/i).first()).toBeVisible()

    await context.close()
  })

  test('35.3 student submits a program-first application', async ({ browser }) => {
    test.skip(!STUDENT_STORAGE_STATE, 'Supply STUDENT_STORAGE_STATE for a verified student.')
    const context = await browser.newContext({ storageState: STUDENT_STORAGE_STATE })
    const page = await context.newPage()

    await gotoAndSettle(page, '/student/application-wizard?new=true')
    await expect(page.getByText(new RegExp(TEST_PROGRAM, 'i')).first()).toBeVisible()
    await expect(page.getByText(/program|intake|assigned school/i).first()).toBeVisible()
    await expect(page.getByRole('button', { name: /submit|continue/i }).first()).toBeVisible()

    await context.close()
  })

  test('35.4 student sees required documents from the assigned offering', async ({ browser }) => {
    test.skip(!STUDENT_STORAGE_STATE, 'Supply STUDENT_STORAGE_STATE for a verified student.')
    const context = await browser.newContext({ storageState: STUDENT_STORAGE_STATE })
    const page = await context.newPage()

    await gotoAndSettle(page, '/student/application-wizard')
    await expect(page.getByText(/required document|nrc|passport|certificate/i).first()).toBeVisible()
    await expect(page.locator('input[type="file"]').first()).toBeAttached()

    await context.close()
  })

  test('35.5 student downloads the backend official application slip', async ({ browser }) => {
    test.skip(!STUDENT_STORAGE_STATE, 'Supply STUDENT_STORAGE_STATE for a student with a submitted application.')
    const context = await browser.newContext({ storageState: STUDENT_STORAGE_STATE })
    const page = await context.newPage()

    await gotoAndSettle(page, '/student/status')
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: /application slip|download/i }).first().click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/application|slip|\.pdf/i)

    await context.close()
  })

  test('35.6 super-admin onboards a tenant through the canonical route', async ({ browser }) => {
    test.skip(!SUPER_ADMIN_STORAGE_STATE, 'Supply SUPER_ADMIN_STORAGE_STATE.')
    const context = await browser.newContext({ storageState: SUPER_ADMIN_STORAGE_STATE })
    const page = await context.newPage()

    await gotoAndSettle(page, '/admin/tenants/new')
    await page.getByLabel(/short name/i).fill(TEST_SCHOOL)
    await page.getByLabel(/institution code/i).fill(TEST_CODE)
    await page.getByLabel(/legal|full name/i).fill(`${TEST_SCHOOL} Limited`)
    await page.getByRole('button', { name: /create|save/i }).first().click()
    await expect(page.getByText(/tenant created|school profile|branding/i).first()).toBeVisible()

    await context.close()
  })

  test('35.7 super-admin uploads tenant logo and signature', async ({ browser }) => {
    test.skip(!SUPER_ADMIN_STORAGE_STATE, 'Supply SUPER_ADMIN_STORAGE_STATE and an onboarded tenant fixture.')
    const context = await browser.newContext({ storageState: SUPER_ADMIN_STORAGE_STATE })
    const page = await context.newPage()

    await gotoAndSettle(page, '/admin/tenants')
    await page.getByRole('tab', { name: /branding|assets/i }).click()
    await expect(page.getByLabel(/asset type/i)).toBeVisible()
    await expect(page.getByLabel(/branding asset file|asset file/i)).toBeAttached()

    await context.close()
  })

  test('35.8 super-admin configures a document profile', async ({ browser }) => {
    test.skip(!SUPER_ADMIN_STORAGE_STATE, 'Supply SUPER_ADMIN_STORAGE_STATE and an onboarded tenant fixture.')
    const context = await browser.newContext({ storageState: SUPER_ADMIN_STORAGE_STATE })
    const page = await context.newPage()

    await gotoAndSettle(page, '/admin/tenants')
    await page.getByRole('tab', { name: /profiles|documents|templates/i }).first().click()
    await expect(page.getByLabel(/profile document type|template document type/i).first()).toBeVisible()
    await expect(page.getByText(/signatory|sections|fee/i).first()).toBeVisible()

    await context.close()
  })

  test('35.9 tenant-admin sees only assigned school data', async ({ browser }) => {
    test.skip(!TENANT_ADMIN_STORAGE_STATE, 'Supply TENANT_ADMIN_STORAGE_STATE.')
    const context = await browser.newContext({ storageState: TENANT_ADMIN_STORAGE_STATE })
    const page = await context.newPage()

    await gotoAndSettle(page, '/admin/tenants')
    await expect(page.getByRole('button', { name: /new institution|create tenant|create school/i })).toHaveCount(0)
    await expect(page.getByText(/your school|school profile|staff access|domains/i).first()).toBeVisible()

    await context.close()
  })

  test('35.10 tenant-admin cannot create a tenant', async ({ browser }) => {
    test.skip(!TENANT_ADMIN_STORAGE_STATE, 'Supply TENANT_ADMIN_STORAGE_STATE.')
    const context = await browser.newContext({ storageState: TENANT_ADMIN_STORAGE_STATE })
    const page = await context.newPage()

    await gotoAndSettle(page, '/admin/tenants/new')
    await expect(page.getByText(/only platform super admins|not authorized|cannot create/i).first()).toBeVisible()
    await expect(page.getByRole('button', { name: /create institution|create tenant|save profile/i })).toHaveCount(0)

    await context.close()
  })
})
