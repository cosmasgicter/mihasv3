import React from 'react'

interface StepNavigationProps {
  currentStep: number
  totalSteps: number
  stepTitles: string[]
  onStepClick: (step: number) => void
}

export function StepNavigation({ currentStep, totalSteps, stepTitles, onStepClick }: StepNavigationProps) {
  return (
    <div className="bg-white rounded-lg shadow p-6 mb-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-secondary">
          Step {currentStep} of {totalSteps}: {stepTitles[currentStep - 1]}
        </h2>
        <div className="text-sm text-secondary">
          {Math.round((currentStep / totalSteps) * 100)}% Complete
        </div>
      </div>
      
      <div className="w-full bg-gray-200 rounded-full h-2 mb-6">
        <div 
          className="bg-gradient-to-r from-primary to-secondary h-2 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${(currentStep / totalSteps) * 100}%` }}
        />
      </div>
      
      <div className="flex justify-between items-center overflow-x-auto">
        {stepTitles.map((title, index) => {
          const stepNumber = index + 1
          const isActive = stepNumber === currentStep
          const isCompleted = stepNumber < currentStep
          
          return (
            <div key={index} className="flex flex-col items-center cursor-pointer min-w-0 flex-1" onClick={() => onStepClick(stepNumber)}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all duration-300 ${
                isCompleted 
                  ? 'bg-green-500 text-white' 
                  : isActive 
                  ? 'bg-primary text-white' 
                  : 'bg-gray-200 text-gray-600'
              }`}>
                {isCompleted ? '✓' : stepNumber}
              </div>
              <span className={`text-xs mt-1 text-center ${
                isActive ? 'text-primary font-medium' : 'text-gray-500'
              }`}>
                {title}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}