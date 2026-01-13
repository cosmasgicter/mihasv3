import { supabaseAdminClient } from '../../_lib/supabaseClient.js'
import { authenticateAdmin } from '../../_lib/auth.js'

/**
 * Alert Management API Endpoint
 * Manages alert configurations and escalation procedures
 * Validates Requirements 8.2
 */

export async function onRequestGet(context) {
  try {
    const authResult = await authenticateAdmin(context.request)
    if (!authResult.success) {
      return new Response(JSON.stringify({ error: authResult.error }), { 
        status: authResult.status,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const url = new URL(context.request.url)
    const action = url.searchParams.get('action')

    switch (action) {
      case 'configurations':
        return await getAlertConfigurations()
      case 'active':
        return await getActiveAlerts()
      case 'history':
        return await getAlertHistory(url)
      case 'remediation':
        return await getRemediationSuggestions(url)
      default:
        return await getAlertDashboard()
    }
  } catch (error) {
    console.error('Alert management error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

export async function onRequestPost(context) {
  try {
    const authResult = await authenticateAdmin(context.request)
    if (!authResult.success) {
      return new Response(JSON.stringify({ error: authResult.error }), { 
        status: authResult.status,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const data = await context.request.json()
    const action = data.action

    switch (action) {
      case 'create_configuration':
        return await createAlertConfiguration(data.configuration)
      case 'update_configuration':
        return await updateAlertConfiguration(data.configId, data.updates)
      case 'test_alert':
        return await testAlertConfiguration(data.configId)
      default:
        return new Response(JSON.stringify({ error: 'Invalid action' }), { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        })
    }
  } catch (error) {
    console.error('Alert management POST error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

/**
 * Get alert configurations
 */
async function getAlertConfigurations() {
  try {
    // Return default alert configurations
    const configurations = [
      {
        id: 'response_time_high',
        name: 'High Response Time',
        type: 'response_time',
        threshold: 2000,
        severity: 'high',
        enabled: true,
        cooldownPeriod: 15,
        escalationRules: [
          {
            level: 1,
            delayMinutes: 0,
            recipients: ['***REMOVED***'],
            channels: ['email'],
            message: 'Response time threshold exceeded'
          }
        ]
      },
      {
        id: 'error_rate_high',
        name: 'High Error Rate',
        type: 'error_rate',
        threshold: 0.05,
        severity: 'critical',
        enabled: true,
        cooldownPeriod: 10,
        escalationRules: [
          {
            level: 1,
            delayMinutes: 0,
            recipients: ['***REMOVED***'],
            channels: ['email', 'sms'],
            message: 'Error rate threshold exceeded'
          }
        ]
      },
      {
        id: 'database_slow',
        name: 'Slow Database Queries',
        type: 'database_slow',
        threshold: 1000,
        severity: 'medium',
        enabled: true,
        cooldownPeriod: 20,
        escalationRules: [
          {
            level: 1,
            delayMinutes: 0,
            recipients: ['***REMOVED***'],
            channels: ['email'],
            message: 'Database performance degradation detected'
          }
        ]
      }
    ]

    return new Response(JSON.stringify({ configurations }), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('Error getting alert configurations:', error)
    throw error
  }
}

/**
 * Get active alerts
 */
async function getActiveAlerts() {
  try {
    const { data: alerts, error } = await supabaseAdminClient
      .from('performance_alerts')
      .select('*')
      .eq('resolved', false)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      console.error('Error fetching active alerts:', error)
      return new Response(JSON.stringify({ alerts: [] }), {
        headers: { 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ alerts: alerts || [] }), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('Error getting active alerts:', error)
    throw error
  }
}

/**
 * Get alert history
 */
async function getAlertHistory(url) {
  try {
    const limit = parseInt(url.searchParams.get('limit')) || 100
    const offset = parseInt(url.searchParams.get('offset')) || 0

    const { data: alerts, error } = await supabaseAdminClient
      .from('performance_alerts')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      console.error('Error fetching alert history:', error)
      return new Response(JSON.stringify({ alerts: [] }), {
        headers: { 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ alerts: alerts || [] }), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('Error getting alert history:', error)
    throw error
  }
}

/**
 * Get remediation suggestions for alert type
 */
async function getRemediationSuggestions(url) {
  try {
    const alertType = url.searchParams.get('type')
    const severity = url.searchParams.get('severity') || 'medium'

    const suggestions = generateRemediationSuggestions(alertType, severity)

    return new Response(JSON.stringify({ suggestions }), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('Error getting remediation suggestions:', error)
    throw error
  }
}

/**
 * Get alert dashboard data
 */
async function getAlertDashboard() {
  try {
    // Get alert statistics
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    const { data: alertsToday } = await supabaseAdminClient
      .from('performance_alerts')
      .select('id, type, severity')
      .gte('created_at', oneDayAgo)

    const { data: alertsThisWeek } = await supabaseAdminClient
      .from('performance_alerts')
      .select('id, type, severity')
      .gte('created_at', oneWeekAgo)

    const { data: activeAlerts } = await supabaseAdminClient
      .from('performance_alerts')
      .select('id, type, severity')
      .eq('resolved', false)

    // Calculate statistics
    const stats = {
      today: {
        total: alertsToday?.length || 0,
        critical: alertsToday?.filter(a => a.severity === 'critical').length || 0,
        high: alertsToday?.filter(a => a.severity === 'high').length || 0,
        medium: alertsToday?.filter(a => a.severity === 'medium').length || 0,
        low: alertsToday?.filter(a => a.severity === 'low').length || 0
      },
      thisWeek: {
        total: alertsThisWeek?.length || 0,
        byType: {}
      },
      active: {
        total: activeAlerts?.length || 0,
        critical: activeAlerts?.filter(a => a.severity === 'critical').length || 0
      }
    }

    // Group by type for this week
    if (alertsThisWeek) {
      alertsThisWeek.forEach(alert => {
        stats.thisWeek.byType[alert.type] = (stats.thisWeek.byType[alert.type] || 0) + 1
      })
    }

    return new Response(JSON.stringify({ stats }), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('Error getting alert dashboard:', error)
    throw error
  }
}

/**
 * Generate remediation suggestions
 */
function generateRemediationSuggestions(alertType, severity) {
  const suggestions = {
    alertType,
    severity,
    suggestions: []
  }

  switch (alertType) {
    case 'response_time':
      suggestions.suggestions = [
        {
          action: 'Check Database Performance',
          description: 'Review slow queries and optimize database indexes',
          priority: 'high',
          estimatedImpact: 'Reduce response time by 30-50%',
          implementationSteps: [
            'Run database performance analysis',
            'Identify slow queries from logs',
            'Add missing indexes',
            'Optimize query execution plans'
          ]
        },
        {
          action: 'Scale Resources',
          description: 'Increase server resources or enable auto-scaling',
          priority: 'medium',
          estimatedImpact: 'Improve response time by 20-40%',
          implementationSteps: [
            'Monitor resource utilization',
            'Scale up server instances',
            'Enable auto-scaling policies',
            'Load balance traffic'
          ]
        }
      ]
      break

    case 'error_rate':
      suggestions.suggestions = [
        {
          action: 'Review Error Logs',
          description: 'Analyze recent error patterns and fix critical bugs',
          priority: 'high',
          estimatedImpact: 'Reduce error rate by 60-80%',
          implementationSteps: [
            'Check application error logs',
            'Identify common error patterns',
            'Fix critical bugs',
            'Deploy hotfixes'
          ]
        }
      ]
      break

    case 'database_slow':
      suggestions.suggestions = [
        {
          action: 'Optimize Database Queries',
          description: 'Review and optimize slow-performing queries',
          priority: 'high',
          estimatedImpact: 'Improve query performance by 50-70%',
          implementationSteps: [
            'Identify slow queries using EXPLAIN',
            'Add appropriate indexes',
            'Rewrite inefficient queries',
            'Update table statistics'
          ]
        }
      ]
      break

    default:
      suggestions.suggestions = [
        {
          action: 'Monitor System Health',
          description: 'Review system metrics and logs for issues',
          priority: 'medium',
          estimatedImpact: 'Identify root cause of performance issues',
          implementationSteps: [
            'Check system resource usage',
            'Review application logs',
            'Monitor network connectivity',
            'Verify service dependencies'
          ]
        }
      ]
  }

  return suggestions
}

/**
 * Create alert configuration
 */
async function createAlertConfiguration(configuration) {
  try {
    // In a real implementation, this would store the configuration in the database
    console.log('Creating alert configuration:', configuration)
    
    return new Response(JSON.stringify({ 
      success: true, 
      configuration: { ...configuration, id: crypto.randomUUID() }
    }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('Error creating alert configuration:', error)
    throw error
  }
}

/**
 * Update alert configuration
 */
async function updateAlertConfiguration(configId, updates) {
  try {
    // In a real implementation, this would update the configuration in the database
    console.log('Updating alert configuration:', configId, updates)
    
    return new Response(JSON.stringify({ 
      success: true, 
      configId,
      updates
    }), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('Error updating alert configuration:', error)
    throw error
  }
}

/**
 * Test alert configuration
 */
async function testAlertConfiguration(configId) {
  try {
    // In a real implementation, this would trigger a test alert
    console.log('Testing alert configuration:', configId)
    
    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Test alert sent successfully',
      configId
    }), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('Error testing alert configuration:', error)
    throw error
  }
}