import { z } from '@/lib/zod'

import type { Institution, Program, Intake } from '@/types/database'
import {
  normalizeResidenceTown,
  RESIDENCE_TOWN_MIN_LENGTH_MESSAGE,
  RESIDENCE_TOWN_REQUIRED_MESSAGE,
} from '@/lib/residenceTown'

type InstitutionSummary = Pick<Institution, 'id' | 'name' | 'full_name'>

export type WizardProgram = Program & {
  institutions?: InstitutionSummary | null
}

export type WizardIntake = Intake & {
  displayName: string
}

const createProgramValidator = (validProgramIds: string[]) =>
  z
    .string({ error: 'Please select a program' })
    .min(1, 'Please select a program')
    .refine(
      value =>
        value.trim().length > 0 && (validProgramIds.length === 0 || validProgramIds.includes(value)),
      {
        message: 'Please select a valid program',
      }
    )

const createIntakeValidator = (validIntakeIds: string[]) =>
  z
    .string({ error: 'Please select an intake' })
    .min(1, 'Please select an intake')
    .refine(
      value =>
        value.trim().length > 0 && (validIntakeIds.length === 0 || validIntakeIds.includes(value)),
      {
        message: 'Please select a valid intake',
      }
    )

export const normalizePhoneNumberInput = (value: string): string => value.replace(/\s+/g, '')

const createSchema = (validProgramIds: string[], validIntakeIds: string[]) =>
  z
    .object({
      full_name: z.string().min(2, 'Full name is required'),
      nrc_number: z.string().optional(),
      passport_number: z.string().optional(),
      date_of_birth: z.string()
        .min(1, 'Date of birth is required')
        .refine((date) => {
          const parsed = new Date(date)
          const year = parsed.getFullYear()
          const currentYear = new Date().getFullYear()
          return !isNaN(parsed.getTime()) && year >= 1900 && year <= currentYear - 16
        }, {
          message: 'Please enter a valid date of birth (must be at least 16 years old)'
        }),
      sex: z.enum(['Male', 'Female'], { error: 'Please select sex' }),
      phone: z.string()
        .transform(normalizePhoneNumberInput)
        .pipe(z.string().regex(/^\+?[0-9]{7,15}$/, 'Phone must be 7–15 digits, optionally prefixed with +')),
      email: z.string().email('Valid email is required'),
      residence_town: z
        .string()
        .transform(normalizeResidenceTown)
        .refine(value => value.length > 0, RESIDENCE_TOWN_REQUIRED_MESSAGE)
        .refine(value => value.length >= 2, RESIDENCE_TOWN_MIN_LENGTH_MESSAGE),
      country: z.string().optional(),
      nationality: z.string().optional(),
      next_of_kin_name: z.string().optional(),
      next_of_kin_phone: z.string().optional(),
      program: createProgramValidator(validProgramIds),
      intake: createIntakeValidator(validIntakeIds),
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
  category?: string
  level?: 'grade12' | 'olevel' | 'alevel'
}

export interface SubjectGrade {
  subject_id: string
  grade: number
}

export interface ApplicationFormData extends WizardFormData {
  grades?: SubjectGrade[]
  nrc?: string
  passport_number?: string
}
