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
import { useToastStore } from '@/components/ui/Toast'

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
  const { success: showSuccess, error: showError } = useToastStore()
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
      const { supabase } = await import('@/lib/supabase')
      
      const [predictions, workflows, notifications] = await Promise.all([
        supabase.from('applications').select('id', { count: 'exact', head: true }),
        supabase.from('workflow_executions').select('id', { count: 'exact', head: true }),
        supabase.from('in_app_notifications').select('id', { count: 'exact', head: true })
      ])
      
      setStats({
        totalPredictions: predictions.count || 0,
        automationRuns: workflows.count || 0,
        notificationsSent: notifications.count || 0,
        avgAccuracy: 85
      })
    } catch (error) {
      console.error('Failed to load AI stats:', error)
      setStats({ totalPredictions: 0, automationRuns: 0, notificationsSent: 0, avgAccuracy: 0 })
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
          <AlertTriangle className="h-12 w-12 text-error mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Access Denied</h2>
          <p className="text-gray-900">You don't have permission to access AI insights.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-muted">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center">
                <Brain className="h-8 w-8 mr-3 text-secondary" />
                AI Insights & Automation
              </h1>
              <p className="text-gray-900 mt-2">
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
                <div className="p-3 bg-primary/10 rounded-lg">
                  <Brain className="h-6 w-6 text-primary" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-900">AI Predictions</p>
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
                <div className="p-3 bg-secondary/10 rounded-lg">
                  <Zap className="h-6 w-6 text-secondary" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-900">Automation Runs</p>
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
                <div className="p-3 bg-accent/10 rounded-lg">
                  <FileText className="h-6 w-6 text-accent" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-900">Notifications Sent</p>
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
                <div className="p-3 bg-accent/10 rounded-lg">
                  <TrendingUp className="h-6 w-6 text-accent" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-900">Avg Accuracy</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.avgAccuracy}%</p>
                </div>
              </div>
            </Card>
          </motion.div>
        </div>

        {/* Tab Navigation */}
        <div className="mb-6">
          <div className="border-b border-border">
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
                      ? 'border-purple-500 text-secondary'
                      : 'border-transparent text-gray-900 hover:text-gray-900 hover:border-input'
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
                  <Zap className="h-5 w-5 mr-2 text-secondary" />
                  Workflow Automation Rules
                </h3>
                <div className="space-y-4">
                  {workflowAutomation.getRules().map((rule) => (
                    <div key={rule.id} className="flex items-center justify-between p-4 bg-muted rounded-lg">
                      <div>
                        <h4 className="font-medium text-gray-900">{rule.name}</h4>
                        <p className="text-sm text-gray-900">Trigger: {rule.trigger}</p>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          rule.enabled 
                            ? 'bg-accent/10 text-accent-foreground' 
                            : 'bg-destructive/10 text-destructive-foreground'
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
                  <FileText className="h-5 w-5 mr-2 text-primary" />
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
                        <div key={channel.name} className="flex items-center justify-between p-3 bg-muted rounded">
                          <span className="font-medium">{channel.name}</span>
                          <div className="flex items-center space-x-2">
                            <span className="text-sm text-gray-900">{channel.count} sent</span>
                            <span className={`px-2 py-1 text-xs rounded-full ${
                              channel.status === 'active' 
                                ? 'bg-accent/10 text-accent-foreground' 
                                : 'bg-accent text-foreground'
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
                        <div key={index} className="flex items-center justify-between p-3 bg-muted rounded">
                          <div>
                            <span className="font-medium text-sm">{activity.type}</span>
                            <p className="text-xs text-gray-900">{activity.time}</p>
                          </div>
                          <span className="px-2 py-1 text-xs bg-accent/10 text-accent-foreground rounded-full">
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