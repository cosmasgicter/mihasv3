import React from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { GraduationCap, Calendar, Clock, Share2, Copy, Download, Mail, Trophy, XCircle, Target, Rocket, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { PublicApplicationStatus } from '../hooks/useApplicationTracker'
import { getStatusEmoji, formatDisplayDate } from '../utils/trackerUtils'

interface ApplicationStatusHeaderProps {
  application: PublicApplicationStatus
  copied: boolean
  slipLoading: boolean
  emailLoading: boolean
  onShare: () => void
  onCopy: () => void
  onDownloadSlip: () => void
  onEmailSlip: () => void
}

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'approved': return <Trophy className="h-6 w-6 text-success" />
    case 'rejected': return <XCircle className="h-6 w-6 text-error" />
    case 'under_review': return <Target className="h-6 w-6 text-primary" />
    case 'submitted': return <Rocket className="h-6 w-6 text-warning" />
    default: return <Clock className="h-6 w-6 text-muted-foreground" />
  }
}

const getStatusStyles = (status: string) => {
  switch (status) {
    case 'approved': return 'bg-success/10 text-success border-success/30'
    case 'rejected': return 'bg-error/10 text-error border-error/30'
    case 'under_review': return 'bg-primary/10 text-primary border-primary/30'
    case 'submitted': return 'bg-warning/10 text-warning border-warning/30'
    default: return 'bg-muted text-muted-foreground border-border'
  }
}

export const ApplicationStatusHeader: React.FC<ApplicationStatusHeaderProps> = ({
  application,
  copied,
  slipLoading,
  emailLoading,
  onShare,
  onCopy,
  onDownloadSlip,
  onEmailSlip
}) => {
  const shouldReduceMotion = useReducedMotion()
  const maybeMotion = <T,>(value: T) => (shouldReduceMotion ? undefined : value)

  return (
    <div className="bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 p-6 sm:p-8">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
        {/* Left Side - Application Info */}
        <div className="space-y-4 flex-1">
          <motion.div
            initial={maybeMotion({ opacity: 0, x: -20 })}
            animate={maybeMotion({ opacity: 1, x: 0 })}
            transition={maybeMotion({ duration: 0.3 })}
          >
            <h3 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-3">
              <span className="text-2xl">{getStatusEmoji(application.status)}</span>
              <span className="break-all">Application #{application.application_number}</span>
            </h3>
          </motion.div>
          
          <motion.div
            initial={maybeMotion({ opacity: 0, x: -20 })}
            animate={maybeMotion({ opacity: 1, x: 0 })}
            transition={maybeMotion({ duration: 0.3, delay: 0.1 })}
            className="space-y-2"
          >
            <p className="text-white/90 text-base sm:text-lg font-medium flex items-center gap-2">
              <GraduationCap className="h-5 w-5 flex-shrink-0" />
              <span className="break-words">{application.program_name}</span>
            </p>
            <p className="text-white/80 text-sm sm:text-base flex items-center gap-2">
              <Calendar className="h-4 w-4 flex-shrink-0" />
              <span className="break-words">{application.intake_name}</span>
            </p>
          </motion.div>
        </div>
        
        {/* Right Side - Status & Actions */}
        <motion.div
          initial={maybeMotion({ opacity: 0, x: 20 })}
          animate={maybeMotion({ opacity: 1, x: 0 })}
          transition={maybeMotion({ duration: 0.3, delay: 0.2 })}
          className="flex flex-col items-center lg:items-end gap-4"
        >
          {/* Status Badge */}
          <div className="flex items-center gap-3">
            {getStatusIcon(application.status)}
            <span className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-bold border ${getStatusStyles(application.status)} bg-white/95`}>
              {application.status.replace('_', ' ').toUpperCase()}
            </span>
          </div>
          
          {/* Last Updated */}
          <p className="text-white/80 text-sm flex items-center gap-2">
            <Clock className="h-4 w-4" />
            <span>Updated: {formatDisplayDate(application.updated_at)}</span>
          </p>
          
          {/* Action Buttons */}
          <div className="flex flex-wrap justify-center lg:justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onShare}
              className="bg-white/95 border-white/30 text-gray-900 hover:bg-white"
            >
              <Share2 className="h-4 w-4 mr-2" />
              Share
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onCopy}
              className="bg-white/95 border-white/30 text-gray-900 hover:bg-white"
            >
              <Copy className="h-4 w-4 mr-2" />
              {copied ? 'Copied!' : 'Copy #'}
            </Button>
          </div>
          
          {/* Download/Email Buttons */}
          <div className="flex flex-wrap justify-center lg:justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onDownloadSlip}
              loading={slipLoading}
              className="bg-white/95 border-white/30 text-gray-900 hover:bg-white"
            >
              <Download className="h-4 w-4 mr-2" />
              Download Slip
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onEmailSlip}
              loading={emailLoading}
              className="bg-white/95 border-white/30 text-gray-900 hover:bg-white"
            >
              <Mail className="h-4 w-4 mr-2" />
              Email Slip
            </Button>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
