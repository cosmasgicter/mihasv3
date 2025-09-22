// Duplicate detection service for applications

import { apiCache } from './api-cache'

export interface ApplicationData {
  id?: string
  fullName: string
  nrc?: string
  email?: string
  phone?: string
  dateOfBirth?: string
  program?: string
  grades?: { subject: string; grade: number }[]
}

export interface DuplicateMatch {
  id: string
  similarity: number
  matchingFields: string[]
  conflictingFields: string[]
  application: ApplicationData
  riskLevel: 'low' | 'medium' | 'high'
}

export interface DuplicateCheckResult {
  isDuplicate: boolean
  matches: DuplicateMatch[]
  confidence: number
  recommendation: 'approve' | 'review' | 'reject'
  reasons: string[]
}

export class DuplicateDetectionService {
  private readonly SIMILARITY_THRESHOLDS = {
    name: 0.85,
    nrc: 1.0, // Exact match required
    email: 1.0, // Exact match required
    phone: 0.9,
    dateOfBirth: 1.0, // Exact match required
    grades: 0.8
  }

  private readonly FIELD_WEIGHTS = {
    nrc: 0.4,
    email: 0.25,
    phone: 0.15,
    name: 0.1,
    dateOfBirth: 0.05,
    grades: 0.05
  }

  async checkForDuplicates(
    applicationData: ApplicationData,
    existingApplications: ApplicationData[]
  ): Promise<DuplicateCheckResult> {
    const matches: DuplicateMatch[] = []
    
    for (const existing of existingApplications) {
      if (existing.id === applicationData.id) continue // Skip self
      
      const similarity = this.calculateSimilarity(applicationData, existing)
      const matchingFields = this.getMatchingFields(applicationData, existing)
      const conflictingFields = this.getConflictingFields(applicationData, existing)
      
      if (similarity > 0.3) { // Only consider significant matches
        matches.push({
          id: existing.id || 'unknown',
          similarity,
          matchingFields,
          conflictingFields,
          application: existing,
          riskLevel: this.calculateRiskLevel(similarity, matchingFields)
        })
      }
    }

    // Sort by similarity score
    matches.sort((a, b) => b.similarity - a.similarity)

    const highestSimilarity = matches.length > 0 ? matches[0].similarity : 0
    const isDuplicate = highestSimilarity > 0.7
    const confidence = Math.round(highestSimilarity * 100)
    
    const recommendation = this.getRecommendation(highestSimilarity, matches)
    const reasons = this.generateReasons(matches)

    return {
      isDuplicate,
      matches: matches.slice(0, 5), // Return top 5 matches
      confidence,
      recommendation,
      reasons
    }
  }

  private calculateSimilarity(
    app1: ApplicationData, 
    app2: ApplicationData
  ): number {
    let totalWeight = 0
    let weightedSimilarity = 0

    // NRC comparison (highest weight)
    if (app1.nrc && app2.nrc) {
      const nrcSimilarity = this.compareStrings(app1.nrc, app2.nrc)
      weightedSimilarity += nrcSimilarity * this.FIELD_WEIGHTS.nrc
      totalWeight += this.FIELD_WEIGHTS.nrc
    }

    // Email comparison
    if (app1.email && app2.email) {
      const emailSimilarity = this.compareStrings(
        app1.email.toLowerCase(), 
        app2.email.toLowerCase()
      )
      weightedSimilarity += emailSimilarity * this.FIELD_WEIGHTS.email
      totalWeight += this.FIELD_WEIGHTS.email
    }

    // Phone comparison
    if (app1.phone && app2.phone) {
      const phone1 = this.normalizePhone(app1.phone)
      const phone2 = this.normalizePhone(app2.phone)
      const phoneSimilarity = this.compareStrings(phone1, phone2)
      weightedSimilarity += phoneSimilarity * this.FIELD_WEIGHTS.phone
      totalWeight += this.FIELD_WEIGHTS.phone
    }

    // Name comparison
    if (app1.fullName && app2.fullName) {
      const nameSimilarity = this.compareNames(app1.fullName, app2.fullName)
      weightedSimilarity += nameSimilarity * this.FIELD_WEIGHTS.name
      totalWeight += this.FIELD_WEIGHTS.name
    }

    // Date of birth comparison
    if (app1.dateOfBirth && app2.dateOfBirth) {
      const dobSimilarity = app1.dateOfBirth === app2.dateOfBirth ? 1 : 0
      weightedSimilarity += dobSimilarity * this.FIELD_WEIGHTS.dateOfBirth
      totalWeight += this.FIELD_WEIGHTS.dateOfBirth
    }

    // Grades comparison
    if (app1.grades && app2.grades) {
      const gradesSimilarity = this.compareGrades(app1.grades, app2.grades)
      weightedSimilarity += gradesSimilarity * this.FIELD_WEIGHTS.grades
      totalWeight += this.FIELD_WEIGHTS.grades
    }

    return totalWeight > 0 ? weightedSimilarity / totalWeight : 0
  }

  private compareStrings(str1: string, str2: string): number {
    if (str1 === str2) return 1
    
    // Use Levenshtein distance for similarity
    const distance = this.levenshteinDistance(str1, str2)
    const maxLength = Math.max(str1.length, str2.length)
    
    return maxLength > 0 ? 1 - (distance / maxLength) : 0
  }

  private compareNames(name1: string, name2: string): number {
    // Normalize names
    const norm1 = this.normalizeName(name1)
    const norm2 = this.normalizeName(name2)
    
    // Direct comparison
    if (norm1 === norm2) return 1
    
    // Split into words and compare
    const words1 = norm1.split(' ')
    const words2 = norm2.split(' ')
    
    let matchedWords = 0
    const totalWords = Math.max(words1.length, words2.length)
    
    for (const word1 of words1) {
      for (const word2 of words2) {
        if (this.compareStrings(word1, word2) > 0.8) {
          matchedWords++
          break
        }
      }
    }
    
    return matchedWords / totalWords
  }

  private compareGrades(
    grades1: { subject: string; grade: number }[],
    grades2: { subject: string; grade: number }[]
  ): number {
    if (grades1.length === 0 || grades2.length === 0) return 0
    
    const subjects1 = new Map(grades1.map(g => [g.subject.toLowerCase(), g.grade]))
    const subjects2 = new Map(grades2.map(g => [g.subject.toLowerCase(), g.grade]))
    
    let matchingSubjects = 0
    let exactMatches = 0
    
    for (const [subject, grade1] of subjects1) {
      const grade2 = subjects2.get(subject)
      if (grade2 !== undefined) {
        matchingSubjects++
        if (grade1 === grade2) {
          exactMatches++
        }
      }
    }
    
    const totalSubjects = Math.max(grades1.length, grades2.length)
    const subjectSimilarity = matchingSubjects / totalSubjects
    const gradeSimilarity = matchingSubjects > 0 ? exactMatches / matchingSubjects : 0
    
    return (subjectSimilarity + gradeSimilarity) / 2
  }

  private getMatchingFields(
    app1: ApplicationData, 
    app2: ApplicationData
  ): string[] {
    const matching: string[] = []
    
    if (app1.nrc && app2.nrc && this.compareStrings(app1.nrc, app2.nrc) > this.SIMILARITY_THRESHOLDS.nrc) {
      matching.push('NRC')
    }
    
    if (app1.email && app2.email && this.compareStrings(app1.email.toLowerCase(), app2.email.toLowerCase()) > this.SIMILARITY_THRESHOLDS.email) {
      matching.push('Email')
    }
    
    if (app1.phone && app2.phone) {
      const phone1 = this.normalizePhone(app1.phone)
      const phone2 = this.normalizePhone(app2.phone)
      if (this.compareStrings(phone1, phone2) > this.SIMILARITY_THRESHOLDS.phone) {
        matching.push('Phone')
      }
    }
    
    if (app1.fullName && app2.fullName && this.compareNames(app1.fullName, app2.fullName) > this.SIMILARITY_THRESHOLDS.name) {
      matching.push('Name')
    }
    
    if (app1.dateOfBirth && app2.dateOfBirth && app1.dateOfBirth === app2.dateOfBirth) {
      matching.push('Date of Birth')
    }
    
    return matching
  }

  private getConflictingFields(
    app1: ApplicationData, 
    app2: ApplicationData
  ): string[] {
    const conflicting: string[] = []
    
    // Check for fields that should match but don't
    if (app1.nrc && app2.nrc && app1.nrc !== app2.nrc) {
      if (this.compareNames(app1.fullName, app2.fullName) > 0.8) {
        conflicting.push('NRC mismatch with same name')
      }
    }
    
    if (app1.email && app2.email && app1.email.toLowerCase() !== app2.email.toLowerCase()) {
      if (this.compareStrings(app1.nrc || '', app2.nrc || '') > 0.9) {
        conflicting.push('Email mismatch with same NRC')
      }
    }
    
    if (app1.program && app2.program && app1.program !== app2.program) {
      conflicting.push('Different programs')
    }
    
    return conflicting
  }

  private calculateRiskLevel(
    similarity: number, 
    matchingFields: string[]
  ): 'low' | 'medium' | 'high' {
    if (similarity > 0.9 || matchingFields.includes('NRC') || matchingFields.includes('Email')) {
      return 'high'
    }
    
    if (similarity > 0.6 || matchingFields.length >= 2) {
      return 'medium'
    }
    
    return 'low'
  }

  private getRecommendation(
    highestSimilarity: number, 
    matches: DuplicateMatch[]
  ): 'approve' | 'review' | 'reject' {
    if (highestSimilarity > 0.95) {
      return 'reject'
    }
    
    if (highestSimilarity > 0.7 || matches.some(m => m.riskLevel === 'high')) {
      return 'review'
    }
    
    return 'approve'
  }

  private generateReasons(matches: DuplicateMatch[]): string[] {
    const reasons: string[] = []
    
    if (matches.length === 0) {
      reasons.push('No similar applications found')
      return reasons
    }
    
    const highRiskMatches = matches.filter(m => m.riskLevel === 'high')
    if (highRiskMatches.length > 0) {
      reasons.push(`${highRiskMatches.length} high-risk duplicate(s) detected`)
    }
    
    const exactMatches = matches.filter(m => m.similarity > 0.95)
    if (exactMatches.length > 0) {
      reasons.push('Near-identical application found')
    }
    
    const fieldMatches = matches.flatMap(m => m.matchingFields)
    const uniqueFields = [...new Set(fieldMatches)]
    
    if (uniqueFields.includes('NRC')) {
      reasons.push('Matching NRC number found')
    }
    
    if (uniqueFields.includes('Email')) {
      reasons.push('Matching email address found')
    }
    
    if (uniqueFields.length >= 3) {
      reasons.push(`Multiple matching fields: ${uniqueFields.join(', ')}`)
    }
    
    return reasons
  }

  // Utility methods
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null))
    
    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j
    
    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1, // deletion
          matrix[j - 1][i] + 1, // insertion
          matrix[j - 1][i - 1] + indicator // substitution
        )
      }
    }
    
    return matrix[str2.length][str1.length]
  }

  private normalizeName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  }

  private normalizePhone(phone: string): string {
    return phone.replace(/[^\d]/g, '')
  }
}

// Export singleton instance
export const duplicateDetectionService = new DuplicateDetectionService()
