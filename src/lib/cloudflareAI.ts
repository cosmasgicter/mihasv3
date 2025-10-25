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

      if (!response.ok) throw new Error('AI chat failed')

      const data = await response.json()
      return data.response
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

      if (!response.ok) throw new Error('AI suggestions failed')

      const data = await response.json()
      return data.suggestions || []
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

      if (!response.ok) throw new Error('Document analysis failed')

      return await response.json()
    } catch (error) {
      console.error('Document analysis error:', error)
      return { error: 'Analysis failed' }
    }
  }

  private fallbackResponse(message: string, context: any): string {
    const lower = message.toLowerCase()
    
    if (lower.includes('eligibility') || lower.includes('chance')) {
      return this.eligibilityResponse(context)
    }
    
    if (lower.includes('document') || lower.includes('upload')) {
      return this.documentResponse(context)
    }
    
    if (lower.includes('subject') || lower.includes('grade')) {
      return this.subjectResponse(context)
    }
    
    if (lower.includes('payment') || lower.includes('fee')) {
      return this.paymentResponse(context)
    }
    
    return `I can help with:\n\n🎯 Eligibility checking\n📄 Document uploads\n📚 Subject requirements\n💳 Payment process\n\nWhat would you like to know?`
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
    const { applicationData } = context
    const suggestions = []
    
    if (!applicationData?.program) suggestions.push('Help me choose a program')
    if (!applicationData?.grades?.length) suggestions.push('Guide me through subjects')
    if (!applicationData?.result_slip_url) suggestions.push('Document upload help')
    
    return suggestions.length > 0 ? suggestions : ['What\'s my next step?', 'Check eligibility']
  }
}

export const cloudflareAI = CloudflareAI.getInstance()
