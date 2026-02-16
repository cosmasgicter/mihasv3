// @ts-nocheck
/**
 * Migration Progress Tracker
 * Provides real-time tracking and reporting of migration progress
 * 
 * @deprecated This module uses the deprecated Supabase stub.
 * TODO: Migrate to API endpoints when migration tracker is reactivated.
 */

import { apiClient } from '@/services/client'
import type { MigrationExecution, MigrationStepResult } from './types'

export interface MigrationProgress {
  executionId: string
  planId: string
  status: string
  progress: number
  currentStep?: string
  startedAt?: Date
  estimatedCompletion?: Date
  stepsCompleted: number
  stepsTotal: number
  errors: string[]
  warnings: string[]
}

export interface MigrationReport {
  execution: MigrationExecution
  summary: {
    totalSteps: number
    completedSteps: number
    failedSteps: number
    skippedSteps: number
    totalExecutionTime: number
    averageStepTime: number
  }
  stepDetails: Array<{
    stepId: string
    name: string
    status: string
    executionTime: number
    errors: string[]
    warnings: string[]
  }>
  recommendations: string[]
}

export class MigrationTracker {
  private progressCallbacks: Array<(progress: MigrationProgress) => void> = []
  private activeExecutions = new Map<string, MigrationExecution>()

  /**
   * Subscribe to migration progress updates
   */
  onProgress(callback: (progress: MigrationProgress) => void): () => void {
    this.progressCallbacks.push(callback)
    
    // Return unsubscribe function
    return () => {
      const index = this.progressCallbacks.indexOf(callback)
      if (index > -1) {
        this.progressCallbacks.splice(index, 1)
      }
    }
  }

  /**
   * Start tracking a migration execution
   */
  async startTracking(execution: MigrationExecution): Promise<void> {
    this.activeExecutions.set(execution.id, execution)
    await this.updateProgress(execution)
  }

  /**
   * Update migration progress
   */
  async updateProgress(execution: MigrationExecution): Promise<void> {
    this.activeExecutions.set(execution.id, execution)
    
    const progress = this.calculateProgress(execution)
    
    // Notify all subscribers
    this.progressCallbacks.forEach(callback => {
      try {
        callback(progress)
      } catch (error) {
        console.error('Error in progress callback:', error)
      }
    })

    // Save progress to database
    await this.saveProgress(progress)
  }

  /**
   * Calculate detailed progress information
   */
  private calculateProgress(execution: MigrationExecution): MigrationProgress {
    const completedSteps = execution.results.filter(r => r.status === 'completed').length
    const totalSteps = execution.results.length
    
    const errors = execution.results
      .filter(r => r.result?.errors)
      .flatMap(r => r.result?.errors || [])
    
    const warnings = execution.results
      .filter(r => r.result?.warnings)
      .flatMap(r => r.result?.warnings || [])

    let estimatedCompletion: Date | undefined
    if (execution.startedAt && execution.progress > 0 && execution.status === 'running') {
      const elapsed = Date.now() - execution.startedAt.getTime()
      const estimatedTotal = (elapsed / execution.progress) * 100
      const remaining = estimatedTotal - elapsed
      estimatedCompletion = new Date(Date.now() + remaining)
    }

    return {
      executionId: execution.id,
      planId: execution.planId,
      status: execution.status,
      progress: execution.progress,
      currentStep: execution.currentStep,
      startedAt: execution.startedAt,
      estimatedCompletion,
      stepsCompleted: completedSteps,
      stepsTotal: totalSteps,
      errors,
      warnings
    }
  }

  /**
   * Generate comprehensive migration report
   */
  async generateReport(executionId: string): Promise<MigrationReport> {
    const execution = this.activeExecutions.get(executionId)
    if (!execution) {
      throw new Error(`Migration execution ${executionId} not found`)
    }

    const completedSteps = execution.results.filter(r => r.status === 'completed')
    const failedSteps = execution.results.filter(r => r.status === 'failed')
    const skippedSteps = execution.results.filter(r => r.status === 'skipped')

    const totalExecutionTime = execution.results.reduce((total, result) => {
      return total + (result.result?.executionTime || 0)
    }, 0)

    const averageStepTime = completedSteps.length > 0 
      ? totalExecutionTime / completedSteps.length 
      : 0

    const stepDetails = execution.results.map(result => ({
      stepId: result.stepId,
      name: result.stepId, // Would need step registry to get actual name
      status: result.status,
      executionTime: result.result?.executionTime || 0,
      errors: result.result?.errors || [],
      warnings: result.result?.warnings || []
    }))

    const recommendations = this.generateRecommendations(execution)

    return {
      execution,
      summary: {
        totalSteps: execution.results.length,
        completedSteps: completedSteps.length,
        failedSteps: failedSteps.length,
        skippedSteps: skippedSteps.length,
        totalExecutionTime,
        averageStepTime
      },
      stepDetails,
      recommendations
    }
  }

  /**
   * Generate recommendations based on migration results
   */
  private generateRecommendations(execution: MigrationExecution): string[] {
    const recommendations: string[] = []
    
    const failedSteps = execution.results.filter(r => r.status === 'failed')
    const slowSteps = execution.results.filter(r => 
      r.result?.executionTime && r.result.executionTime > 30000 // > 30 seconds
    )

    if (failedSteps.length > 0) {
      recommendations.push(
        `${failedSteps.length} step(s) failed. Review error logs and consider breaking down complex steps.`
      )
    }

    if (slowSteps.length > 0) {
      recommendations.push(
        `${slowSteps.length} step(s) took longer than 30 seconds. Consider optimizing or adding progress indicators.`
      )
    }

    if (execution.status === 'rolled_back') {
      recommendations.push(
        'Migration was rolled back. Ensure all dependencies are met before retrying.'
      )
    }

    const warningCount = execution.results.reduce((count, result) => {
      return count + (result.result?.warnings?.length || 0)
    }, 0)

    if (warningCount > 0) {
      recommendations.push(
        `${warningCount} warning(s) were generated. Review warnings to prevent future issues.`
      )
    }

    return recommendations
  }

  /**
   * Get active migrations
   */
  getActiveMigrations(): MigrationExecution[] {
    return Array.from(this.activeExecutions.values())
      .filter(execution => execution.status === 'running' || execution.status === 'pending')
  }

  /**
   * Get migration history
   */
  async getMigrationHistory(limit = 50): Promise<MigrationExecution[]> {
    try {
      const result = await apiClient.request<{
        data?: any[]
        [key: string]: unknown
      }>(`/admin?action=migrate&type=history&limit=${limit}`)

      const data = result?.data ?? []
      return data.map((row: any) => ({
        id: row.id,
        planId: row.plan_id,
        status: row.status,
        startedAt: row.started_at ? new Date(row.started_at) : undefined,
        completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
        currentStep: row.current_step,
        progress: row.progress,
        results: row.results || [],
        rollbackPoint: row.rollback_point,
        metadata: row.metadata || {}
      }))
    } catch (error) {
      console.error('Failed to fetch migration history:', error instanceof Error ? error.message : error)
      return []
    }
  }

  /**
   * Save progress to database
   */
  private async saveProgress(progress: MigrationProgress): Promise<void> {
    try {
      await apiClient.request('/admin?action=migrate', {
        method: 'POST',
        body: JSON.stringify({
          type: 'save_progress',
          execution_id: progress.executionId,
          plan_id: progress.planId,
          status: progress.status,
          progress: progress.progress,
          current_step: progress.currentStep,
          started_at: progress.startedAt?.toISOString(),
          estimated_completion: progress.estimatedCompletion?.toISOString(),
          steps_completed: progress.stepsCompleted,
          steps_total: progress.stepsTotal,
          errors: progress.errors,
          warnings: progress.warnings,
          updated_at: new Date().toISOString()
        })
      })
    } catch (error) {
      console.error('Failed to save migration progress:', error instanceof Error ? error.message : error)
    }
  }

  /**
   * Stop tracking a migration
   */
  stopTracking(executionId: string): void {
    this.activeExecutions.delete(executionId)
  }

  /**
   * Clear all tracking data
   */
  clearAll(): void {
    this.activeExecutions.clear()
    this.progressCallbacks.length = 0
  }
}