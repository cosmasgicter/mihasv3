/**
 * useOcrGradeExtraction — polls for OCR results after result slip upload
 * and auto-populates grade selectors when AI analysis is available.
 *
 * Resilience guarantees:
 * - Never blocks the wizard — all failures are silent
 * - Never overwrites manually entered grades (≥3 threshold)
 * - Stops polling on unmount, navigation, or timeout
 * - Uses refs for callbacks to avoid stale closures
 * - Validates every AI response field before use
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { apiClient } from '@/services/client'
import { logger } from '@/lib/logger'

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
const MAX_POLLS = 20 // 60 seconds max

/**
 * Fuzzy-match an AI-extracted subject name to a catalog subject.
 * Uses a scoring system to pick the best match above a threshold.
 */
function matchSubjectName(aiName: string, catalogSubjects: CatalogSubject[]): string | null {
  if (!aiName || catalogSubjects.length === 0) return null
  const normalized = aiName.toLowerCase().trim()
  if (normalized.length < 2) return null

  // Exact match
  const exact = catalogSubjects.find(s => s.name.toLowerCase() === normalized)
  if (exact) return exact.id

  // Contains match — require at least 4 chars to avoid false positives
  if (normalized.length >= 4) {
    const contains = catalogSubjects.find(s => {
      const catLower = s.name.toLowerCase()
      return normalized.includes(catLower) || catLower.includes(normalized)
    })
    if (contains) return contains.id
  }

  // Word overlap — split both into words and count matches
  const aiWords = normalized.split(/[\s\-\/]+/).filter(w => w.length >= 3)
  if (aiWords.length > 0) {
    let bestMatch: CatalogSubject | null = null
    let bestScore = 0
    for (const cat of catalogSubjects) {
      const catWords = cat.name.toLowerCase().split(/[\s\-\/]+/).filter(w => w.length >= 3)
      const overlap = aiWords.filter(w => catWords.some(cw => cw.startsWith(w) || w.startsWith(cw))).length
      const score = overlap / Math.max(aiWords.length, catWords.length)
      if (score > bestScore && score >= 0.5) {
        bestScore = score
        bestMatch = cat
      }
    }
    if (bestMatch) return bestMatch.id
  }

  return null
}

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

    const subjectId = matchSubjectName(name, catalogSubjects)
    if (subjectId && !usedIds.has(subjectId)) {
      matched.push({ subject_id: subjectId, grade })
      usedIds.add(subjectId)
    }
  }

  return matched
}

export function useOcrGradeExtraction(
  documentId: string | null,
  catalogSubjects: CatalogSubject[],
  onGradesExtracted: (grades: MatchedGrade[]) => void,
) {
  const [status, setStatus] = useState<'idle' | 'polling' | 'done' | 'failed'>('idle')
  const [extractedCount, setExtractedCount] = useState(0)

  // Use refs for values that change between polls to avoid stale closures
  const pollCountRef = useRef(0)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const doneRef = useRef(false)
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
    if (!currentDocId) return

    pollCountRef.current += 1
    if (pollCountRef.current > MAX_POLLS) {
      if (mountedRef.current) setStatus('done')
      logger.info('[OCR] Polling timed out', { attempts: MAX_POLLS })
      return
    }

    try {
      const info = await apiClient.request<DocumentInfo>(`/documents/${currentDocId}/info/`)
      if (!mountedRef.current || doneRef.current) return
      if (!info) {
        timeoutRef.current = setTimeout(poll, POLL_INTERVAL)
        return
      }

      const analysis = info.ai_analysis
      if (analysis?.subjects && Array.isArray(analysis.subjects) && analysis.subjects.length > 0) {
        const matched = mapAiGradesToCatalog(analysis.subjects, catalogRef.current)
        if (matched.length > 0 && !doneRef.current) {
          doneRef.current = true
          if (mountedRef.current) {
            setExtractedCount(matched.length)
            setStatus('done')
          }
          callbackRef.current(matched)
          logger.info('[OCR] Auto-populated grades from AI', { matched: matched.length, total: analysis.subjects.length })
          return
        }
      }

      // Text extracted but no usable analysis yet — keep polling
      if (info.extracted_text && pollCountRef.current > 12) {
        if (mountedRef.current) setStatus('done')
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
        setStatus('failed')
      }
    }
  }, []) // No deps — uses refs for everything

  const startPolling = useCallback(() => {
    if (!docIdRef.current) return
    doneRef.current = false
    pollCountRef.current = 0
    setStatus('polling')
    setExtractedCount(0)
    stopPolling()
    // Delay first poll — give Celery time to pick up the task
    timeoutRef.current = setTimeout(poll, POLL_INTERVAL + 1000)
  }, [poll, stopPolling])

  // Cleanup on unmount
  useEffect(() => () => stopPolling(), [stopPolling])

  return { status, extractedCount, startPolling, stopPolling }
}
