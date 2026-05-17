import { z } from '@/lib/zod'

export const applicationSchema = z.object({
  program_id: z.string().min(1, 'Please select a program'),
  intake_id: z.string().min(1, 'Please select an intake'),
  nrc_number: z.string().optional(),
  passport_number: z.string().optional(),
  date_of_birth: z.string().min(1, 'Date of birth is required'),
  sex: z.enum(['Male', 'Female'], { error: 'Please select sex' }),
  marital_status: z.enum(['Single', 'Married', 'Divorced', 'Widowed'], { error: 'Please select marital status' }),
  nationality: z.string().min(1, 'Nationality is required'),
  province: z.string().min(1, 'Province is required'),
  district: z.string().min(1, 'District is required'),
  postal_address: z.string().optional(),
  physical_address: z.string().min(5, 'Physical address is required'),
  next_of_kin_name: z.string().optional(),
  next_of_kin_phone: z.string().optional(),
  next_of_kin_relationship: z.string().optional(),
  medical_conditions: z.string().optional(),
  disabilities: z.string().optional(),
  criminal_record: z.boolean().optional(),
  criminal_record_details: z.string().optional(),
  professional_registration_number: z.string().optional(),
  professional_body: z.string().optional(),
  employment_status: z.enum(['Unemployed', 'Employed', 'Self-employed', 'Student']).optional(),
  employer_name: z.string().optional(),
  employer_address: z.string().optional(),
  years_of_experience: z.number().min(0).optional(),
  previous_education: z.string().optional(),
  grades_or_gpa: z.string().optional(),
  subjects: z.array(z.object({
    id: z.string(),
    name: z.string(),
    code: z.string(),
    category: z.enum(['core', 'elective']),
    grade: z.string().optional(),
    score: z.number().optional()
  })).min(5, 'At least 5 subjects are required').optional(),
  motivation_letter: z.string().optional(),
  career_goals: z.string().optional(),
  english_proficiency: z.enum(['Basic', 'Intermediate', 'Advanced', 'Fluent']).optional(),
  computer_skills: z.enum(['Basic', 'Intermediate', 'Advanced']).optional(),
  references: z.string().optional(),
  financial_sponsor: z.string().optional(),
  sponsor_relationship: z.string().optional(),
  additional_info: z.string().optional(),
  declaration: z.boolean().optional(),
  information_accuracy: z.boolean().optional(),
  professional_conduct: z.boolean().optional()
}).superRefine((data, ctx) => {
  const hasNrc = (data.nrc_number?.trim().length ?? 0) > 0
  const hasPassport = (data.passport_number?.trim().length ?? 0) > 0
  
  if (!hasNrc && !hasPassport) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Either NRC number or passport number must be provided",
      path: ["nrc_number"]
    })
  }
  
  if (hasNrc && hasPassport) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Please provide either NRC number or passport number, not both",
      path: ["passport_number"]
    })
  }
})

export type ApplicationFormData = z.infer<typeof applicationSchema>

export interface ProfileData {
  date_of_birth?: string
  sex?: string
  nationality?: string
  address?: string
  next_of_kin_name?: string
  next_of_kin_phone?: string
  full_name?: string
}
