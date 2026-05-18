// Zambian Grading System: 1-9 scale (1 = best, 9 = worst)
// LOWER TOTAL = BETTER PERFORMANCE
// Best 5 = sum of 5 lowest grade numbers

export type GradeSummaryInput = string | GradeEntry[] | null | undefined

export interface GradeEntry {
  grade: number
  [key: string]: unknown
}

export function calculatePointsFromSummary(summary: GradeSummaryInput): number {
  if (!summary) return 0;
  
  // If summary is a string, try to parse it
  if (typeof summary === 'string') {
    try {
      const parsed = JSON.parse(summary);
      if (Array.isArray(parsed)) {
        return calculateBestFivePoints(parsed);
      }
    } catch {
      // If not JSON, try to extract grades from text
      const gradeMatches = summary.match(/grade[:\s]*(\d)/gi);
      if (gradeMatches) {
        const grades = gradeMatches.map(m => {
          const num = parseInt(m.match(/\d/)?.[0] || '0');
          return { grade: num };
        });
        return calculateBestFivePoints(grades);
      }
    }
  }
  
  // If summary is already an array
  if (Array.isArray(summary)) {
    return calculateBestFivePoints(summary);
  }
  
  return 0;
}

export function calculateBestFivePoints(grades: ReadonlyArray<GradeEntry | number>): number {
  if (!grades || grades.length === 0) return 0;
  
  // Extract grade values (1-9)
  const gradeValues = grades
    .map(g => {
      const gradeValue = typeof g === 'object' ? g.grade : g;
      return typeof gradeValue === 'number' && gradeValue >= 1 && gradeValue <= 9 ? gradeValue : null;
    })
    .filter((g): g is number => g !== null)
    .sort((a, b) => a - b); // Sort ascending (best/lowest first)
  
  // Take best 5 subjects and sum them (lower is better)
  const bestFive = gradeValues.slice(0, 5);
  return bestFive.reduce((sum, grade) => sum + grade, 0);
}

export function sanitizeGradeValue(value: unknown): number {
  if (typeof value === 'number' && value >= 1 && value <= 9) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = parseInt(value);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= 9) {
      return parsed;
    }
  }
  return 0;
}

