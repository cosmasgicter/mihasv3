import { supabase } from './supabase'
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
      schedule: '0 2 * * *', // Daily at 2 AM
      nextRun: new Date(Date.now() + 24 * 60 * 60 * 1000),
      status: 'pending'
    },
    {
      id: 'backup-database',
      name: 'Database Backup',
      description: 'Create daily database backup',
      schedule: '0 1 * * *', // Daily at 1 AM
      nextRun: new Date(Date.now() + 24 * 60 * 60 * 1000),
      status: 'pending'
    },
    {
      id: 'update-metrics',
      name: 'Update Performance Metrics',
      description: 'Aggregate and update performance metrics',
      schedule: '0 */6 * * *', // Every 6 hours
      nextRun: new Date(Date.now() + 6 * 60 * 60 * 1000),
      status: 'pending'
    },
    {
      id: 'health-check',
      name: 'System Health Check',
      description: 'Comprehensive system health verification',
      schedule: '*/15 * * * *', // Every 15 minutes
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
    const cutoffDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    
    // Clean up old application drafts
    await supabase
      .from('application_drafts')
      .delete()
      .lt('created_at', cutoffDate.toISOString())

    // Clean up old error logs
    await supabase
      .from('error_logs')
      .delete()
      .lt('timestamp', cutoffDate.toISOString())
  }

  private async backupDatabase() {
    // In production, this would trigger a proper backup
    // For now, we'll just log the backup attempt
    monitoring.trackMetric('database_backup', 1, { 
      timestamp: new Date().toISOString() 
    })
  }

  private async updateMetrics() {
    const { data: applications } = await supabase
      .from('applications')
      .select('status, created_at')

    if (applications) {
      const statusCounts = applications.reduce((acc, app) => {
        acc[app.status] = (acc[app.status] || 0) + 1
        return acc
      }, {} as Record<string, number>)

      Object.entries(statusCounts).forEach(([status, count]) => {
        monitoring.trackMetric('application_status_count', count, { status })
      })
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
      await supabase.from('maintenance_logs').insert({
        task_id: task.id,
        task_name: task.name,
        success,
        duration: task.duration,
        error_message: error,
        executed_at: new Date().toISOString()
      })
    } catch (logError) {
      console.error('Failed to log task execution:', logError)
    }
  }

  getTasks(): MaintenanceTask[] {
    return [...this.tasks]
  }

  async getMaintenanceLogs(limit = 50) {
    const { data } = await supabase
      .from('maintenance_logs')
      .select('*')
      .order('executed_at', { ascending: false })
      .limit(limit)

    return data || []
  }

  // Update management
  async checkForUpdates(): Promise<UpdateInfo | null> {
    try {
      // In a real app, this would check a remote endpoint
      const currentVersion = '1.0.0'
      const latestVersion = '1.0.1'
      
      if (this.compareVersions(currentVersion, latestVersion) < 0) {
        return {
          version: latestVersion,
          releaseDate: new Date(),
          features: ['Improved performance', 'New monitoring dashboard'],
          fixes: ['Fixed file upload issue', 'Resolved authentication bug'],
          breaking: false
        }
      }
      
      return null
    } catch (error) {
      console.error('Failed to check for updates:', error)
      return null
    }
  }

  private compareVersions(version1: string, version2: string): number {
    const v1Parts = version1.split('.').map(Number)
    const v2Parts = version2.split('.').map(Number)
    
    for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
      const v1Part = v1Parts[i] || 0
      const v2Part = v2Parts[i] || 0
      
      if (v1Part < v2Part) return -1
      if (v1Part > v2Part) return 1
    }
    
    return 0
  }

  async scheduleUpdate(version: string, scheduledTime: Date) {
    try {
      await supabase.from('scheduled_updates').insert({
        version,
        scheduled_time: scheduledTime.toISOString(),
        status: 'scheduled'
      })
      
      monitoring.createAlert('info', 
        `System update to v${version} scheduled for ${scheduledTime.toLocaleString()}`,
        { version, scheduledTime: scheduledTime.toISOString() }
      )
    } catch (error) {
      console.error('Failed to schedule update:', error)
    }
  }
}

export const maintenance = new MaintenanceService()