import { CheckCircle, Clock, AlertCircle } from 'lucide-react'

interface ApplicationProgressProps {
  currentStep: number
  totalSteps: number
  completedSteps: boolean[]
  hasErrors: boolean
}

export function ApplicationProgress({ currentStep, totalSteps, completedSteps, hasErrors }: ApplicationProgressProps) {
  const progressPercentage = (currentStep / totalSteps) * 100

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-body">
          Step {currentStep} of {totalSteps}
        </span>
        <span className="text-sm text-body">
          {Math.round(progressPercentage)}% Complete
        </span>
      </div>
      
      <div className="w-full bg-skeleton rounded-full h-2 mb-3">
        <div 
          className={`h-2 rounded-full transition-all duration-300 ${
            hasErrors ? 'bg-error' : 'bg-primary'
          }`}
          style={{ width: `${progressPercentage}%` }}
        />
      </div>
      
      <div className="flex items-center gap-4 text-xs text-body">
        <div className="flex items-center gap-1">
          <CheckCircle className="h-3 w-3 text-success" />
          <span>{completedSteps.filter(Boolean).length} completed</span>
        </div>
        <div className="flex items-center gap-1">
          <Clock className="h-3 w-3 text-primary" />
          <span>{totalSteps - completedSteps.filter(Boolean).length} remaining</span>
        </div>
        {hasErrors && (
          <div className="flex items-center gap-1">
            <AlertCircle className="h-3 w-3 text-error" />
            <span>Needs attention</span>
          </div>
        )}
      </div>
    </div>
  )
}