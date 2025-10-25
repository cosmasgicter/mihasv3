import React from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { FileText, User, GraduationCap, Calendar, Clock, MapPin, Mail, CreditCard } from 'lucide-react'
import { AnimatedCard } from '@/components/ui/AnimatedCard'
import { PublicApplicationStatus } from '../hooks/useApplicationTracker'
import { displayValue, getInstitutionName, formatPaymentStatus, getPaymentStatusStyles, getPaymentStatusDescription, formatDisplayDate } from '../utils/trackerUtils'

interface ApplicationInfoGridProps {
  application: PublicApplicationStatus
}

export const ApplicationInfoGrid: React.FC<ApplicationInfoGridProps> = ({ application }) => {
  const shouldReduceMotion = useReducedMotion()
  const maybeMotion = <T,>(value: T) => (shouldReduceMotion ? undefined : value)

  return (
    <motion.div
      initial={maybeMotion({ opacity: 0, x: 20 })}
      animate={maybeMotion({ opacity: 1, x: 0 })}
      transition={maybeMotion({ delay: 0.8 })}
      className="space-y-4 sm:space-y-6"
    >
      <h4 className="text-responsive-2xl font-black text-gray-900 mb-6 sm:mb-8 flex items-center space-x-2 sm:space-x-3">
        <span className="text-2xl sm:text-3xl">📄</span>
        <span>Details</span>
      </h4>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <AnimatedCard className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200" hover3d>
          <div className="flex items-center space-x-3 sm:space-x-4">
            <div className="p-2 sm:p-3 bg-blue-500 rounded-lg sm:rounded-xl flex-shrink-0">
              <FileText className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-gray-900 text-sm sm:text-base lg:text-lg">Application Number</p>
              <p className="text-gray-900 font-mono text-base sm:text-lg lg:text-xl break-all font-bold">{application.application_number}</p>
            </div>
          </div>
        </AnimatedCard>

        <AnimatedCard className="bg-gradient-to-r from-slate-50 to-sky-50 border border-sky-200" hover3d delay={0.05}>
          <div className="flex items-center space-x-3 sm:space-x-4">
            <div className="p-2 sm:p-3 bg-sky-500 rounded-lg sm:rounded-xl flex-shrink-0">
              <User className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-gray-900 text-sm sm:text-base lg:text-lg">Applicant</p>
              <p className="text-gray-900 text-base sm:text-lg lg:text-xl break-words font-semibold">{displayValue(application.full_name)}</p>
            </div>
          </div>
        </AnimatedCard>

        <AnimatedCard className="bg-gradient-to-r from-purple-50 to-pink-50 border border-gray-200" hover3d delay={0.1}>
          <div className="flex items-center space-x-3 sm:space-x-4">
            <div className="p-2 sm:p-3 bg-gray-50 rounded-lg sm:rounded-xl flex-shrink-0">
              <GraduationCap className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-gray-900 text-sm sm:text-base lg:text-lg">Program</p>
              <p className="text-gray-900 text-base sm:text-lg lg:text-xl break-words font-semibold">{displayValue(application.program_name, 'Program unavailable')}</p>
            </div>
          </div>
        </AnimatedCard>

        <AnimatedCard className="bg-gradient-to-r from-green-50 to-emerald-50 border border-yellow-200" hover3d delay={0.15}>
          <div className="flex items-center space-x-3 sm:space-x-4">
            <div className="p-2 sm:p-3 bg-yellow-500 rounded-lg sm:rounded-xl flex-shrink-0">
              <Calendar className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-gray-900 text-sm sm:text-base lg:text-lg">Intake Period</p>
              <p className="text-gray-900 text-base sm:text-lg lg:text-xl break-words font-semibold">{displayValue(application.intake_name, 'Intake unavailable')}</p>
            </div>
          </div>
        </AnimatedCard>

        <AnimatedCard className="bg-gradient-to-r from-amber-50 to-orange-50 border border-orange-200" hover3d delay={0.2}>
          <div className="flex items-center space-x-3 sm:space-x-4">
            <div className="p-2 sm:p-3 bg-orange-500 rounded-lg sm:rounded-xl flex-shrink-0">
              <Clock className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-gray-900 text-sm sm:text-base lg:text-lg">Submitted On</p>
              <p className="text-gray-900 text-base sm:text-lg lg:text-xl font-semibold">{application.submitted_at ? formatDisplayDate(application.submitted_at) : 'Not submitted yet'}</p>
            </div>
          </div>
        </AnimatedCard>

        <AnimatedCard className="bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-200" hover3d delay={0.25}>
          <div className="flex items-center space-x-3 sm:space-x-4">
            <div className="p-2 sm:p-3 bg-secondary rounded-lg sm:rounded-xl flex-shrink-0">
              <MapPin className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-gray-900 text-sm sm:text-base lg:text-lg">Institution</p>
              <p className="text-gray-900 text-base sm:text-lg lg:text-xl break-words font-semibold">{getInstitutionName(application.institution)}</p>
            </div>
          </div>
        </AnimatedCard>

        <AnimatedCard className="bg-gradient-to-r from-rose-50 to-pink-50 border border-rose-200" hover3d delay={0.3}>
          <div className="flex items-center space-x-3 sm:space-x-4">
            <div className="p-2 sm:p-3 bg-rose-500 rounded-lg sm:rounded-xl flex-shrink-0">
              <Mail className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-gray-900 text-sm sm:text-base lg:text-lg">Email</p>
              {application.email ? (
                <a
                  href={`mailto:${application.email}`}
                  className="text-blue-700 text-base sm:text-lg lg:text-xl break-all hover:underline font-semibold"
                >
                  {application.email}
                </a>
              ) : (
                <p className="text-gray-900 text-base sm:text-lg lg:text-xl font-semibold">{displayValue(application.email)}</p>
              )}
            </div>
          </div>
        </AnimatedCard>

        <AnimatedCard className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200" hover3d delay={0.35}>
          <div className="flex items-center space-x-3 sm:space-x-4">
            <div className="p-2 sm:p-3 bg-emerald-500 rounded-lg sm:rounded-xl flex-shrink-0">
              <CreditCard className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-gray-900 text-sm sm:text-base lg:text-lg">Payment Status</p>
              <span
                className={`inline-flex items-center px-3 py-1 mt-1 rounded-full text-xs sm:text-sm font-bold border ${getPaymentStatusStyles(application.payment_status)}`}
              >
                {formatPaymentStatus(application.payment_status)}
              </span>
              <p className="text-gray-800 text-xs sm:text-sm mt-2 font-medium">
                {getPaymentStatusDescription(application.payment_status)}
              </p>
            </div>
          </div>
        </AnimatedCard>
      </div>
    </motion.div>
  )
}
