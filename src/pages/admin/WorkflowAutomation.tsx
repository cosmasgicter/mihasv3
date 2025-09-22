import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Zap, Play, Pause, Settings, AlertTriangle, CheckCircle, Clock, TrendingUp } from 'lucide-react'
import { useProfileQuery } from '@/hooks/auth/useProfileQuery'
import { useRoleQuery, isAdminRole } from '@/hooks/auth/useRoleQuery'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { workflowAutomation, WorkflowRule } from '@/lib/workflowAutomation'

interface WorkflowStats {
  totalRules: number
  activeRules: number
  executionsToday: number
  successRate: number
}

export default function WorkflowAutomation() {
  const { profile } = useProfileQuery()
  const { isAdmin: hasAdminRole } = useRoleQuery()
  const isAdmin = hasAdminRole || isAdminRole(profile?.role)
  const [rules, setRules] = useState<WorkflowRule[]>([])
  const [stats, setStats] = useState<WorkflowStats>({
    totalRules: 0,
    activeRules: 0,
    executionsToday: 0,
    successRate: 0
  })
  const [loading, setLoading] = useState(true)
  const [processingRule, setProcessingRule] = useState<string | null>(null)

  useEffect(() => {
    if (isAdmin) {
      loadWorkflowData()
    }
  }, [isAdmin])

  const loadWorkflowData = async () => {
    try {
      setLoading(true)
      
      const workflowRules = workflowAutomation.getRules()
      const workflowStats = await workflowAutomation.getWorkflowStats()
      
      setRules(workflowRules)
      setStats({
        totalRules: workflowRules.length,
        activeRules: workflowRules.filter(r => r.enabled).length,
        executionsToday: workflowStats.totalExecutions,
        successRate: workflowStats.totalExecutions > 0 
          ? Math.round((workflowStats.successfulExecutions / workflowStats.totalExecutions) * 100)
          : 100
      })
    } catch (error) {
      console.error('Failed to load workflow data:', error)
    } finally {
      setLoading(false)
    }
  }

  const toggleRule = async (ruleId: string, enabled: boolean) => {
    try {
      setProcessingRule(ruleId)
      
      if (enabled) {
        await workflowAutomation.enableRule(ruleId)
      } else {
        await workflowAutomation.disableRule(ruleId)
      }
      
      await loadWorkflowData()
    } catch (error) {
      console.error('Failed to toggle rule:', error)
    } finally {
      setProcessingRule(null)
    }
  }

  const runManualWorkflow = async () => {
    try {
      const result = await workflowAutomation.runScheduledWorkflows()
      alert(`Manual workflow execution completed.\nProcessed: ${result.processed}\nErrors: ${result.errors}`)
      await loadWorkflowData()
    } catch (error) {
      console.error('Manual workflow execution failed:', error)
      alert('Manual workflow execution failed. Please try again.')
    }
  }

  const getRuleStatusColor = (rule: WorkflowRule) => {
    if (!rule.enabled) return 'bg-gray-100 text-gray-800'
    return 'bg-green-100 text-green-800'
  }

  const getRuleIcon = (trigger: string) => {
    switch (trigger) {
      case 'document_upload':
        return '📄'
      case 'status_change':
        return '🔄'
      case 'time_based':
        return '⏰'
      case 'score_threshold':
        return '🎯'
      default:
        return '⚡'
    }
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Access Denied</h2>
          <p className="text-gray-600">You don't have permission to access workflow automation.</p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading workflow automation...</p>
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
                <Zap className="h-8 w-8 mr-3 text-purple-600" />
                Workflow Automation
              </h1>
              <p className="text-gray-600 mt-2">
                Manage automated workflows and business rules
              </p>
            </div>
            <div className="flex items-center space-x-3">
              <Button
                onClick={runManualWorkflow}
                className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700"
              >
                <Play className="h-4 w-4" />
                Run Manual Execution
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
                  <Settings className="h-6 w-6 text-blue-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Total Rules</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.totalRules}</p>
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
                <div className="p-3 bg-green-100 rounded-lg">
                  <CheckCircle className="h-6 w-6 text-green-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Active Rules</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.activeRules}</p>
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
                <div className="p-3 bg-purple-100 rounded-lg">
                  <Clock className="h-6 w-6 text-purple-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Executions (7 days)</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.executionsToday}</p>
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
                  <p className="text-sm font-medium text-gray-600">Success Rate</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.successRate}%</p>
                </div>
              </div>
            </Card>
          </motion.div>
        </div>

        {/* Workflow Rules */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-gray-900">Automation Rules</h2>
            <div className="text-sm text-gray-500">
              {stats.activeRules} of {stats.totalRules} rules active
            </div>
          </div>

          <div className="space-y-4">
            {rules.map((rule, index) => (
              <motion.div
                key={rule.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className={`p-6 rounded-lg border-2 transition-all duration-200 ${
                  rule.enabled 
                    ? 'border-green-200 bg-green-50' 
                    : 'border-gray-200 bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="text-2xl">{getRuleIcon(rule.trigger)}</div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">{rule.name}</h3>
                      <div className="flex items-center space-x-4 mt-1">
                        <span className="text-sm text-gray-600">
                          Trigger: <span className="font-medium">{rule.trigger.replace('_', ' ')}</span>
                        </span>
                        <span className="text-sm text-gray-600">
                          Actions: <span className="font-medium">{rule.actions.length}</span>
                        </span>
                        {rule.priority && (
                          <span className="text-sm text-gray-600">
                            Priority: <span className="font-medium">{rule.priority}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-3">
                    <span className={`px-3 py-1 text-sm font-medium rounded-full ${getRuleStatusColor(rule)}`}>
                      {rule.enabled ? 'Active' : 'Inactive'}
                    </span>
                    
                    <Button
                      onClick={() => toggleRule(rule.id, !rule.enabled)}
                      disabled={processingRule === rule.id}
                      size="sm"
                      variant={rule.enabled ? "outline" : "primary"}
                      className={`flex items-center gap-2 ${
                        rule.enabled 
                          ? 'text-red-600 border-red-200 hover:bg-red-50' 
                          : 'bg-green-600 hover:bg-green-700'
                      }`}
                    >
                      {processingRule === rule.id ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
                      ) : rule.enabled ? (
                        <Pause className="h-4 w-4" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                      {rule.enabled ? 'Disable' : 'Enable'}
                    </Button>
                  </div>
                </div>

                {/* Rule Details */}
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-2">Conditions</h4>
                      <div className="space-y-1">
                        {Object.entries(rule.conditions).map(([key, value]) => (
                          <div key={key} className="text-sm text-gray-600">
                            <span className="font-medium">{key.replace(/([A-Z])/g, ' $1').toLowerCase()}:</span>{' '}
                            {typeof value === 'object' && value.operator 
                              ? `${value.operator} ${value.value}`
                              : String(value)
                            }
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-2">Actions</h4>
                      <div className="space-y-1">
                        {rule.actions.map((action, actionIndex) => (
                          <div key={actionIndex} className="text-sm text-gray-600">
                            <span className="font-medium">{action.type.replace('_', ' ')}:</span>{' '}
                            {action.parameters.reason || action.parameters.type || 'Execute action'}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {rules.length === 0 && (
            <div className="text-center py-12">
              <Zap className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Workflow Rules</h3>
              <p className="text-gray-600">No automation rules are currently configured.</p>
            </div>
          )}
        </Card>

        {/* Quick Actions */}
        <div className="mt-8">
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Button
                onClick={() => alert('Feature coming soon: Create custom workflow rule')}
                variant="outline"
                className="flex items-center justify-center gap-2 p-4 h-auto"
              >
                <Settings className="h-5 w-5" />
                <div className="text-left">
                  <div className="font-medium">Create Rule</div>
                  <div className="text-sm text-gray-600">Add custom automation</div>
                </div>
              </Button>
              
              <Button
                onClick={() => alert('Feature coming soon: Export workflow configuration')}
                variant="outline"
                className="flex items-center justify-center gap-2 p-4 h-auto"
              >
                <TrendingUp className="h-5 w-5" />
                <div className="text-left">
                  <div className="font-medium">Export Config</div>
                  <div className="text-sm text-gray-600">Download settings</div>
                </div>
              </Button>
              
              <Button
                onClick={() => alert('Feature coming soon: View detailed analytics')}
                variant="outline"
                className="flex items-center justify-center gap-2 p-4 h-auto"
              >
                <Clock className="h-5 w-5" />
                <div className="text-left">
                  <div className="font-medium">View Analytics</div>
                  <div className="text-sm text-gray-600">Detailed reports</div>
                </div>
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}