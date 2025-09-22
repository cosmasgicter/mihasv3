import { z } from 'zod'

import type { Institution, Program, Intake } from '@/lib/supabase'

type InstitutionSummary = Pick<Institution, 'id' | 'name' | 'full_name'>

export type WizardProgram = Program & {
  institutions?: InstitutionSummary | null
}

export type WizardIntake = Intake & {
  displayName: string
}

const createProgramValidator = (validProgramNames: string[]) =>
  z
    .string({ required_error: 'Please select a program' })
    .min(1, 'Please select a program')
    .refine(
      value =>
        value.trim().length > 0 && (validProgramNames.length === 0 || validProgramNames.includes(value)),
      {
        message: 'Please select a valid program',
      }
    )

const createIntakeValidator = (validIntakeOptions: string[]) =>
  z
    .string({ required_error: 'Please select an intake' })
    .min(1, 'Please select an intake')
    .refine(
      value =>
        value.trim().length > 0 && (validIntakeOptions.length === 0 || validIntakeOptions.includes(value)),
      {
        message: 'Please select a valid intake',
      }
    )

const createSchema = (validProgramNames: string[], validIntakeOptions: string[]) =>
  z
    .object({
      full_name: z.string().min(2, 'Full name is required'),
      nrc_number: z.string().optional(),
      passport_number: z.string().optional(),
      date_of_birth: z.string().min(1, 'Date of birth is required'),
      sex: z.enum(['Male', 'Female'], { required_error: 'Please select sex' }),
      phone: z.string().min(10, 'Valid phone number is required'),
      email: z.string().email('Valid email is required'),
      residence_town: z.string().min(2, 'Residence town is required'),
      next_of_kin_name: z.string().optional(),
      next_of_kin_phone: z.string().optional(),
      program: createProgramValidator(validProgramNames),
      intake: createIntakeValidator(validIntakeOptions),
      payment_method: z
        .enum(['MTN Money', 'Airtel Money', 'Zamtel Money', 'Ewallet', 'Bank To Cell'])
        .default('MTN Money'),
      payer_name: z.string().optional(),
      payer_phone: z.string().optional(),
      amount: z.number().min(153, 'Minimum amount is K153').optional(),
      paid_at: z.string().optional(),
      momo_ref: z.string().optional(),
    })
    .refine(
      data => Boolean(data.nrc_number || data.passport_number),
      {
        message: 'Either NRC or Passport number is required',
        path: ['nrc_number'],
      }
    )

export const createWizardSchema = createSchema

export const wizardSchema = createWizardSchema([], [])

export type WizardFormData = z.infer<ReturnType<typeof createWizardSchema>>

export interface Grade12Subject {
  id: string
  name: string
  code: string
}

export interface SubjectGrade {
  subject_id: string
  grade: number
}
