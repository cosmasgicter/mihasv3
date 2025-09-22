import React, { useState, useEffect } from 'react'
import { maintenance, MaintenanceTask } from '@/lib/maintenance'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
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
      case 'completed': return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'failed': return <XCircle className="h-4 w-4 text-red-500" />
      case 'running': return <LoadingSpinner className="h-4 w-4" />
      default: return <Clock className="h-4 w-4 text-gray-400" />
    }
  }

  const getStatusColor = (status: MaintenanceTask['status']) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800'
      case 'failed': return 'bg-red-100 text-red-800'
      case 'running': return 'bg-blue-100 text-blue-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Maintenance & Updates</h1>

      {/* Update Notification */}
      {updateInfo && (
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Download className="h-5 w-5 text-blue-600" />
              <span>Update Available</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p className="font-medium">Version {updateInfo.version}</p>
              <div className="text-sm text-gray-600">
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
                  <p className="text-sm text-gray-600 mb-2">{task.description}</p>
                  <div className="flex items-center space-x-4 text-xs text-gray-500">
                    <span>Schedule: {task.schedule}</span>
                    <span>Next: {task.nextRun.toLocaleString()}</span>
                    {task.lastRun && (
                      <span>Last: {task.lastRun.toLocaleString()}</span>
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
                    <LoadingSpinner className="h-4 w-4" />
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
              <p className="text-gray-500 text-center py-4">No maintenance logs</p>
            ) : (
              logs.map((log, index) => (
                <div key={index} className="flex items-center justify-between p-3 border rounded">
                  <div>
                    <span className="font-medium">{log.task_name}</span>
                    <div className="text-sm text-gray-500">
                      {new Date(log.executed_at).toLocaleString()} • {log.duration}ms
                    </div>
                    {log.error_message && (
                      <div className="text-sm text-red-600 mt-1">{log.error_message}</div>
                    )}
                  </div>
                  <Badge className={log.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
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