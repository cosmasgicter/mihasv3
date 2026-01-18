import { useMemo } from 'react'

import { motion } from 'framer-motion'
import { CheckCircle } from 'lucide-react'
import type { UseFormReturn } from 'react-hook-form'

import { AnimatedInput } from '@/components/smoothui/animated-input'
import { FormSelect } from '@/components/ui/form-select'
import { ProfileCompletionBadge } from '@/components/ui/ProfileAutoPopulationIndicator'
import { durations, easings } from '@/lib/animation-config'
import { FieldHelp } from '../components/FieldHelp'
import { useOptimizedAnimation } from '@/hooks/useOptimizedAnimation'

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
    control,
    formState: { errors }
  } = form
  const { shouldAnimate, prefersReducedMotion } = useOptimizedAnimation()

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

  // Animation variants for staggered content
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: shouldAnimate ? 0.05 : 0,
        delayChildren: shouldAnimate ? 0.1 : 0,
      },
    },
  }

  const itemVariants = {
    hidden: { opacity: 0, y: shouldAnimate ? 15 : 0 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: {
        duration: shouldAnimate ? durations.normal : 0,
        ease: easings.easeOut,
      }
    },
  }

  return (
    <motion.div
      key="step1"
      initial={shouldAnimate ? { opacity: 0, x: 50 } : { opacity: 1, x: 0 }}
      animate={{ opacity: 1, x: 0 }}
      exit={shouldAnimate ? { opacity: 0, x: -50 } : undefined}
      transition={{ duration: shouldAnimate ? 0.3 : 0 }}
      className="bg-card rounded-lg shadow-lg p-6 border border-border"
      data-testid="basic-kyc-step"
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        {hasAutoPopulatedData && (
          <ProfileCompletionBadge completionPercentage={completionPercentage} />
        )}
      </div>

      {hasAutoPopulatedData && (
        <motion.div
          initial={shouldAnimate ? { opacity: 0, y: -10 } : false}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 p-3 bg-accent/10 border border-accent rounded-lg"
        >
          <div className="flex items-center space-x-2 text-sm text-accent-foreground">
            <CheckCircle className="h-4 w-4" />
            <span className="font-medium">Profile data automatically populated</span>
          </div>
          <p className="text-xs text-gray-900 mt-1">
            Some fields have been pre-filled from your profile. Please review and update as needed.
          </p>
        </motion.div>
      )}

      <motion.div 
        className="grid grid-cols-1 lg:grid-cols-2 gap-6"
        variants={containerVariants}
        initial={shouldAnimate ? "hidden" : "visible"}
        animate="visible"
      >
        <motion.div className="lg:col-span-2" variants={itemVariants}>
          <AnimatedInput
            {...register('full_name')}
            label="Full Name *"
            error={errors.full_name?.message}
          />
        </motion.div>

        <motion.div variants={itemVariants}>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-gray-900">NRC Number</span>
            <FieldHelp
              title="National Registration Card"
              description="Your Zambian National Registration Card number. Required for Zambian citizens."
              example="123456/78/9"
            />
          </div>
          <AnimatedInput
            {...register('nrc_number')}
            placeholder="e.g., 123456/78/9"
            error={errors.nrc_number?.message}
            helperText="Provide either NRC or Passport (one is sufficient)"
          />
        </motion.div>

        <motion.div variants={itemVariants}>
          <AnimatedInput
            {...register('passport_number')}
            label="Passport Number"
            error={errors.passport_number?.message}
            helperText="Provide either NRC or Passport (one is sufficient)"
          />
        </motion.div>

        <motion.div variants={itemVariants}>
          <AnimatedInput
            type="date"
            {...register('date_of_birth')}
            label="Date of Birth *"
            error={errors.date_of_birth?.message}
          />
        </motion.div>

        <motion.div variants={itemVariants}>
          <FormSelect
            name="sex"
            control={control}
            label="Sex"
            options={[
              { value: 'Male', label: 'Male' },
              { value: 'Female', label: 'Female' },
            ]}
            placeholder="Select sex"
            error={errors.sex?.message}
            required
          />
        </motion.div>

        <motion.div variants={itemVariants}>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-gray-900">Phone Number *</span>
            <FieldHelp
              title="Contact Phone Number"
              description="Your primary phone number for communication. Include country code for international numbers."
              example="+260 97 123 4567"
            />
          </div>
          <AnimatedInput
            {...register('phone')}
            placeholder="e.g., +260 97 123 4567"
            error={errors.phone?.message}
          />
        </motion.div>

        <motion.div variants={itemVariants}>
          <AnimatedInput
            type="email"
            {...register('email')}
            label="Email Address *"
            error={errors.email?.message}
          />
        </motion.div>

        <motion.div variants={itemVariants}>
          <AnimatedInput
            {...register('residence_town')}
            label="Residence Town *"
            error={errors.residence_town?.message}
          />
        </motion.div>

        <motion.div variants={itemVariants}>
          <AnimatedInput
            {...register('nationality')}
            label="Nationality"
            error={errors.nationality?.message}
            placeholder="e.g., Zambian"
          />
        </motion.div>

        <motion.div variants={itemVariants}>
          <AnimatedInput
            {...register('next_of_kin_name')}
            label="Next of Kin Name (Optional)"
            error={errors.next_of_kin_name?.message}
          />
        </motion.div>

        <motion.div variants={itemVariants}>
          <AnimatedInput
            {...register('next_of_kin_phone')}
            label="Next of Kin Phone (Optional)"
            error={errors.next_of_kin_phone?.message}
          />
        </motion.div>

        <motion.div variants={itemVariants}>
          <FormSelect
            name="program"
            control={control}
            label="Program"
            options={programs.map(program => {
              const institutionName = program.institutions?.full_name || program.institutions?.name
              const label = institutionName ? `${program.name} (${institutionName})` : program.name
              return { value: program.id, label }
            })}
            placeholder="Select program"
            error={errors.program?.message}
            required
          />
        </motion.div>

        <motion.div variants={itemVariants}>
          <FormSelect
            name="intake"
            control={control}
            label="Intake"
            options={intakes.map(intake => {
              const label = intake.displayName
              const deadline = formatDeadline(intake.application_deadline)
              const optionLabel = deadline ? `${label} — Apply by ${deadline}` : label
              return { value: label, label: optionLabel }
            })}
            placeholder="Select intake"
            disabled={intakes.length === 0}
            error={errors.intake?.message}
            helperText={intakes.length === 0 ? 'Intakes will appear here once enrollment periods are announced.' : undefined}
            required
          />
        </motion.div>
      </motion.div>

      {selectedProgramDetails && (
        <motion.div
          className="mt-4 p-4 bg-primary/10 rounded-lg border border-primary/20"
          initial={shouldAnimate ? { opacity: 0, scale: 0.95 } : false}
          animate={{ opacity: 1, scale: 1 }}
        >
          <p className="text-sm text-gray-900 font-medium">
            <strong>Institution:</strong>{' '}
            {selectedInstitutionLabel || 'MIHAS'}
          </p>
        </motion.div>
      )}
    </motion.div>
  )
}

export default BasicKycStep
