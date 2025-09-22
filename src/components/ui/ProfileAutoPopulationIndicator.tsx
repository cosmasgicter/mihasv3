import React from 'react'
import { motion } from 'framer-motion'
import { CheckCircle, User } from 'lucide-react'

interface ProfileAutoPopulationIndicatorProps {
  isPopulated: boolean
  fieldName: string
}

export function ProfileAutoPopulationIndicator({ isPopulated, fieldName }: ProfileAutoPopulationIndicatorProps) {
  if (!isPopulated) return null

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      className="inline-flex items-center space-x-1 text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full"
    >
      <CheckCircle className="h-3 w-3" />
      <span>Auto-filled from profile</span>
    </motion.div>
  )
}

interface ProfileCompletionBadgeProps {
  completionPercentage: number
}

export function ProfileCompletionBadge({ completionPercentage }: ProfileCompletionBadgeProps) {
  const getColor = () => {
    if (completionPercentage >= 80) return 'bg-green-100 text-green-800 border-green-200'
    if (completionPercentage >= 60) return 'bg-yellow-100 text-yellow-800 border-yellow-200'
    return 'bg-red-100 text-red-800 border-red-200'
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`inline-flex items-center space-x-2 px-3 py-1 rounded-full border text-sm font-medium ${getColor()}`}
    >
      <User className="h-4 w-4" />
      <span>Profile {completionPercentage}% Complete</span>
    </motion.div>
  )
}