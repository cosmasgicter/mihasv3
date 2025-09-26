export interface GradeRecord {
  grade?: number | null
}

const MIN_GRADE = 1
const MAX_GRADE = 12
const BEST_FIVE_COUNT = 5

/**
 * Zambian Grading System:
 * Grade 1 = 1 point
 * Grade 2 = 2 points
 * Grade 3 = 3 points
 * Grade 4 = 4 points
 * Grade 5 = 5 points
 * Grade 6 = 6 points
 * Grade 7 = 7 points
 * Grade 8 = 8 points
 * Grade 9 = 9 points
 * Grade 10-12 = 0 points (Fail)
 */

export const convertGradeToPoints = (grade: number): number => {
  if (!Number.isFinite(grade)) {
    return 0
  }

  // Zambian grading system: Grade 1 = 1 point, Grade 2 = 2 points, etc.
  if (grade >= 1 && grade <= 9) {
    return grade
  }
  
  return 0
}

export const sanitizeGradeValue = (value: unknown): number | null => {
  if (value === null || value === undefined) {
    return null
  }

  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return null
  }

  const rounded = Math.round(numeric)
  if (rounded < MIN_GRADE || rounded > MAX_GRADE) {
    return null
  }

  return rounded
}

export const calculateBestFivePoints = (grades: Array<GradeRecord | number | null | undefined>): number => {
  const normalizedGrades = grades
    .map(record => {
      if (typeof record === 'number') {
        return sanitizeGradeValue(record)
      }

      if (record && typeof record === 'object' && 'grade' in record) {
        return sanitizeGradeValue((record as GradeRecord).grade)
      }

      return sanitizeGradeValue(record as number)
    })
    .filter((value): value is number => value !== null)

  if (normalizedGrades.length === 0) {
    return 0
  }

  // Sort by grade value (ascending) to get best grades first (1 is better than 9)
  const bestGrades = [...normalizedGrades]
    .sort((a, b) => a - b)
    .slice(0, BEST_FIVE_COUNT)

  return bestGrades.reduce((total, grade) => total + convertGradeToPoints(grade), 0)
}

export const parseGradesFromSummary = (summary?: string | null): number[] => {
  if (!summary) {
    return []
  }

  const trimmed = summary.trim()
  if (!trimmed) {
    return []
  }

  try {
    const parsed = JSON.parse(trimmed)
    if (Array.isArray(parsed)) {
      return parsed
        .map(entry => {
          if (typeof entry === 'number') {
            return sanitizeGradeValue(entry)
          }

          if (entry && typeof entry === 'object') {
            const gradeValue =
              sanitizeGradeValue((entry as { grade?: unknown; value?: unknown; score?: unknown }).grade) ??
              sanitizeGradeValue((entry as { grade?: unknown; value?: unknown; score?: unknown }).value) ??
              sanitizeGradeValue((entry as { grade?: unknown; value?: unknown; score?: unknown }).score)

            return gradeValue
          }

          if (typeof entry === 'string') {
            return extractGradeFromText(entry)
          }

          return null
        })
        .filter((value): value is number => value !== null)
    }

    if (typeof parsed === 'object' && parsed !== null) {
      const possible =
        sanitizeGradeValue((parsed as Record<string, unknown>).grade) ??
        sanitizeGradeValue((parsed as Record<string, unknown>).value) ??
        sanitizeGradeValue((parsed as Record<string, unknown>).score)

      return possible ? [possible] : []
    }
  } catch (error) {
    // Fall back to text parsing
  }

  return extractGradesFromText(trimmed)
}

const extractGradeFromText = (text: string): number | null => {
  const match = text.match(/\b([1-9]|1[0-2])\b/)
  return match ? sanitizeGradeValue(Number(match[1])) : null
}

const extractGradesFromText = (text: string): number[] => {
  const matches = text.match(/\b([1-9]|1[0-2])\b/g)
  if (!matches) {
    return []
  }

  return matches
    .map(value => sanitizeGradeValue(Number(value)))
    .filter((value): value is number => value !== null)
}

export const calculatePointsFromSummary = (summary?: string | null): number => {
  const grades = parseGradesFromSummary(summary)
  return calculateBestFivePoints(grades)
}
