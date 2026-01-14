/**
 * Migration Framework Types
 * Defines types for automated migration system with rollback capabilities
 */

export interface MigrationStep {
  id: string
  name: string
  description: string
  type: 'schema' | 'data' | 'config' | 'cleanup'
  forward: () => Promise<MigrationResult>
  rollback: () => Promise<MigrationResult>
  validate?: () => Promise<ValidationResult>
  dependencies?: string[]
  timeout?: number
}

export interface MigrationResult {
  success: boolean
  message: string
  data?: any
  errors?: string[]
  warnings?: string[]
  executionTime: number
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
  checks: ValidationCheck[]
}

export interface ValidationCheck {
  name: string
  passed: boolean
  message: string
  severity: 'error' | 'warning' | 'info'
}

export interface MigrationPlan {
  id: string
  name: string
  version: string
  description: string
  steps: MigrationStep[]
  createdAt: Date
  estimatedDuration: number
}

export interface MigrationExecution {
  id: string
  planId: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'rolled_back'
  startedAt?: Date
  completedAt?: Date
  currentStep?: string
  progress: number
  results: MigrationStepResult[]
  rollbackPoint?: string
  metadata: Record<string, any>
}

export interface MigrationStepResult {
  stepId: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  result?: MigrationResult
  startedAt?: Date
  completedAt?: Date
  rollbackData?: any
}

export interface MigrationConfig {
  dryRun: boolean
  autoRollback: boolean
  continueOnWarning: boolean
  backupBeforeExecution: boolean
  maxRetries: number
  retryDelay: number
  validationTimeout: number
}

export interface MigrationBackup {
  id: string
  migrationId: string
  type: 'full' | 'incremental'
  size: number
  location: string
  createdAt: Date
  verified: boolean
  metadata: Record<string, any>
}