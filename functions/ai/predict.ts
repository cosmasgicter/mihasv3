// Cloudflare Workers AI - Admission Prediction
import { createClient } from '@supabase/supabase-js'

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const authHeader = context.request.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
    }

    const supabase = createClient(
      context.env.SUPABASE_URL,
      context.env.SUPABASE_SERVICE_ROLE_KEY
    )

    const { application_id } = await context.request.json()

    const { data: app, error } = await supabase
      .from('applications')
      .select('*')
      .eq('id', application_id)
      .single()

    if (error || !app) {
      return new Response(JSON.stringify({ error: 'Application not found' }), { status: 404 })
    }

    const analysisPrompt = buildAnalysisPrompt(app)
    
    const aiResponse = await context.env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'system', content: PREDICTION_SYSTEM_PROMPT },
        { role: 'user', content: analysisPrompt }
      ],
      max_tokens: 1024,
      temperature: 0.3
    })

    const prediction = parseAIPrediction(aiResponse.response, app)

    await supabase.from('prediction_results').insert({
      application_id: app.id,
      admission_probability: prediction.admission_probability,
      processing_time_estimate: prediction.processing_time_estimate,
      risk_factors: prediction.risk_factors,
      recommendations: prediction.recommendations,
      confidence: prediction.confidence,
      model_version: 'cloudflare-ai-v1'
    })

    return new Response(JSON.stringify(prediction), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Prediction failed' }), { status: 500 })
  }
}

const PREDICTION_SYSTEM_PROMPT = `You are an AI admission analyst for MIHAS health programs. Analyze applications and provide:
1. Admission probability (0.0-1.0)
2. Processing time estimate (days)
3. Risk factors (array)
4. Recommendations (array)

Zambian grading: 1=A+ (best), 9=F (worst). Minimum 5 subjects required.

Programs:
- Clinical Medicine: Requires Math, Biology, Chemistry (grades 1-4)
- Environmental Health: Requires Math, Biology, Chemistry (grades 1-5)
- Registered Nursing: Requires Math, Biology, English (grades 1-5)

Respond in JSON format only.`

function buildAnalysisPrompt(app: any): string {
  const grades = app.grades || []
  const avgGrade = grades.length > 0 
    ? (grades.reduce((sum: number, g: any) => sum + g.grade, 0) / grades.length).toFixed(1)
    : 'N/A'

  return `Analyze this application:

Program: ${app.program}
Subjects: ${grades.length} (${grades.map((g: any) => `${g.subject}: ${g.grade}`).join(', ')})
Average Grade: ${avgGrade}
Documents: ${app.result_slip_url ? 'Result slip ✓' : 'Missing'}, ${app.pop_url ? 'Payment ✓' : 'Missing'}

Provide JSON response:
{
  "admission_probability": 0.0-1.0,
  "processing_time_estimate": days,
  "risk_factors": ["factor1", "factor2"],
  "recommendations": ["rec1", "rec2"],
  "confidence": 0.0-1.0
}`
}

function parseAIPrediction(aiText: string, app: any): any {
  try {
    const jsonMatch = aiText.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return {
        admission_probability: Math.max(0.05, Math.min(0.98, parsed.admission_probability || 0.5)),
        processing_time_estimate: Math.max(1, parsed.processing_time_estimate || 5),
        risk_factors: Array.isArray(parsed.risk_factors) ? parsed.risk_factors : [],
        recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
        confidence: Math.max(0.1, Math.min(0.95, parsed.confidence || 0.7))
      }
    }
  } catch (e) {
    // Fallback to rule-based
  }

  return fallbackPrediction(app)
}

function fallbackPrediction(app: any): any {
  const grades = app.grades || []
  let score = 0.4

  if (grades.length >= 6) score += 0.15
  if (grades.length >= 8) score += 0.1

  const avgGrade = grades.length > 0 
    ? grades.reduce((sum: number, g: any) => sum + g.grade, 0) / grades.length
    : 5

  if (avgGrade <= 3) score += 0.2
  else if (avgGrade <= 4) score += 0.15
  else if (avgGrade <= 5) score += 0.1

  if (app.result_slip_url) score += 0.1
  if (app.pop_url) score += 0.1

  const risks = []
  if (grades.length < 5) risks.push('Insufficient subjects (minimum 5)')
  if (!app.result_slip_url) risks.push('Missing result slip')
  if (!app.pop_url) risks.push('Missing payment proof')
  if (avgGrade > 6) risks.push('Grades may not meet requirements')

  const recommendations = []
  if (score < 0.6) recommendations.push('Add more subjects to strengthen application')
  if (!app.result_slip_url) recommendations.push('Upload result slip immediately')
  if (!app.pop_url) recommendations.push('Upload payment proof')

  let processingTime = 2
  if (!app.result_slip_url) processingTime += 3
  if (!app.pop_url) processingTime += 2
  if (grades.length < 5) processingTime += 2

  return {
    admission_probability: Math.max(0.05, Math.min(0.98, score)),
    processing_time_estimate: Math.max(1, processingTime),
    risk_factors: risks,
    recommendations: recommendations,
    confidence: 0.75
  }
}
