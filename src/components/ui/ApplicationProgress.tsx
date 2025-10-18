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
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300 dark:text-gray-600">
          Step {currentStep} of {totalSteps}
        </span>
        <span className="text-sm text-gray-500 dark:text-gray-500">
          {Math.round(progressPercentage)}% Complete
        </span>
      </div>
      
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-3">
        <div 
          className={`h-2 rounded-full transition-all duration-300 ${
            hasErrors ? 'bg-red-500' : 'bg-blue-600'
          }`}
          style={{ width: `${progressPercentage}%` }}
        />
      </div>
      
      <div className="flex items-center gap-4 text-xs text-gray-600 dark:text-gray-400 dark:text-gray-500">
        <div className="flex items-center gap-1">
          <CheckCircle className="h-3 w-3 text-green-500" />
          <span>{completedSteps.filter(Boolean).length} completed</span>
        </div>
        <div className="flex items-center gap-1">
          <Clock className="h-3 w-3 text-blue-500 dark:text-blue-400" />
          <span>{totalSteps - completedSteps.filter(Boolean).length} remaining</span>
        </div>
        {hasErrors && (
          <div className="flex items-center gap-1">
            <AlertCircle className="h-3 w-3 text-red-500" />
            <span>Needs attention</span>
          </div>
        )}
      </div>
    </div>
  )
}