// Zambian Grading System: 1-9 scale (1 = best, 9 = worst)
// LOWER TOTAL = BETTER PERFORMANCE
// Best 5 = sum of 5 lowest grade numbers

export const gradeCalculator = {
  calculate: (grades: Array<{ grade: number }>) => {
    if (!grades || grades.length === 0) {
      return { total: 0, average: 0 };
    }
    
    const gradeValues = grades.map(g => g.grade).filter(g => g >= 1 && g <= 9);
    const total = gradeValues.reduce((sum, g) => sum + g, 0);
    const average = total / gradeValues.length;
    
    return { total, average };
  }
};

export function calculatePointsFromSummary(summary: any): number {
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

export function calculateBestFivePoints(grades: any[]): number {
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

export function sanitizeGradeValue(value: any): number {
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

export function getGradeLabel(grade: number): string {
  const labels: Record<number, string> = {
    1: 'Distinction',
    2: 'Merit',
    3: 'Credit',
    4: 'Credit',
    5: 'Credit',
    6: 'Pass',
    7: 'Pass',
    8: 'Pass',
    9: 'Fail'
  };
  return labels[grade] || 'Unknown';
}

export function parseGradesFromSummary(summary: string): Array<{ subject: string; grade: number }> {
  if (!summary) return [];
  
  try {
    const parsed = JSON.parse(summary);
    if (Array.isArray(parsed)) {
      return parsed.map(g => ({
        subject: g.subject_name || g.subject || 'Unknown',
        grade: sanitizeGradeValue(g.grade)
      }));
    }
  } catch {
    // Parse from text format
    const lines = summary.split('\n').filter(l => l.trim());
    return lines.map(line => {
      const match = line.match(/(.+?):\s*Grade\s*(\d)/i);
      if (match) {
        const grade = parseInt(match[2]!);
        return {
          subject: match[1]!.trim(),
          grade
        };
      }
      return null;
    }).filter(Boolean) as Array<{ subject: string; grade: number }>;
  }
  
  return [];
}