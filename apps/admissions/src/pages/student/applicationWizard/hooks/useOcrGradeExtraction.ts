/**
 * useOcrGradeExtraction — polls for OCR results after result slip upload
 * and auto-populates grade selectors when AI analysis is available.
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

interface MatchedGrade {
  subject_id: string
  grade: number
}

const POLL_INTERVAL = 3000
const MAX_POLLS = 20 // 60 seconds max

/**
 * Fuzzy-match an AI-extracted subject name to a catalog subject ID.
 * Handles variations like "English Language" → "English", "Biology" → "Biology", etc.
 */
function matchSubjectName(aiName: string, catalogSubjects: CatalogSubject[]): string | null {
  const normalized = aiName.toLowerCase().trim()

  // Exact match first
  const exact = catalogSubjects.find(s => s.name.toLowerCase() === normalized)
  if (exact) return exact.id

  // Contains match (e.g., "English Language" matches "English")
  const contains = catalogSubjects.find(s =>
    normalized.includes(s.name.toLowerCase()) || s.name.toLowerCase().includes(normalized)
  )
  if (contains) return contains.id

  // Word-start match (e.g., "Bio" matches "Biology")
  const startsWith = catalogSubjects.find(s =>
    s.name.toLowerCase().startsWith(normalized.slice(0, 4)) ||
    normalized.startsWith(s.name.toLowerCase().slice(0, 4))
  )
  if (startsWith) return startsWith.id

  return null
}

function mapAiGradesToCatalog(
  aiSubjects: AiSubject[],
  catalogSubjects: CatalogSubject[]
): MatchedGrade[] {
  const matched: MatchedGrade[] = []
  const usedIds = new Set<string>()

  for (const ai of aiSubjects) {
    if (ai.grade < 1 || ai.grade > 9) continue // Invalid ECZ grade

    const subjectId = matchSubjectName(ai.name, catalogSubjects)
    if (subjectId && !usedIds.has(subjectId)) {
      matched.push({ subject_id: subjectId, grade: ai.grade })
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
  const pollCountRef = useRef(0)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const calledBackRef = useRef(false)

  const stopPolling = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  const poll = useCallback(async () => {
    if (!documentId || calledBackRef.current) return

    pollCountRef.current += 1
    if (pollCountRef.current > MAX_POLLS) {
      setStatus('done') // Timed out — student enters manually
      logger.info('[OCR] Polling timed out after %d attempts', MAX_POLLS)
      return
    }

    try {
      const info = await apiClient.request<DocumentInfo>(`/documents/${documentId}/info/`)
      if (!info) return

      if (info.ai_analysis?.subjects && info.ai_analysis.subjects.length > 0) {
        // AI analysis available — map to catalog subjects
        const matched = mapAiGradesToCatalog(info.ai_analysis.subjects, catalogSubjects)
        if (matched.length > 0 && !calledBackRef.current) {
          calledBackRef.current = true
          setExtractedCount(matched.length)
          setStatus('done')
          onGradesExtracted(matched)
          logger.info('[OCR] Auto-populated %d grades from AI analysis', matched.length)
          return
        }
      }

      if (info.extracted_text && !info.ai_analysis) {
        // Text extracted but no AI analysis — might still be processing
        // Continue polling a few more times
        if (pollCountRef.current > 10) {
          setStatus('done')
          return
        }
      }

      // Schedule next poll
      timeoutRef.current = setTimeout(poll, POLL_INTERVAL)
    } catch {
      // Non-critical — just stop polling
      setStatus('failed')
    }
  }, [documentId, catalogSubjects, onGradesExtracted])

  const startPolling = useCallback(() => {
    if (!documentId || catalogSubjects.length === 0) return
    calledBackRef.current = false
    pollCountRef.current = 0
    setStatus('polling')
    setExtractedCount(0)
    // Wait a bit before first poll — give Celery time to start
    timeoutRef.current = setTimeout(poll, POLL_INTERVAL)
  }, [documentId, catalogSubjects, poll])

  // Cleanup on unmount
  useEffect(() => () => stopPolling(), [stopPolling])

  return { status, extractedCount, startPolling, stopPolling }
}
