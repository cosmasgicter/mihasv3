/**
 * Analytics Service
 * Provides functions to interact with analytics API endpoints
 */

import { supabase } from '@/lib/supabase'

export interface PredictionData {
  period: string
  predictedVolume: number
  confidence: number
  trend: 'up' | 'down' | 'stable'
}

export interface PredictiveAnalyticsResponse {
  predictions: PredictionData[]
  metadata: {
    daysAhead: number
    generatedAt: string
    modelVersion: string
  }
}

export interface ComplianceCheck {
  id: string
  checkType: string
  status: 'passed' | 'failed' | 'warning'
  message: string
  timestamp: string
  details?: Record<string, any>
}

export interface ComplianceReport {
  overallStatus: 'compliant' | 'non-compliant' | 'partial'
  totalChecks: number
  passedChecks: number
  failedChecks: number
  warningChecks: number
  complianceScore: number
  checks: ComplianceCheck[]
  generatedAt: string
}

export interface RealtimeMetrics {
  activeApplications: number
  todaySubmissions: number
  pendingReviews: number
  averageProcessingTime: number
  systemLoad: number
  lastUpdated: string
}

/**
 * Get authentication token for API requests
 */
async function getAuthToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token || null
}

/**
 * Predictive Analytics API
 */
export const predictiveAnalytics = {
  /**
   * Get application volume predictions
   */
  async getApplicationVolume(daysAhead: number = 30): Promise<PredictiveAnalyticsResponse> {
    const token = await getAuthToken()
    
    const response = await fetch('/analytics/predictive/application-volume', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` })
      },
      body: JSON.stringify({
        daysAhead,
        includeConfidence: true
      })
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch predictions: ${response.statusText}`)
    }

    return response.json()
  },

  /**
   * Generate predictive analytics report
   */
  async generateReport(daysAhead: number = 30, format: 'pdf' | 'excel' | 'json' = 'pdf'): Promise<Blob> {
    const token = await getAuthToken()
    
    const response = await fetch('/analytics/predictive/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` })
      },
      body: JSON.stringify({
        daysAhead,
        format
      })
    })

    if (!response.ok) {
      throw new Error(`Failed to generate report: ${response.statusText}`)
    }

    return response.blob()
  }
}

/**
 * Compliance Analytics API
 */
export const complianceAnalytics = {
  /**
   * Run compliance checks
   */
  async runCheck(includeDetails: boolean = true): Promise<ComplianceReport> {
    const token = await getAuthToken()
    
    const response = await fetch('/analytics/compliance/check', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` })
      },
      body: JSON.stringify({
        includeDetails
      })
    })

    if (!response.ok) {
      throw new Error(`Failed to run compliance check: ${response.statusText}`)
    }

    return response.json()
  },

  /**
   * Generate compliance report
   */
  async generateReport(format: 'pdf' | 'excel' | 'json' = 'pdf', includeDetails: boolean = true): Promise<Blob> {
    const token = await getAuthToken()
    
    const response = await fetch('/analytics/compliance/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` })
      },
      body: JSON.stringify({
        format,
        includeDetails
      })
    })

    if (!response.ok) {
      throw new Error(`Failed to generate compliance report: ${response.statusText}`)
    }

    return response.blob()
  },

  /**
   * Validate compliance
   */
  async validate(): Promise<{ success: boolean; message: string }> {
    const token = await getAuthToken()
    
    const response = await fetch('/analytics/compliance/validate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` })
      }
    })

    if (!response.ok) {
      throw new Error(`Failed to validate compliance: ${response.statusText}`)
    }

    return response.json()
  }
}

/**
 * Real-time Metrics API
 */
export const realtimeMetrics = {
  /**
   * Get current real-time metrics
   */
  async getMetrics(): Promise<RealtimeMetrics> {
    const token = await getAuthToken()
    
    const response = await fetch('/analytics/realtime-metrics', {
      method: 'GET',
      headers: {
        ...(token && { 'Authorization': `Bearer ${token}` })
      }
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch real-time metrics: ${response.statusText}`)
    }

    return response.json()
  }
}

/**
 * Comprehensive Metrics API
 */
export const comprehensiveMetrics = {
  /**
   * Get comprehensive metrics for a time range
   */
  async getMetrics(
    startDate: string,
    endDate: string,
    programs?: string[],
    includeTimeSeries: boolean = true,
    includeProcessingTimes: boolean = true
  ): Promise<any> {
    const token = await getAuthToken()
    
    const response = await fetch('/analytics/comprehensive-metrics', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` })
      },
      body: JSON.stringify({
        timeRange: {
          startDate,
          endDate
        },
        programs,
        includeTimeSeries,
        includeProcessingTimes
      })
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch comprehensive metrics: ${response.statusText}`)
    }

    return response.json()
  }
}

/**
 * Dashboard API
 */
export const dashboardAnalytics = {
  /**
   * Get dashboard layout
   */
  async getDashboard(layoutId: string = 'default', includeAlerts: boolean = true): Promise<any> {
    const token = await getAuthToken()
    
    const response = await fetch(`/analytics/dashboard?layoutId=${layoutId}&includeAlerts=${includeAlerts}`, {
      method: 'GET',
      headers: {
        ...(token && { 'Authorization': `Bearer ${token}` })
      }
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch dashboard: ${response.statusText}`)
    }

    return response.json()
  },

  /**
   * Generate executive summary
   */
  async getExecutiveSummary(startDate: string, endDate: string): Promise<any> {
    const token = await getAuthToken()
    
    const response = await fetch('/analytics/dashboard', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` })
      },
      body: JSON.stringify({
        timeRange: {
          startDate,
          endDate
        },
        reportType: 'executive'
      })
    })

    if (!response.ok) {
      throw new Error(`Failed to generate executive summary: ${response.statusText}`)
    }

    return response.json()
  }
}
