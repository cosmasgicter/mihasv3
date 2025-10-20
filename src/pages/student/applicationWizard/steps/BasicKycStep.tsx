import { useMemo } from 'react'

import { motion } from 'framer-motion'
import { CheckCircle } from 'lucide-react'
import type { UseFormReturn } from 'react-hook-form'

import { Input } from '@/components/ui/Input'
import { ProfileCompletionBadge } from '@/components/ui/ProfileAutoPopulationIndicator'

import type { WizardFormData, WizardProgram, WizardIntake } from '../types'

interface BasicKycStepProps {
  form: UseFormReturn<WizardFormData>
  hasAutoPopulatedData: boolean
  completionPercentage: number
  selectedProgram?: WizardFormData['program']
  programs: WizardProgram[]
  intakes: WizardIntake[]
  title: string
}

const BasicKycStep = ({
  form,
  hasAutoPopulatedData,
  completionPercentage,
  selectedProgram,
  programs,
  intakes,
  title
}: BasicKycStepProps) => {
  const {
    register,
    formState: { errors }
  } = form

  const selectedProgramDetails = useMemo(
    () => programs.find(program => program.id === selectedProgram),
    [programs, selectedProgram]
  )

  const selectedInstitutionLabel = useMemo(() => {
    if (!selectedProgramDetails?.institutions) return undefined
    return selectedProgramDetails.institutions.full_name || selectedProgramDetails.institutions.name || undefined
  }, [selectedProgramDetails])

  const formatDeadline = (date: string | undefined) => {
    if (!date) return ''
    try {
      return new Date(date).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })
    } catch {
      return ''
    }
  }

  return (
    <motion.div
      key="step1"
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -50 }}
      transition={{ duration: 0.3 }}
      className="bg-card rounded-lg shadow-lg p-6 border border-border"
      data-testid="basic-kyc-step"
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        {hasAutoPopulatedData && (
          <ProfileCompletionBadge completionPercentage={completionPercentage} />
        )}
      </div>

      {hasAutoPopulatedData && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 p-3 bg-accent/10 border border-accent rounded-lg"
        >
          <div className="flex items-center space-x-2 text-sm text-accent-foreground">
            <CheckCircle className="h-4 w-4" />
            <span className="font-medium">Profile data automatically populated</span>
          </div>
          <p className="text-xs text-foreground mt-1">
            Some fields have been pre-filled from your profile. Please review and update as needed.
          </p>
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="lg:col-span-2">
          <Input
            {...register('full_name')}
            label="Full Name"
            error={errors.full_name?.message}
            required
          />
        </div>

        <div>
          <Input
            {...register('nrc_number')}
            label="NRC Number"
            error={errors.nrc_number?.message}
            placeholder="e.g., 123456/78/9"
            helperText="Provide either NRC or Passport (one is sufficient)"
          />
        </div>

        <div>
          <Input
            {...register('passport_number')}
            label="Passport Number"
            error={errors.passport_number?.message}
            placeholder="e.g., ZM1234567"
            helperText="Provide either NRC or Passport (one is sufficient)"
          />
        </div>

        <div>
          <Input
            type="date"
            {...register('date_of_birth')}
            label="Date of Birth"
            error={errors.date_of_birth?.message}
            required
          />
        </div>

        <div>
          <label htmlFor="sex" className="block text-sm font-medium text-foreground mb-1">
            Sex <span className="text-error">*</span>
          </label>
          <select
            {...register('sex')}
            id="sex"
            className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-primary"
          >
            <option value="">Select sex</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
          </select>
          {errors.sex && <p className="mt-1 text-sm text-destructive">{errors.sex.message}</p>}
        </div>

        <div>
          <Input
            {...register('phone')}
            label="Phone Number"
            error={errors.phone?.message}
            placeholder="e.g., +260 97 123 4567"
            required
          />
        </div>

        <div>
          <Input
            type="email"
            {...register('email')}
            label="Email Address"
            error={errors.email?.message}
            required
          />
        </div>

        <div>
          <Input
            {...register('residence_town')}
            label="Residence Town"
            error={errors.residence_town?.message}
            required
          />
        </div>

        <div>
          <Input
            {...register('nationality')}
            label="Nationality"
            error={errors.nationality?.message}
            placeholder="e.g., Zambian"
          />
        </div>

        <div>
          <Input
            {...register('next_of_kin_name')}
            label="Next of Kin Name (Optional)"
            error={errors.next_of_kin_name?.message}
          />
        </div>

        <div>
          <Input
            {...register('next_of_kin_phone')}
            label="Next of Kin Phone (Optional)"
            error={errors.next_of_kin_phone?.message}
          />
        </div>

        <div>
          <label htmlFor="program" className="block text-sm font-medium text-foreground mb-1">
            Program <span className="text-error">*</span>
          </label>
          <select
            {...register('program')}
            id="program"
            className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-primary"
          >
            <option value="">Select program</option>
            {programs.length === 0 && (
              <option value="" disabled>
                No programs available
              </option>
            )}
            {programs.map(program => {
              const institutionName = program.institutions?.full_name || program.institutions?.name
              const label = institutionName ? `${program.name} (${institutionName})` : program.name
              return (
                <option key={program.id} value={program.id}>
                  {label}
                </option>
              )
            })}
          </select>
          {errors.program && <p className="mt-1 text-sm text-destructive">{errors.program.message}</p>}
        </div>

        <div>
          <label htmlFor="intake" className="block text-sm font-medium text-foreground mb-1">
            Intake <span className="text-error">*</span>
          </label>
          <select
            {...register('intake')}
            id="intake"
            disabled={intakes.length === 0}
            className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-primary ${
              intakes.length === 0 ? 'bg-accent text-muted-foreground cursor-not-allowed border-border' : 'bg-card border-input'
            }`}
          >
            <option value="">Select intake</option>
            {intakes.length === 0 && (
              <option value="" disabled>
                No intakes available
              </option>
            )}
            {intakes.map(intake => {
              const label = intake.displayName
              const deadline = formatDeadline(intake.application_deadline)
              const optionLabel = deadline ? `${label} — Apply by ${deadline}` : label
              return (
                <option key={intake.id} value={label}>
                  {optionLabel}
                </option>
              )
            })}
          </select>
          {intakes.length === 0 && (
            <p className="mt-1 text-sm text-muted-foreground">Intakes will appear here once enrollment periods are announced.</p>
          )}
          {errors.intake && <p className="mt-1 text-sm text-destructive">{errors.intake.message}</p>}
        </div>
      </div>

      {selectedProgramDetails && (
        <motion.div
          className="mt-4 p-4 bg-primary/10 rounded-lg"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <p className="text-sm text-primary-foreground">
            <strong>Institution:</strong>{' '}
            {selectedInstitutionLabel || 'MIHAS'}
          </p>
        </motion.div>
      )}
    </motion.div>
  )
}

export default BasicKycStep
