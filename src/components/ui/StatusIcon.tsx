import React from 'react'
import { motion } from 'framer-motion'
import {
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Trophy,
  Rocket,
  Search,
  HeartCrack,
  Target
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface StatusIconProps {
  status: 'approved' | 'rejected' | 'under_review' | 'submitted' | 'pending' | 'warning'
  size?: 'sm' | 'md' | 'lg' | 'xl'
  animated?: boolean
  className?: string
}

export function StatusIcon({ status, size = 'md', animated = false, className }: StatusIconProps) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
    xl: 'w-12 h-12'
  }

  const iconMap = {
    approved: { Icon: Trophy, color: 'text-green-600 dark:text-green-400' },
    rejected: { Icon: XCircle, color: 'text-red-600 dark:text-red-400' },
    under_review: { Icon: Target, color: 'text-blue-600 dark:text-blue-400' },
    submitted: { Icon: Rocket, color: 'text-yellow-600 dark:text-yellow-400' },
    pending: { Icon: Clock, color: 'text-gray-600 dark:text-gray-400 dark:text-gray-500' },
    warning: { Icon: AlertTriangle, color: 'text-orange-600 dark:text-orange-400' }
  }

  const { Icon, color } = iconMap[status]

  if (animated) {
    return (
      <motion.div
        animate={{ rotate: [0, 10, -10, 0] }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        <Icon className={cn(sizeClasses[size], color, className)} />
      </motion.div>
    )
  }

  return <Icon className={cn(sizeClasses[size], color, className)} />
}
