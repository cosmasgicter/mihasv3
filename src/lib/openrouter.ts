const OPENROUTER_API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY || 'sk-or-v1-your-free-key'
const API_URL = 'https://openrouter.ai/api/v1/chat/completions'

export async function analyzeDocumentWithAI(ocrText: string, documentType: string) {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek/deepseek-chat', // Free model
        messages: [{
          role: 'user',
          content: `Extract structured data from this ${documentType} document:

${ocrText}

Return JSON with: name, nrc, examNumber, school, grades (array of {subject, grade}), paymentAmount, paymentReference.`
        }],
        max_tokens: 500
      })
    })

    const data = await response.json()
    return JSON.parse(data.choices[0].message.content)
  } catch (error) {
    console.error('AI analysis failed:', error)
    return {}
  }
}