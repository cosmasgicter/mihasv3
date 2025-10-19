import { z } from 'zod';

const SUBJECT_SCHEMA = z.object({
  id: z.string().min(1, 'Subject ID is required'),
  name: z.string().min(1, 'Subject name is required'),
  code: z.string().min(1, 'Subject code is required'),
  category: z.enum(['core', 'elective'], { required_error: 'Subject category is required' }),
  grade: z.string().optional(),
  score: z.number().optional()
});

const APPLICATION_STATUS_VALUES = ['draft', 'submitted', 'under_review', 'approved', 'rejected', 'deleted'];
const PAYMENT_STATUS_VALUES = ['pending', 'pending_review', 'verified', 'rejected'];

const baseApplicationFields = {
  program_id: z.string().min(1, 'Program is required'),
  intake_id: z.string().min(1, 'Intake is required'),
  nrc_number: z.string().trim().optional(),
  passport_number: z.string().trim().optional(),
  date_of_birth: z.string().min(1, 'Date of birth is required'),
  sex: z.enum(['Male', 'Female'], { required_error: 'Sex is required' }),
  marital_status: z.enum(['Single', 'Married', 'Divorced', 'Widowed'], { required_error: 'Marital status is required' }),
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
  years_of_experience: z.coerce.number().min(0).optional(),
  previous_education: z.string().optional(),
  grades_or_gpa: z.string().optional(),
  subjects: z.array(SUBJECT_SCHEMA).min(5, 'At least 5 subjects are required').optional(),
  motivation_letter: z.string().optional(),
  career_goals: z.string().optional(),
  english_proficiency: z.enum(['Basic', 'Intermediate', 'Advanced', 'Fluent']).optional(),
  computer_skills: z.enum(['Basic', 'Intermediate', 'Advanced']).optional(),
  references: z.string().optional(),
  financial_sponsor: z.string().optional(),
  sponsor_relationship: z.string().optional(),
  additional_info: z.string().optional(),
  payment_method: z.enum(['MTN Money', 'Airtel Money', 'Zamtel Money', 'Ewallet', 'Bank To Cell']).optional(),
  payment_reference: z.string().optional(),
  declaration: z.boolean().optional(),
  information_accuracy: z.boolean().optional(),
  professional_conduct: z.boolean().optional(),
  status: z.enum(APPLICATION_STATUS_VALUES).optional(),
  payment_status: z.enum(PAYMENT_STATUS_VALUES).optional(),
  admin_notes: z.string().optional()
};

const identificationValidator = (data, ctx) => {
  const hasNrc = typeof data.nrc_number === 'string' && data.nrc_number.trim().length > 0;
  const hasPassport = typeof data.passport_number === 'string' && data.passport_number.trim().length > 0;

  if (!hasNrc && !hasPassport) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Either NRC number or passport number must be provided',
      path: ['nrc_number']
    });
  }

  if (hasNrc && hasPassport) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Please provide either NRC number or passport number, not both',
      path: ['passport_number']
    });
  }
};

const baseApplicationSchema = z.object(baseApplicationFields).passthrough();

const createApplicationSchema = baseApplicationSchema.superRefine(identificationValidator);

const updateApplicationSchema = baseApplicationSchema.partial().superRefine((data, ctx) => {
  const hasIdentificationField = 'nrc_number' in data || 'passport_number' in data;

  if (hasIdentificationField) {
    identificationValidator(data, ctx);
  }
});

const statusUpdateSchema = z
  .object({
    status: z.preprocess(
      value => (typeof value === 'string' ? value.replace('-', '_') : value),
      z.enum(APPLICATION_STATUS_VALUES, { required_error: 'Status is required' })
    ),
    notes: z.string().max(1000, 'Notes must be 1000 characters or less').optional()
  })
  .superRefine((data, ctx) => {
    if (data.status === 'draft' || data.status === 'deleted') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Invalid status update',
        path: ['status']
      });
    }
  });

export function validateCreate(payload) {
  return createApplicationSchema.safeParse(payload);
}

export function validateUpdate(payload) {
  return updateApplicationSchema.safeParse(payload);
}

export function validateStatusUpdate(payload) {
  return statusUpdateSchema.safeParse(payload);
}

export const schemas = {
  createApplicationSchema,
  updateApplicationSchema,
  statusUpdateSchema
};

export default schemas;
