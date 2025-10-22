import { useMemo } from 'react'

const STEP_TIMES = {
  0: 3, // Basic KYC: 3 minutes
  1: 5, // Education: 5 minutes
  2: 2, // Payment: 2 minutes
  3: 1  // Review: 1 minute
}

export const useEstimatedTime = (currentStep: number, totalSteps: number) => {
  const estimatedMinutes = useMemo(() => {
    let total = 0
    for (let i = currentStep; i < totalSteps; i++) {
      total += STEP_TIMES[i as keyof typeof STEP_TIMES] || 0
    }
    return total
  }, [currentStep, totalSteps])

  const formatTime = (minutes: number) => {
    if (minutes === 0) return 'Almost done!'
    if (minutes === 1) return '~1 minute remaining'
    return `~${minutes} minutes remaining`
  }

  return {
    estimatedMinutes,
    formattedTime: formatTime(estimatedMinutes)
  }
}
