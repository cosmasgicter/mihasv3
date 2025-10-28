// Smart features for auto-filling forms and processing documents

import { compressImage } from './file-helpers'
import { sanitizeForLog } from '../lib/security'

// OCR Service for extracting text from documents
export class OCRService {
  private worker: any = null
  private isInitialized = false

  async initialize(): Promise<void> {
    if (this.isInitialized) return

    try {
      // Dynamic import to avoid loading OCR library until needed
      const Tesseract = await import('tesseract.js')
      
      this.worker = await Tesseract.createWorker()
      
      await this.worker.loadLanguage('eng')
      await this.worker.initialize('eng')
      
      this.isInitialized = true
    } catch (error) {
      console.error('Failed to initialize OCR:', sanitizeForLog(error))
      throw new Error('OCR service unavailable')
    }
  }

  async extractText(file: File): Promise<string> {
    if (!this.isInitialized) {
      await this.initialize()
    }

    try {
      // Compress image for better OCR performance
      const compressedFile = await compressImage(file, 0.9, 2000, 2000)
      
      const { data: { text } } = await this.worker.recognize(compressedFile)
      return text.trim()
    } catch (error) {
      console.error('OCR extraction failed:', sanitizeForLog(error))
      throw new Error('Failed to extract text from image')
    }
  }

  async cleanup(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate()
      this.worker = null
      this.isInitialized = false
    }
  }
}

// Document data extraction patterns
export interface ExtractedData {
  name?: string
  nrc?: string
  dateOfBirth?: string
  grades?: { subject: string; grade: number }[]
  schoolName?: string
  examYear?: string
  email?: string
  phone?: string
}

// Document parser for different document types
export class DocumentParser {
  private static readonly NRC_PATTERN = /\b\d{6}\/\d{2}\/\d{1}\b/g
  private static readonly DATE_PATTERNS = [
    /\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}\b/g,
    /\b\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}\b/g,
    /\b\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}\b/gi
  ]
  private static readonly EMAIL_PATTERN = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g
  private static readonly PHONE_PATTERN = /\b(?:\+260|0)?\s*\d{3}\s*\d{3}\s*\d{3}\b/g
  private static readonly NAME_PATTERN = /^([A-Z][a-z]+ [A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)$/gm

  // Grade patterns for Zambian education system
  private static readonly GRADE_PATTERNS = {
    // Subject followed by grade (1-9)
    subjectGrade: /([A-Za-z\s]+?)\s*[:\-]?\s*([1-9])(?!\d)/g,
    // Table format recognition
    tableFormat: /([A-Za-z\s]+?)\s+([1-9])\s*(?:$|\n)/gm
  }

  // Zambian subjects mapping
  private static readonly SUBJECT_MAPPINGS: Record<string, string> = {
    'english': 'English',
    'eng': 'English',
    'mathematics': 'Mathematics',
    'maths': 'Mathematics',
    'math': 'Mathematics',
    'science': 'Science',
    'biology': 'Biology',
    'bio': 'Biology',
    'chemistry': 'Chemistry',
    'chem': 'Chemistry',
    'physics': 'Physics',
    'phy': 'Physics',
    'geography': 'Geography',
    'geo': 'Geography',
    'history': 'History',
    'hist': 'History',
    'religious education': 'Religious Education',
    're': 'Religious Education',
    'civic education': 'Civic Education',
    'ce': 'Civic Education',
    'computer studies': 'Computer Studies',
    'cs': 'Computer Studies',
    'additional mathematics': 'Additional Mathematics',
    'add maths': 'Additional Mathematics'
  }

  static parseDocument(text: string, documentType: 'nrc' | 'grade12' | 'general' = 'general'): ExtractedData {
    const extracted: ExtractedData = {}

    switch (documentType) {
      case 'nrc':
        return this.parseNRCDocument(text)
      case 'grade12':
        return this.parseGrade12Document(text)
      default:
        return this.parseGeneralDocument(text)
    }
  }

  private static parseNRCDocument(text: string): ExtractedData {
    const extracted: ExtractedData = {}

    // Extract NRC number
    const nrcMatch = text.match(this.NRC_PATTERN)
    if (nrcMatch) {
      extracted.nrc = nrcMatch[0]
    }

    // Extract name (usually appears before NRC or after "Name:")
    const namePatterns = [
      /(?:Name|NAMES?)\s*[:\-]?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i,
      /^([A-Z][A-Z\s]+)$/gm // All caps names
    ]

    for (const pattern of namePatterns) {
      const match = text.match(pattern)
      if (match && match[1]) {
        extracted.name = this.cleanName(match[1])
        break
      }
    }

    // Extract date of birth
    const dobPatterns = [
      /(?:Date of Birth|DOB|Born)\s*[:\-]?\s*([\d\/\-\s]+)/i,
      /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})\b/
    ]

    for (const pattern of dobPatterns) {
      const match = text.match(pattern)
      if (match && match[1]) {
        extracted.dateOfBirth = this.standardizeDate(match[1])
        break
      }
    }

    return extracted
  }

  private static parseGrade12Document(text: string): ExtractedData {
    const extracted: ExtractedData = {}

    // Extract student name
    const nameMatch = text.match(/(?:Student|Candidate|Name)\s*[:\-]?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i)
    if (nameMatch) {
      extracted.name = this.cleanName(nameMatch[1])
    }

    // Extract school name
    const schoolMatch = text.match(/(?:School|Institution)\s*[:\-]?\s*([A-Z][A-Za-z\s]+)/i)
    if (schoolMatch) {
      extracted.schoolName = schoolMatch[1].trim()
    }

    // Extract exam year
    const yearMatch = text.match(/(?:Year|Examination)\s*[:\-]?\s*(20\d{2})/i)
    if (yearMatch) {
      extracted.examYear = yearMatch[1]
    }

    // Extract grades
    extracted.grades = this.extractGrades(text)

    return extracted
  }

  private static parseGeneralDocument(text: string): ExtractedData {
    const extracted: ExtractedData = {}

    // Extract email
    const emailMatch = text.match(this.EMAIL_PATTERN)
    if (emailMatch) {
      extracted.email = emailMatch[0]
    }

    // Extract phone
    const phoneMatch = text.match(this.PHONE_PATTERN)
    if (phoneMatch) {
      extracted.phone = this.cleanPhone(phoneMatch[0])
    }

    // Extract NRC if present
    const nrcMatch = text.match(this.NRC_PATTERN)
    if (nrcMatch) {
      extracted.nrc = nrcMatch[0]
    }

    // Extract name
    const nameMatch = text.match(this.NAME_PATTERN)
    if (nameMatch) {
      extracted.name = this.cleanName(nameMatch[0])
    }

    return extracted
  }

  private static extractGrades(text: string): { subject: string; grade: number }[] {
    const grades: { subject: string; grade: number }[] = []
    const foundSubjects = new Set<string>()

    // Try different grade extraction patterns
    const patterns = [
      this.GRADE_PATTERNS.subjectGrade,
      this.GRADE_PATTERNS.tableFormat
    ]

    for (const pattern of patterns) {
      let match
      while ((match = pattern.exec(text)) !== null) {
        const subjectRaw = match[1].trim().toLowerCase()
        const gradeStr = match[2]
        
        const subject = this.normalizeSubject(subjectRaw)
        const grade = parseInt(gradeStr, 10)
        
        if (subject && grade >= 1 && grade <= 9 && !foundSubjects.has(subject)) {
          grades.push({ subject, grade })
          foundSubjects.add(subject)
        }
      }
    }

    return grades
  }

  private static normalizeSubject(subject: string): string {
    const normalized = subject.toLowerCase().trim()
    return this.SUBJECT_MAPPINGS[normalized] || this.toTitleCase(subject)
  }

  private static toTitleCase(str: string): string {
    return str.replace(/\w\S*/g, (txt) => 
      txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
    )
  }

  private static cleanName(name: string): string {
    return name
      .replace(/[^A-Za-z\s]/g, '') // Remove non-alphabetic characters
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim()
      .split(' ')
      .map(word => this.toTitleCase(word))
      .join(' ')
  }

  private static cleanPhone(phone: string): string {
    const cleaned = phone.replace(/[^\d+]/g, '')
    
    // Normalize Zambian phone numbers
    if (cleaned.startsWith('0')) {
      return '+260' + cleaned.substring(1)
    } else if (cleaned.startsWith('260')) {
      return '+' + cleaned
    } else if (!cleaned.startsWith('+')) {
      return '+260' + cleaned
    }
    
    return cleaned
  }

  private static standardizeDate(date: string): string {
    // Try to parse and format date consistently
    const parsed = new Date(date)
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().split('T')[0]
    }
    
    return date.trim()
  }
}

// Auto-fill service that combines OCR and parsing
export class AutoFillService {
  private ocrService = new OCRService()

  async extractDataFromFile(file: File, documentType: 'nrc' | 'grade12' | 'general' = 'general'): Promise<ExtractedData> {
    try {
      // Extract text using OCR
      const extractedText = await this.ocrService.extractText(file)
      
      if (!extractedText || extractedText.length < 10) {
        throw new Error('Could not extract sufficient text from document')
      }

      // Parse the extracted text
      const parsedData = DocumentParser.parseDocument(extractedText, documentType)
      
      return {
        ...parsedData,
        // Include sanitized raw text for debugging/manual review
        _rawText: extractedText.replace(/[<>"'&]/g, (match) => {
          const entities: Record<string, string> = {
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#x27;',
            '&': '&amp;'
          }
          return entities[match] || match
        })
      }
    } catch (error) {
      console.error('Auto-fill extraction failed:', sanitizeForLog(error))
      throw new Error('Failed to extract data from document. Please enter information manually.')
    }
  }

  async cleanup(): Promise<void> {
    await this.ocrService.cleanup()
  }
}

// Grade calculation utilities
export class GradeCalculator {
  // Zambian education system requirements
  private static readonly PROGRAM_REQUIREMENTS = {
    'clinical-medicine': {
      requiredSubjects: ['English', 'Mathematics', 'Science', 'Biology', 'Chemistry'],
      minimumGrade: 6,
      totalSubjects: 6,
      passGrade: 6
    },
    'environmental-health': {
      requiredSubjects: ['English', 'Mathematics', 'Science', 'Geography'],
      minimumGrade: 6,
      totalSubjects: 6,
      passGrade: 6
    },
    'registered-nursing': {
      requiredSubjects: ['English', 'Mathematics', 'Science', 'Biology'],
      minimumGrade: 6,
      totalSubjects: 6,
      passGrade: 6
    }
  }

  static calculateEligibility(
    grades: { subject: string; grade: number }[],
    program: 'clinical-medicine' | 'environmental-health' | 'registered-nursing'
  ): {
    eligible: boolean
    score: number
    maxScore: number
    percentage: number
    missing: string[]
    issues: string[]
  } {
    const requirements = this.PROGRAM_REQUIREMENTS[program]
    const gradeMap = new Map(grades.map(g => [g.subject.toLowerCase(), g.grade]))
    
    const missing: string[] = []
    const issues: string[] = []
    let score = 0
    let eligibleSubjects = 0

    // Check required subjects
    for (const subject of requirements.requiredSubjects) {
      const grade = gradeMap.get(subject.toLowerCase())
      
      if (grade === undefined) {
        missing.push(subject)
      } else if (grade > requirements.passGrade) {
        issues.push(`${subject}: Grade ${grade} is below pass grade (${requirements.passGrade})`)
      } else {
        score += (10 - grade) // Convert grade to points (1=9 points, 9=1 point)
        eligibleSubjects++
      }
    }

    // Check total subjects requirement
    const passingGrades = grades.filter(g => g.grade <= requirements.passGrade)
    if (passingGrades.length < requirements.totalSubjects) {
      issues.push(`Need ${requirements.totalSubjects} passing subjects, have ${passingGrades.length}`)
    }

    // Add points for additional subjects (up to total required)
    const additionalSubjects = grades
      .filter(g => !requirements.requiredSubjects.map(s => s.toLowerCase()).includes(g.subject.toLowerCase()))
      .filter(g => g.grade <= requirements.passGrade)
      .sort((a, b) => a.grade - b.grade) // Best grades first
      .slice(0, Math.max(0, requirements.totalSubjects - requirements.requiredSubjects.length))

    additionalSubjects.forEach(subject => {
      score += (10 - subject.grade)
    })

    const maxScore = requirements.totalSubjects * 9 // Maximum possible points
    const percentage = Math.round((score / maxScore) * 100)
    
    const eligible = missing.length === 0 && 
                    issues.length === 0 && 
                    passingGrades.length >= requirements.totalSubjects

    return {
      eligible,
      score,
      maxScore,
      percentage,
      missing,
      issues
    }
  }

  static getRecommendations(
    grades: { subject: string; grade: number }[],
    targetProgram?: string
  ): {
    program: string
    eligibility: ReturnType<typeof GradeCalculator.calculateEligibility>
  }[] {
    const programs = Object.keys(this.PROGRAM_REQUIREMENTS) as Array<keyof typeof this.PROGRAM_REQUIREMENTS>
    
    return programs.map(program => ({
      program: program.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase()),
      eligibility: this.calculateEligibility(grades, program)
    })).sort((a, b) => {
      // Sort by eligibility first, then by score
      if (a.eligibility.eligible && !b.eligibility.eligible) return -1
      if (!a.eligibility.eligible && b.eligibility.eligible) return 1
      return b.eligibility.score - a.eligibility.score
    })
  }
}

// Export singleton instance
export const autoFillService = new AutoFillService()
