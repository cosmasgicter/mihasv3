import React from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Calendar } from 'lucide-react'
import { PublicApplicationStatus } from '../hooks/useApplicationTracker'
import { formatDate } from '@/lib/utils'
import { getStatusEmoji, getStatusMessage } from '../utils/trackerUtils'

interface ApplicationStatusDetailsProps {
  application: PublicApplicationStatus
}

export const ApplicationStatusDetails: React.FC<ApplicationStatusDetailsProps> = ({ application }) => {
  const shouldReduceMotion = useReducedMotion()
  const maybeMotion = <T,>(value: T) => (shouldReduceMotion ? undefined : value)

  return (
    <div className="xl:col-span-2 space-y-6 sm:space-y-8">
      <motion.div
        initial={maybeMotion({ opacity: 0, y: 20 })}
        animate={maybeMotion({ opacity: 1, y: 0 })}
        transition={maybeMotion({ delay: 0.6 })}
      >
        <h4 className="text-responsive-2xl font-black text-gray-900 mb-6 sm:mb-8 flex items-center space-x-2 sm:space-x-3">
          <span className="text-2xl sm:text-3xl">📊</span>
          <span>Current Status</span>
        </h4>
        
        <div className={`bg-gradient-to-br space-responsive rounded-2xl shadow-2xl border-2 ${
          application.status === 'approved' 
            ? 'from-green-50 via-emerald-50 to-teal-50 border-green-300'
            : application.status === 'rejected'
            ? 'from-red-50 via-pink-50 to-rose-50 border-destructive/30'
            : application.status === 'under_review'
            ? 'from-blue-50 via-indigo-50 to-purple-50 border-blue-300'
            : 'from-yellow-50 via-orange-50 to-amber-50 border-yellow-300'
        }`}>
          <div className="flex flex-col sm:flex-row items-center sm:items-start space-y-4 sm:space-y-0 sm:space-x-6 lg:space-x-8">
            <motion.div
              animate={maybeMotion({
                scale: [1, 1.1, 1],
                rotate: [0, 5, -5, 0]
              })}
              transition={maybeMotion({ duration: 3, repeat: Infinity })}
              className="text-5xl sm:text-6xl lg:text-7xl flex-shrink-0"
            >
              {getStatusEmoji(application.status)}
            </motion.div>
            <div className="flex-1 text-center sm:text-left">
              <p className="font-black text-xl sm:text-2xl lg:text-3xl text-gray-900 mb-3 sm:mb-4">
                {application.status.replace('_', ' ').toUpperCase()}
              </p>
              <p className="text-gray-800 text-base sm:text-lg lg:text-xl leading-relaxed font-medium">
                {getStatusMessage(application.status)}
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      <AnimatePresence initial={!shouldReduceMotion}>
        {application.admin_feedback && (
          <motion.div
            initial={maybeMotion({ opacity: 0, y: 20 })}
            animate={maybeMotion({ opacity: 1, y: 0 })}
            exit={maybeMotion({ opacity: 0, y: -20 })}
            transition={maybeMotion({ delay: 0.7 })}
            className="bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 border-2 border-green-300 rounded-2xl space-responsive shadow-2xl"
          >
            <h5 className="font-black text-gray-900 mb-4 sm:mb-6 text-lg sm:text-xl lg:text-2xl flex items-center space-x-2 sm:space-x-3">
              <span className="text-xl sm:text-2xl">💬</span>
              <span>Message from Admissions</span>
            </h5>
            <div className="bg-white/80 rounded-xl p-4 sm:p-6 mb-4 sm:mb-6 border border-green-200">
              <p className="text-gray-900 text-base sm:text-lg lg:text-xl leading-relaxed font-semibold">
                {application.admin_feedback}
              </p>
            </div>
            {application.admin_feedback_date && (
              <p className="text-gray-900 font-bold text-sm sm:text-base lg:text-lg flex items-center space-x-2">
                <Calendar className="h-4 w-4 sm:h-5 sm:w-5" />
                <span>Provided on {formatDate(application.admin_feedback_date)}</span>
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
