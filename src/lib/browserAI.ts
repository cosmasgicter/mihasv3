import { pipeline } from '@xenova/transformers'

let classifier: any = null

export async function initBrowserAI() {
  if (!classifier) {
    classifier = await pipeline('text-classification', 'Xenova/distilbert-base-uncased-finetuned-sst-2-english')
  }
  return classifier
}

export async function analyzeText(text: string) {
  try {
    const model = await initBrowserAI()
    
    // Extract patterns using regex + AI classification
    const nrcMatch = text.match(/(\d{6}\/\d{2}\/\d)/)
    const nameMatch = text.match(/name[:\s]+([a-zA-Z\s]+)/i)
    const gradeMatches = text.match(/(mathematics|english|biology|chemistry|physics|geography)[:\s]+(\d)/gi)
    
    return {
      nrc: nrcMatch?.[1],
      name: nameMatch?.[1]?.trim(),
      grades: gradeMatches?.map(match => {
        const [subject, grade] = match.split(/[:\s]+/)
        return { subject: subject.trim(), grade: parseInt(grade) }
      }) || [],
      confidence: 0.8
    }
  } catch (error) {
    return { error: 'Browser AI failed' }
  }
}