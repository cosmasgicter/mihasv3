import { supabase } from './supabase'
import { sessionManager } from './session'
import { sanitizeForLog } from './security'

export interface PredictionResult {
  admissionProbability: number
  processingTimeEstimate: number
  riskFactors: string[]
  recommendations: string[]
  confidence: number
  modelVersion: string
}

export interface TrendAnalysis {
  applicationTrend: 'increasing' | 'decreasing' | 'stable'
  peakTimes: string[]
  bottlenecks: string[]
  efficiency: number
  totalApplications: number
  avgProcessingTime: number
}

export class PredictiveAnalytics {
  private static instance: PredictiveAnalytics
  private readonly MODEL_VERSION = 'v2.0'
  
  static getInstance(): PredictiveAnalytics {
    if (!PredictiveAnalytics.instance) {
      PredictiveAnalytics.instance = new PredictiveAnalytics()
    }
    return PredictiveAnalytics.instance
  }

  async predictAdmissionSuccess(applicationData: any): Promise<PredictionResult> {
    try {
      // Validate session
      const isValid = await sessionManager.isSessionValid()
      if (!isValid) {
        throw new Error('Session expired')
      }

      const historicalData = await this.getHistoricalData(applicationData.program)
      const score = this.calculateProbabilityScore(applicationData, historicalData)
      const riskFactors = this.identifyRiskFactors(applicationData)
      const recommendations = this.generateRecommendations(applicationData, score)
      const confidence = this.calculateConfidence(applicationData, historicalData)
      
      const result: PredictionResult = {
        admissionProbability: score,
        processingTimeEstimate: this.estimateProcessingTime(applicationData),
        riskFactors,
        recommendations,
        confidence,
        modelVersion: this.MODEL_VERSION
      }

      // Store prediction results
      if (applicationData.id) {
        await this.storePredictionResults(applicationData.id, result)
      }
      
      return result
    } catch (error) {
      const sanitizedError = sanitizeForLog(error instanceof Error ? error.message : 'Unknown error')
      console.error('Prediction failed:', sanitizedError)
      return {
        admissionProbability: 0.5,
        processingTimeEstimate: 5,
        riskFactors: ['Prediction service unavailable'],
        recommendations: ['Please try again later'],
        confidence: 0.1,
        modelVersion: this.MODEL_VERSION
      }
    }
  }

  async analyzeTrends(): Promise<TrendAnalysis> {
    try {
      // Validate session
      const isValid = await sessionManager.isSessionValid()
      if (!isValid) {
        throw new Error('Session expired')
      }

      const { data: applications } = await supabase
        .from('applications_new')
        .select('created_at, status, program, updated_at')
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())

      const apps = applications || []
      
      return {
        applicationTrend: this.calculateTrend(apps),
        peakTimes: this.identifyPeakTimes(apps),
        bottlenecks: this.identifyBottlenecks(apps),
        efficiency: this.calculateEfficiency(apps),
        totalApplications: apps.length,
        avgProcessingTime: this.calculateAvgProcessingTime(apps)
      }
    } catch (error) {
      const sanitizedError = error instanceof Error ? error.message : 'Unknown error'
      console.error('Trend analysis failed:', sanitizedError)
      return {
        applicationTrend: 'stable',
        peakTimes: [],
        bottlenecks: ['Analysis unavailable'],
        efficiency: 0,
        totalApplications: 0,
        avgProcessingTime: 0
      }
    }
  }

  private async getHistoricalData(program: string) {
    const { data } = await supabase
      .from('applications_new')
      .select('status, program, created_at, updated_at')
      .eq('program', program)
      .in('status', ['approved', 'rejected'])
      .gte('created_at', new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString()) // Last year
      .order('created_at', { ascending: false })
      .limit(200)
    
    return data || []
  }

  private calculateProbabilityScore(applicationData: any, historicalData: any[]): number {
    let score = 0.4 // Base score
    
    // Grade-based scoring (40% weight) - 1 is best, 9 is worst in Zambian system
    if (applicationData.grades?.length >= 6) score += 0.15
    if (applicationData.grades?.length >= 8) score += 0.1
    
    const avgGrade = applicationData.grades?.reduce((sum: number, g: any) => sum + g.grade, 0) / (applicationData.grades?.length || 1)
    if (avgGrade <= 3) score += 0.2  // Excellent grades (1-3)
    else if (avgGrade <= 4) score += 0.15  // Good grades (4)
    else if (avgGrade <= 5) score += 0.1   // Average grades (5)
    
    // Document completeness (20% weight)
    if (applicationData.result_slip_url) score += 0.1
    if (applicationData.pop_url) score += 0.1
    
    // Program-specific adjustments (20% weight)
    if (historicalData.length > 0) {
      const programSuccess = historicalData.filter(h => h.status === 'approved').length / historicalData.length
      score += programSuccess * 0.2
    }
    
    // Core subjects bonus (20% weight)
    const coreSubjects = this.getCoreSubjects(applicationData.program)
    const coreGrades = applicationData.grades?.filter((g: any) => 
      coreSubjects.some(core => g.subject.toLowerCase().includes(core.toLowerCase()))
    ) || []
    
    if (coreGrades.length >= coreSubjects.length) {
      const avgCoreGrade = coreGrades.reduce((sum: number, g: any) => sum + g.grade, 0) / coreGrades.length
      if (avgCoreGrade <= 3) score += 0.15  // Excellent core grades
      else if (avgCoreGrade <= 4) score += 0.1   // Good core grades
    }
    
    return Math.min(Math.max(score, 0.05), 0.98)
  }

  private estimateProcessingTime(applicationData: any): number {
    let baseTime = 2 // Base processing days for complete applications
    
    // Document-related delays
    if (!applicationData.result_slip_url) baseTime += 3
    if (!applicationData.pop_url) baseTime += 2
    if (!applicationData.extra_kyc_url) baseTime += 1
    
    // Application completeness
    if (applicationData.grades?.length < 5) baseTime += 2
    if (applicationData.grades?.length < 6) baseTime += 1
    
    // Quality factors that speed up processing (1 is best grade)
    const avgGrade = applicationData.grades?.reduce((sum: number, g: any) => sum + g.grade, 0) / (applicationData.grades?.length || 1)
    if (avgGrade <= 3 && applicationData.grades?.length >= 6) baseTime -= 1  // Excellent grades speed up processing
    
    return Math.max(baseTime, 1) // Minimum 1 day
  }

  private identifyRiskFactors(applicationData: any): string[] {
    const risks: string[] = []
    
    if (applicationData.grades?.length < 5) {
      risks.push('Insufficient number of subjects (minimum 5 required)')
    }
    
    if (!applicationData.result_slip_url) {
      risks.push('Missing result slip document')
    }
    
    if (!applicationData.pop_url) {
      risks.push('Missing proof of payment')
    }
    
    // Check grade quality (1 is best, 9 is worst in Zambian system)
    if (applicationData.grades?.some((g: any) => g.grade > 6)) {
      risks.push('Some grades may not meet program requirements')
    }
    
    // Check core subjects for specific programs
    const coreSubjects = this.getCoreSubjects(applicationData.program)
    const hasAllCore = coreSubjects.every(subject => 
      applicationData.grades?.some((g: any) => 
        g.subject.toLowerCase().includes(subject.toLowerCase())
      )
    )
    
    if (!hasAllCore && coreSubjects.length > 0) {
      risks.push('Missing core subjects for selected program')
    }
    
    return risks
  }

  private getCoreSubjects(program: string): string[] {
    const coreSubjectsMap: Record<string, string[]> = {
      'Clinical Medicine': ['Mathematics', 'Biology', 'Chemistry'],
      'Environmental Health': ['Mathematics', 'Biology', 'Chemistry'],
      'Registered Nursing': ['Mathematics', 'Biology', 'English']
    }
    
    return coreSubjectsMap[program] || []
  }

  private generateRecommendations(applicationData: any, score: number): string[] {
    // Generate intelligent recommendations using local logic (100% free)
    const recommendations: string[] = []
    
    if (score < 0.6) {
      recommendations.push('Consider adding more subjects to strengthen your application')
      recommendations.push('Focus on improving grades in core subjects')
    } else if (score < 0.8) {
      recommendations.push('Good application - consider adding one more strong subject')
    } else {
      recommendations.push('Excellent application with high approval probability')
    }
    
    if (!applicationData.extra_kyc_url) {
      recommendations.push('Upload additional KYC documents for faster processing')
    }
    
    if (applicationData.grades?.length < 7) {
      recommendations.push('Adding more subjects can improve your chances')
    }
    
    // Program-specific recommendations
    const programRecs = this.getProgramRecommendations(applicationData.program, applicationData.grades)
    recommendations.push(...programRecs)
    
    return recommendations
  }

  private getProgramRecommendations(program: string, grades: any[]): string[] {
    const recommendations: string[] = []
    
    if (program === 'Clinical Medicine') {
      const hasMath = grades?.some(g => g.subject.toLowerCase().includes('math'))
      const hasBio = grades?.some(g => g.subject.toLowerCase().includes('bio'))
      
      if (!hasMath) recommendations.push('Mathematics is essential for Clinical Medicine')
      if (!hasBio) recommendations.push('Biology is required for Clinical Medicine')
    }
    
    return recommendations
  }

  private calculateTrend(applications: any[]): 'increasing' | 'decreasing' | 'stable' {
    if (applications.length < 2) return 'stable'
    
    const recent = applications.filter(a => 
      new Date(a.created_at) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    ).length
    
    const previous = applications.filter(a => {
      const date = new Date(a.created_at)
      return date > new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) &&
             date <= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    }).length
    
    if (previous === 0) {
      return recent > 0 ? 'increasing' : 'stable'
    }
    
    const changeRatio = recent / previous
    
    if (changeRatio > 1.2) return 'increasing'
    if (changeRatio < 0.8) return 'decreasing'
    return 'stable'
  }

  private identifyPeakTimes(applications: any[]): string[] {
    const hourCounts: Record<number, number> = {}
    
    applications.forEach(app => {
      const hour = new Date(app.created_at).getHours()
      hourCounts[hour] = (hourCounts[hour] || 0) + 1
    })
    
    if (Object.keys(hourCounts).length === 0) return []
    
    const maxCount = Math.max(...Object.values(hourCounts))
    const threshold = Math.max(maxCount * 0.6, 2) // At least 2 applications or 60% of peak
    
    return Object.entries(hourCounts)
      .filter(([_, count]) => count >= threshold)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5) // Top 5 peak times
      .map(([hour, count]) => `${hour}:00 (${count} apps)`)
  }

  private identifyBottlenecks(applications: any[]): string[] {
    const bottlenecks: string[] = []
    const pending = applications.filter(a => a.status === 'submitted').length
    const underReview = applications.filter(a => a.status === 'under_review').length
    const total = applications.length
    
    if (pending > 20) {
      bottlenecks.push(`High volume of pending applications (${pending})`)
    }
    
    if (underReview > 15) {
      bottlenecks.push(`Many applications under review (${underReview})`)
    }
    
    if (total > 0) {
      const pendingRatio = (pending + underReview) / total
      if (pendingRatio > 0.7) {
        bottlenecks.push('Processing capacity may be exceeded')
      }
    }
    
    // Check for old applications
    const oldApps = applications.filter(a => {
      const daysSince = (Date.now() - new Date(a.created_at).getTime()) / (1000 * 60 * 60 * 24)
      return daysSince > 7 && ['submitted', 'under_review'].includes(a.status)
    }).length
    
    if (oldApps > 5) {
      bottlenecks.push(`${oldApps} applications overdue for processing`)
    }
    
    return bottlenecks
  }

  private calculateEfficiency(applications: any[]): number {
    const processed = applications.filter(a => ['approved', 'rejected'].includes(a.status)).length
    return applications.length > 0 ? (processed / applications.length) * 100 : 100
  }

  private calculateAvgProcessingTime(applications: any[]): number {
    const processedApps = applications.filter(a => 
      ['approved', 'rejected'].includes(a.status) && a.updated_at
    )
    
    if (processedApps.length === 0) return 0
    
    const totalTime = processedApps.reduce((sum, app) => {
      const created = new Date(app.created_at)
      const updated = new Date(app.updated_at)
      return sum + (updated.getTime() - created.getTime())
    }, 0)
    
    return Math.round(totalTime / processedApps.length / (1000 * 60 * 60 * 24)) // Days
  }

  private calculateConfidence(applicationData: any, historicalData: any[]): number {
    let confidence = 0.7 // Base confidence
    
    // Increase confidence based on data completeness
    if (applicationData.grades?.length >= 6) confidence += 0.1
    if (applicationData.result_slip_url) confidence += 0.1
    if (applicationData.pop_url) confidence += 0.05
    if (historicalData.length >= 50) confidence += 0.05
    
    return Math.min(confidence, 0.95)
  }

  private async storePredictionResults(applicationId: string, result: PredictionResult): Promise<void> {
    try {
      const { error } = await supabase
        .from('prediction_results')
        .insert({
          application_id: applicationId,
          admission_probability: result.admissionProbability,
          processing_time_estimate: result.processingTimeEstimate,
          risk_factors: result.riskFactors,
          recommendations: result.recommendations,
          confidence: result.confidence,
          model_version: result.modelVersion
        })
      
      if (error) {
        const sanitizedError = error.message || 'Unknown error'
        console.error('Failed to store prediction results:', sanitizedError)
      }
    } catch (error) {
      const sanitizedError = error instanceof Error ? error.message : 'Unknown error'
      console.error('Error storing prediction results:', sanitizedError)
    }
  }
}

export const predictiveAnalytics = PredictiveAnalytics.getInstance()