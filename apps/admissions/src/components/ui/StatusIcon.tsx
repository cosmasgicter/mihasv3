import React from 'react'
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
    approved: { Icon: Trophy, color: 'text-accent' },
    rejected: { Icon: XCircle, color: 'text-destructive' },
    under_review: { Icon: Target, color: 'text-primary' },
    submitted: { Icon: Rocket, color: 'text-accent' },
    pending: { Icon: Clock, color: 'text-foreground' },
    warning: { Icon: AlertTriangle, color: 'text-warning' }
  }

  const { Icon, color } = iconMap[status]

  if (animated) {
    return (
      <div className="animate-[wiggle_2s_ease-in-out_infinite]">
        <Icon className={cn(sizeClasses[size], color, className)} />
      </div>
    )
  }

  return <Icon className={cn(sizeClasses[size], color, className)} />
}
