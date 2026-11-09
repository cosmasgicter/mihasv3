import type { UseFormReturn } from 'react-hook-form'

import { FormSelect } from '@/components/ui/form-select'
import { animateClasses, staggerChild } from '@/lib/animations'
import { formatDate } from '@/lib/dateFormat'
import { useOptimizedAnimation } from '@/hooks/useOptimizedAnimation'
import { ErrorDisplay } from '@/components/ui/ErrorDisplay'
import { rateLimitMessage } from '@/lib/rateLimitCopy'

import type { WizardFormData, WizardProgram, WizardIntake } from '../types'

/** A failed catalogue query. `retryAfterSeconds` is set for a rate-limited request. */
export interface CatalogueQueryError {
  message: string
  retryAfterSeconds: number | null
  /** True when the server refused the request for going over a budget. */
  rateLimited?: boolean
}

interface ProgramStepProps {
  form: UseFormReturn<WizardFormData>
  programs: WizardProgram[]
  programsLoading?: boolean
  intakes: WizardIntake[]
  /** A failed programmes query: shown as an error, never as an empty catalogue (clause 2.16). */
  programsError?: CatalogueQueryError | null
  /** A failed intakes query: shown as an error, never as an empty list (clause 2.16). */
  intakesError?: CatalogueQueryError | null
  onRetryPrograms?: () => void
  onRetryIntakes?: () => void
  title: string
  /** Returns an aria-describedby value linking a field to its wizard-level error message (Req 17.2) */
  getFieldAriaDescribedBy?: (fieldName: string) => string | undefined
}

/**
 * Step 1 of the program-first wizard (R10.1): the student chooses a canonical
 * programme and intake. The backend then assigns an eligible school offering,
 * surfaced on the next step (assigned-school review). No personal details are
 * collected here — those move to the dedicated personal step (step 3).
 */
const ProgramStep = ({
  form,
  programs,
  programsLoading,
  intakes,
  programsError,
  intakesError,
  onRetryPrograms,
  onRetryIntakes,
  title,
  getFieldAriaDescribedBy,
}: ProgramStepProps) => {
  const {
    control,
    formState: { errors },
  } = form
  const { shouldAnimate } = useOptimizedAnimation()

  const formatDeadline = (date: string | undefined) => {
    if (!date) return ''
    return formatDate(date)
  }

  const errorText = (error: CatalogueQueryError) =>
    error.rateLimited || error.retryAfterSeconds !== null
      ? rateLimitMessage(error.retryAfterSeconds)
      : error.message

  return (
    <div
      key="step-program"
      className={`overflow-visible bg-card rounded-lg shadow-sm ring-1 ring-border/50 p-5 sm:p-8 ${shouldAnimate ? animateClasses.fadeIn : ''}`}
      data-testid="program-step"
    >
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose your programme and intake. We will then confirm the school assigned to you.
        </p>
      </div>

      <fieldset className="border-none p-0 m-0">
        <legend className="sr-only">Programme and intake</legend>
        <div className="grid grid-cols-1 gap-4 overflow-visible sm:gap-6">
          <div style={shouldAnimate ? staggerChild(0) : undefined}>
            <FormSelect
              name="program"
              control={control}
              label="Programme"
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
                    const offeringCount = program.available_offerings?.length ?? 0
                    return {
                      value: program.id,
                      label: program.name,
                      description: institutionName || (offeringCount > 0 ? `${offeringCount} school${offeringCount === 1 ? '' : 's'} available` : undefined),
                    }
                  })
              }
              placeholder="Select programme"
              error={errors.program?.message}
              disabled={programs.length === 0}
              helperText={programs.length === 0 && !programsLoading && !programsError ? 'No programmes available for the current intake' : undefined}
              triggerClassName="min-h-[56px] py-3 [&>span]:max-w-[calc(100%-1.75rem)] [&>span]:line-clamp-2 [&>span]:whitespace-normal [&>span]:leading-snug"
              required
              extraDescribedBy={getFieldAriaDescribedBy?.('program')}
            />
            {programsError && (
              <ErrorDisplay
                variant="inline"
                className="mt-2"
                message={errorText(programsError)}
                onRetry={onRetryPrograms}
              />
            )}
          </div>

          <div style={shouldAnimate ? staggerChild(1) : undefined}>
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
              helperText={intakes.length === 0 && !intakesError ? 'Intakes will appear here once enrollment periods are announced.' : undefined}
              triggerClassName="min-h-[56px] py-3 [&>span]:max-w-[calc(100%-1.75rem)] [&>span]:line-clamp-2 [&>span]:whitespace-normal [&>span]:leading-snug"
              required
              extraDescribedBy={getFieldAriaDescribedBy?.('intake')}
            />
            {intakesError && (
              <ErrorDisplay
                variant="inline"
                className="mt-2"
                message={errorText(intakesError)}
                onRetry={onRetryIntakes}
              />
            )}
          </div>
        </div>
      </fieldset>
    </div>
  )
}

export default ProgramStep
