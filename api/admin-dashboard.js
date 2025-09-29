import { supabaseAdminClient, getUserFromRequest } from './_lib/supabaseClient.js'
import { withNetlifyHandler } from './_lib/netlifyHandler.js';

async function baseHandler(req, res) {
  

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { data, error } = await supabaseAdminClient
      .from('applications_new')
      .select('status')

    if (error) throw error

    const statusCounts = data.reduce((acc, app) => {
      acc[app.status] = (acc[app.status] || 0) + 1
      return acc
    }, {})

    const stats = {
      totalApplications: data.length,
      pendingApplications: (statusCounts.submitted || 0) + (statusCounts.under_review || 0),
      approvedApplications: statusCounts.approved || 0,
      rejectedApplications: statusCounts.rejected || 0,
      statusBreakdown: statusCounts
    }

    return res.status(200).json({ stats, recentActivity: [] });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to load dashboard' })
  }
}

const netlifyHandler = withNetlifyHandler(baseHandler)

export { baseHandler as expressHandler }
export { netlifyHandler as handler }
export default netlifyHandler