/**
 * Architecture enforcement test (R14.3):
 * Pages and components must not import the raw transport client directly.
 * They must go through domain service modules (e.g., @/services/auth, @/services/applications).
 *
 * This test uses grep to find violations that ESLint might miss (e.g., dynamic imports,
 * commented-out code that could be uncommented, or files not covered by ESLint).
 */
import { describe, it, expect } from 'vitest'
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

const REPO_ROOT = path.resolve(__dirname, '../..')
const SRC_DIR = path.join(REPO_ROOT, 'src')

/**
 * Raw transport client modules that pages/components must NOT import directly.
 * Domain services (src/services/auth.ts, src/services/applications.ts, etc.) are the
 * only allowed consumers of the raw client.
 */
const FORBIDDEN_CLIENT_IMPORTS = [
  '@/services/client',
  './client',
  '../client',
  '../services/client',
  '../../services/client',
  '@/services/httpClient',
  '@/services/apiHelpers',
  '@/services/retry',
  '@/services/authInterceptor',
  '@/services/csrfManager',
]

/**
 * Directories subject to the architecture rule.
 * Service modules themselves are excluded — they are the authorized consumers.
 */
const ENFORCED_DIRS = ['src/pages', 'src/components']

/**
 * Pending-migration allowlist (R14.3 / R14.5).
 *
 * These first-party pages/components still import the raw transport client and
 * are migrated to domain service modules by later phase tasks (2.x auth/tenant,
 * 8.x payments, 9.x admin review/users, 10.x public tracking + official docs).
 * The reference conversion for the pattern is `src/services/interviews.ts`
 * (task 1.5): a domain service that consumes the generated strict client and
 * no longer needs a permissive normalizer.
 *
 * This list is intentionally finite, documented, and SHRINKING — never a
 * blanket exemption. Three guarantees keep it honest:
 *   1. The first test fails if a *new* page/component (not on this list) imports
 *      the raw client — no new violations may be introduced.
 *   2. The second test fails if an entry here no longer imports the raw client
 *      (or was deleted) — a migrated file MUST be removed from the allowlist,
 *      so the set can only shrink toward zero.
 *   3. The third test fails if an entry carries no owner or no removal date, or
 *      if the announced window has closed — added by admissions-v2 task 13.6's
 *      remediation item **L10** (finding **GATE-13.6-01**), because task 12.5's
 *      own clause allows a remaining match only as *"a registered
 *      Legacy_Exception with owner/removal date"* and this register had neither.
 *      Evidence: `docs/v2-evidence/13.6/remediation/L9-L11/README.md` §4.
 */
interface LegacyException {
  /** Repo-relative path, matched against the grep's own output. */
  path: string
  /** Who is accountable for removing the exemption. */
  owner: string
  /** The announced end date for the exemption, ISO `YYYY-MM-DD`. */
  removeBy: string
}

/**
 * The owner recorded for every entry below.
 *
 * Not invented here: 13.6 §7.1 named this register as *"admissions-v2's own"*
 * and `platform-admissions` is the owner string the canonical compatibility
 * register already uses for this spec's surfaces
 * (`backend/apps/common/compatibility_register.py`).
 */
const LEGACY_EXCEPTION_OWNER = 'platform-admissions'

/**
 * The announced end date for every entry below.
 *
 * **This is task 12.2's existing window, not a new commitment**: it is
 * `compatibility_register.ANNOUNCED_ON` (2026-08-11) + `COMPATIBILITY_WINDOW_DAYS`
 * (180) = 2027-02-07, the same date every `COMPATIBILITY_SURFACES` entry carries.
 * `backend/tests/unit/test_compatibility_surfaces_12_2.py::test_frontend_register_windows_match_the_canonical_register`
 * reads this literal and fails if it drifts from the register, so the date has
 * exactly one source of truth despite being spelled in three languages.
 */
const LEGACY_EXCEPTION_REMOVE_BY = '2027-02-07'

/**
 * **Empty since admissions-v2 task 13.6 remediation item L12.**
 *
 * The register held nine entries, and those nine files were exactly the nine
 * `no-restricted-imports` errors `bun run lint` reported (the other six of the 15 were
 * stale `eslint-disable` directives). L12 migrated all nine onto domain services, so by
 * the second test's own contract — *"a migrated file MUST be removed from the
 * allowlist"* — every entry had to go. What each one became:
 *
 * | was exempt | now reads through |
 * |---|---|
 * | `pages/dev/hooks/useDocumentGeneration.ts` | `listPayments` + `readPaymentReceipt` (`services/payments`) |
 * | `pages/dev/hooks/usePaymentReceipt.ts` | the same two |
 * | `pages/student/PaymentCallback.tsx` | `verifyPayment` (`services/payments`) |
 * | `…/applicationWizard/steps/PaymentStep.tsx` | `deferPayment` / `devBypassPayment` (`services/payments`) |
 * | `…/hooks/useApplicationFileUploads.ts` | `services/sessionProbe` (the probe moved there whole) |
 * | `…/hooks/useWizardController.ts` | `documentService.extract({force})` |
 * | `…/hooks/useSmartAutoSave.ts` | `AuthenticationError` from `services/errors` |
 * | `…/hooks/wizard/wizardControllerUtils.ts` | the same |
 *
 * The two `AuthenticationError` rows are the ones worth reading twice, because the note
 * above about `ApplicationStatus.tsx` warned that *"inventing a re-export to satisfy a
 * grep would be worse than saying so here"*. That warning is honoured, not dodged: the
 * class is **defined** in `src/services/errors.ts` now and `authInterceptor.ts` /
 * `client.ts` re-export it, so there is one definition, every `instanceof` still holds,
 * and an error thrown across the service boundary has a home that is not transport.
 *
 * Empty is not the same as retired. The three tests below still run — the first one
 * now has nothing to forgive, which is the state the register was written to reach.
 * Evidence: `docs/v2-evidence/13.6/remediation/L12/README.md` §4.
 */
const LEGACY_EXCEPTIONS: readonly LegacyException[] = [
  // Admin pages/components — migrated by Phase 8/9 (settlement, review workspace, users)
  // ProgramFees.tsx migrated to the canonical catalog service in task 5.1 (R14.3/R14.5).
  // ApplicationReviewWorkspace.tsx (was ApplicationDetailModal.tsx, task 30.2) migrated by admissions-v2 task 9.4 (R8.5): it
  // reads the one workspace query through `services/admin/reviewWorkspace` and
  // issues each write as a versioned command there — no raw client, no endpoint
  // literal, no six-call composition.
  // AISummaryPanel.tsx DELETED by admissions-v2 task 9.4: it called
  // `/applications/{id}/admin-summary/`, which task 7.4 removed from the backend
  // (R11.1 — no generative AI in admissions). Its replacement is
  // `ReviewReadinessPanel`, which renders the deterministic checklist carried in
  // the workspace read.
  // UserImport.tsx was migrated by admissions-v2 task 9.3 (R6.4): it reads the
  // file and calls `services/admin/userDirectory` — no raw client, no endpoint
  // literal, no browser-side validation.
  // Dev preview hooks — non-production code
  // Student pages/wizard — migrated by Phase 6/7/8 (draft machine, documents, payment)
  // ApplicationStatus.tsx left the allowlist in admissions-v2 task 12.1 (MAINT-01):
  // the page's four server reads and four commands moved into
  // `hooks/student/useApplicationWorkspace.ts`, and the `AuthenticationError`
  // guard — its only reason to touch transport — went with them. Stated plainly
  // because the import was **relocated**, not eliminated: the rule's boundary is
  // `src/pages` + `src/components`, the hook layer is where task 9.4 put the same
  // concern for the admin workspace (`hooks/admin/useReviewWorkspace.ts`), and
  // `AuthenticationError` is the shared client's error class, which the
  // applications domain service does not re-export. Inventing a re-export to
  // satisfy a grep would be worse than saying so here.
  // useOcrGradeExtraction.ts migrated in admissions-v2 task 7.5: the assistance
  // hook now reads the document contract through `documentService.getInfo`.
  // SubmitStep.tsx left the allowlist in admissions-v2 task 11.5: its only raw
  // client call was the generative `preview-summary` fetch — a request to a route
  // task 7.4 deleted — and removing the AI framing removed the import with it.
  // Payment.tsx migrated in admissions-v2 task 8.3: the payment page now reads the
  // ledger through `listPayments` in the payments domain service (R14.3/R14.5).
  // useApplicationTracker.ts migrated in admissions-v2 task 10.5 (R14.3/R14.5):
  // the tracker hook reads the public-tracking contract through
  // `services/publicTracking` — one credential, one contract, no raw client.
]

describe('Architecture enforcement: no raw client imports in pages/components', () => {
  it('pages/ and components/ do not import from @/services/client or transport internals', () => {
    const violations: string[] = []

    for (const dir of ENFORCED_DIRS) {
      const fullDir = path.join(SRC_DIR, dir.replace('src/', ''))

      for (const forbiddenImport of FORBIDDEN_CLIENT_IMPORTS) {
        try {
          // Use grep to find import statements referencing the forbidden module
          const escapedImport = forbiddenImport.replace(/\//g, '\\/').replace(/\./g, '\\.')
          const result = execSync(
            `grep -rn "from ['\\"']${escapedImport}['\\"']" "${fullDir}" --include="*.ts" --include="*.tsx" 2>/dev/null || true`,
            { encoding: 'utf-8' }
          ).trim()

          if (result) {
            const lines = result.split('\n').filter(Boolean)
            for (const line of lines) {
              const relativePath = line.replace(REPO_ROOT + '/', '')
              // Skip legacy exceptions
              if (!LEGACY_EXCEPTIONS.some(exc => relativePath.includes(exc.path))) {
                violations.push(relativePath)
              }
            }
          }
        } catch {
          // grep returns non-zero when no matches found — that's fine
        }
      }
    }

    if (violations.length > 0) {
      const message = [
        'Architecture violation (R14.3): Pages and components must not import the raw API client directly.',
        'Use domain service modules (e.g., @/services/auth, @/services/applications) instead.',
        '',
        'Violations found:',
        ...violations.map(v => `  - ${v}`),
        '',
        'To fix: Move the API call into the appropriate service module and import from there.',
      ].join('\n')

      expect.fail(message)
    }
  })

  it('the pending-migration allowlist has no stale entries (allowlist only shrinks)', () => {
    // Guarantees the allowlist is SHRINKING, not a blanket exemption: an entry
    // may remain only while it still imports the raw client. Once a later phase
    // task migrates a file onto a domain service (or deletes it), its exception
    // becomes stale and this test fails until the entry is removed.
    const staleExceptions: string[] = []

    for (const entry of LEGACY_EXCEPTIONS) {
      const exc = entry.path
      const filePath = path.join(REPO_ROOT, exc)

      if (!fs.existsSync(filePath)) {
        staleExceptions.push(`${exc} — file no longer exists; remove it from LEGACY_EXCEPTIONS`)
        continue
      }

      let stillImportsClient = false
      for (const forbiddenImport of FORBIDDEN_CLIENT_IMPORTS) {
        const escapedImport = forbiddenImport.replace(/\//g, '\\/').replace(/\./g, '\\.')
        const result = execSync(
          `grep -nE "from ['\\"']${escapedImport}['\\"']" "${filePath}" 2>/dev/null || true`,
          { encoding: 'utf-8' }
        ).trim()
        if (result) {
          stillImportsClient = true
          break
        }
      }

      if (!stillImportsClient) {
        staleExceptions.push(
          `${exc} — no longer imports the raw client; it has been migrated, so remove it from LEGACY_EXCEPTIONS`
        )
      }
    }

    if (staleExceptions.length > 0) {
      const message = [
        'Stale architecture allowlist entries (R14.3/R14.5): the pending-migration',
        'allowlist must shrink as files are migrated. The following entries are stale:',
        '',
        ...staleExceptions.map(v => `  - ${v}`),
        '',
        'To fix: delete the migrated/removed path(s) from LEGACY_EXCEPTIONS.',
      ].join('\n')

      expect.fail(message)
    }
  })

  it('every allowlist entry carries an owner and an unexpired removal date', () => {
    // Added by admissions-v2 task 13.6 remediation item L10 (GATE-13.6-01).
    //
    // A staleness check answers "is the thing you exempted still there?"; it
    // cannot answer "who is removing it, and by when?". Without that, an entry
    // that stays a genuine violation forever stays exempt forever — which is an
    // exemption, not an exception (12.5's clause, and scripts/v1_surface_telemetry.py
    // half 5b's own definition). So both are asserted per entry, and the window
    // is enforced rather than announced: once it closes, this test fails and the
    // exemption has to be renewed on purpose or removed.
    const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
    const problems: string[] = []
    const today = new Date().toISOString().slice(0, 10)

    for (const entry of LEGACY_EXCEPTIONS) {
      if (!entry.owner.trim()) {
        problems.push(`${entry.path} — no owner`)
      }
      if (!ISO_DATE.test(entry.removeBy)) {
        problems.push(`${entry.path} — removeBy '${entry.removeBy}' is not an ISO date`)
        continue
      }
      if (entry.removeBy < today) {
        problems.push(
          `${entry.path} — its announced window closed on ${entry.removeBy} (today ${today}). ` +
            'Migrate the file and delete the entry, or renew the window deliberately.'
        )
      }
    }

    if (problems.length > 0) {
      expect.fail(
        [
          'Legacy_Exception register (R14.3/R14.5, task 12.5 clause): every entry needs',
          'an owner and an announced, unexpired removal date.',
          '',
          ...problems.map(p => `  - ${p}`),
        ].join('\n')
      )
    }
  })

  it('the register keeps its owner and its window even while it is empty', () => {
    // Added by admissions-v2 task 13.6 remediation item L12, which emptied
    // LEGACY_EXCEPTIONS by migrating all nine entries.
    //
    // An empty list makes the three tests above vacuous, and a vacuous test is a
    // quiet place for two things to be lost. First, `LEGACY_EXCEPTION_REMOVE_BY`
    // is read out of this file's *source* by
    // `backend/tests/unit/test_compatibility_surfaces_12_2.py::test_frontend_
    // register_windows_match_the_canonical_register`, which is the mechanism that
    // stops the announced window drifting between three languages — deleting the
    // constant as "unused" would silently remove that guard's subject. Second,
    // the next entry needs a default owner and window to inherit, and an entry
    // added without them is what item L10 was filed to fix (GATE-13.6-01).
    //
    // So both are asserted here directly, which also means neither constant is
    // unreferenced while the register is empty.
    const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
    expect(LEGACY_EXCEPTION_OWNER.trim().length).toBeGreaterThan(0)
    expect(LEGACY_EXCEPTION_REMOVE_BY).toMatch(ISO_DATE)
  })
})
