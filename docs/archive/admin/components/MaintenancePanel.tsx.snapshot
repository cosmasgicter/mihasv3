import React, { useState, useEffect } from 'react'
import { maintenance, MaintenanceTask } from '@/lib/maintenance'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui'
import { UnifiedLoader, UnifiedSpinner } from '@/components/ui/UnifiedLoader'
import { formatTimestamp } from '@/lib/dateFormat'
import { 
  Play, 
  Clock, 
  CheckCircle, 
  XCircle, 
  Settings,
  Download,
  Calendar
} from 'lucide-react'

export function MaintenancePanel() {
  const [tasks, setTasks] = useState<MaintenanceTask[]>([])
  const [logs, setLogs] = useState<any[]>([])
  const [runningTasks, setRunningTasks] = useState<Set<string>>(new Set())
  const [updateInfo, setUpdateInfo] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      const [tasksData, logsData, updates] = await Promise.all([
        maintenance.getTasks(),
        maintenance.getMaintenanceLogs(20),
        maintenance.checkForUpdates()
      ])
      
      setTasks(tasksData)
      setLogs(logsData)
      setUpdateInfo(updates)
    } catch (error) {
      console.error('Failed to load maintenance data:', error)
    } finally {
      setLoading(false)
    }
  }

  const runTask = async (taskId: string) => {
    setRunningTasks(prev => new Set(prev).add(taskId))
    
    try {
      await maintenance.runTask(taskId)
      await loadData() // Refresh data
    } catch (error) {
      console.error('Failed to run task:', error)
    } finally {
      setRunningTasks(prev => {
        const newSet = new Set(prev)
        newSet.delete(taskId)
        return newSet
      })
    }
  }

  const getStatusIcon = (status: MaintenanceTask['status']) => {
    switch (status) {
      case 'completed': return <CheckCircle className="h-4 w-4 text-success" />
      case 'failed': return <XCircle className="h-4 w-4 text-error" />
      case 'running': return <UnifiedSpinner size="sm" />
      default: return <Clock className="h-4 w-4 text-foreground" />
    }
  }

  const getStatusColor = (status: MaintenanceTask['status']) => {
    switch (status) {
      case 'completed': return 'bg-accent/10 text-accent-foreground'
      case 'failed': return 'bg-destructive/10 text-destructive-foreground'
      case 'running': return 'bg-primary/10 text-primary-foreground'
      default: return 'bg-accent text-foreground'
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <UnifiedLoader variant="inline" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Maintenance & Updates</h1>

      {/* Update Notification */}
      {updateInfo && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Download className="h-5 w-5 text-primary" />
              <span>Update Available</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p className="font-medium">Version {updateInfo.version}</p>
              <div className="text-sm text-foreground">
                <p><strong>Features:</strong> {updateInfo.features.join(', ')}</p>
                <p><strong>Fixes:</strong> {updateInfo.fixes.join(', ')}</p>
              </div>
              <Button size="sm" className="mt-2">
                <Calendar className="h-4 w-4 mr-2" />
                Schedule Update
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Maintenance Tasks */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Settings className="h-5 w-5" />
            <span>Maintenance Tasks</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {tasks.map((task) => (
              <div key={task.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-1">
                    {getStatusIcon(task.status)}
                    <h3 className="font-medium">{task.name}</h3>
                    <Badge className={getStatusColor(task.status)}>
                      {task.status}
                    </Badge>
                  </div>
                  <p className="text-sm text-foreground mb-2">{task.description}</p>
                  <div className="flex items-center space-x-4 text-xs text-foreground">
                    <span>Schedule: {task.schedule}</span>
                    <span>Next: {formatTimestamp(task.nextRun)}</span>
                    {task.lastRun && (
                      <span>Last: {formatTimestamp(task.lastRun)}</span>
                    )}
                    {task.duration && (
                      <span>Duration: {task.duration}ms</span>
                    )}
                  </div>
                </div>
                <Button
                  onClick={() => runTask(task.id)}
                  disabled={runningTasks.has(task.id)}
                  size="sm"
                  variant="outline"
                >
                  {runningTasks.has(task.id) ? (
                    <UnifiedSpinner size="sm" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Maintenance Logs */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Maintenance Logs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {logs.length === 0 ? (
              <p className="text-foreground text-center py-4">No maintenance logs</p>
            ) : (
              logs.map((log, index) => (
                <div key={index} className="flex items-center justify-between p-3 border rounded">
                  <div>
                    <span className="font-medium">{log.task_name}</span>
                    <div className="text-sm text-foreground">
                      {formatTimestamp(log.executed_at)} • {log.duration}ms
                    </div>
                    {log.error_message && (
                      <div className="text-sm text-destructive mt-1">{log.error_message}</div>
                    )}
                  </div>
                  <Badge className={log.success ? 'bg-accent/10 text-accent-foreground' : 'bg-destructive/10 text-destructive-foreground'}>
                    {log.success ? 'Success' : 'Failed'}
                  </Badge>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}