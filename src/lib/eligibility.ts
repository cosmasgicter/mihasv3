// Zambian grading: 1=Distinction, 2-6=Credit, 7-8=Pass, 9=Fail
const ZAMBIAN_PASS_GRADE = 8
const ZAMBIAN_CREDIT_GRADE = 6

interface SubjectGrade {
  subject_id?: string
  subject_name: string
  grade: number
}

const PROGRAM_REQUIREMENTS: Record<string, {
  minSubjects: number
  requiredSubjects: string[]
  minGrade: number
  coreSubjectsMinGrade: number
}> = {
  'clinical medicine': {
    minSubjects: 5,
    requiredSubjects: ['english', 'mathematics', 'biology', 'chemistry'],
    minGrade: ZAMBIAN_PASS_GRADE,
    coreSubjectsMinGrade: ZAMBIAN_CREDIT_GRADE
  },
  'registered nursing': {
    minSubjects: 5,
    requiredSubjects: ['english', 'mathematics', 'biology'],
    minGrade: ZAMBIAN_PASS_GRADE,
    coreSubjectsMinGrade: ZAMBIAN_CREDIT_GRADE
  },
  'environmental health': {
    minSubjects: 5,
    requiredSubjects: ['english', 'mathematics', 'biology', 'chemistry'],
    minGrade: ZAMBIAN_PASS_GRADE,
    coreSubjectsMinGrade: ZAMBIAN_CREDIT_GRADE
  },
  'pharmacy': {
    minSubjects: 5,
    requiredSubjects: ['english', 'mathematics', 'chemistry', 'biology'],
    minGrade: ZAMBIAN_PASS_GRADE,
    coreSubjectsMinGrade: ZAMBIAN_CREDIT_GRADE
  }
}

export function checkEligibility(programName: string, grades: SubjectGrade[]) {
  const normalizedProgram = programName.toLowerCase().trim()
  const requirements = PROGRAM_REQUIREMENTS[normalizedProgram]
  
  if (!requirements) {
    return {
      eligible: false,
      message: 'Program requirements not configured',
      score: 0
    }
  }

  const validGrades = grades.filter(g => g.grade >= 1 && g.grade <= 9)
  
  if (validGrades.length < requirements.minSubjects) {
    return {
      eligible: false,
      message: `Minimum ${requirements.minSubjects} subjects required`,
      score: Math.round((validGrades.length / requirements.minSubjects) * 100)
    }
  }

  const missingRequired: string[] = []
  const poorGrades: string[] = []
  
  for (const required of requirements.requiredSubjects) {
    const grade = validGrades.find(g => 
      g.subject_name.toLowerCase().includes(required)
    )
    
    if (!grade) {
      missingRequired.push(required)
    } else if (grade.grade > requirements.coreSubjectsMinGrade) {
      poorGrades.push(`${required} (grade ${grade.grade})`)
    }
  }

  if (missingRequired.length > 0) {
    return {
      eligible: false,
      message: `Missing required subjects: ${missingRequired.join(', ')}`,
      score: Math.round(((requirements.requiredSubjects.length - missingRequired.length) / requirements.requiredSubjects.length) * 100)
    }
  }

  if (poorGrades.length > 0) {
    return {
      eligible: false,
      message: `Grades below credit level in: ${poorGrades.join(', ')}. Minimum credit (grade 6) required`,
      score: Math.round(((requirements.requiredSubjects.length - poorGrades.length) / requirements.requiredSubjects.length) * 100)
    }
  }

  const passedSubjects = validGrades.filter(g => g.grade <= requirements.minGrade).length
  const score = Math.round((passedSubjects / validGrades.length) * 100)

  return {
    eligible: true,
    message: `Meets requirements for ${programName}`,
    score
  }
}

export function getRecommendedSubjects(programName: string): string[] {
  const normalizedProgram = programName.toLowerCase().trim()
  const requirements = PROGRAM_REQUIREMENTS[normalizedProgram]
  return requirements?.requiredSubjects || []
}

export const eligibilityCalculator = { calculate: checkEligibility }

export interface EnhancedEligibilityResult {
  overallScore: number
  status: 'eligible' | 'not_eligible' | 'conditional'
  breakdown: {
    subjectCount: number
    gradeAverage: number
    coreSubjects: number
    totalWeighted: number
  }
  missingRequirements: Array<{
    type: string
    description: string
    severity: string
    suggestion: string
  }>
  recommendations?: string[]
  alternativePathways?: Array<{ name: string }>
}

export async function checkEnhancedEligibility(
  programName: string,
  grades: SubjectGrade[]
): Promise<EnhancedEligibilityResult> {
  const result = checkEligibility(programName, grades)
  
  return {
    overallScore: result.score,
    status: result.eligible ? 'eligible' : 'not_eligible',
    breakdown: {
      subjectCount: grades.length >= 5 ? 100 : (grades.length / 5) * 100,
      gradeAverage: result.score,
      coreSubjects: result.score,
      totalWeighted: result.score
    },
    missingRequirements: result.eligible ? [] : [{
      type: 'prerequisite',
      description: result.message,
      severity: 'critical',
      suggestion: 'Meet the minimum requirements'
    }],
    recommendations: result.eligible ? [] : [result.message]
  }
}
