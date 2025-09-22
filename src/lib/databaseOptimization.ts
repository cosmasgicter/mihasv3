// Database Optimization and Performance Utilities
import { supabase } from './supabase'
import { ErrorLogger } from './errorHandling'

export interface PerformanceMetrics {
  tableSize: string
  rowCount: number
  todayCount: number
  weekCount: number
  avgProcessingHours: number
}

export interface BackupMetadata {
  id: string
  backup_type: string
  table_name?: string
  backup_status: string
  started_at: string
  completed_at?: string
  error_message?: string
}

export class DatabaseOptimizer {
  // Get application processing metrics
  static async getApplicationMetrics(): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('application_metrics')
        .select('*')
        .order('date', { ascending: false })
        .limit(30)

      if (error) throw error
      return data || []
    } catch (error) {
      await ErrorLogger.logError({
        code: 'METRICS_FETCH_ERROR',
        message: 'Failed to fetch application metrics',
        details: error,
        timestamp: new Date(),
        operation: 'get_application_metrics'
      })
      throw error
    }
  }

  // Get system performance overview
  static async getSystemPerformance(): Promise<PerformanceMetrics[]> {
    try {
      const { data, error } = await supabase
        .from('system_performance')
        .select('*')

      if (error) throw error
      return data || []
    } catch (error) {
      await ErrorLogger.logError({
        code: 'PERFORMANCE_FETCH_ERROR',
        message: 'Failed to fetch system performance data',
        details: error,
        timestamp: new Date(),
        operation: 'get_system_performance'
      })
      throw error
    }
  }

  // Run database maintenance
  static async performMaintenance(): Promise<string> {
    try {
      const { data, error } = await supabase.rpc('perform_maintenance')
      if (error) throw error
      return data
    } catch (error) {
      await ErrorLogger.logError({
        code: 'MAINTENANCE_ERROR',
        message: 'Database maintenance failed',
        details: error,
        timestamp: new Date(),
        operation: 'perform_maintenance'
      })
      throw error
    }
  }

  // Archive old applications
  static async archiveOldApplications(cutoffDate?: string): Promise<number> {
    try {
      const params = cutoffDate ? { p_cutoff_date: cutoffDate } : {}
      const { data, error } = await supabase.rpc('archive_old_applications', params)
      if (error) throw error
      return data
    } catch (error) {
      await ErrorLogger.logError({
        code: 'ARCHIVE_ERROR',
        message: 'Failed to archive old applications',
        details: error,
        timestamp: new Date(),
        operation: 'archive_old_applications'
      })
      throw error
    }
  }

  // Clean up old draft applications
  static async cleanupOldDrafts(daysOld = 30): Promise<number> {
    try {
      const { data, error } = await supabase.rpc('cleanup_old_drafts', { p_days_old: daysOld })
      if (error) throw error
      return data
    } catch (error) {
      await ErrorLogger.logError({
        code: 'CLEANUP_ERROR',
        message: 'Failed to cleanup old drafts',
        details: error,
        timestamp: new Date(),
        operation: 'cleanup_old_drafts'
      })
      throw error
    }
  }
}

export class BackupManager {
  // Create backup record
  static async createBackupRecord(backupType: string, tableName?: string): Promise<string> {
    try {
      const { data, error } = await supabase.rpc('create_backup_record', {
        p_backup_type: backupType,
        p_table_name: tableName
      })
      if (error) throw error
      return data
    } catch (error) {
      await ErrorLogger.logError({
        code: 'BACKUP_RECORD_ERROR',
        message: 'Failed to create backup record',
        details: error,
        timestamp: new Date(),
        operation: 'create_backup_record'
      })
      throw error
    }
  }

  // Update backup status
  static async updateBackupStatus(
    backupId: string, 
    status: string, 
    errorMessage?: string
  ): Promise<boolean> {
    try {
      const { data, error } = await supabase.rpc('update_backup_status', {
        p_backup_id: backupId,
        p_status: status,
        p_error_message: errorMessage
      })
      if (error) throw error
      return data
    } catch (error) {
      await ErrorLogger.logError({
        code: 'BACKUP_UPDATE_ERROR',
        message: 'Failed to update backup status',
        details: error,
        timestamp: new Date(),
        operation: 'update_backup_status'
      })
      throw error
    }
  }

  // Get backup history
  static async getBackupHistory(limit = 50): Promise<BackupMetadata[]> {
    try {
      const { data, error } = await supabase
        .from('backup_metadata')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit)

      if (error) throw error
      return data || []
    } catch (error) {
      await ErrorLogger.logError({
        code: 'BACKUP_HISTORY_ERROR',
        message: 'Failed to fetch backup history',
        details: error,
        timestamp: new Date(),
        operation: 'get_backup_history'
      })
      throw error
    }
  }
}

export class MonitoringService {
  // Check database health
  static async checkDatabaseHealth(): Promise<any[]> {
    try {
      const { data, error } = await supabase.rpc('check_database_health')
      if (error) throw error
      return data || []
    } catch (error) {
      await ErrorLogger.logError({
        code: 'HEALTH_CHECK_ERROR',
        message: 'Database health check failed',
        details: error,
        timestamp: new Date(),
        operation: 'check_database_health'
      })
      throw error
    }
  }

  // Get error statistics
  static async getErrorStatistics(hours = 24): Promise<any[]> {
    try {
      const { data, error } = await supabase.rpc('get_error_statistics', { p_hours: hours })
      if (error) throw error
      return data || []
    } catch (error) {
      await ErrorLogger.logError({
        code: 'ERROR_STATS_ERROR',
        message: 'Failed to fetch error statistics',
        details: error,
        timestamp: new Date(),
        operation: 'get_error_statistics'
      })
      throw error
    }
  }

  // Record monitoring metric
  static async recordMetric(
    metricName: string,
    metricValue: number,
    metricUnit?: string,
    thresholdWarning?: number,
    thresholdCritical?: number
  ): Promise<void> {
    try {
      const status = this.determineMetricStatus(metricValue, thresholdWarning, thresholdCritical)
      
      const { error } = await supabase
        .from('db_monitoring')
        .insert({
          metric_name: metricName,
          metric_value: metricValue,
          metric_unit: metricUnit,
          threshold_warning: thresholdWarning,
          threshold_critical: thresholdCritical,
          status
        })

      if (error) throw error
    } catch (error) {
      console.error('Failed to record metric:', error)
    }
  }

  private static determineMetricStatus(
    value: number,
    warning?: number,
    critical?: number
  ): string {
    if (critical && value >= critical) return 'critical'
    if (warning && value >= warning) return 'warning'
    return 'normal'
  }

  // Get monitoring data
  static async getMonitoringData(hours = 24): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('db_monitoring')
        .select('*')
        .gte('created_at', new Date(Date.now() - hours * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false })

      if (error) throw error
      return data || []
    } catch (error) {
      await ErrorLogger.logError({
        code: 'MONITORING_DATA_ERROR',
        message: 'Failed to fetch monitoring data',
        details: error,
        timestamp: new Date(),
        operation: 'get_monitoring_data'
      })
      throw error
    }
  }
}

// Automated maintenance scheduler
export class MaintenanceScheduler {
  private static intervals: NodeJS.Timeout[] = []

  // Start automated maintenance tasks
  static startAutomatedMaintenance(): void {
    // Daily cleanup of old drafts (runs at 2 AM)
    const dailyCleanup = setInterval(async () => {
      const now = new Date()
      if (now.getHours() === 2 && now.getMinutes() === 0) {
        try {
          const cleaned = await DatabaseOptimizer.cleanupOldDrafts(30)
          await MonitoringService.recordMetric('drafts_cleaned', cleaned, 'count')
        } catch (error) {
          console.error('Automated cleanup failed:', error)
        }
      }
    }, 60000) // Check every minute

    // Weekly maintenance (runs on Sunday at 3 AM)
    const weeklyMaintenance = setInterval(async () => {
      const now = new Date()
      if (now.getDay() === 0 && now.getHours() === 3 && now.getMinutes() === 0) {
        try {
          await DatabaseOptimizer.performMaintenance()
          await MonitoringService.recordMetric('maintenance_completed', 1, 'boolean')
        } catch (error) {
          console.error('Automated maintenance failed:', error)
        }
      }
    }, 60000)

    // Monthly archiving (runs on 1st of month at 4 AM)
    const monthlyArchiving = setInterval(async () => {
      const now = new Date()
      if (now.getDate() === 1 && now.getHours() === 4 && now.getMinutes() === 0) {
        try {
          const archived = await DatabaseOptimizer.archiveOldApplications()
          await MonitoringService.recordMetric('applications_archived', archived, 'count')
        } catch (error) {
          console.error('Automated archiving failed:', error)
        }
      }
    }, 60000)

    this.intervals.push(dailyCleanup, weeklyMaintenance, monthlyArchiving)
  }

  // Stop automated maintenance
  static stopAutomatedMaintenance(): void {
    this.intervals.forEach(interval => clearInterval(interval))
    this.intervals = []
  }
}