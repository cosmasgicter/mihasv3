/**
 * Cloudflare AI Service - 100% Free AI Integration
 * Uses Cloudflare Workers AI (free tier: 10,000 neurons/day)
 */

export class CloudflareAI {
  constructor(env) {
    this.ai = env.AI // Cloudflare AI binding
    this.env = env || {}
  }

  /**
   * Generate text embeddings for semantic search
   * Model: @cf/baai/bge-small-en-v1.5 (384 dimensions)
   */
  async generateEmbedding(text) {
    const response = await this.ai.run('@cf/baai/bge-small-en-v1.5', {
      text: text
    })
    return response.data[0] // Returns 384-dimensional vector
  }

  /**
   * Generate smart recommendations based on application data
   * Model: @cf/meta/llama-2-7b-chat-int8
   */
  async generateRecommendations(applicationData) {
    const prompt = `You are an admissions advisor for MIHAS (Medical Institute). Analyze this application and provide 3 specific, actionable recommendations:

Application Details:
- Program: ${applicationData.program || 'Not specified'}
- Grades: ${applicationData.grades?.length || 0} subjects
- Average Grade: ${this._calculateAvgGrade(applicationData.grades)}
- Documents: ${this._listDocuments(applicationData)}

Provide exactly 3 recommendations as a JSON array of strings. Be specific and helpful.`

    const response = await this.ai.run('@cf/meta/llama-2-7b-chat-int8', {
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 256
    })

    return this._parseRecommendations(response.response)
  }

  /**
   * Chat helper that asks the model to return a structured JSON response
   * { response: string, suggestions: string[] }
   */
  async chat(userMessage, context = {}) {
    const systemPrompt = this.env.AI_SYSTEM_PROMPT || 'You are a helpful admissions assistant for MIHAS. Provide concise, friendly answers and include up to 3 short suggestions in the response JSON.'
    const model = this.env.AI_CHAT_MODEL || '@cf/meta/llama-2-7b-chat-int8'

    const userContent = `User message:\n${userMessage}\n\nContext:\n${JSON.stringify(context)}`
    const prompt = `${userContent}\n\nRespond with a JSON object exactly like: {"response": "<text>", "suggestions": ["s1","s2"]}`

    const response = await this.ai.run(model, {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
      max_tokens: 512
    })

    const raw = response?.response || response?.output?.[0]?.content || ''
    try {
      const m = String(raw).match(/\{[\s\S]*\}/)
      if (m) return JSON.parse(m[0])
    } catch (e) {
      // fallthrough
    }

    // Best-effort fallback: return raw text and empty suggestions
    return { response: String(raw).trim(), suggestions: [] }
  }

  /**
   * Predict admission probability using AI
   * Model: @cf/meta/llama-2-7b-chat-int8
   */
  async predictAdmission(applicationData) {
    const prompt = `As an admissions AI, analyze this application and predict admission probability (0-100):

Program: ${applicationData.program}
Subjects: ${applicationData.grades?.length || 0}
Average Grade: ${this._calculateAvgGrade(applicationData.grades)} (1=best, 9=worst in Zambian system)
Documents Complete: ${this._documentsComplete(applicationData)}

Respond with ONLY a JSON object: {"probability": <number 0-100>, "confidence": <number 0-100>, "key_factor": "<one sentence>"}`

    const response = await this.ai.run('@cf/meta/llama-2-7b-chat-int8', {
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 128
    })

    return this._parsePrediction(response.response)
  }

  /**
   * Analyze document text and return structured JSON (attempt).
   */
  async analyzeDocument(text, documentType = 'unknown') {
    const model = this.env.AI_DOC_MODEL || '@cf/meta/llama-2-7b-chat-int8'
    const system = this.env.AI_DOC_SYSTEM_PROMPT || 'You are a document analysis assistant. Extract structured data and provide a short summary in JSON.'

    const prompt = `DocumentType: ${documentType}\n\n${text}\n\nRespond with a JSON object containing extracted fields and a short summary field named \"summary\".`

    const response = await this.ai.run(model, {
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt }
      ],
      max_tokens: 512
    })

    const raw = response?.response || response?.output?.[0]?.content || ''
    try {
      const m = String(raw).match(/\{[\s\S]*\}/)
      if (m) return JSON.parse(m[0])
    } catch (e) {
      // ignore parse errors
    }

    return { type: documentType, summary: String(raw).slice(0, 1000) }
  }

  /**
   * Analyze application trends using AI
   */
  async analyzeTrends(applications) {
    const summary = {
      total: applications.length,
      byStatus: this._groupByStatus(applications),
      avgProcessingDays: this._avgProcessingTime(applications)
    }

    const prompt = `Analyze these application statistics and identify 2 key insights:

Total Applications: ${summary.total}
Status Distribution: ${JSON.stringify(summary.byStatus)}
Avg Processing Time: ${summary.avgProcessingDays} days

Respond with JSON: {"insights": ["<insight1>", "<insight2>"], "trend": "increasing|stable|decreasing"}`

    const response = await this.ai.run('@cf/meta/llama-2-7b-chat-int8', {
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 128
    })

    return this._parseTrends(response.response, summary)
  }

  /**
   * Smart document classification
   * Model: @cf/microsoft/resnet-50 for images
   */
  async classifyDocument(imageBuffer) {
    const response = await this.ai.run('@cf/microsoft/resnet-50', {
      image: imageBuffer
    })
    return response
  }

  // Helper methods
  _calculateAvgGrade(grades) {
    if (!grades || grades.length === 0) return 'N/A'
    const avg = grades.reduce((sum, g) => sum + g.grade, 0) / grades.length
    return avg.toFixed(1)
  }

  _listDocuments(data) {
    const docs = []
    if (data.result_slip_url) docs.push('Result Slip')
    if (data.pop_url) docs.push('Payment Proof')
    if (data.extra_kyc_url) docs.push('KYC')
    return docs.length > 0 ? docs.join(', ') : 'None'
  }

  _documentsComplete(data) {
    return !!(data.result_slip_url && data.pop_url)
  }

  _parseRecommendations(text) {
    try {
      const jsonMatch = text.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0])
      }
      // Fallback: extract bullet points
      const lines = text.split('\n').filter(l => l.trim().match(/^[-*\d.]/))
      return lines.slice(0, 3).map(l => l.replace(/^[-*\d.]\s*/, '').trim())
    } catch {
      return ['Review your application for completeness', 'Ensure all documents are uploaded', 'Check grade requirements']
    }
  }

  _parsePrediction(text) {
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0])
      }
    } catch {}
    return { probability: 50, confidence: 30, key_factor: 'Insufficient data for accurate prediction' }
  }

  _parseTrends(text, summary) {
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        return { ...summary, ...parsed }
      }
    } catch {}
    return { ...summary, insights: ['Analysis in progress'], trend: 'stable' }
  }

  _groupByStatus(apps) {
    return apps.reduce((acc, app) => {
      acc[app.status] = (acc[app.status] || 0) + 1
      return acc
    }, {})
  }

  _avgProcessingTime(apps) {
    const processed = apps.filter(a => ['approved', 'rejected'].includes(a.status) && a.updated_at)
    if (processed.length === 0) return 0
    const total = processed.reduce((sum, app) => {
      const days = (new Date(app.updated_at) - new Date(app.created_at)) / (1000 * 60 * 60 * 24)
      return sum + days
    }, 0)
    return Math.round(total / processed.length)
  }
}
