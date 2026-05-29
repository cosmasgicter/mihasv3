import { z } from '@/lib/zod'

export const programFormSchema = z.object({
  name: z.string().min(1, 'Program name is required'),
  description: z.string(),
  duration_years: z.number().min(1, 'Duration must be at least 1 year').max(10, 'Duration must be at most 10 years'),
  institution_id: z.string().min(1, 'Institution is required'),
  tuition_fee: z.string(),
  regulatory_body: z.string(),
  accreditation_status: z.string(),
})

export type ProgramFormData = z.infer<typeof programFormSchema>

export const institutionFormSchema = z.object({
  name: z.string().min(1, 'Institution name is required'),
  full_name: z.string(),
  code: z.string(),
  description: z.string(),
  status: z.enum(['active', 'archived']),
  address: z.string(),
  phone: z.string(),
  email: z.string(),
  website: z.string(),
})

export type InstitutionFormData = z.infer<typeof institutionFormSchema>

export const defaultProgramForm: ProgramFormData = {
  name: '',
  description: '',
  duration_years: 1,
  institution_id: '',
  tuition_fee: '',
  regulatory_body: '',
  accreditation_status: 'active',
}

export const defaultInstitutionForm: InstitutionFormData = {
  name: '',
  full_name: '',
  code: '',
  description: '',
  status: 'active',
  address: '',
  phone: '',
  email: '',
  website: '',
}
