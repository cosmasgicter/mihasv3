/**
 * useOcrGradeExtraction — polls for OCR results after result slip upload
 * and auto-populates grade selectors when AI analysis is available.
 *
 * Resilience guarantees:
 * - Never blocks the wizard — all failures are silent
 * - Scanned grades take precedence over manual entries (but remain editable)
 * - Stops polling on unmount, navigation, or timeout
 * - Uses refs for callbacks to avoid stale closures
 * - Validates every AI response field before use
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { apiClient } from '@/services/client'
import { logger } from '@/lib/logger'
import { findBestSubjectId } from '@/lib/subjectMatcher'

interface AiSubject {
  name: string
  grade: number
}

interface AiAnalysis {
  subjects?: AiSubject[]
  exam_number?: string
  year?: string
}

interface DocumentInfo {
  id: string
  extracted_text: boolean
  ai_analysis: AiAnalysis | null
  verification_status?: string | null
  ocr_state?: string | null
  ai_analysis_available?: boolean
}

interface CatalogSubject {
  id: string
  name: string
}

export interface MatchedGrade {
  subject_id: string
  grade: number
}

const POLL_INTERVAL = 3000
const MAX_POLLS = 30 // 90 seconds max — Celery cold-start can take 30-60s
const POST_EXTRACTION_GRACE_POLLS = 3

function isValidEczGrade(grade: unknown): grade is number {
  return typeof grade === 'number' && Number.isInteger(grade) && grade >= 1 && grade <= 9
}

function mapAiGradesToCatalog(
  aiSubjects: unknown,
  catalogSubjects: CatalogSubject[]
): MatchedGrade[] {
  // Defensive: validate the AI response shape
  if (!Array.isArray(aiSubjects)) return []

  const matched: MatchedGrade[] = []
  const usedIds = new Set<string>()

  for (const ai of aiSubjects) {
    if (!ai || typeof ai !== 'object') continue
    const name = typeof (ai as AiSubject).name === 'string' ? (ai as AiSubject).name : ''
    const grade = (ai as AiSubject).grade

    if (!name || !isValidEczGrade(grade)) continue

    const subjectId = findBestSubjectId(name, catalogSubjects)
    if (subjectId && !usedIds.has(subjectId)) {
      matched.push({ subject_id: subjectId, grade })
      usedIds.add(subjectId)
    }
  }

  return matched
}

export type OcrFailureReason = 'timeout' | 'server_failed' | 'skipped' | 'no_text' | 'no_grades_matched' | null

export interface OcrExtractionMeta {
  subjects: AiSubject[]
  examNumber: string | null
  year: string | null
}

export function useOcrGradeExtraction(
  documentId: string | null,
  catalogSubjects: CatalogSubject[],
  onGradesExtracted: (grades: MatchedGrade[]) => void,
) {
  const [status, setStatus] = useState<'idle' | 'polling' | 'done' | 'failed'>('idle')
  const [extractedCount, setExtractedCount] = useState(0)
  const [failureReason, setFailureReason] = useState<OcrFailureReason>(null)
  const [extractionMeta, setExtractionMeta] = useState<OcrExtractionMeta | null>(null)

  // Use refs for values that change between polls to avoid stale closures
  const pollCountRef = useRef(0)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const doneRef = useRef(false)
  const runIdRef = useRef(0)
  const catalogRef = useRef(catalogSubjects)
  const callbackRef = useRef(onGradesExtracted)
  const docIdRef = useRef(documentId)
  const mountedRef = useRef(true)

  // Keep refs in sync
  catalogRef.current = catalogSubjects
  callbackRef.current = onGradesExtracted
  docIdRef.current = documentId

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const stopPolling = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  const poll = useCallback(async () => {
    if (doneRef.current || !mountedRef.current) return
    const currentDocId = docIdRef.current
    const currentRunId = runIdRef.current
    if (!currentDocId) return

    pollCountRef.current += 1
    if (pollCountRef.current > MAX_POLLS) {
      if (mountedRef.current) {
        setFailureReason('timeout')
        setStatus('failed')
      }
      logger.info('[OCR] Polling timed out', { attempts: MAX_POLLS })
      return
    }

    try {
      const info = await apiClient.request<DocumentInfo>(`/documents/${currentDocId}/info/`)
      if (!mountedRef.current || doneRef.current || currentRunId !== runIdRef.current || docIdRef.current !== currentDocId) return
      if (!info) {
        timeoutRef.current = setTimeout(poll, POLL_INTERVAL)
        return
      }

      // Stop early if backend reports permanent OCR failure
      const vStatus = info.ocr_state || info.verification_status
      if (vStatus === 'ocr_failed' || vStatus === 'ocr_skipped') {
        if (mountedRef.current) {
          setFailureReason(vStatus === 'ocr_skipped' ? 'skipped' : 'server_failed')
          setStatus('failed')
        }
        logger.info('[OCR] Backend reported permanent failure', { status: vStatus })
        return
      }
      if (vStatus === 'ocr_no_text' || vStatus === 'ocr_no_grades') {
        if (mountedRef.current) {
          setFailureReason(vStatus === 'ocr_no_grades' ? 'no_grades_matched' : 'no_text')
          setStatus('failed')
        }
        logger.info('[OCR] Backend reported no usable grades', { status: vStatus })
        return
      }

      const analysis = info.ai_analysis
      if (analysis?.subjects && Array.isArray(analysis.subjects) && analysis.subjects.length > 0) {
        // Wait for catalog subjects to load before attempting match
        if (catalogRef.current.length === 0) {
          timeoutRef.current = setTimeout(poll, POLL_INTERVAL)
          return
        }
        const matched = mapAiGradesToCatalog(analysis.subjects, catalogRef.current)
        if (matched.length > 0 && !doneRef.current) {
          doneRef.current = true
          if (mountedRef.current) {
            setExtractedCount(matched.length)
            // Only keep subjects that have a valid name + valid 1-9 grade.
            // Prevents downstream NaN in Math.min / average computations
            // and guards against AI returning malformed entries.
            const cleanSubjects: AiSubject[] = []
            for (const s of analysis.subjects as unknown[]) {
              if (!s || typeof s !== 'object') continue
              const name = (s as AiSubject).name
              const grade = (s as AiSubject).grade
              if (typeof name === 'string' && name.trim().length > 0 && isValidEczGrade(grade)) {
                cleanSubjects.push({ name: name.trim(), grade })
              }
            }
            const rawExam = typeof analysis.exam_number === 'string' ? analysis.exam_number.trim() : null
            const rawYear = typeof analysis.year === 'string' ? analysis.year.trim() : null
            setExtractionMeta({
              subjects: cleanSubjects,
              examNumber: rawExam && rawExam.length <= 20 ? rawExam : null,
              year: rawYear && /^\d{4}$/.test(rawYear) ? rawYear : null,
            })
            setStatus('done')
          }
          callbackRef.current(matched)
          logger.info('[OCR] Auto-populated grades from AI', { matched: matched.length, total: analysis.subjects.length })
          return
        }
      }

      // Text extracted but no usable analysis yet — keep polling
      if (info.extracted_text && pollCountRef.current >= MAX_POLLS - POST_EXTRACTION_GRACE_POLLS) {
        const reason = (analysis?.subjects && analysis.subjects.length > 0) ? 'no_grades_matched' : 'no_text'
        if (mountedRef.current) {
          setFailureReason(reason)
          setStatus('failed')
        }
        return
      }

      if (mountedRef.current) {
        timeoutRef.current = setTimeout(poll, POLL_INTERVAL)
      }
    } catch {
      // Non-critical — retry silently
      if (mountedRef.current && pollCountRef.current < MAX_POLLS) {
        timeoutRef.current = setTimeout(poll, POLL_INTERVAL * 2)
      } else if (mountedRef.current) {
        setFailureReason('timeout')
        setStatus('failed')
      }
    }
  }, []) // No deps — uses refs for everything

  const startPolling = useCallback((nextDocumentId?: string | null) => {
    if (nextDocumentId) {
      docIdRef.current = nextDocumentId
    }
    if (!docIdRef.current) return
    doneRef.current = false
    runIdRef.current += 1
    pollCountRef.current = 0
    setStatus('polling')
    setExtractedCount(0)
    setExtractionMeta(null)
    setFailureReason(null)
    stopPolling()
    // Delay first poll — give Celery time to pick up the task
    timeoutRef.current = setTimeout(poll, POLL_INTERVAL + 1000)
  }, [poll, stopPolling])

  useEffect(() => {
    doneRef.current = false
    pollCountRef.current = 0
    setExtractedCount(0)
    setStatus('idle')
    stopPolling()
  }, [documentId, stopPolling])

  // Cleanup on unmount
  useEffect(() => () => stopPolling(), [stopPolling])

  return { status, extractedCount, failureReason, extractionMeta, startPolling, stopPolling }
}
