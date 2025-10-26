import { z } from 'zod'

export const ChatResponseSchema = z.object({
  response: z.string(),
  suggestions: z.array(z.string()).optional()
})

export const GradeSchema = z.object({
  subject: z.string(),
  grade: z.number()
})

export const AnalyzeDocumentSchema = z.object({
  grades: z.array(GradeSchema).optional(),
  summary: z.string().optional(),
  nrc: z.string().optional(),
  name: z.string().optional(),
  examYear: z.string().optional()
})

export type ChatResponse = z.infer<typeof ChatResponseSchema>
export type AnalyzeDocument = z.infer<typeof AnalyzeDocumentSchema>
