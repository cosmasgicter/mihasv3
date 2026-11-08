/**
 * useOcrGradeExtraction — polls for the backend's DETERMINISTIC grade candidates
 * after a result-slip upload and holds them as unconfirmed suggestions.
 *
 * Spec:         `.kiro/specs/admissions-v2-canonical-rebuild/` task 7.5.
 * Requirements: R11.4 — "STUDENTS SHALL enter grades manually. Optional local OCR
 *               MAY propose subject and grade candidates against a versioned
 *               alias catalogue, but candidates SHALL include
 *               provenance/confidence and require EXPLICIT CONFIRMATION before
 *               they become application data."
 * Findings:     STU-06, STU-07.
 *
 * What changed at 7.5, and why
 * ----------------------------
 * This hook used to read `ai_analysis` off the document and call
 * `onGradesExtracted(...)` the moment it found anything — the grid was populated
 * before the student had seen, let alone agreed to, a single value. "It only
 * fills empty slots" limited the damage but did not make it a choice.
 *
 * Now the hook only *holds* candidates. Applying them is a separate, explicit
 * action the student takes (`EducationStep`'s confirmation panel), and the
 * candidates it hands over are exactly the ones the student selected. It also no
 * longer does any client-side subject matching: identity is resolved on the
 * server through the task-7.1 versioned alias catalogue, so there is one mapping,
 * not two that can disagree.
 *
 * Resilience guarantees (unchanged):
 * - never blocks the wizard; every failure is silent and leaves manual entry intact
 * - stops polling on unmount, navigation, or timeout
 * - uses refs for callbacks/values to avoid stale closures
 * - validates every field of the server payload before use
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { documentService } from '@/services/documents'
import { logger } from '@/lib/logger'
import { isCanonicalSubjectId } from '@/lib/canonicalSubjectId'
import { retryAfterOf } from '@/lib/rateLimitCopy'

/** One deterministic suggestion. Mirrors the backend `GradeCandidate` shape. */
export interface OcrGradeCandidate {
  subject_id: string
  subject_code: string
  subject_name: string
  grade: number
  /** 0..1 — the server's deterministic confidence, never a model score. */
  confidence: number
  /** `canonical` = printed name/code matched exactly; `alias` = resolved via the catalogue. */
  match: 'canonical' | 'alias'
  matched_alias: string | null
  /** 1-based line of the OCR text the value came from. */
  source_line: number
  source_text: string
  provenance: string
  raw_label: string
}

/** Candidates the server resolved but will not offer pre-selected. */
export interface OcrWithheldCandidate {
  raw_label: string
  grade: number | null
  status: 'low_confidence' | 'unresolved' | 'duplicate' | 'invalid_grade'
  subject_name: string | null
  confidence: number
  source_line: number
}

export interface OcrExtractionMeta {
  examNumber: string | null
  year: string | null
  parserVersion: string | null
  catalogVersion: string | null
  meanConfidence: number
}

export interface MatchedGrade {
  subject_id: string
  grade: number
}

interface DocumentInfo {
  id: string
  extracted_text: boolean
  verification_status?: string | null
  ocr_state?: string | null
  extraction?: unknown
}

/**
 * Delay before each poll (SJR R3-c, clause 2.15): at most 10 polls, about 106 s in
 * all, which covers a 60 s worker cold start. Each poll is one request with no
 * client-level retry, so the document read budget is spent predictably.
 */
export const OCR_POLL_DELAYS_MS = [2000, 3000, 5000, 8000, 13000, 15000, 15000, 15000, 15000, 15000]
const MAX_POLLS = OCR_POLL_DELAYS_MS.length
const POST_EXTRACTION_GRACE_POLLS = 3

const WITHHELD_STATUSES = new Set(['low_confidence', 'unresolved', 'duplicate', 'invalid_grade'])

function isValidEczGrade(grade: unknown): grade is number {
  return typeof grade === 'number' && Number.isInteger(grade) && grade >= 1 && grade <= 9
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

/**
 * Split the server payload into confirmable candidates and withheld rows.
 *
 * Defensive on purpose: a candidate is only offered when it carries a canonical
 * server-issued subject id (R11.5) and a valid 1-9 ECZ grade. Anything else is
 * shown as withheld context, so the student sees that the slip had a row there
 * without being handed a value the grade mutation would reject.
 */
export function readExtractionPayload(payload: unknown): {
  candidates: OcrGradeCandidate[]
  withheld: OcrWithheldCandidate[]
  meta: OcrExtractionMeta
} | null {
  const extraction = asRecord(payload)
  if (!extraction) return null
  const rawCandidates = extraction.candidates
  if (!Array.isArray(rawCandidates)) return null

  const candidates: OcrGradeCandidate[] = []
  const withheld: OcrWithheldCandidate[] = []
  const seen = new Set<string>()

  for (const entry of rawCandidates) {
    const record = asRecord(entry)
    if (!record) continue
    const subjectId = str(record.subject_id)
    const grade = record.grade
    const confidence = typeof record.confidence === 'number' ? record.confidence : 0
    const status = typeof record.status === 'string' ? record.status : ''
    const sourceLine = typeof record.source_line === 'number' ? record.source_line : 0
    const rawLabel = str(record.raw_label) || ''

    const offerable =
      record.confirmable === true &&
      subjectId !== null &&
      isCanonicalSubjectId(subjectId) &&
      isValidEczGrade(grade) &&
      !seen.has(subjectId)

    if (offerable && subjectId && isValidEczGrade(grade)) {
      seen.add(subjectId)
      candidates.push({
        subject_id: subjectId,
        subject_code: str(record.subject_code) || '',
        subject_name: str(record.subject_name) || rawLabel,
        grade,
        confidence,
        match: record.match === 'alias' ? 'alias' : 'canonical',
        matched_alias: str(record.matched_alias),
        source_line: sourceLine,
        source_text: str(record.source_text) || '',
        provenance: str(record.provenance) || 'deterministic_ocr',
        raw_label: rawLabel,
      })
      continue
    }

    withheld.push({
      raw_label: rawLabel,
      grade: isValidEczGrade(grade) ? grade : null,
      status: (WITHHELD_STATUSES.has(status)
        ? status
        : 'low_confidence') as OcrWithheldCandidate['status'],
      subject_name: str(record.subject_name),
      confidence,
      source_line: sourceLine,
    })
  }

  const rawYear = extraction.exam_year
  return {
    candidates,
    withheld,
    meta: {
      examNumber: str(extraction.exam_number),
      year: typeof rawYear === 'number' && Number.isInteger(rawYear) ? String(rawYear) : str(rawYear),
      parserVersion: str(extraction.parser_version),
      catalogVersion: str(extraction.catalog_version),
      meanConfidence:
        typeof extraction.mean_confidence === 'number' ? extraction.mean_confidence : 0,
    },
  }
}

export type OcrFailureReason =
  | 'timeout'
  | 'server_failed'
  | 'skipped'
  | 'no_text'
  | 'no_grades_matched'
  | 'not_started'
  | 'missing'
  | 'rate_limited'
  | null

export function useOcrGradeExtraction(documentId: string | null) {
  const [status, setStatus] = useState<'idle' | 'polling' | 'suggested' | 'applied' | 'dismissed' | 'failed'>('idle')
  const [candidates, setCandidates] = useState<OcrGradeCandidate[]>([])
  const [withheld, setWithheld] = useState<OcrWithheldCandidate[]>([])
  const [extractionMeta, setExtractionMeta] = useState<OcrExtractionMeta | null>(null)
  const [failureReason, setFailureReason] = useState<OcrFailureReason>(null)
  const [appliedCount, setAppliedCount] = useState(0)
  const [retryAfterSeconds, setRetryAfterSeconds] = useState<number | null>(null)

  const pollCountRef = useRef(0)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const doneRef = useRef(false)
  const runIdRef = useRef(0)
  const docIdRef = useRef(documentId)
  const mountedRef = useRef(true)

  docIdRef.current = documentId

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const visibilityCleanupRef = useRef<(() => void) | null>(null)

  const stopPolling = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    if (visibilityCleanupRef.current) {
      visibilityCleanupRef.current()
      visibilityCleanupRef.current = null
    }
  }, [])

  /** Stop for good: record why, leave the education step usable for manual entry. */
  const finishFailed = useCallback((reason: Exclude<OcrFailureReason, null>) => {
    if (mountedRef.current) {
      setFailureReason(reason)
      setStatus('failed')
    }
    logger.info('[OCR] polling stopped', { reason, polls: pollCountRef.current })
  }, [])

  const pollRef = useRef<() => Promise<void>>(async () => {})

  /**
   * Run the next poll, but not while the tab is hidden: wait for it to become
   * visible and resume without resetting the count (clause 2.15).
   */
  const runWhenVisible = useCallback(() => {
    timeoutRef.current = null
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      const onVisible = () => {
        if (document.visibilityState === 'hidden') return
        document.removeEventListener('visibilitychange', onVisible)
        visibilityCleanupRef.current = null
        void pollRef.current()
      }
      document.addEventListener('visibilitychange', onVisible)
      visibilityCleanupRef.current = () => document.removeEventListener('visibilitychange', onVisible)
      return
    }
    void pollRef.current()
  }, [])

  const poll = useCallback(async () => {
    if (doneRef.current || !mountedRef.current) return
    const currentDocId = docIdRef.current
    const currentRunId = runIdRef.current
    if (!currentDocId) return
    pollCountRef.current += 1
    const pollNumber = pollCountRef.current
    /** Schedule the following poll on the backoff schedule, or stop at the bound. */
    const scheduleNext = () => {
      if (!mountedRef.current || doneRef.current) return
      if (pollNumber >= MAX_POLLS) {
        finishFailed('timeout')
        return
      }
      timeoutRef.current = setTimeout(runWhenVisible, OCR_POLL_DELAYS_MS[pollNumber])
    }
    try {
      // One request per poll: no client-level retry, so a slow worker cannot
      // multiply the polls against the document read budget.
      const info = await documentService.getInfo<DocumentInfo>(currentDocId, { retries: 0 })
      if (!mountedRef.current || doneRef.current || currentRunId !== runIdRef.current || docIdRef.current !== currentDocId) return
      if (!info) {
        scheduleNext()
        return
      }
      // Stop early if the backend reports a permanent extraction outcome.
      const state = info.ocr_state || info.verification_status
      if (state === 'ocr_failed' || state === 'ocr_skipped') {
        if (mountedRef.current) {
          setFailureReason(state === 'ocr_skipped' ? 'skipped' : 'server_failed')
          setStatus('failed')
        }
        logger.info('[OCR] polling stopped', { reason: state, polls: pollNumber })
        return
      }
      const parsed = readExtractionPayload(info.extraction)
      if (parsed && parsed.candidates.length > 0 && !doneRef.current) {
        doneRef.current = true
        if (mountedRef.current) {
          setCandidates(parsed.candidates)
          setWithheld(parsed.withheld)
          setExtractionMeta(parsed.meta)
          // NOT 'applied'. The student has not agreed to anything yet — this is
          // the whole point of R11.4. No callback fires from here.
          setStatus('suggested')
        }
        logger.info('[OCR] Deterministic candidates available for confirmation', {
          candidates: parsed.candidates.length,
          withheld: parsed.withheld.length,
        })
        return
      }
      if (state === 'ocr_no_text' || state === 'ocr_no_grades') {
        if (mountedRef.current) {
          setWithheld(parsed?.withheld ?? [])
          setFailureReason(state === 'ocr_no_grades' ? 'no_grades_matched' : 'no_text')
          setStatus('failed')
        }
        logger.info('[OCR] polling stopped', { reason: state, polls: pollNumber })
        return
      }
      // No job exists: nothing queued, nothing running, nothing extracted. The
      // server publishes `ocr_pending` once a job is accepted, so null means
      // there is nothing to wait for (clause 2.15).
      const hasJobState = typeof state === 'string' && state.startsWith('ocr_')
      if (!hasJobState && !info.extraction && !info.extracted_text) {
        finishFailed('not_started')
        return
      }
      // Text extracted but no candidate set yet — keep polling to the grace window.
      if (info.extracted_text && pollNumber >= MAX_POLLS - POST_EXTRACTION_GRACE_POLLS) {
        if (mountedRef.current) {
          setWithheld(parsed?.withheld ?? [])
          setFailureReason(parsed ? 'no_grades_matched' : 'no_text')
          setStatus('failed')
        }
        return
      }
      scheduleNext()
    } catch (error) {
      if (!mountedRef.current || doneRef.current || currentRunId !== runIdRef.current) return
      const status = (error as { status?: unknown } | null)?.status
      if (status === 404) {
        finishFailed('missing')
        return
      }
      if (status === 429) {
        setRetryAfterSeconds(retryAfterOf(error))
        finishFailed('rate_limited')
        return
      }
      // Non-critical — try again on the schedule, then degrade to manual entry.
      scheduleNext()
    }
  }, [finishFailed, runWhenVisible]) // Uses refs for everything else
  pollRef.current = poll

  const startPolling = useCallback((nextDocumentId?: string | null) => {
    if (nextDocumentId) {
      docIdRef.current = nextDocumentId
    }
    if (!docIdRef.current) return
    doneRef.current = false
    runIdRef.current += 1
    pollCountRef.current = 0
    setStatus('polling')
    setCandidates([])
    setWithheld([])
    setExtractionMeta(null)
    setFailureReason(null)
    setRetryAfterSeconds(null)
    setAppliedCount(0)
    stopPolling()
    // Delay first poll — give the worker time to pick up the job
    timeoutRef.current = setTimeout(runWhenVisible, OCR_POLL_DELAYS_MS[0])
  }, [runWhenVisible, stopPolling])

  /**
   * The extract request did not start a job (rejected, rate limited or the queue
   * is down): there is nothing to poll, so go straight to manual entry.
   */
  const markExtractRejected = useCallback((error?: unknown) => {
    stopPolling()
    doneRef.current = true
    if ((error as { status?: unknown } | null)?.status === 429) {
      setRetryAfterSeconds(retryAfterOf(error))
      finishFailed('rate_limited')
      return
    }
    finishFailed('not_started')
  }, [finishFailed, stopPolling])

  /**
   * The student's explicit confirmation. Returns only the selected candidates, so
   * a caller cannot "apply" something the student did not tick.
   */
  const confirmCandidates = useCallback((subjectIds: string[]): MatchedGrade[] => {
    const allowed = new Set(subjectIds)
    const confirmed = candidates
      .filter(candidate => allowed.has(candidate.subject_id))
      .map(candidate => ({ subject_id: candidate.subject_id, grade: candidate.grade }))
    if (confirmed.length === 0) return []
    setAppliedCount(confirmed.length)
    setStatus('applied')
    return confirmed
  }, [candidates])

  const dismissCandidates = useCallback(() => {
    setStatus('dismissed')
    setCandidates([])
  }, [])

  useEffect(() => {
    doneRef.current = false
    pollCountRef.current = 0
    setCandidates([])
    setWithheld([])
    setAppliedCount(0)
    setStatus('idle')
    stopPolling()
  }, [documentId, stopPolling])

  // Cleanup on unmount
  useEffect(() => () => stopPolling(), [stopPolling])

  return {
    status,
    candidates,
    withheld,
    extractionMeta,
    failureReason,
    retryAfterSeconds,
    appliedCount,
    startPolling,
    markExtractRejected,
    stopPolling,
    confirmCandidates,
    dismissCandidates,
  }
}
