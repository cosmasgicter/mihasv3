/**
 * Session probe — "is this browser still authenticated?", with one retry.
 *
 * ## Why this is a service and not a wizard hook
 *
 * This is the check the wizard runs immediately before it hands a student's file to
 * storage: an upload that starts against a dead session fails halfway through and
 * loses the file, so the probe exists to turn that into a legible "please sign in
 * again" *before* any bytes move.
 *
 * It lived in `pages/student/applicationWizard/hooks/useApplicationFileUploads.ts` and
 * reached `apiClient` directly, which the R14.3 architecture rule forbids for anything
 * under `src/pages` (`eslint.config.js`; grep twin in
 * `tests/unit/architectureEnforcement.test.ts`). The rule is right and the import was
 * the symptom: a raw `GET /auth/session/` with retry-once semantics is a *transport*
 * concern, and the only reason it sat in a page hook is that it was written there.
 * Moving the behaviour — unchanged, same two calls, same messages — is the cause fix;
 * the hook re-exports these three symbols so its existing callers and property tests
 * are untouched.
 *
 * ## Deliberately not `authService.session()`
 *
 * `services/auth.ts::authService.session()` swallows every failure and returns `null`,
 * which is correct for bootstrap (an anonymous visitor is not an error) and useless
 * here: this caller has to tell *"expired, stop and re-authenticate"* apart from
 * *"the network blinked, carry on"*. So it reads the raw payload and keeps its own
 * error discrimination.
 *
 * Task 13.6 remediation L12. Evidence:
 * `docs/v2-evidence/13.6/remediation/L12/README.md` §4.
 *
 * @module services/sessionProbe
 */

import { extractAuthUser } from '@/lib/authSession'
import { isPermissionDenial } from '@/lib/sessionHardening'

import { apiClient } from './client'

/**
 * Whether `error` means *the session is gone*, as opposed to any other failure.
 *
 * A 403 is the interesting case: a CSRF-invalid 403 is an auth failure the caller can
 * recover from by re-authenticating, while `INSUFFICIENT_PERMISSIONS` is a permission
 * decision the backend meant, so it must **not** be reported as an expired session.
 * `isPermissionDenial` is the shared classifier for that distinction.
 */
export function isAuthError(error: unknown): boolean {
  if (error instanceof Error && error.name === 'AuthenticationError') {
    return true
  }
  const status = (error as { status?: number })?.status
  if (status === 401) return true
  if (status === 403) {
    const code = (error as { code?: string })?.code
    // Permission denials (e.g. INSUFFICIENT_PERMISSIONS) are NOT auth errors
    return !isPermissionDenial(403, code)
  }
  return false
}

export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Confirm the session, retrying once after an auth failure.
 *
 * Returns `true` when an upload may proceed. Two auth failures in a row throw, because
 * the student needs to be told; anything else — a timeout, a dropped connection —
 * returns `true` and lets the upload itself be the thing that reports the network,
 * since failing a probe is not evidence that the upload would fail.
 */
export async function verifySessionWithRetry(): Promise<boolean> {
  try {
    const result = await apiClient.request<unknown>('/auth/session/')
    return !!extractAuthUser(result)
  } catch (error) {
    if (isAuthError(error)) {
      await delay(1000)
      try {
        const retryResult = await apiClient.request<unknown>('/auth/session/')
        return !!extractAuthUser(retryResult)
      } catch (retryError) {
        if (isAuthError(retryError)) {
          throw new Error('Your session has expired. Please sign in again to continue uploading.')
        }
        // Network error on retry — proceed with upload
        return true
      }
    }
    // Network error (not auth) — proceed with upload
    return true
  }
}
