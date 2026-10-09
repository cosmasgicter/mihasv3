/**
 * Public tracking service (admissions-v2 task 10.5, R13.12 / R14.3, STU-22).
 *
 *   GET  /api/v1/applications/track/?code=…             read one status by secret
 *   POST /api/v1/applications/{id}/tracking-link/       issue (and rotate) the link
 *
 * Both calls live here rather than in the tracker page because they are the same
 * domain concern — one credential, one contract — and because R14.3's architecture
 * rule is that a page never reaches for the raw transport. The tracker hook
 * consumed `apiClient` directly before this task.
 *
 * There is no GET for the credential itself. It is stored only as a SHA-256, so no
 * read can return it — which is exactly why acquiring a link is a command. Each
 * issue mints a fresh secret and revokes the previous one, so the response is the
 * one moment the plaintext exists outside the owner's hands.
 *
 * The client must not persist `code` or `url`: they are a credential for the
 * application's public status page, and the owner can always issue another.
 *
 * @module publicTracking
 */
import { logApiError } from '@/lib/apiErrorLogger'
import { apiClient } from './client'

const SERVICE = 'publicTracking'

/**
 * The whole published public-tracking contract — the exact field set
 * `ApplicationTrackingSerializer` sends. Nothing here is applicant PII, and the
 * pre-10.5 `feedback_summary` / `admin_feedback` / `public_tracking_code` /
 * `created_at` fields are deliberately absent (STU-22).
 */
export interface PublicTrackingStatus {
  application_number: string | null
  status: string
  program_name: string | null
  intake_name: string | null
  institution: string | null
  submitted_at: string | null
  updated_at: string | null
}

export interface IssuedTrackingLink {
  /** The tracking secret. `TRK-{selector}-{verifier}`. */
  code: string
  /** Absolute URL, built by the backend from the request's own origin. */
  url: string
  /** Origin-relative path, for in-app links. */
  path: string
  issued_at: string
  /** Whether issuing this link revoked a previously issued one. */
  replaced_previous: boolean
}

/** The envelope shape older callers may still receive (`{application: …}`). */
interface TrackResponse extends Partial<PublicTrackingStatus> {
  application?: Partial<PublicTrackingStatus>
}

export const publicTrackingService = {
  /**
   * Read one application's public status with its tracking secret.
   *
   * Errors are thrown for the caller to map onto the server's stable codes
   * (`TRACKING_SECRET_REQUIRED`, `INVALID_FORMAT`, `NOT_FOUND`, 429) — this
   * service does not invent copy.
   */
  track: async (code: string): Promise<Partial<PublicTrackingStatus> | null> => {
    const endpoint = `/applications/track/?code=${encodeURIComponent(code)}`
    const result = await apiClient.request<TrackResponse>(endpoint)
    return result?.application ?? result ?? null
  },

  /**
   * Issue a public tracking link for an application the signed-in user owns.
   *
   * Rotation is the documented contract, not a side effect: the caller should
   * tell the student that any link they shared earlier stops working.
   */
  issueLink: async (applicationId: string): Promise<IssuedTrackingLink> => {
    const endpoint = `/applications/${applicationId}/tracking-link/`
    try {
      const result = await apiClient.request<IssuedTrackingLink>(endpoint, { method: 'POST' })
      if (!result?.code) {
        throw new Error('tracking link response carried no code')
      }
      return result
    } catch (err) {
      logApiError(SERVICE, endpoint, err)
      throw err
    }
  },
}
