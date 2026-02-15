import React from 'react'
import { CheckCircle, User } from 'lucide-react'

interface ProfileAutoPopulationIndicatorProps {
  isPopulated: boolean
  fieldName: string
}

export function ProfileAutoPopulationIndicator({ isPopulated, fieldName }: ProfileAutoPopulationIndicatorProps) {
  if (!isPopulated) return null

  return (
    <div
      className="inline-flex items-center space-x-1 text-xs text-green-800 bg-green-100 px-2 py-1 rounded-full border border-green-300 animate-scale-in"
    >
      <CheckCircle className="h-3 w-3" />
      <span>Auto-filled from profile</span>
    </div>
  )
}

interface ProfileCompletionBadgeProps {
  completionPercentage: number
}

export function ProfileCompletionBadge({ completionPercentage }: ProfileCompletionBadgeProps) {
  const getColor = () => {
    if (completionPercentage >= 80) return 'bg-green-100 text-green-800 border-green-300'
    if (completionPercentage >= 60) return 'bg-yellow-100 text-yellow-800 border-yellow-300'
    return 'bg-red-100 text-red-800 border-red-300'
  }

  return (
    <div
      className={`inline-flex items-center space-x-2 px-3 py-1 rounded-full border text-sm font-medium animate-fade-in ${getColor()}`}
    >
      <User className="h-4 w-4" />
      <span>Profile {completionPercentage}% Complete</span>
    </div>
  )
}
