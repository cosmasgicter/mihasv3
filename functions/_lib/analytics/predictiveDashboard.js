import { supabaseAdminClient, getUserFromRequest } from '../supabaseClient.js'

const DEFAULT_PREDICTIVE_SUMMARY = {
  avgAdmissionProbability: 0,
  totalApplications: 0,
  avgProcessingTime: 0,
  efficiency: 0,
  applicationTrend: 'stable',
  peakTimes: [],
  bottlenecks: [],
  generatedAt: new Date().toISOString()
}

const DEFAULT_WORKFLOW_SUMMARY = {
  totalExecutions: 0,
  successfulExecutions: 0,
  failedExecutions: 0,
  ruleStats: {},
  generatedAt: new Date().toISOString()
}

async function fallbackPredictiveSummary() {
  try {
    // Get total count of ALL applications regardless of status
    // This ensures the AI Dashboard shows accurate total (e.g., 28 applications)
    // including draft, submitted, under_review, approved, and rejected
    const { count: totalApplications, error: countError } = await supabaseAdminClient
      .from('applications')
      .select('*', { count: 'exact', head: true })

    if (countError) {
      console.error('Predictive summary count error:', countError)
      return DEFAULT_PREDICTIVE_SUMMARY
    }

    // Get recent applications for trend analysis (last 30 days)
    const { data, error } = await supabaseAdminClient
      .from('applications')
      .select('created_at, status, program, updated_at')
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())

    if (error) {
      console.error('Predictive summary fallback error:', error)
      return DEFAULT_PREDICTIVE_SUMMARY
    }

    const recentApplications = data || []
    const processed = recentApplications.filter(app => ['approved', 'rejected'].includes(app.status)).length
    const efficiency = recentApplications.length > 0 ? (processed / recentApplications.length) * 100 : 100

    return {
      avgAdmissionProbability: 0,
      totalApplications: totalApplications || 0,
      avgProcessingTime: 0,
      efficiency,
      applicationTrend: 'stable',
      peakTimes: [],
      bottlenecks: [],
      generatedAt: new Date().toISOString()
    }
  } catch (error) {
    console.error('Fallback error:', error)
    return DEFAULT_PREDICTIVE_SUMMARY
  }
}

async function handlePredictiveDashboardRequest(req, res) {
  try {
    const authContext = await getUserFromRequest(req, { requireAdmin: true })
    if (authContext.error) {
      const status = authContext.error === 'Access denied' ? 403 : 401
      return res.status(status).json({ error: authContext.error })
    }

    const predictive = await fallbackPredictiveSummary()
    const workflow = DEFAULT_WORKFLOW_SUMMARY

    const responseBody = {
      predictive,
      workflow,
      generatedAt: new Date().toISOString(),
      source: {
        predictive: 'fallback',
        workflow: 'default'
      }
    }

    return res.status(200).json(responseBody)
  } catch (error) {
    console.error('Predictive dashboard error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export { handlePredictiveDashboardRequest }