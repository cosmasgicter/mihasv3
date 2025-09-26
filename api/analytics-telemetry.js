import { mockApplications, mockPrograms } from './_lib/mockData.js'
import { withNetlifyHandler } from './_lib/netlifyHandler.js';
import { supabaseAdminClient, getUserFromRequest, useMockSupabase } from './_lib/supabaseClient.js'



function buildMockMetrics() {
  const totalApplications = mockApplications.length
  const statusBreakdown = mockApplications.reduce((acc, app) => {
    acc[app.status] = (acc[app.status] ?? 0) + 1
    return acc
  }, {})

  const programInterest = mockPrograms.map(program => ({
    id: program.id,
    name: program.name,
    applicants: mockApplications.filter(app => app.program_id === program.id).length
  }))

  return {
    success: true,
    mode: 'mock',
    metrics: {
      totalApplications,
      statusBreakdown,
      programInterest,
      generatedAt: new Date().toISOString()
    }
  }
}

async function buildLiveMetrics() {
  const metrics = {
    totalApplications: 0,
    statusBreakdown: {},
    programInterest: [],
    generatedAt: new Date().toISOString()
  }

  const warnings = []

  try {
    const { data: applications, error } = await supabaseAdminClient
      .from('applications_new')
      .select('id, status, program')

    if (error) {
      warnings.push(`Failed to load applications: ${error.message}`)
    } else if (applications) {
      metrics.totalApplications = applications.length
      for (const application of applications) {
        const statusKey = application.status ?? 'unknown'
        metrics.statusBreakdown[statusKey] = (metrics.statusBreakdown[statusKey] ?? 0) + 1

        const programName = application.program ?? 'Unspecified'
        const existingProgram = metrics.programInterest.find(entry => entry.name === programName)
        if (existingProgram) {
          existingProgram.applicants += 1
        } else {
          metrics.programInterest.push({ id: programName, name: programName, applicants: 1 })
        }
      }

      metrics.programInterest.sort((a, b) => b.applicants - a.applicants)
    }
  } catch (error) {
    warnings.push(`Unexpected telemetry aggregation error: ${error.message}`)
  }

  return { metrics, warnings }
}

async function baseHandler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method === 'POST') {
    return new Response(JSON.stringify({ success: true }), { headers })
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (useMockSupabase) {
    return new Response(JSON.stringify(buildMockMetrics()), { status: 200, headers })
  }

  const authContext = await getUserFromRequest(
    { headers: Object.fromEntries(request.headers) },
    { requireAdmin: true }
  )

  if (authContext.error) {
    const status = authContext.error === 'Access denied' ? 403 : 401
    return new Response(JSON.stringify({ error: authContext.error }), { status, headers })
  }

  const { metrics, warnings } = await buildLiveMetrics()

  return new Response(
    JSON.stringify({
      success: true,
      mode: 'live',
      metrics,
      warnings: warnings.length ? warnings : undefined
    }),
    { status: 200, headers }
  )
}


const netlifyHandler = withNetlifyHandler(baseHandler)

export { baseHandler as expressHandler }
export { netlifyHandler as handler }
export default netlifyHandler