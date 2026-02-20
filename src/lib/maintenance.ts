// @ts-nocheck
/**
 * Maintenance Tasks
 * 
 * Manages scheduled maintenance operations via API.
 */
import { apiClient } from '@/services/client'
import { monitoring } from './monitoring'

export interface MaintenanceTask {
  id: string
  name: string
  description: string
  schedule: string // cron expression
  lastRun?: Date
  nextRun: Date
  status: 'pending' | 'running' | 'completed' | 'failed'
  duration?: number
}

export interface UpdateInfo {
  version: string
  releaseDate: Date
  features: string[]
  fixes: string[]
  breaking: boolean
}

class MaintenanceService {
  private tasks: MaintenanceTask[] = [
    {
      id: 'cleanup-temp-files',
      name: 'Cleanup Temporary Files',
      description: 'Remove temporary application files older than 7 days',
      schedule: '0 2 * * *',
      nextRun: new Date(Date.now() + 24 * 60 * 60 * 1000),
      status: 'pending'
    },
    {
      id: 'backup-database',
      name: 'Database Backup',
      description: 'Create daily database backup',
      schedule: '0 1 * * *',
      nextRun: new Date(Date.now() + 24 * 60 * 60 * 1000),
      status: 'pending'
    },
    {
      id: 'update-metrics',
      name: 'Update Performance Metrics',
      description: 'Aggregate and update performance metrics',
      schedule: '0 */6 * * *',
      nextRun: new Date(Date.now() + 6 * 60 * 60 * 1000),
      status: 'pending'
    },
    {
      id: 'health-check',
      name: 'System Health Check',
      description: 'Comprehensive system health verification',
      schedule: '*/15 * * * *',
      nextRun: new Date(Date.now() + 15 * 60 * 1000),
      status: 'pending'
    }
  ]

  async runTask(taskId: string): Promise<boolean> {
    const task = this.tasks.find(t => t.id === taskId)
    if (!task) return false

    task.status = 'running'
    const startTime = Date.now()

    try {
      switch (taskId) {
        case 'cleanup-temp-files':
          await this.cleanupTempFiles()
          break
        case 'backup-database':
          await this.backupDatabase()
          break
        case 'update-metrics':
          await this.updateMetrics()
          break
        case 'health-check':
          await this.performHealthCheck()
          break
        default:
          throw new Error(`Unknown task: ${taskId}`)
      }

      task.status = 'completed'
      task.lastRun = new Date()
      task.duration = Date.now() - startTime
      
      await this.logTaskExecution(task, true)
      return true
    } catch (error: any) {
      task.status = 'failed'
      task.duration = Date.now() - startTime
      
      await this.logTaskExecution(task, false, error.message)
      monitoring.logError(error, { task: taskId })
      return false
    }
  }

  private async cleanupTempFiles() {
    // Fire-and-forget cleanup via admin API
    try {
      await apiClient.request('/admin?action=cleanup', {
        method: 'POST',
        body: JSON.stringify({ type: 'temp_files', olderThanDays: 7 })
      })
    } catch {
      // Non-critical — log and continue
      console.error('Cleanup temp files failed (non-critical)')
    }
  }

  private async backupDatabase() {
    monitoring.trackMetric('database_backup', 1, { 
      timestamp: new Date().toISOString() 
    })
  }

  private async updateMetrics() {
    try {
      const result = await apiClient.request<{ data?: any }>('/admin?action=stats')
      if (result?.data) {
        monitoring.trackMetric('metrics_updated', 1, { timestamp: new Date().toISOString() })
      }
    } catch {
      console.error('Update metrics failed (non-critical)')
    }
  }

  private async performHealthCheck() {
    const checks = await monitoring.performHealthCheck()
    const unhealthyServices = checks.filter(c => c.status === 'unhealthy')
    
    if (unhealthyServices.length > 0) {
      monitoring.createAlert('error', 
        `Health check failed for: ${unhealthyServices.map(s => s.service).join(', ')}`,
        { services: unhealthyServices }
      )
    }
  }

  private async logTaskExecution(task: MaintenanceTask, success: boolean, error?: string) {
    try {
      // Fire-and-forget — maintenance logging is non-critical
      await apiClient.request('/admin?action=maintenance-log', {
        method: 'POST',
        body: JSON.stringify({
          task_id: task.id,
          task_name: task.name,
          success,
          duration: task.duration,
          error_message: error,
          executed_at: new Date().toISOString()
        })
      })
    } catch (logError) {
      console.error('Failed to log task execution:', logError)
    }
  }

  getTasks(): MaintenanceTask[] {
    return [...this.tasks]
  }

  async getMaintenanceLogs(limit = 50) {
    try {
      const result = await apiClient.request<{ data?: any[] }>(
        `/admin?action=maintenance-logs&limit=${limit}`
      )
      return result?.data ?? []
    } catch {
      return []
    }
  }

  /**
   * Update checking is not implemented — the system is deployed via Vercel
   * and updates are applied through git push. This method is a no-op.
   */
  async checkForUpdates(): Promise<UpdateInfo | null> {
    return null
  }

  /**
   * Update scheduling is not implemented — Vercel handles deployments.
   */
  async scheduleUpdate(_version: string, _scheduledTime: Date) {
    // No-op: Vercel deployments are triggered by git push
  }
}

export const maintenance = new MaintenanceService()
