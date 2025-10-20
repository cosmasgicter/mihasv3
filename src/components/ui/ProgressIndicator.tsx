import React from 'react'
import { cn } from '@/lib/utils'
import { Check, Circle } from 'lucide-react'

interface Step {
  id: string
  title: string
  description?: string
  status: 'pending' | 'current' | 'completed' | 'error'
}

interface ProgressIndicatorProps {
  steps: Step[]
  orientation?: 'horizontal' | 'vertical'
  size?: 'sm' | 'md' | 'lg'
  showDescriptions?: boolean
  className?: string
}

export function ProgressIndicator({
  steps,
  orientation = 'horizontal',
  size = 'md',
  showDescriptions = true,
  className
}: ProgressIndicatorProps) {
  const sizeClasses = {
    sm: {
      circle: 'w-6 h-6 text-xs',
      line: orientation === 'horizontal' ? 'h-0.5' : 'w-0.5',
      title: 'text-sm',
      description: 'text-xs'
    },
    md: {
      circle: 'w-8 h-8 text-sm',
      line: orientation === 'horizontal' ? 'h-1' : 'w-1', 
      title: 'text-base',
      description: 'text-sm'
    },
    lg: {
      circle: 'w-10 h-10 text-base',
      line: orientation === 'horizontal' ? 'h-1.5' : 'w-1.5',
      title: 'text-lg',
      description: 'text-base'
    }
  }

  const getStepIcon = (step: Step) => {
    switch (step.status) {
      case 'completed':
        return <Check className="w-full h-full" />
      case 'error':
        return (
          <svg className="w-full h-full" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
        )
      default:
        return (
          <span className="font-semibold">
            {steps.findIndex(s => s.id === step.id) + 1}
          </span>
        )
    }
  }

  const getStepClasses = (step: Step) => {
    const baseClasses = cn(
      'flex items-center justify-center rounded-full border-2 transition-all duration-200',
      sizeClasses[size].circle
    )

    switch (step.status) {
      case 'completed':
        return cn(baseClasses, 'bg-green-500 border-green-500 text-foreground')
      case 'current':
        return cn(baseClasses, 'bg-blue-500 border-blue-500 text-foreground animate-pulse')
      case 'error':
        return cn(baseClasses, 'bg-red-500 border-red-500 text-foreground')
      default:
        return cn(baseClasses, 'bg-accent border-input text-muted-foreground')
    }
  }

  const getLineClasses = (index: number) => {
    const isCompleted = steps[index].status === 'completed'
    const baseClasses = cn(
      'transition-all duration-200',
      sizeClasses[size].line
    )
    
    if (orientation === 'horizontal') {
      return cn(
        baseClasses,
        'flex-1 mx-2',
        isCompleted ? 'bg-green-500' : 'bg-skeleton'
      )
    }
    
    return cn(
      baseClasses,
      'my-2 h-8',
      isCompleted ? 'bg-green-500' : 'bg-skeleton'
    )
  }

  if (orientation === 'horizontal') {
    return (
      <div className={cn('w-full', className)}>
        <div className="flex items-center">
          {steps.map((step, index) => (
            <React.Fragment key={step.id}>
              <div className="flex flex-col items-center">
                <div className={getStepClasses(step)}>
                  {getStepIcon(step)}
                </div>
                {showDescriptions && (
                  <div className="mt-2 text-center">
                    <div className={cn(
                      'font-medium',
                      sizeClasses[size].title,
                      step.status === 'current' ? 'text-blue-600' : 'text-foreground'
                    )}>
                      {step.title}
                    </div>
                    {step.description && (
                      <div className={cn(
                        'text-muted-foreground mt-1',
                        sizeClasses[size].description
                      )}>
                        {step.description}
                      </div>
                    )}
                  </div>
                )}
              </div>
              {index < steps.length - 1 && (
                <div className={getLineClasses(index)} />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
    )
  }

  // Vertical orientation
  return (
    <div className={cn('flex flex-col', className)}>
      {steps.map((step, index) => (
        <React.Fragment key={step.id}>
          <div className="flex items-start">
            <div className="flex flex-col items-center">
              <div className={getStepClasses(step)}>
                {getStepIcon(step)}
              </div>
              {index < steps.length - 1 && (
                <div className={getLineClasses(index)} />
              )}
            </div>
            {showDescriptions && (
              <div className="ml-4 pb-8">
                <div className={cn(
                  'font-medium',
                  sizeClasses[size].title,
                  step.status === 'current' ? 'text-blue-600' : 'text-foreground'
                )}>
                  {step.title}
                </div>
                {step.description && (
                  <div className={cn(
                    'text-muted-foreground mt-1',
                    sizeClasses[size].description
                  )}>
                    {step.description}
                  </div>
                )}
              </div>
            )}
          </div>
        </React.Fragment>
      ))}
    </div>
  )
}

// Simple progress bar component
export function ProgressBar({ 
  value, 
  max = 100, 
  className,
  showPercentage = true,
  color = 'blue',
  size = 'md'
}: {
  value: number
  max?: number
  className?: string
  showPercentage?: boolean
  color?: 'blue' | 'green' | 'red' | 'yellow'
  size?: 'sm' | 'md' | 'lg'
}) {
  const percentage = Math.round((value / max) * 100)
  
  const colorClasses = {
    blue: 'bg-blue-500',
    green: 'bg-green-500', 
    red: 'bg-red-500',
    yellow: 'bg-yellow-500'
  }
  
  const sizeClasses = {
    sm: 'h-1',
    md: 'h-2',
    lg: 'h-3'
  }

  return (
    <div className={cn('w-full', className)}>
      {showPercentage && (
        <div className="flex justify-between items-center mb-1">
          <span className="text-sm font-medium text-foreground">Progress</span>
          <span className="text-sm text-muted-foreground">{percentage}%</span>
        </div>
      )}
      <div className={cn(
        'w-full bg-skeleton rounded-full overflow-hidden',
        sizeClasses[size]
      )}>
        <div 
          className={cn(
            'h-full transition-all duration-300 ease-out rounded-full',
            colorClasses[color]
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}
