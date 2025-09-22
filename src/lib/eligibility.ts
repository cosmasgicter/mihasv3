// Legacy course eligibility checker - kept for backward compatibility
export interface EligibilityRule {
  required: string[]
  minGrade: number
  minSubjects: number
  additionalRequirements?: string[]
}

export interface EligibilityResult {
  eligible: boolean
  message: string
  score?: number
  recommendations?: string[]
}

// Enhanced eligibility interfaces
export interface EnhancedEligibilityResult {
  eligible: boolean
  status: 'eligible' | 'conditional' | 'not_eligible' | 'under_review'
  overallScore: number
  breakdown: {
    subjectCount: number
    gradeAverage: number
    coreSubjects: number
    totalWeighted: number
  }
  missingRequirements: Array<{
    type: 'subject' | 'grade' | 'document'
    description: string
    severity: 'critical' | 'major' | 'minor'
    suggestion: string
  }>
  recommendations: string[]
  alternativePathways?: Array<{
    name: string
    description: string
    additionalRequirements: string[]
  }>
}

export const ELIGIBILITY_RULES: Record<string, EligibilityRule> = {
  'Clinical Medicine': {
    required: ['English', 'Mathematics', 'Biology'],
    minGrade: 5,
    minSubjects: 5,
    additionalRequirements: [
      'Chemistry and Physics (or Science) are highly recommended',
      'Strong performance in sciences is preferred',
      'Please consult with the institution for specific requirements'
    ]
  },
  'Environmental Health': {
    required: ['English', 'Mathematics', 'Biology'],
    minGrade: 5,
    minSubjects: 5,
    additionalRequirements: [
      'Chemistry (or Science) is highly recommended',
      'Geography or Agricultural Science recommended',
      'Please consult with the institution for specific requirements'
    ]
  },
  'Registered Nursing': {
    required: ['English', 'Mathematics', 'Biology'],
    minGrade: 5,
    minSubjects: 5,
    additionalRequirements: [
      'Chemistry (or Science) is highly recommended',
      'Good communication skills essential',
      'Please consult with the institution for specific requirements'
    ]
  }
}

export interface SubjectGrade {
  subject_id: string
  subject_name: string
  grade: number
}

// Export the enhanced eligibility checker for use in components
export { eligibilityEngine } from './eligibilityEngine'

export function checkEligibility(
  program: string, 
  grades: SubjectGrade[]
): EligibilityResult {
  const rules = ELIGIBILITY_RULES[program]
  if (!rules) {
    return { 
      eligible: false, 
      message: 'Program not found in eligibility database' 
    }
  }

  // Check minimum subjects
  if (grades.length < rules.minSubjects) {
    return {
      eligible: false,
      message: `Minimum ${rules.minSubjects} subjects required. You have ${grades.length}.`,
      recommendations: ['Add more subjects to meet minimum requirements']
    }
  }

  // Get subject names from grades
  const subjectNames = grades.map(g => g.subject_name).filter(Boolean)
  
  // Check required subjects (more flexible approach)
  const missingRequired = rules.required.filter(req => 
    !subjectNames.some(name => name.toLowerCase().includes(req.toLowerCase()))
  )

  // Check for science subjects flexibility (Chemistry/Physics vs Science)
  const hasChemistry = subjectNames.some(name => name.toLowerCase().includes('chemistry'))
  const hasPhysics = subjectNames.some(name => name.toLowerCase().includes('physics'))
  const hasScience = subjectNames.some(name => name.toLowerCase().includes('science'))
  const hasScienceSubjects = hasChemistry || hasPhysics || hasScience

  if (missingRequired.length > 0) {
    return {
      eligible: true, // Changed to true to allow progression
      message: `Conditionally eligible - Missing preferred subjects: ${missingRequired.join(', ')}`,
      recommendations: [
        `Preferred subjects: ${missingRequired.join(', ')}`,
        'Please consult with the institution about subject requirements',
        'You may still proceed with your application'
      ]
    }
  }

  // Check grades for required subjects (more lenient approach)
  const requiredSubjectGrades = grades.filter(g => 
    rules.required.some(req => 
      g.subject_name.toLowerCase().includes(req.toLowerCase())
    )
  )

  const lowGrades = requiredSubjectGrades.filter(g => g.grade > rules.minGrade)
  
  if (lowGrades.length > 0) {
    const lowGradeSubjects = lowGrades.map(g => `${g.subject_name} (${g.grade})`).join(', ')
    return {
      eligible: true, // Changed to true to allow progression
      message: `Conditionally eligible - Lower grades in: ${lowGradeSubjects}`,
      recommendations: [
        `Consider improving grades in: ${lowGradeSubjects}`,
        'Please consult with the institution about grade requirements',
        'You may still proceed with your application'
      ]
    }
  }

  // Calculate eligibility score (1 is best, 9 is worst in Zambian system)
  const averageGrade = grades.reduce((sum, g) => sum + g.grade, 0) / grades.length
  const score = Math.round(((10 - averageGrade) / 9) * 100)

  return {
    eligible: true,
    message: `Eligible for ${program}`,
    score,
    recommendations: rules.additionalRequirements || []
  }
}

export function getRecommendedSubjects(program: string): string[] {
  const rules = ELIGIBILITY_RULES[program]
  if (!rules) return []
  
  const recommended = {
    'Clinical Medicine': ['English', 'Mathematics', 'Biology', 'Chemistry', 'Physics', 'Science', 'Additional Mathematics'],
    'Environmental Health': ['English', 'Mathematics', 'Biology', 'Chemistry', 'Science', 'Geography', 'Agricultural Science'],
    'Registered Nursing': ['English', 'Mathematics', 'Biology', 'Chemistry', 'Science', 'Civic Education', 'Religious Education']
  }
  
  return recommended[program as keyof typeof recommended] || []
}

// Enhanced eligibility checking with comprehensive assessment
export function checkEnhancedEligibility(
  program: string,
  grades: SubjectGrade[]
): EnhancedEligibilityResult {
  const rules = ELIGIBILITY_RULES[program]
  if (!rules) {
    return {
      eligible: false,
      status: 'not_eligible',
      overallScore: 0,
      breakdown: { subjectCount: 0, gradeAverage: 0, coreSubjects: 0, totalWeighted: 0 },
      missingRequirements: [{
        type: 'subject',
        description: 'Program not found in eligibility database',
        severity: 'critical',
        suggestion: 'Please contact admissions for program requirements'
      }],
      recommendations: []
    }
  }

  const breakdown = {
    subjectCount: calculateSubjectCountScore(grades, rules),
    gradeAverage: calculateGradeAverageScore(grades),
    coreSubjects: calculateCoreSubjectsScore(grades, rules),
    totalWeighted: 0
  }

  // Calculate weighted total
  breakdown.totalWeighted = (breakdown.subjectCount * 0.3 + 
                            breakdown.gradeAverage * 0.3 + 
                            breakdown.coreSubjects * 0.4)

  const missingRequirements = identifyMissingRequirements(grades, rules)
  const recommendations = generateRecommendations(program, grades, missingRequirements)
  const alternativePathways = getAlternativePathways(program, breakdown.totalWeighted)

  let status: 'eligible' | 'conditional' | 'not_eligible' | 'under_review'
  const criticalMissing = missingRequirements.filter(r => r.severity === 'critical')
  
  if (criticalMissing.length > 0) {
    status = 'not_eligible'
  } else if (breakdown.totalWeighted >= 80) {
    status = missingRequirements.length === 0 ? 'eligible' : 'conditional'
  } else if (breakdown.totalWeighted >= 60) {
    status = 'conditional'
  } else {
    status = 'not_eligible'
  }

  return {
    eligible: status === 'eligible' || status === 'conditional',
    status,
    overallScore: breakdown.totalWeighted,
    breakdown,
    missingRequirements,
    recommendations,
    alternativePathways
  }
}

function calculateSubjectCountScore(grades: SubjectGrade[], rules: EligibilityRule): number {
  const qualifyingSubjects = grades.filter(g => g.grade <= rules.minGrade).length
  return Math.min(100, (qualifyingSubjects / rules.minSubjects) * 100)
}

function calculateGradeAverageScore(grades: SubjectGrade[]): number {
  if (grades.length === 0) return 0
  const average = grades.reduce((sum, g) => sum + g.grade, 0) / grades.length
  return Math.min(100, ((10 - average) / 9) * 100)
}

function calculateCoreSubjectsScore(grades: SubjectGrade[], rules: EligibilityRule): number {
  let score = 0
  let coreSubjectsFound = 0

  for (const requiredSubject of rules.required) {
    const grade = grades.find(g => 
      g.subject_name.toLowerCase().includes(requiredSubject.toLowerCase())
    )
    
    if (grade) {
      coreSubjectsFound++
      if (grade.grade <= rules.minGrade) {
        score += ((10 - grade.grade) / 9) * 100
      }
    }
  }

  return coreSubjectsFound > 0 ? score / rules.required.length : 0
}

function identifyMissingRequirements(grades: SubjectGrade[], rules: EligibilityRule) {
  const missing: Array<{
    type: 'subject' | 'grade' | 'document'
    description: string
    severity: 'critical' | 'major' | 'minor'
    suggestion: string
  }> = []

  // Check for missing required subjects
  const subjectNames = grades.map(g => g.subject_name.toLowerCase())
  const missingSubjects = rules.required.filter(req => 
    !subjectNames.some(name => name.includes(req.toLowerCase()))
  )

  missingSubjects.forEach(subject => {
    missing.push({
      type: 'subject',
      description: `Missing required subject: ${subject}`,
      severity: 'critical',
      suggestion: `Add ${subject} to your subject selection`
    })
  })

  // Check for low grades in required subjects
  rules.required.forEach(requiredSubject => {
    const grade = grades.find(g => 
      g.subject_name.toLowerCase().includes(requiredSubject.toLowerCase())
    )
    
    if (grade && grade.grade > rules.minGrade) {
      missing.push({
        type: 'grade',
        description: `Grade ${grade.grade} in ${requiredSubject} is below required ${rules.minGrade}`,
        severity: 'major',
        suggestion: `Improve grade in ${requiredSubject} to at least ${rules.minGrade}`
      })
    }
  })

  // Check minimum subject count
  if (grades.length < rules.minSubjects) {
    missing.push({
      type: 'subject',
      description: `Only ${grades.length} subjects provided, minimum ${rules.minSubjects} required`,
      severity: 'critical',
      suggestion: `Add ${rules.minSubjects - grades.length} more subjects`
    })
  }

  return missing
}

function generateRecommendations(program: string, grades: SubjectGrade[], missingRequirements: any[]): string[] {
  const recommendations: string[] = []

  // Add program-specific recommendations
  const rules = ELIGIBILITY_RULES[program]
  if (rules?.additionalRequirements) {
    recommendations.push(...rules.additionalRequirements)
  }

  // Add grade improvement suggestions
  const lowGrades = grades.filter(g => g.grade > 6)
  if (lowGrades.length > 0) {
    recommendations.push(
      `Consider retaking exams to improve grades in: ${lowGrades.map(g => g.subject_name).join(', ')}`
    )
  }

  // Add subject-specific recommendations
  if (program === 'Clinical Medicine') {
    recommendations.push('Strong performance in sciences is essential for medical studies')
    recommendations.push('Consider additional mathematics for better preparation')
  }

  return recommendations
}

function getAlternativePathways(program: string, score: number) {
  if (score >= 60) return [] // No alternative pathways needed

  const pathways = {
    'Clinical Medicine': [{
      name: 'Foundation Program',
      description: 'One-year foundation program to strengthen science background',
      additionalRequirements: ['Complete foundation mathematics', 'Complete foundation sciences']
    }],
    'Environmental Health': [{
      name: 'Bridging Course',
      description: 'Six-month bridging course for environmental sciences',
      additionalRequirements: ['Environmental science basics', 'Research methodology']
    }],
    'Registered Nursing': [{
      name: 'Pre-Nursing Program',
      description: 'Preparatory program for nursing studies',
      additionalRequirements: ['Health sciences foundation', 'Communication skills']
    }]
  }

  return pathways[program as keyof typeof pathways] || []
}