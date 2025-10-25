// Cloudflare Workers AI - Document Analysis
export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const { text, documentType } = await context.request.json()

    const prompt = buildDocumentPrompt(text, documentType)
    
    const response = await context.env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'system', content: DOCUMENT_SYSTEM_PROMPT },
        { role: 'user', content: prompt }
      ],
      max_tokens: 1024,
      temperature: 0.2
    })

    const extracted = parseDocumentData(response.response, text)

    return new Response(JSON.stringify(extracted), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Document analysis failed' }), { status: 500 })
  }
}

const DOCUMENT_SYSTEM_PROMPT = `You are an AI document analyzer for MIHAS applications. Extract data from Grade 12 result slips and payment receipts.

For result slips, extract:
- Student name
- NRC number (format: 123456/12/1)
- Subjects and grades (1-9, where 1=A+, 9=F)

For payment receipts, extract:
- Transaction ID
- Amount (should be K153)
- Date
- Phone number

Respond in JSON format only.`

function buildDocumentPrompt(text: string, docType: string): string {
  return `Extract data from this ${docType}:

${text}

Provide JSON response:
${docType === 'result_slip' ? `{
  "name": "student name",
  "nrc": "123456/12/1",
  "grades": [
    {"subject": "Mathematics", "grade": 2},
    {"subject": "English", "grade": 3}
  ]
}` : `{
  "transaction_id": "ABC123",
  "amount": 153,
  "date": "2025-01-23",
  "phone": "0961234567"
}`}`
}

function parseDocumentData(aiText: string, originalText: string): any {
  try {
    const jsonMatch = aiText.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0])
    }
  } catch (e) {
    // Fallback to regex
  }

  return fallbackExtraction(originalText)
}

function fallbackExtraction(text: string): any {
  const nrcMatch = text.match(/(\d{6}\/\d{2}\/\d)/)
  const nameMatch = text.match(/name[:\s]+([a-zA-Z\s]+)/i)
  const gradeMatches = text.match(/(mathematics|english|biology|chemistry|physics|geography|science|history|civics|religious education)[:\s]+(\d)/gi)
  
  const grades = gradeMatches?.map(match => {
    const parts = match.split(/[:\s]+/)
    return { 
      subject: parts[0].trim(), 
      grade: parseInt(parts[parts.length - 1]) 
    }
  }) || []

  return {
    nrc: nrcMatch?.[1],
    name: nameMatch?.[1]?.trim(),
    grades,
    confidence: 0.7
  }
}
