import React from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { GraduationCap, Calendar, Clock, Share2, Copy, Download, Mail } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Trophy, XCircle, Target, Rocket } from 'lucide-react'
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
    case 'approved': return <Trophy className="h-8 w-8 text-success" />
    case 'rejected': return <XCircle className="h-8 w-8 text-error" />
    case 'under_review': return <Target className="h-8 w-8 text-primary" />
    case 'submitted': return <Rocket className="h-8 w-8 text-warning" />
    default: return <Clock className="h-8 w-8 text-secondary" />
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
    <div className="bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 relative overflow-hidden">
      <div className="absolute inset-0 opacity-20">
        <motion.div
          animate={maybeMotion({ x: [0, 100, 0], y: [0, -50, 0] })}
          transition={maybeMotion({ duration: 10, repeat: Infinity })}
          className="absolute top-0 left-0 w-32 h-32 bg-card rounded-full"
        />
        <motion.div
          animate={maybeMotion({ x: [100, 0, 100], y: [0, 50, 0] })}
          transition={maybeMotion({ duration: 15, repeat: Infinity })}
          className="absolute bottom-0 right-0 w-24 h-24 bg-card rounded-full"
        />
      </div>
      
      <div className="relative space-responsive text-white">
        <div className="flex flex-col space-y-4 lg:flex-row lg:items-start lg:justify-between lg:space-y-0 lg:space-x-6">
          <div className="space-y-3 sm:space-y-4 flex-1">
            <motion.div
              initial={maybeMotion({ x: -50, opacity: 0 })}
              animate={maybeMotion({ x: 0, opacity: 1 })}
              transition={maybeMotion({ delay: 0.2 })}
            >
              <h3 className="text-responsive-2xl font-black mb-3 sm:mb-4 flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-4">
                <span className="text-3xl sm:text-4xl">📄</span>
                <span className="break-all">Application #{application.application_number}</span>
              </h3>
            </motion.div>
            
            <motion.div
              initial={maybeMotion({ x: -50, opacity: 0 })}
              animate={maybeMotion({ x: 0, opacity: 1 })}
              transition={maybeMotion({ delay: 0.3 })}
              className="space-y-2 sm:space-y-3"
            >
              <p className="text-white text-base sm:text-2xl font-bold flex items-start sm:items-center space-x-2 sm:space-x-3">
                <GraduationCap className="h-5 w-5 sm:h-6 sm:w-6 flex-shrink-0 mt-0.5 sm:mt-0" />
                <span className="break-words">{application.program_name}</span>
              </p>
              <p className="text-white text-sm sm:text-xl font-semibold flex items-start sm:items-center space-x-2 sm:space-x-3">
                <Calendar className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0 mt-0.5 sm:mt-0" />
                <span className="break-words">{application.intake_name}</span>
              </p>
            </motion.div>
          </div>
          
          <motion.div
            initial={maybeMotion({ x: 50, opacity: 0 })}
            animate={maybeMotion({ x: 0, opacity: 1 })}
            transition={maybeMotion({ delay: 0.4 })}
            className="text-center lg:text-right space-y-3 sm:space-y-4 flex-shrink-0"
          >
            <div className="flex items-center justify-center lg:justify-end space-x-3 sm:space-x-4">
              <motion.div
                animate={maybeMotion({ rotate: [0, 10, -10, 0] })}
                transition={maybeMotion({ duration: 2, repeat: Infinity })}
                className="text-4xl sm:text-6xl"
              >
                {getStatusEmoji(application.status)}
              </motion.div>
              <div className="text-4xl sm:text-6xl">
                {getStatusIcon(application.status)}
              </div>
            </div>
            
            <motion.span
              initial={maybeMotion({ scale: 0 })}
              animate={maybeMotion({ scale: 1 })}
              transition={maybeMotion({ delay: 0.5, type: "spring" })}
              className="inline-block bg-white/20 backdrop-blur-sm px-4 sm:px-8 py-2 sm:py-4 rounded-xl sm:rounded-2xl text-body font-black text-base sm:text-2xl border-2 border-white/30 shadow-lg"
            >
              {application.status.replace('_', ' ').toUpperCase()}
            </motion.span>
            
            <p className="text-white text-sm sm:text-lg font-semibold flex items-center justify-center lg:justify-end space-x-2">
              <Clock className="h-4 w-4 sm:h-5 sm:w-5" />
              <span className="text-xs sm:text-base">Updated: {formatDisplayDate(application.updated_at)}</span>
            </p>
            
            <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-3 justify-center lg:justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={onShare}
                className="bg-white border-white/30 text-body hover:bg-white btn-mobile touch-target"
              >
                <Share2 className="h-4 w-4 mr-2" />
                Share
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onCopy}
                className="bg-white border-white/30 text-body hover:bg-white btn-mobile touch-target"
              >
                <Copy className="h-4 w-4 mr-2" />
                {copied ? 'Copied!' : 'Copy #'}
              </Button>
            </div>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={onDownloadSlip}
                loading={slipLoading}
                className="bg-white border-white/30 text-body hover:bg-white btn-mobile touch-target"
              >
                <Download className="h-4 w-4 mr-2" />
                Download Slip
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onEmailSlip}
                loading={emailLoading}
                className="bg-white border-white/30 text-body hover:bg-white btn-mobile touch-target"
              >
                <Mail className="h-4 w-4 mr-2" />
                Email Me the Slip
              </Button>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
