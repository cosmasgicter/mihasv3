import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Brain, Zap, FileText, TrendingUp, AlertTriangle, Settings, RefreshCw } from 'lucide-react'
import { useProfileQuery } from '@/hooks/auth/useProfileQuery'
import { useRoleQuery, isAdminRole } from '@/hooks/auth/useRoleQuery'
import { PredictiveDashboard } from '@/components/admin/PredictiveDashboard'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { workflowAutomation } from '@/lib/workflowAutomation'
import { multiChannelNotifications } from '@/lib/multiChannelNotifications'
import { useToast } from '@/components/ui/Toast'

interface AIInsightsStats {
  totalPredictions: number
  automationRuns: number
  notificationsSent: number
  avgAccuracy: number
}

export default function AIInsights() {
  const { profile } = useProfileQuery()
  const { isAdmin: hasAdminRole } = useRoleQuery()
  const isAdmin = hasAdminRole || isAdminRole(profile?.role)
  const { showSuccess, showError } = useToast()
  const [stats, setStats] = useState<AIInsightsStats>({
    totalPredictions: 0,
    automationRuns: 0,
    notificationsSent: 0,
    avgAccuracy: 0
  })
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'dashboard' | 'automation' | 'notifications'>('dashboard')

  useEffect(() => {
    if (isAdmin) {
      loadAIStats()
    }
  }, [isAdmin])

  const loadAIStats = async () => {
    try {
      setLoading(true)
      
      // Load AI statistics
      const workflowStats = await workflowAutomation.getWorkflowStats()
      
      setStats({
        totalPredictions: 156, // Mock data - in production, get from prediction_results table
        automationRuns: workflowStats.totalExecutions,
        notificationsSent: 89, // Mock data - in production, get from notification_logs table
        avgAccuracy: 87.5 // Mock data - calculate from actual predictions
      })
    } catch (error) {
      console.error('Failed to load AI stats:', error)
    } finally {
      setLoading(false)
    }
  }

  const runWorkflowMaintenance = async () => {
    try {
      const result = await workflowAutomation.runScheduledWorkflows()
      showSuccess('Workflow maintenance completed', `Processed: ${result.processed}, Errors: ${result.errors}`)
    } catch (error) {
      console.error('Workflow maintenance failed:', error)
      const fallbackMessage = 'Workflow maintenance failed. Please try again.'
      const message = error instanceof Error ? error.message : fallbackMessage
      showError('Workflow maintenance failed', message !== fallbackMessage ? message : undefined)
    }
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Access Denied</h2>
          <p className="text-gray-600">You don't have permission to access AI insights.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center">
                <Brain className="h-8 w-8 mr-3 text-purple-600" />
                AI Insights & Automation
              </h1>
              <p className="text-gray-600 mt-2">
                Monitor AI performance, predictive analytics, and automation workflows
              </p>
            </div>
            <div className="flex items-center space-x-3">
              <Button
                onClick={runWorkflowMaintenance}
                variant="outline"
                size="sm"
                className="flex items-center gap-2"
              >
                <Zap className="h-4 w-4" />
                Run Maintenance
              </Button>
              <Button
                onClick={loadAIStats}
                variant="outline"
                size="sm"
                className="flex items-center gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </Button>
            </div>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Card className="p-6">
              <div className="flex items-center">
                <div className="p-3 bg-blue-100 rounded-lg">
                  <Brain className="h-6 w-6 text-blue-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">AI Predictions</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.totalPredictions}</p>
                </div>
              </div>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Card className="p-6">
              <div className="flex items-center">
                <div className="p-3 bg-purple-100 rounded-lg">
                  <Zap className="h-6 w-6 text-purple-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Automation Runs</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.automationRuns}</p>
                </div>
              </div>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <Card className="p-6">
              <div className="flex items-center">
                <div className="p-3 bg-green-100 rounded-lg">
                  <FileText className="h-6 w-6 text-green-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Notifications Sent</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.notificationsSent}</p>
                </div>
              </div>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <Card className="p-6">
              <div className="flex items-center">
                <div className="p-3 bg-yellow-100 rounded-lg">
                  <TrendingUp className="h-6 w-6 text-yellow-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Avg Accuracy</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.avgAccuracy}%</p>
                </div>
              </div>
            </Card>
          </motion.div>
        </div>

        {/* Tab Navigation */}
        <div className="mb-6">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              {[
                { id: 'dashboard', label: 'Predictive Dashboard', icon: Brain },
                { id: 'automation', label: 'Workflow Automation', icon: Zap },
                { id: 'notifications', label: 'Notification System', icon: FileText }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === tab.id
                      ? 'border-purple-500 text-purple-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <tab.icon className="h-4 w-4 mr-2" />
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* Tab Content */}
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          {activeTab === 'dashboard' && <PredictiveDashboard />}
          
          {activeTab === 'automation' && (
            <div className="space-y-6">
              <Card className="p-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center">
                  <Zap className="h-5 w-5 mr-2 text-purple-600" />
                  Workflow Automation Rules
                </h3>
                <div className="space-y-4">
                  {workflowAutomation.getRules().map((rule) => (
                    <div key={rule.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                      <div>
                        <h4 className="font-medium text-gray-900">{rule.name}</h4>
                        <p className="text-sm text-gray-600">Trigger: {rule.trigger}</p>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          rule.enabled 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {rule.enabled ? 'Enabled' : 'Disabled'}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            if (rule.enabled) {
                              workflowAutomation.disableRule(rule.id)
                            } else {
                              workflowAutomation.enableRule(rule.id)
                            }
                            loadAIStats() // Refresh
                          }}
                        >
                          {rule.enabled ? 'Disable' : 'Enable'}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}
          
          {activeTab === 'notifications' && (
            <div className="space-y-6">
              <Card className="p-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center">
                  <FileText className="h-5 w-5 mr-2 text-blue-600" />
                  Notification System Status
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-medium text-gray-900 mb-3">Channel Status</h4>
                    <div className="space-y-2">
                      {[
                        { name: 'Email', status: 'active', count: 45 },
                        { name: 'In-App', status: 'active', count: 89 },
                        { name: 'SMS', status: 'inactive', count: 0 },
                        { name: 'WhatsApp', status: 'inactive', count: 0 }
                      ].map((channel) => (
                        <div key={channel.name} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                          <span className="font-medium">{channel.name}</span>
                          <div className="flex items-center space-x-2">
                            <span className="text-sm text-gray-600">{channel.count} sent</span>
                            <span className={`px-2 py-1 text-xs rounded-full ${
                              channel.status === 'active' 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-gray-100 text-gray-800'
                            }`}>
                              {channel.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-900 mb-3">Recent Activity</h4>
                    <div className="space-y-2">
                      {[
                        { type: 'Application Submitted', time: '2 minutes ago', status: 'sent' },
                        { type: 'Document Missing', time: '15 minutes ago', status: 'sent' },
                        { type: 'Status Update', time: '1 hour ago', status: 'sent' },
                        { type: 'Application Approved', time: '2 hours ago', status: 'sent' }
                      ].map((activity, index) => (
                        <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                          <div>
                            <span className="font-medium text-sm">{activity.type}</span>
                            <p className="text-xs text-gray-600">{activity.time}</p>
                          </div>
                          <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">
                            {activity.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  )
}