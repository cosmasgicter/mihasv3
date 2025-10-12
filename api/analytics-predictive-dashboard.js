import { withNetlifyHandler } from './_lib/netlifyHandler.js'

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const mockData = {
      predictive: {
        avgAdmissionProbability: 0,
        totalApplications: 0,
        avgProcessingTime: 0,
        efficiency: 100,
        applicationTrend: 'stable',
        peakTimes: [],
        bottlenecks: [],
        generatedAt: new Date().toISOString()
      },
      workflow: {
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        ruleStats: {},
        generatedAt: new Date().toISOString()
      },
      generatedAt: new Date().toISOString(),
      source: {
        predictive: 'fallback',
        workflow: 'default'
      }
    }

    return res.status(200).json(mockData)
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' })
  }
}

const netlifyHandler = withNetlifyHandler(handler)

export { handler as expressHandler }
export { netlifyHandler as handler }
export default netlifyHandler