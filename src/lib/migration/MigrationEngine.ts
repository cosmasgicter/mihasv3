/**
 * Migration Engine
 * Core engine for executing automated migrations with rollback capabilities
 */

import { apiClient } from '@/services/client'
import type {
  MigrationPlan,
  MigrationExecution,
  MigrationStep,
  MigrationResult,
  MigrationConfig,
  MigrationStepResult,
  ValidationResult
} from './types'

export class MigrationEngine {
  private config: MigrationConfig
  private currentExecution: MigrationExecution | null = null

  constructor(config: Partial<MigrationConfig> = {}) {
    this.config = {
      dryRun: false,
      autoRollback: true,
      continueOnWarning: true,
      backupBeforeExecution: true,
      maxRetries: 3,
      retryDelay: 1000,
      validationTimeout: 30000,
      ...config
    }
  }

  /**
   * Execute a migration plan with progress tracking and rollback capabilities
   */
  async executeMigration(plan: MigrationPlan): Promise<MigrationExecution> {
    const execution: MigrationExecution = {
      id: crypto.randomUUID(),
      planId: plan.id,
      status: 'pending',
      progress: 0,
      results: [],
      metadata: {
        config: this.config,
        environment: process.env.NODE_ENV,
        timestamp: new Date().toISOString()
      }
    }

    this.currentExecution = execution

    try {
      // Save execution record
      await this.saveExecution(execution)

      // Pre-execution validation
      const validationResult = await this.validatePlan(plan)
      if (!validationResult.valid && !this.config.continueOnWarning) {
        throw new Error(`Migration validation failed: ${validationResult.errors.join(', ')}`)
      }

      // Create backup if configured
      if (this.config.backupBeforeExecution) {
        await this.createBackup(execution.id)
      }

      execution.status = 'running'
      execution.startedAt = new Date()
      await this.saveExecution(execution)

      // Execute steps in order
      for (let i = 0; i < plan.steps.length; i++) {
        const step = plan.steps[i]
        execution.currentStep = step.id
        
        const stepResult = await this.executeStep(step, execution)
        execution.results.push(stepResult)
        execution.progress = ((i + 1) / plan.steps.length) * 100

        await this.saveExecution(execution)

        if (stepResult.status === 'failed') {
          if (this.config.autoRollback) {
            await this.rollbackExecution(execution)
            execution.status = 'rolled_back'
          } else {
            execution.status = 'failed'
          }
          break
        }
      }

      if (execution.status === 'running') {
        execution.status = 'completed'
        execution.completedAt = new Date()
      }

    } catch (error) {
      execution.status = 'failed'
      execution.metadata.error = error instanceof Error ? error.message : String(error)
      
      if (this.config.autoRollback && execution.results.length > 0) {
        await this.rollbackExecution(execution)
        execution.status = 'rolled_back'
      }
    }

    execution.completedAt = new Date()
    await this.saveExecution(execution)
    
    return execution
  }

  /**
   * Execute a single migration step with retry logic
   */
  private async executeStep(step: MigrationStep, execution: MigrationExecution): Promise<MigrationStepResult> {
    const stepResult: MigrationStepResult = {
      stepId: step.id,
      status: 'pending',
      startedAt: new Date()
    }

    try {
      // Validate step dependencies
      await this.validateStepDependencies(step, execution)

      stepResult.status = 'running'

      // Execute step with retry logic
      let lastError: Error | null = null
      for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
        try {
          if (this.config.dryRun) {
            stepResult.result = {
              success: true,
              message: `Dry run: ${step.name}`,
              executionTime: 0
            }
          } else {
            const startTime = Date.now()
            stepResult.result = await step.forward()
            stepResult.result.executionTime = Date.now() - startTime
          }

          if (stepResult.result.success) {
            stepResult.status = 'completed'
            break
          } else {
            throw new Error(stepResult.result.message)
          }
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error))
          
          if (attempt < this.config.maxRetries) {
            await new Promise(resolve => setTimeout(resolve, this.config.retryDelay * attempt))
          }
        }
      }

      if (stepResult.status !== 'completed') {
        stepResult.status = 'failed'
        stepResult.result = {
          success: false,
          message: lastError?.message || 'Step execution failed',
          errors: [lastError?.message || 'Unknown error'],
          executionTime: 0
        }
      }

    } catch (error) {
      stepResult.status = 'failed'
      stepResult.result = {
        success: false,
        message: error instanceof Error ? error.message : String(error),
        errors: [error instanceof Error ? error.message : String(error)],
        executionTime: 0
      }
    }

    stepResult.completedAt = new Date()
    return stepResult
  }

  /**
   * Rollback a migration execution
   */
  async rollbackExecution(execution: MigrationExecution): Promise<void> {
    const completedSteps = execution.results
      .filter(r => r.status === 'completed')
      .reverse() // Rollback in reverse order

    for (const stepResult of completedSteps) {
      const step = await this.getStepById(stepResult.stepId)
      if (step && step.rollback) {
        try {
          await step.rollback()
        } catch (error) {
          console.error(`Rollback failed for step ${step.id}:`, error)
          // Continue with other rollbacks even if one fails
        }
      }
    }
  }

  /**
   * Validate migration plan before execution
   */
  private async validatePlan(plan: MigrationPlan): Promise<ValidationResult> {
    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
      checks: []
    }

    // Check for circular dependencies
    const dependencyCheck = this.validateDependencies(plan.steps)
    result.checks.push(dependencyCheck)
    if (!dependencyCheck.passed) {
      result.valid = false
      result.errors.push(dependencyCheck.message)
    }

    // Validate each step
    for (const step of plan.steps) {
      if (step.validate) {
        try {
          const stepValidation = await Promise.race([
            step.validate(),
            new Promise<ValidationResult>((_, reject) => 
              setTimeout(() => reject(new Error('Validation timeout')), this.config.validationTimeout)
            )
          ])
          
          result.checks.push(...stepValidation.checks)
          result.errors.push(...stepValidation.errors)
          result.warnings.push(...stepValidation.warnings)
          
          if (!stepValidation.valid) {
            result.valid = false
          }
        } catch (error) {
          const check = {
            name: `${step.name} validation`,
            passed: false,
            message: error instanceof Error ? error.message : String(error),
            severity: 'error' as const
          }
          result.checks.push(check)
          result.errors.push(check.message)
          result.valid = false
        }
      }
    }

    return result
  }

  /**
   * Validate step dependencies
   */
  private validateDependencies(steps: MigrationStep[]) {
    const stepIds = new Set(steps.map(s => s.id))
    const visited = new Set<string>()
    const visiting = new Set<string>()

    const hasCycle = (stepId: string): boolean => {
      if (visiting.has(stepId)) return true
      if (visited.has(stepId)) return false

      visiting.add(stepId)
      
      const step = steps.find(s => s.id === stepId)
      if (step?.dependencies) {
        for (const dep of step.dependencies) {
          if (!stepIds.has(dep)) {
            return true // Missing dependency
          }
          if (hasCycle(dep)) {
            return true
          }
        }
      }

      visiting.delete(stepId)
      visited.add(stepId)
      return false
    }

    for (const step of steps) {
      if (hasCycle(step.id)) {
        return {
          name: 'Dependency validation',
          passed: false,
          message: 'Circular dependency or missing dependency detected',
          severity: 'error' as const
        }
      }
    }

    return {
      name: 'Dependency validation',
      passed: true,
      message: 'All dependencies are valid',
      severity: 'info' as const
    }
  }

  /**
   * Validate step dependencies during execution
   */
  private async validateStepDependencies(step: MigrationStep, execution: MigrationExecution): Promise<void> {
    if (!step.dependencies) return

    for (const depId of step.dependencies) {
      const depResult = execution.results.find(r => r.stepId === depId)
      if (!depResult || depResult.status !== 'completed') {
        throw new Error(`Dependency ${depId} not completed for step ${step.id}`)
      }
    }
  }

  /**
   * Create backup before migration
   */
  private async createBackup(migrationId: string): Promise<void> {
    // Implementation would depend on the specific backup strategy
    // This is a placeholder for the backup creation logic
    console.log(`Creating backup for migration ${migrationId}`)
  }

  /**
   * Save migration execution to database
   */
  private async saveExecution(execution: MigrationExecution): Promise<void> {
    try {
      await apiClient.request('/admin?action=migrate', {
        method: 'POST',
        body: JSON.stringify({
          type: 'save_execution',
          id: execution.id,
          plan_id: execution.planId,
          status: execution.status,
          started_at: execution.startedAt?.toISOString(),
          completed_at: execution.completedAt?.toISOString(),
          current_step: execution.currentStep,
          progress: execution.progress,
          results: execution.results,
          rollback_point: execution.rollbackPoint,
          metadata: execution.metadata
        })
      })
    } catch (error) {
      console.error('Failed to save migration execution:', error instanceof Error ? error.message : error)
    }
  }

  /**
   * Get step by ID (placeholder - would need step registry)
   */
  private async getStepById(stepId: string): Promise<MigrationStep | null> {
    // This would typically query a step registry or database
    return null
  }

  /**
   * Get current execution status
   */
  getCurrentExecution(): MigrationExecution | null {
    return this.currentExecution
  }

  /**
   * Cancel current migration
   */
  async cancelMigration(): Promise<void> {
    if (this.currentExecution && this.currentExecution.status === 'running') {
      this.currentExecution.status = 'failed'
      this.currentExecution.metadata.cancelled = true
      
      if (this.config.autoRollback) {
        await this.rollbackExecution(this.currentExecution)
        this.currentExecution.status = 'rolled_back'
      }
      
      await this.saveExecution(this.currentExecution)
    }
  }
}