import { useMemo } from 'react'

import { CheckCircle } from 'lucide-react'
import type { UseFormReturn } from 'react-hook-form'

import { AnimatedInput } from '@/components/smoothui/animated-input'
import { FormSelect } from '@/components/ui/form-select'
import { ProfileCompletionBadge } from '@/components/ui/ProfileAutoPopulationIndicator'
import { animateClasses, staggerChild } from '@/lib/animations'
import { formatDate } from '@/lib/dateFormat'
import { FieldHelp } from '../components/FieldHelp'
import { useOptimizedAnimation } from '@/hooks/useOptimizedAnimation'
import { useResidenceLocationOptions } from '@/hooks/useResidenceLocationOptions'
import { DEFAULT_RESIDENCE_COUNTRY } from '@/lib/locationOptions'
import { getResidenceTownHelperText, normalizeResidenceTown, RESIDENCE_TOWN_LABEL } from '@/lib/residenceTown'

import { NATIONALITY_OPTIONS } from '@/lib/nationalityOptions'

import type { WizardFormData, WizardProgram, WizardIntake } from '../types'

interface BasicKycStepProps {
  form: UseFormReturn<WizardFormData>
  hasAutoPopulatedData: boolean
  completionPercentage: number
  missingFields?: { key: string; label: string }[]
  selectedProgram?: WizardFormData['program']
  programs: WizardProgram[]
  intakes: WizardIntake[]
  title: string
}

const BasicKycStep = ({
  form,
  hasAutoPopulatedData,
  completionPercentage,
  missingFields,
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
  const { shouldAnimate } = useOptimizedAnimation()
  const selectedCountry = form.watch('country')
  const { countryOptions, cityOptions, loadingCountries, loadingCities } = useResidenceLocationOptions(selectedCountry)
  const residenceTownDatalistId = 'wizard-residence-town-options'

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
    return formatDate(date)
  }

  return (
    <div
      key="step1"
      className={`overflow-visible bg-card rounded-lg shadow-lg p-4 sm:p-6 border border-border ${shouldAnimate ? animateClasses.fadeIn : ''}`}
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
            <span className="font-medium">Profile data automatically populated</span>
          </div>
          <p className="text-xs text-foreground mt-1">
            Some fields have been pre-filled from your profile. Please review and update as needed.
          </p>
        </div>
      )}

      <div className="mb-4 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-foreground">
        Your account details help us pre-fill this step. This KYC section is the admissions record we will review for your application, so confirm that your names, contact details, programme, and identity information are correct here.
      </div>

      <fieldset className="border-none p-0 m-0">
        <legend className="sr-only">Personal Information</legend>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 overflow-visible sm:gap-6">
          <div className="md:col-span-2" style={shouldAnimate ? staggerChild(0) : undefined}>
            <AnimatedInput
              {...register('full_name')}
              label="Full Name *"
              error={errors.full_name?.message}
            />
          </div>

          <div style={shouldAnimate ? staggerChild(1) : undefined}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-medium text-foreground">NRC Number</span>
              <FieldHelp
                title="National Registration Card"
                description="Your Zambian National Registration Card number. Required for Zambian citizens."
                example="123456/78/9"
              />
            </div>
            <AnimatedInput
              {...register('nrc_number')}
              aria-label="NRC Number"
              placeholder="e.g., 123456/78/9"
              error={errors.nrc_number?.message}
              helperText="Provide either NRC or Passport (one is sufficient)"
            />
          </div>

          <div style={shouldAnimate ? staggerChild(2) : undefined}>
            <AnimatedInput
              {...register('passport_number')}
              label="Passport Number"
              error={errors.passport_number?.message}
              helperText="Provide either NRC or Passport (one is sufficient)"
            />
          </div>

          <div style={shouldAnimate ? staggerChild(3) : undefined}>
            <AnimatedInput
              type="date"
              {...register('date_of_birth')}
              label="Date of Birth *"
              error={errors.date_of_birth?.message}
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
            />
          </div>

          <div style={shouldAnimate ? staggerChild(5) : undefined}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-medium text-foreground">Phone Number *</span>
              <FieldHelp
                title="Contact Phone Number"
                description="Your primary phone number for communication. Include country code for international numbers."
                example="+260 97 123 4567"
              />
            </div>
            <AnimatedInput
              {...register('phone')}
              aria-label="Phone Number"
              placeholder="e.g., +260 97 123 4567"
              error={errors.phone?.message}
            />
          </div>

          <div style={shouldAnimate ? staggerChild(6) : undefined}>
            <AnimatedInput
              type="email"
              {...register('email')}
              label="Email Address *"
              error={errors.email?.message}
            />
          </div>

          <div style={shouldAnimate ? staggerChild(7) : undefined}>
            <FormSelect
              name="country"
              control={control}
              label="Country of Residence"
              options={countryOptions}
              placeholder="Select country"
              disabled={loadingCountries}
              helperText="Defaults to Zambia. Change it only if you currently live elsewhere."
              error={(errors as any).country?.message}
            />
          </div>

          <div style={shouldAnimate ? staggerChild(8) : undefined}>
            <AnimatedInput
              {...register('residence_town', { setValueAs: normalizeResidenceTown })}
              list={residenceTownDatalistId}
              label={`${RESIDENCE_TOWN_LABEL} *`}
              error={errors.residence_town?.message}
              placeholder={selectedCountry === DEFAULT_RESIDENCE_COUNTRY ? 'Kitwe' : 'Start typing your city or town'}
              helperText={getResidenceTownHelperText({
                loadingCities,
                selectedCountry,
                defaultCountry: DEFAULT_RESIDENCE_COUNTRY,
              })}
            />
            <datalist id={residenceTownDatalistId}>
              {cityOptions.map(option => (
                <option key={option.value} value={option.value} />
              ))}
            </datalist>
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
              label="Next of Kin Name (Optional)"
              error={errors.next_of_kin_name?.message}
            />
          </div>

          <div style={shouldAnimate ? staggerChild(11) : undefined}>
            <AnimatedInput
              {...register('next_of_kin_phone')}
              label="Next of Kin Phone (Optional)"
              error={errors.next_of_kin_phone?.message}
            />
          </div>

          <div className="md:col-span-2" style={shouldAnimate ? staggerChild(12) : undefined}>
            <FormSelect
              name="program"
              control={control}
              label="Program"
              options={
                [...programs]
                  .sort((a, b) => {
                    const instA = a.institutions?.name || ''
                    const instB = b.institutions?.name || ''
                    const cmp = instA.localeCompare(instB)
                    return cmp !== 0 ? cmp : (a.name || '').localeCompare(b.name || '')
                  })
                  .map(program => {
                    const institutionName = program.institutions?.full_name || program.institutions?.name
                    return {
                      value: program.id,
                      label: program.name,
                      description: institutionName,
                    }
                  })
              }
              placeholder="Select programme"
              error={errors.program?.message}
              disabled={programs.length === 0}
              helperText={programs.length === 0 ? 'No programmes available for the current intake' : undefined}
              triggerClassName="min-h-[56px] py-3 [&>span]:max-w-[calc(100%-1.75rem)] [&>span]:line-clamp-2 [&>span]:whitespace-normal [&>span]:leading-snug"
              required
            />
          </div>

          <div className="md:col-span-2" style={shouldAnimate ? staggerChild(13) : undefined}>
            <FormSelect
              name="intake"
              control={control}
              label="Intake"
              options={intakes.map(intake => {
                const deadline = formatDeadline(intake.application_deadline)
                return {
                  value: intake.id,
                  label: intake.displayName,
                  description: deadline ? `Apply by ${deadline}` : undefined,
                }
              })}
              placeholder="Select intake"
              disabled={intakes.length === 0}
              error={errors.intake?.message}
              helperText={intakes.length === 0 ? 'Intakes will appear here once enrollment periods are announced.' : undefined}
              triggerClassName="min-h-[56px] py-3 [&>span]:max-w-[calc(100%-1.75rem)] [&>span]:line-clamp-2 [&>span]:whitespace-normal [&>span]:leading-snug"
              required
            />
          </div>
        </div>
      </fieldset>

      {selectedProgramDetails && (
        <div
          className={`mt-4 p-4 bg-primary/10 rounded-lg border border-primary/20 ${shouldAnimate ? animateClasses.scaleIn : ''}`}
        >
          <p className="text-sm text-foreground font-medium">
            <strong>Institution:</strong>{' '}
            {selectedInstitutionLabel || 'MIHAS'}
          </p>
        </div>
      )}
    </div>
  )
}

export default BasicKycStep
