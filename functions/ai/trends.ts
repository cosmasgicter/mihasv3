// Cloudflare Workers AI - Trend Analysis
import { createClient } from '@supabase/supabase-js'

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const authHeader = context.request.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
    }

    const supabase = createClient(
      context.env.SUPABASE_URL,
      context.env.SUPABASE_SERVICE_ROLE_KEY
    )

    const { data: apps, error } = await supabase
      .from('applications')
      .select('id, status, program, created_at, updated_at')
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })

    if (error) {
      return new Response(JSON.stringify({ error: 'Failed to fetch data' }), { status: 500 })
    }

    const analysisPrompt = buildTrendPrompt(apps || [])
    
    const aiResponse = await context.env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'system', content: TREND_SYSTEM_PROMPT },
        { role: 'user', content: analysisPrompt }
      ],
      max_tokens: 1024,
      temperature: 0.3
    })

    const analysis = parseAITrends(aiResponse.response, apps || [])

    return new Response(JSON.stringify(analysis), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Trend analysis failed' }), { status: 500 })
  }
}

const TREND_SYSTEM_PROMPT = `You are an AI analyst for MIHAS application trends. Analyze application data and provide:
1. Overall trend (increasing/decreasing/stable)
2. Key insights (bottlenecks, patterns)
3. Recommendations for admissions team

Respond in JSON format only.`

function buildTrendPrompt(apps: any[]): string {
  const total = apps.length
  const recent7 = apps.filter(a => 
    new Date(a.created_at) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  ).length
  const previous7 = apps.filter(a => {
    const date = new Date(a.created_at)
    return date > new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) &&
           date <= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  }).length

  const statusCounts = apps.reduce((acc: any, app) => {
    acc[app.status] = (acc[app.status] || 0) + 1
    return acc
  }, {})

  const processed = apps.filter(a => ['approved', 'rejected'].includes(a.status))
  const avgProcessingDays = processed.length > 0
    ? processed.reduce((sum, app) => {
        const created = new Date(app.created_at)
        const updated = new Date(app.updated_at)
        return sum + (updated.getTime() - created.getTime()) / (1000 * 60 * 60 * 24)
      }, 0) / processed.length
    : 0

  return `Analyze these application trends (last 30 days):

Total Applications: ${total}
Recent 7 days: ${recent7}
Previous 7 days: ${previous7}
Status Distribution: ${JSON.stringify(statusCounts)}
Avg Processing Time: ${avgProcessingDays.toFixed(1)} days

Provide JSON response:
{
  "trend": "increasing|decreasing|stable",
  "insights": ["insight1", "insight2"],
  "recommendations": ["rec1", "rec2"]
}`
}

function parseAITrends(aiText: string, apps: any[]): any {
  try {
    const jsonMatch = aiText.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return {
        trend: parsed.trend || 'stable',
        insights: Array.isArray(parsed.insights) ? parsed.insights : [],
        recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
        total: apps.length,
        avgProcessingDays: calculateAvgProcessing(apps)
      }
    }
  } catch (e) {
    // Fallback
  }

  return fallbackTrends(apps)
}

function fallbackTrends(apps: any[]): any {
  const recent7 = apps.filter(a => 
    new Date(a.created_at) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  ).length
  const previous7 = apps.filter(a => {
    const date = new Date(a.created_at)
    return date > new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) &&
           date <= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  }).length

  let trend: 'increasing' | 'decreasing' | 'stable' = 'stable'
  if (previous7 > 0) {
    const ratio = recent7 / previous7
    if (ratio > 1.2) trend = 'increasing'
    else if (ratio < 0.8) trend = 'decreasing'
  }

  const insights = []
  const pending = apps.filter(a => a.status === 'submitted').length
  const underReview = apps.filter(a => a.status === 'under_review').length

  if (pending > 20) insights.push(`High volume of pending applications (${pending})`)
  if (underReview > 15) insights.push(`Many applications under review (${underReview})`)

  return {
    trend,
    insights,
    recommendations: insights.length > 0 
      ? ['Consider increasing review capacity', 'Prioritize older applications']
      : ['Maintain current processing pace'],
    total: apps.length,
    avgProcessingDays: calculateAvgProcessing(apps)
  }
}

function calculateAvgProcessing(apps: any[]): number {
  const processed = apps.filter(a => 
    ['approved', 'rejected'].includes(a.status) && a.updated_at
  )
  
  if (processed.length === 0) return 0
  
  const totalTime = processed.reduce((sum, app) => {
    const created = new Date(app.created_at)
    const updated = new Date(app.updated_at)
    return sum + (updated.getTime() - created.getTime())
  }, 0)
  
  return Math.round(totalTime / processed.length / (1000 * 60 * 60 * 24))
}
