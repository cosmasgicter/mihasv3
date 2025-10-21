import { cn } from '@/lib/utils'
import { Check } from 'lucide-react'

export interface Step {
  label: string
  description?: string
}

export interface StepperProps extends React.HTMLAttributes<HTMLDivElement> {
  steps: Step[]
  currentStep: number
}

export function Stepper({ className, steps, currentStep, ...props }: StepperProps) {
  return (
    <div className={cn('w-full', className)} {...props}>
      <div className="flex items-center justify-between">
        {steps.map((step, index) => {
          const stepNumber = index + 1
          const isCompleted = stepNumber < currentStep
          const isCurrent = stepNumber === currentStep

          return (
            <div key={index} className="flex items-center flex-1">
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    'w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-colors',
                    isCompleted && 'bg-primary text-white',
                    isCurrent && 'bg-primary text-white',
                    !isCompleted && !isCurrent && 'bg-secondary/5 text-foreground/40'
                  )}
                >
                  {isCompleted ? <Check className="h-5 w-5" /> : stepNumber}
                </div>
                <div className="mt-2 text-center">
                  <p
                    className={cn(
                      'text-sm font-medium',
                      isCurrent ? 'text-foreground' : 'text-foreground/60'
                    )}
                  >
                    {step.label}
                  </p>
                  {step.description && (
                    <p className="text-xs text-foreground/40 mt-0.5">{step.description}</p>
                  )}
                </div>
              </div>
              {index < steps.length - 1 && (
                <div
                  className={cn(
                    'flex-1 h-0.5 mx-4 transition-colors',
                    isCompleted ? 'bg-primary' : 'bg-secondary/5'
                  )}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
