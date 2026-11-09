/**
 * useOfficialDocument — student-facing official-document action hook.
 *
 * Spec: `multi-tenant-beanola-remediation` Phase 3, Requirement 7. This hook is
 * the single seam the student document components use to drive official
 * downloads/email through the backend (`services/officialDocuments.ts`), so the
 * document a student receives is the authoritative tenant-branded backend
 * record — never a locally rendered `@/lib/pdf` blob (R7.1, R7.3, R7.4).
 *
 * SJR task 3.17 (R5-a): the hook no longer opens anything. `prepare()` asks the
 * platform to make the document and waits for it; `openHref` is then the link to
 * the in-app opener (`/student/documents/open`), which signs at click time. A tab
 * opened in code after a POST, a poll and a GET is a tab the browser blocks, and
 * a URL signed before the student clicks can have expired by the time they do.
 *
 * It maps the backend generation status to the four UI states the design
 * requires (R7.2):
 *
 *   - `Generating` — the initial generate request is in flight.
 *   - `Queued`     — the backend reported `queued`; we are polling for readiness.
 *   - `Ready`      — the backend reported `ready`; the document can be opened.
 *   - `Failed`     — generation failed (or the gate/scope rejected the request);
 *                    a retry affordance is surfaced.
 *
 * The R5 status + payment gates are enforced by the callers (which only render
 * the action when the application status / payment state permits it); the
 * backend additionally 404-masks out-of-scope or not-permitted requests, which
 * this hook degrades to a `Failed` state with a friendly message rather than
 * crashing (R7.5).
 *
 * @module useOfficialDocument
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import { documentOpenHref, OPENABLE_OFFICIAL_TYPES, type OpenableOfficialType } from '@/lib/documentOpen'
import { toError } from '@/lib/toError'
import {
  officialDocumentService,
  type OfficialDocumentGenerationStatus,
  type OfficialDocumentJob,
  type OfficialDocumentStatus,
  type OfficialDocumentType,
} from '@/services/officialDocuments'

/** The UI states the student/admin document surfaces render (R7.2, R7.7). */
export type OfficialDocumentUiState = 'idle' | 'generating' | 'queued' | 'ready' | 'failed' | 'setup_required'

/** Polling cadence while the backend works through a `queued` document. */
export const OFFICIAL_DOC_POLL_INTERVAL_MS = 3_000
/** Bound on poll attempts so a stuck `queued` document degrades to `failed`. */
export const OFFICIAL_DOC_MAX_POLLS = 20

/**
 * Pure mapper from `{ inflight, backendStatus }` to a UI state.
 *
 * Exported so the gating/UI-state tests (task 10.3) can exercise it directly.
 * Precedence: a known terminal/queued backend status wins over the transient
 * in-flight flag, so polling a `queued` document reads as `Queued` (not a
 * flickering `Generating`); only the very first request — before any backend
 * status is known — reads as `Generating`.
 */
export function deriveOfficialDocumentUiState(
  inflight: boolean,
  backendStatus: OfficialDocumentGenerationStatus | null,
  setupRequired = false,
): OfficialDocumentUiState {
  if (setupRequired) return 'setup_required'
  if (backendStatus === 'setup_required') return 'setup_required'
  if (backendStatus === 'ready') return 'ready'
  if (backendStatus === 'failed') return inflight ? 'generating' : 'failed'
  if (backendStatus === 'queued') return inflight ? 'queued' : 'queued'
  // admissions-v2 task 10.4 (R13.11): `not_requested` means nothing is queued.
  // It maps to `idle`/`generating` — never `queued` — because polling it would
  // never end. That is the phantom this status exists to remove.
  if (backendStatus === 'not_requested') return inflight ? 'generating' : 'idle'
  if (inflight) return 'generating'
  return 'idle'
}

const SETUP_REQUIRED_CODES = new Set([
  'DOCUMENT_PROFILE_NOT_CONFIGURED',
  'DOCUMENT_TEMPLATE_NOT_CONFIGURED',
  'DOCUMENT_ASSET_NOT_CONFIGURED',
  'TENANT_DOCUMENT_PROFILE_NOT_CONFIGURED',
  'TENANT_DOCUMENT_TEMPLATE_NOT_CONFIGURED',
  'TENANT_ASSET_NOT_CONFIGURED',
])

function errorCode(error: unknown): string | null {
  const candidate = error as { code?: unknown; data?: { code?: unknown } } | null
  const code = candidate?.code ?? candidate?.data?.code
  return typeof code === 'string' ? code : null
}

export function isOfficialDocumentSetupRequiredError(error: unknown): boolean {
  const code = errorCode(error)
  if (code && SETUP_REQUIRED_CODES.has(code)) return true
  const message = toError(error).message.toUpperCase()
  return (
    message.includes('DOCUMENT_PROFILE_NOT_CONFIGURED') ||
    message.includes('DOCUMENT TEMPLATE') ||
    message.includes('DOCUMENT ASSET') ||
    message.includes('LOGO') ||
    message.includes('SIGNATURE') ||
    message.includes('NOT CONFIGURED')
  )
}

/**
 * The **staff** message for a tenant setup failure. Names the configuration to
 * fix, because the reader can fix it.
 */
export const OFFICIAL_DOCUMENT_SETUP_REQUIRED_MESSAGE =
  'Tenant document setup is incomplete. Configure the document profile, template, logo, and signature before generating this document.'

/**
 * The **student** message for the same failure (admissions-v2 task 10.4, STU-18).
 *
 * STU-18's third clause is "student errors expose tenant setup instructions": the
 * message above was rendered to applicants, telling them to configure a document
 * profile — work only a school operator can do — and disclosing that the school's
 * configuration is incomplete. A student needs to know that the school has been
 * told and that there is a person to ask, which is what
 * `resolveTenantSupportContact({ purpose: 'official_document' })` provides
 * (task 8.3's neutral affordance: never a hardcoded address, and never an
 * example tenant's).
 *
 * The school half of this failure is not dropped — it is delivered to the
 * tenant's own authorized staff as an inbox work item by the renderer
 * (`_alert_staff_of_setup_failure`).
 */
export const OFFICIAL_DOCUMENT_STUDENT_UNAVAILABLE_MESSAGE =
  'This document is not available to download yet. The admissions office has been notified and will make it available.'

/**
 * The student message for a render failure they may retry themselves.
 */
export const OFFICIAL_DOCUMENT_STUDENT_RETRY_MESSAGE =
  'The document could not be prepared. Please try again.'

/**
 * Who the messages are for. The **student** never sees tenant configuration
 * instructions or a retry that cannot work (STU-18); staff see both, because
 * they can act on them.
 */
export type OfficialDocumentAudience = 'student' | 'staff'

export interface UseOfficialDocumentOptions {
  audience?: OfficialDocumentAudience
}

export interface UseOfficialDocumentResult {
  /** The mapped UI state — drives button label / retry affordance. */
  uiState: OfficialDocumentUiState
  /** The raw backend generation status, or `null` before any request. */
  status: OfficialDocumentGenerationStatus | null
  /** True while any generate/poll/email request is in flight. */
  isBusy: boolean
  /** Last error message, or `null`. */
  error: string | null
  /** True when generation failed because tenant document setup is incomplete. */
  isSetupRequired: boolean
  /**
   * The **server's** answer to whether retrying is worth offering (R13.11).
   * A tenant setup failure is not a student's to retry, so the affordance is
   * absent rather than present and futile.
   */
  canRetry: boolean
  /**
   * True when the artifact on offer is the one the platform issued rather than
   * one regenerated from today's application state (read-existing policy).
   */
  isHistorical: boolean
  /** The committed durable job behind the current status, or `null`. */
  job: OfficialDocumentJob | null
  /**
   * Ask the platform to make the document (ensure current) and wait until it is
   * ready. Resolves `true` when it is. It opens nothing: the student opens it
   * with an anchor to {@link UseOfficialDocumentResult.openHref}.
   */
  prepare: () => Promise<boolean>
  /**
   * The in-app opener link once the document is ready, else `null`. Only the
   * four student-openable types have one; no admin control uses it (OS-15).
   */
  openHref: string | null
  /** Email the backend-stored document to the applicant's own address. */
  email: (address?: string) => Promise<boolean>
  /** Clear transient error/state back to idle. */
  reset: () => void
  /**
   * True when the school's missing document profile was learned from a **read**
   * (SJR R7-d), before the student asked for anything. The letter is then "not
   * available yet" rather than a failed attempt, and no Prepare is offered.
   */
  setupKnownFromRead: boolean
  /**
   * Ask the platform, without requesting anything, whether this document is
   * blocked on school setup. Only a `setup_required` answer changes state: every
   * other answer belongs to `useIssuedOfficialDocuments` or to `prepare()`.
   */
  checkSetup: () => Promise<void>
}

/**
 * Drive backend official-document generation, download, and email for one
 * `(applicationId, documentType)` pair.
 */
export function useOfficialDocument(
  applicationId: string,
  documentType: OfficialDocumentType,
  { audience = 'student' }: UseOfficialDocumentOptions = {},
): UseOfficialDocumentResult {
  const [status, setStatus] = useState<OfficialDocumentGenerationStatus | null>(null)
  const [inflight, setInflight] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [setupRequired, setSetupRequired] = useState(false)
  const [job, setJob] = useState<OfficialDocumentJob | null>(null)
  const [historical, setHistorical] = useState(false)
  const [setupKnownFromRead, setSetupKnownFromRead] = useState(false)

  const mountedRef = useRef(true)
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current)
        pollTimerRef.current = null
      }
    }
  }, [])

  /**
   * The message for a non-ready outcome, chosen by audience (STU-18). Staff get
   * the configuration detail; a student gets a neutral sentence, and the caller
   * pairs it with `resolveTenantSupportContact`'s affordance.
   */
  const failureMessage = useCallback(
    (settled: OfficialDocumentGenerationStatus | null): string => {
      if (settled === 'setup_required') {
        return audience === 'staff'
          ? OFFICIAL_DOCUMENT_SETUP_REQUIRED_MESSAGE
          : OFFICIAL_DOCUMENT_STUDENT_UNAVAILABLE_MESSAGE
      }
      return OFFICIAL_DOCUMENT_STUDENT_RETRY_MESSAGE
    },
    [audience],
  )

  /**
   * Record everything one status read said — the status, the durable job, and
   * whether the artifact is a historical read. The client derives none of it.
   */
  const absorb = useCallback(
    (payload: OfficialDocumentStatus | null): OfficialDocumentGenerationStatus | null => {
      const next = payload?.status ?? null
      if (!mountedRef.current) return next
      setStatus(next)
      setJob(payload?.job ?? null)
      setHistorical(Boolean(payload?.historical))
      return next
    },
    [],
  )

  const checkSetup = useCallback(async (): Promise<void> => {
    try {
      const payload = await officialDocumentService.getOfficialDocument(applicationId, documentType)
      if (payload?.status !== 'setup_required' || !mountedRef.current) return
      absorb(payload)
      setSetupKnownFromRead(true)
      setSetupRequired(true)
    } catch {
      // Quiet by design: a failed read leaves the surface as it was, and
      // `prepare()` reports its own errors.
    }
  }, [absorb, applicationId, documentType])

  const reset = useCallback(() => {
    if (!mountedRef.current) return
    setSetupKnownFromRead(false)
    setStatus(null)
    setError(null)
    setSetupRequired(false)
    setJob(null)
    setHistorical(false)
  }, [])

  /**
   * Poll `getOfficialDocument` until the backend reports `ready` or `failed`,
   * or the attempt budget is exhausted. Resolves to the terminal status.
   */
  const pollUntilSettled = useCallback(
    async (): Promise<OfficialDocumentGenerationStatus> => {
      for (let attempt = 0; attempt < OFFICIAL_DOC_MAX_POLLS; attempt += 1) {
        await new Promise<void>((resolve) => {
          pollTimerRef.current = setTimeout(() => resolve(), OFFICIAL_DOC_POLL_INTERVAL_MS)
        })
        if (!mountedRef.current) return 'queued'

        const payload = await officialDocumentService.getOfficialDocument(applicationId, documentType)
        const next = absorb(payload) ?? 'failed'
        // `not_requested` is terminal for a poll: the server is telling us there
        // is no committed job, so waiting longer cannot change the answer
        // (admissions-v2 task 10.4, R13.11).
        if (next !== 'queued') return next
      }
      return 'failed'
    },
    [absorb, applicationId, documentType],
  )

  const prepare = useCallback(async (): Promise<boolean> => {
    if (inflight) return false
    setInflight(true)
    setError(null)
    setSetupRequired(false)
    try {
      const generated = await officialDocumentService.generateOfficialDocument(applicationId, documentType)
      let current: OfficialDocumentGenerationStatus = absorb(generated) ?? 'failed'
      if (current === 'queued') {
        current = await pollUntilSettled()
      }
      if (current !== 'ready') {
        if (mountedRef.current) {
          setSetupRequired(current === 'setup_required')
          setError(failureMessage(current))
        }
        return false
      }
      return true
    } catch (err) {
      if (mountedRef.current) {
        const requiresSetup = isOfficialDocumentSetupRequiredError(err)
        setStatus('failed')
        setSetupRequired(requiresSetup)
        setError(
          requiresSetup
            ? failureMessage('setup_required')
            : toError(err).message || 'Unable to prepare the document',
        )
      }
      return false
    } finally {
      if (mountedRef.current) setInflight(false)
    }
  }, [absorb, applicationId, documentType, failureMessage, inflight, pollUntilSettled])
  const email = useCallback(
    async (address?: string): Promise<boolean> => {
      if (inflight) return false
      setInflight(true)
      setError(null)
      setSetupRequired(false)
      try {
        // Ensure the backend-stored document exists/current before emailing it,
        // so the email attaches the authoritative record, not a local render.
        const generated = await officialDocumentService.generateOfficialDocument(applicationId, documentType)
        let current: OfficialDocumentGenerationStatus = absorb(generated) ?? 'failed'
        if (current === 'queued') {
          current = await pollUntilSettled()
        }
        if (current !== 'ready') {
          if (mountedRef.current) {
            setSetupRequired(current === 'setup_required')
            setError(failureMessage(current))
          }
          return false
        }

        await officialDocumentService.emailOfficialDocument(applicationId, documentType, address)
        return true
      } catch (err) {
        if (mountedRef.current) {
          const requiresSetup = isOfficialDocumentSetupRequiredError(err)
          setStatus('failed')
          setSetupRequired(requiresSetup)
          setError(
            requiresSetup
              ? failureMessage('setup_required')
              : toError(err).message || 'Unable to email the document',
          )
        }
        return false
      } finally {
        if (mountedRef.current) setInflight(false)
      }
    },
    [absorb, applicationId, documentType, failureMessage, inflight, pollUntilSettled],
  )

  const openHref =
    status === 'ready' && (OPENABLE_OFFICIAL_TYPES as readonly string[]).includes(documentType)
      ? documentOpenHref({
          kind: 'official',
          applicationId,
          documentType: documentType as OpenableOfficialType,
        })
      : null
  return {
    uiState: deriveOfficialDocumentUiState(inflight, status, setupRequired),
    status,
    isBusy: inflight,
    error,
    isSetupRequired: setupRequired,
    // The server decides both of these; the client adds no rule of its own.
    canRetry: Boolean(job?.can_retry),
    isHistorical: historical,
    job,
    prepare,
    openHref,
    email,
    reset,
    setupKnownFromRead,
    checkSetup,
  }
}
