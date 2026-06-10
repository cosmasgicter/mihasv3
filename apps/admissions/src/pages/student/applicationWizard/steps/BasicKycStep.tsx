import { CheckCircle } from 'lucide-react'
import type { UseFormReturn } from 'react-hook-form'

import { AnimatedInput } from '@/components/smoothui/animated-input'
import { FormSelect } from '@/components/ui/form-select'
import { ProfileCompletionBadge } from '@/components/ui/ProfileAutoPopulationIndicator'
import { animateClasses, staggerChild } from '@/lib/animations'
import { useOptimizedAnimation } from '@/hooks/useOptimizedAnimation'

import { NATIONALITY_OPTIONS } from '@/lib/nationalityOptions'

import type { WizardFormData } from '../types'
import { ResidenceLocationFields } from '../components/ResidenceLocationFields'

interface BasicKycStepProps {
  form: UseFormReturn<WizardFormData>
  hasAutoPopulatedData: boolean
  completionPercentage: number
  missingFields?: { key: string; label: string }[]
  title: string
  /** Returns an aria-describedby value linking a field to its wizard-level error message (Req 17.2) */
  getFieldAriaDescribedBy?: (fieldName: string) => string | undefined
}

/**
 * Step 3 of the program-first wizard (R10.1): personal and contact details.
 * Programme + intake selection now lives on the first step (ProgramStep) and
 * the assigned school is reviewed on step 2 (AssignedSchoolStep), so this step
 * collects only the applicant's personal information.
 */
const BasicKycStep = ({
  form,
  hasAutoPopulatedData,
  completionPercentage,
  missingFields,
  title,
  getFieldAriaDescribedBy
}: BasicKycStepProps) => {
  const {
    register,
    trigger,
    control,
    formState: { errors }
  } = form
  const { shouldAnimate } = useOptimizedAnimation()

  return (
    <div
      key="step-personal"
      className={`overflow-visible bg-card rounded-lg shadow-sm ring-1 ring-border/50 p-5 sm:p-8 ${shouldAnimate ? animateClasses.fadeIn : ''}`}
      data-testid="basic-kyc-step"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        {hasAutoPopulatedData && (
          <ProfileCompletionBadge completionPercentage={completionPercentage} missingFields={missingFields} />
        )}
      </div>

      {hasAutoPopulatedData && (
        <div
          className={`mb-4 p-3 bg-accent/10 border border-accent rounded-lg ${shouldAnimate ? animateClasses.slideUp : ''}`}
        >
          <div className="flex items-center space-x-2 text-sm text-accent-foreground">
            <CheckCircle className="h-4 w-4" />
            <span className="font-medium">Profile details pre-filled</span>
          </div>
          <p className="text-xs text-foreground mt-1">
            Review them before continuing.
          </p>
        </div>
      )}

      <fieldset className="border-none p-0 m-0">
        <legend className="sr-only">Personal Information</legend>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 overflow-visible sm:gap-6">
          <div className="md:col-span-2" style={shouldAnimate ? staggerChild(0) : undefined}>
            <AnimatedInput
              {...register('full_name', { onBlur: () => trigger('full_name') })}
              label="Full Name *"
              autoComplete="name"
              error={errors.full_name?.message}
              extraDescribedBy={getFieldAriaDescribedBy?.('full_name')}
            />
          </div>

          <div style={shouldAnimate ? staggerChild(1) : undefined}>
            <AnimatedInput
              {...register('nrc_number')}
              label="NRC Number"
              placeholder="e.g., 123456/78/9"
              autoComplete="off"
              inputMode="text"
              error={errors.nrc_number?.message}
              helperText="NRC or Passport required"
              extraDescribedBy={getFieldAriaDescribedBy?.('nrc_number')}
            />
          </div>

          <div style={shouldAnimate ? staggerChild(2) : undefined}>
            <AnimatedInput
              {...register('passport_number')}
              label="Passport Number"
              autoComplete="off"
              error={errors.passport_number?.message}
              helperText="NRC or Passport required"
            />
          </div>

          <div style={shouldAnimate ? staggerChild(3) : undefined}>
            <AnimatedInput
              type="date"
              autoComplete="bday"
              {...register('date_of_birth')}
              label="Date of Birth *"
              max={new Date().toISOString().split('T')[0]}
              error={errors.date_of_birth?.message}
              extraDescribedBy={getFieldAriaDescribedBy?.('date_of_birth')}
            />
          </div>

          <div style={shouldAnimate ? staggerChild(4) : undefined}>
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
              extraDescribedBy={getFieldAriaDescribedBy?.('sex')}
            />
          </div>

          <div style={shouldAnimate ? staggerChild(5) : undefined}>
            <AnimatedInput
              {...register('phone', { onBlur: () => trigger('phone') })}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              label="Phone Number *"
              placeholder="e.g., +260971234567"
              helperText="Use digits only after +260; spaces are removed automatically."
              error={errors.phone?.message}
              extraDescribedBy={getFieldAriaDescribedBy?.('phone')}
            />
          </div>

          <div style={shouldAnimate ? staggerChild(6) : undefined}>
            <AnimatedInput
              type="email"
              inputMode="email"
              autoComplete="email"
              {...register('email', { onBlur: () => trigger('email') })}
              label="Email Address *"
              error={errors.email?.message}
              extraDescribedBy={getFieldAriaDescribedBy?.('email')}
            />
          </div>

          <div className="md:col-span-2 my-1">
            <div className="h-px bg-border/40" />
          </div>

          <div className="md:col-span-2" style={shouldAnimate ? staggerChild(7) : undefined}>
            <ResidenceLocationFields form={form} getFieldAriaDescribedBy={getFieldAriaDescribedBy} />
          </div>

          <div style={shouldAnimate ? staggerChild(9) : undefined}>
            <FormSelect
              name="nationality"
              control={control}
              label="Nationality"
              options={NATIONALITY_OPTIONS}
              placeholder="Select nationality"
              error={errors.nationality?.message}
            />
          </div>

          <div style={shouldAnimate ? staggerChild(10) : undefined}>
            <AnimatedInput
              {...register('next_of_kin_name')}
              autoComplete="off"
              label="Next of Kin Name (Optional)"
              error={errors.next_of_kin_name?.message}
            />
          </div>

          <div style={shouldAnimate ? staggerChild(11) : undefined}>
            <AnimatedInput
              {...register('next_of_kin_phone')}
              type="tel"
              inputMode="tel"
              autoComplete="off"
              label="Next of Kin Phone (Optional)"
              error={errors.next_of_kin_phone?.message}
            />
          </div>
        </div>
      </fieldset>
    </div>
  )
}

export default BasicKycStep
