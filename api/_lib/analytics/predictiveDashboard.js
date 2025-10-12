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
    const { data, error } = await supabaseAdminClient
      .from('applications_new')
      .select('created_at, status, program, updated_at')
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())

    if (error) {
      console.error('Predictive summary fallback error:', error)
      return DEFAULT_PREDICTIVE_SUMMARY
    }

    const applications = data || []
    const totalApplications = applications.length
    const processed = applications.filter(app => ['approved', 'rejected'].includes(app.status)).length
    const efficiency = totalApplications > 0 ? (processed / totalApplications) * 100 : 100

    return {
      avgAdmissionProbability: 0,
      totalApplications,
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