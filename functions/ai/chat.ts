// Cloudflare Workers AI - Chat Assistant
export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const { message, context: appContext } = await context.request.json()

    const prompt = buildPrompt(message, appContext)
    
    const response = await context.env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt }
      ],
      max_tokens: 512,
      temperature: 0.7
    })

    return new Response(JSON.stringify({
      response: response.response,
      suggestions: generateSuggestions(message, appContext)
    }), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: 'AI chat failed' }), { status: 500 })
  }
}

const SYSTEM_PROMPT = `You are a helpful assistant for MIHAS (Mukuba Institute of Health and Allied Sciences) student application system.

Your role:
- Guide students through the 4-step application process
- Explain eligibility requirements for health programs
- Help with document uploads (result slip, payment proof)
- Provide subject/grade guidance
- Answer payment questions (K153 fee)

Be concise, friendly, and accurate. Use emojis sparingly.`

function buildPrompt(message: string, context: any): string {
  const { applicationData, currentStep } = context
  
  return `Student Question: ${message}

Application Context:
- Current Step: ${currentStep || 1}/4
- Program: ${applicationData?.program || 'Not selected'}
- Subjects Added: ${applicationData?.grades?.length || 0}
- Documents: ${applicationData?.result_slip_url ? 'Result slip ✓' : 'Missing result slip'}, ${applicationData?.pop_url ? 'Payment ✓' : 'Missing payment'}

Provide a helpful, specific answer based on their application status.`
}

function generateSuggestions(message: string, context: any): string[] {
  const lower = message.toLowerCase()
  
  if (lower.includes('eligibility') || lower.includes('chance')) {
    return ['How can I improve my chances?', 'What documents do I need?', 'Check my progress']
  }
  
  if (lower.includes('document') || lower.includes('upload')) {
    return ['Help with result slip', 'Payment proof guide', 'Document quality tips']
  }
  
  const { applicationData } = context
  const suggestions = []
  
  if (!applicationData?.program) suggestions.push('Help me choose a program')
  if (!applicationData?.grades?.length) suggestions.push('Guide me through subjects')
  if (!applicationData?.result_slip_url) suggestions.push('Document upload help')
  
  return suggestions.length > 0 ? suggestions : ['What\'s my next step?', 'Check eligibility', 'Any tips?']
}
