
// Cloudflare Workers AI Client - 100% Free Models
import { supabase } from './supabase'

export class CloudflareAI {
  private static instance: CloudflareAI
  
  static getInstance(): CloudflareAI {
    if (!CloudflareAI.instance) {
      CloudflareAI.instance = new CloudflareAI()
    }
    return CloudflareAI.instance
  }

  async generateResponse(userMessage: string, context: any): Promise<string> {
    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
        },
        body: JSON.stringify({ message: userMessage, context })
      })
      if (!response.ok) {
        // If server indicates AI not implemented or unauthorized, fall back locally
        if (response.status === 501 || response.status === 403 || response.status === 401) {
          return this.fallbackResponse(userMessage, context)
        }
        // Try to parse error details
        const err = await response.json().catch(() => null)
        throw new Error(err?.error || 'AI chat failed')
      }

      const data = await response.json().catch(() => null)
      if (!data) return this.fallbackResponse(userMessage, context)
      // Server should return { response: string }
      return data.response ?? this.fallbackResponse(userMessage, context)
    } catch (error) {
      console.error('AI chat error:', error)
      return this.fallbackResponse(userMessage, context)
    }
  }

  async generateSuggestions(userMessage: string, context: any): Promise<string[]> {
    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
        },
        body: JSON.stringify({ message: userMessage, context })
      })
      if (!response.ok) {
        if (response.status === 501 || response.status === 403 || response.status === 401) {
          return this.fallbackSuggestions(context)
        }
        const err = await response.json().catch(() => null)
        throw new Error(err?.error || 'AI suggestions failed')
      }

      const data = await response.json().catch(() => null)
      return data?.suggestions || []
    } catch (error) {
      return this.fallbackSuggestions(context)
    }
  }

  async analyzeDocument(text: string, documentType: 'result_slip' | 'payment'): Promise<any> {
    try {
      const response = await fetch('/api/ai/analyze-document', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
        },
        body: JSON.stringify({ text, documentType })
      })
      if (!response.ok) {
        if (response.status === 501 || response.status === 403 || response.status === 401) {
          console.warn('Server document analysis not available, falling back')
          return { error: 'server_unavailable' }
        }
        const err = await response.json().catch(() => null)
        throw new Error(err?.error || 'Document analysis failed')
      }

      // Return parsed JSON or raw result from server
      const data = await response.json().catch(() => null)
      return data ?? { error: 'invalid_response' }
    } catch (error) {
      console.error('Document analysis error:', error)
      return { error: 'Analysis failed' }
    }
  }

  private fallbackResponse(message: string, context: any): string {
    // Minimal fallback so the assistant feels less hardcoded.
    return `Sorry — the AI service is currently unavailable. I can still help with eligibility checks, document upload guidance, subject/grade questions, or payment instructions. Which would you like help with?`
  }

  private eligibilityResponse(context: any): string {
    const { applicationData } = context
    const gradeCount = applicationData?.grades?.length || 0
    const hasDocuments = !!(applicationData?.result_slip_url && applicationData?.pop_url)
    
    let probability = 50
    if (gradeCount >= 6) probability += 20
    if (hasDocuments) probability += 20
    if (applicationData?.program) probability += 10
    
    return `🎯 **Eligibility Assessment**:\n\n**Probability**: ${probability}%\n**Program**: ${applicationData?.program || 'Not selected'}\n**Subjects**: ${gradeCount}/5 minimum\n**Documents**: ${hasDocuments ? 'Complete ✓' : 'Missing'}\n\n${probability >= 70 ? '🌟 Excellent chances!' : '📈 Keep improving!'}`
  }

  private documentResponse(context: any): string {
    const { applicationData } = context
    
    return `📄 **Document Requirements**:\n\n${applicationData?.result_slip_url ? '✅' : '❌'} Result Slip\n${applicationData?.pop_url ? '✅' : '❌'} Payment Proof (K153)\n\n**Tips**: Clear photos, readable text, JPG/PNG/PDF, max 10MB`
  }

  private subjectResponse(context: any): string {
    const { applicationData } = context
    const grades = applicationData?.grades || []
    
    return `📚 **Subject Progress**:\n\n**Added**: ${grades.length} subjects\n**Required**: 5 minimum\n**Recommended**: 6-8 subjects\n\nFocus on core subjects for your program!`
  }

  private paymentResponse(context: any): string {
    const { applicationData } = context
    const institution = ['Clinical Medicine', 'Environmental Health'].includes(applicationData?.program) 
      ? 'Kalulushi Training Centre' 
      : 'MIHAS'
    const number = institution === 'Kalulushi Training Centre' ? '0966 992 299' : '0961 515 151'
    
    return `💳 **Payment Info**:\n\n**Fee**: K153.00\n**Institution**: ${institution}\n**MTN Number**: ${number}\n**Status**: ${applicationData?.pop_url ? '✅ Uploaded' : '❌ Pending'}`
  }

  private fallbackSuggestions(context: any): string[] {
    // Minimal, non-specific fallbacks
    return ['How do I check eligibility?', 'How do I upload documents?', 'What subjects are required?']
  }
}

export const cloudflareAI = CloudflareAI.getInstance()
