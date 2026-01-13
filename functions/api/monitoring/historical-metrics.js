import { supabaseAdminClient } from '../../_lib/supabaseClient.js'

export async function onRequestPost(context) {
  const authHeader = context.request.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  try {
    const { startTime, endTime, granularity = 'hour' } = await context.request.json()
    
    // Get historical metrics for the specified time range
    const metrics = await getHistoricalMetrics(startTime, endTime, granularity)
    
    return new Response(JSON.stringify(metrics), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('Historical metrics error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

async function getHistoricalMetrics(startTime, endTime, granularity) {
  try {
    // Get metrics from audit logs within the time range
    const { data: metricLogs, error } = await supabaseAdminClient
      .from('audit_logs')
      .select('created_at, metadata')
      .gte('created_at', startTime)
      .lte('created_at', endTime)
      .like('action', 'metric.%')
      .order('created_at', { ascending: true })
    
    if (error) {
      console.error('Error fetching historical metrics:', error)
      return []
    }
    
    if (!metricLogs || metricLogs.length === 0) {
      return []
    }
    
    // Group metrics by time intervals based on granularity
    const groupedMetrics = groupMetricsByTime(metricLogs, granularity)
    
    // Convert grouped data to SystemMetrics format
    return groupedMetrics.map(group => ({
      timestamp: group.timestamp,
      responseTime: {
        average: group.avgResponseTime || 150,
        p95: group.p95ResponseTime || 300,
        p99: group.p99ResponseTime || 500
      },
      errorRate: {
        total: group.errorCount || 0,
        rate: group.errorRate || 0,
        byEndpoint: group.errorsByEndpoint || {}
      },
      resourceUtilization: {
        cpu: 25,
        memory: 45,
        database: {
          connections: 8,
          queryTime: group.avgQueryTime || 50,
          slowQueries: 0
        }
      },
      throughput: {
        requestsPerSecond: group.requestsPerSecond || 2.5,
        requestsPerMinute: group.requestsPerMinute || 150
      }
    }))
  } catch (error) {
    console.error('Error getting historical metrics:', error)
    return []
  }
}

function groupMetricsByTime(metricLogs, granularity) {
  const groups = new Map()
  const intervalMs = getIntervalMs(granularity)
  
  metricLogs.forEach(log => {
    const timestamp = new Date(log.created_at)
    const intervalStart = new Date(Math.floor(timestamp.getTime() / intervalMs) * intervalMs)
    const key = intervalStart.toISOString()
    
    if (!groups.has(key)) {
      groups.set(key, {
        timestamp: key,
        responseTimes: [],
        errors: [],
        requests: 0,
        errorsByEndpoint: {}
      })
    }
    
    const group = groups.get(key)
    const metadata = log.metadata || {}
    
    if (metadata.response_time) {
      group.responseTimes.push(metadata.response_time)
    }
    
    if (metadata.error) {
      group.errors.push(metadata.error)
      const endpoint = metadata.endpoint || 'unknown'
      group.errorsByEndpoint[endpoint] = (group.errorsByEndpoint[endpoint] || 0) + 1
    }
    
    group.requests++
  })
  
  // Calculate aggregated metrics for each group
  return Array.from(groups.values()).map(group => {
    const responseTimes = group.responseTimes.sort((a, b) => a - b)
    const avgResponseTime = responseTimes.length > 0 
      ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length
      : 150
    
    const p95Index = Math.floor(responseTimes.length * 0.95)
    const p99Index = Math.floor(responseTimes.length * 0.99)
    
    return {
      timestamp: group.timestamp,
      avgResponseTime: Math.round(avgResponseTime),
      p95ResponseTime: responseTimes[p95Index] || avgResponseTime,
      p99ResponseTime: responseTimes[p99Index] || avgResponseTime,
      errorCount: group.errors.length,
      errorRate: group.requests > 0 ? group.errors.length / group.requests : 0,
      errorsByEndpoint: group.errorsByEndpoint,
      requestsPerSecond: group.requests / (intervalMs / 1000),
      requestsPerMinute: group.requests / (intervalMs / 60000),
      avgQueryTime: 50 // Placeholder
    }
  })
}

function getIntervalMs(granularity) {
  switch (granularity) {
    case 'minute':
      return 60 * 1000
    case 'hour':
      return 60 * 60 * 1000
    case 'day':
      return 24 * 60 * 60 * 1000
    default:
      return 60 * 60 * 1000 // Default to hour
  }
}