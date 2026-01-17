import React from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { FileText, User, GraduationCap, Calendar, Clock, MapPin, Mail, CreditCard, Info } from 'lucide-react'
import { PublicApplicationStatus } from '../hooks/useApplicationTracker'
import { displayValue, getInstitutionName, formatPaymentStatus, getPaymentStatusStyles, getPaymentStatusDescription, formatDisplayDate } from '../utils/trackerUtils'

interface ApplicationInfoGridProps {
  application: PublicApplicationStatus
}

interface InfoCardProps {
  icon: React.ReactNode
  iconBg: string
  label: string
  value: React.ReactNode
  delay?: number
}

const InfoCard: React.FC<InfoCardProps> = ({ icon, iconBg, label, value, delay = 0 }) => {
  const shouldReduceMotion = useReducedMotion()
  const maybeMotion = <T,>(val: T) => (shouldReduceMotion ? undefined : val)

  return (
    <motion.div
      initial={maybeMotion({ opacity: 0, y: 10 })}
      animate={maybeMotion({ opacity: 1, y: 0 })}
      transition={maybeMotion({ duration: 0.3, delay })}
      className="flex items-start gap-3 p-4 rounded-xl bg-card border border-border hover:border-primary/30 transition-colors"
    >
      <div className={`flex-shrink-0 p-2 rounded-lg ${iconBg}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
        <div className="text-sm font-semibold text-gray-900 mt-1 break-words">{value}</div>
      </div>
    </motion.div>
  )
}

export const ApplicationInfoGrid: React.FC<ApplicationInfoGridProps> = ({ application }) => {
  const shouldReduceMotion = useReducedMotion()
  const maybeMotion = <T,>(value: T) => (shouldReduceMotion ? undefined : value)

  return (
    <motion.div
      initial={maybeMotion({ opacity: 0, x: 20 })}
      animate={maybeMotion({ opacity: 1, x: 0 })}
      transition={maybeMotion({ duration: 0.3, delay: 0.2 })}
      className="space-y-4"
    >
      <h4 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
        <Info className="h-5 w-5 text-primary" />
        Application Details
      </h4>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <InfoCard
          icon={<FileText className="h-4 w-4 text-primary" />}
          iconBg="bg-primary/10"
          label="Application Number"
          value={<span className="font-mono">{application.application_number}</span>}
          delay={0}
        />

        <InfoCard
          icon={<User className="h-4 w-4 text-secondary" />}
          iconBg="bg-secondary/10"
          label="Applicant"
          value={displayValue(application.full_name)}
          delay={0.05}
        />

        <InfoCard
          icon={<GraduationCap className="h-4 w-4 text-purple-600" />}
          iconBg="bg-purple-100"
          label="Program"
          value={displayValue(application.program_name, 'Program unavailable')}
          delay={0.1}
        />

        <InfoCard
          icon={<Calendar className="h-4 w-4 text-warning" />}
          iconBg="bg-warning/10"
          label="Intake Period"
          value={displayValue(application.intake_name, 'Intake unavailable')}
          delay={0.15}
        />

        <InfoCard
          icon={<Clock className="h-4 w-4 text-orange-600" />}
          iconBg="bg-orange-100"
          label="Submitted On"
          value={application.submitted_at ? formatDisplayDate(application.submitted_at) : 'Not submitted yet'}
          delay={0.2}
        />

        <InfoCard
          icon={<MapPin className="h-4 w-4 text-indigo-600" />}
          iconBg="bg-indigo-100"
          label="Institution"
          value={getInstitutionName(application.institution)}
          delay={0.25}
        />

        <InfoCard
          icon={<Mail className="h-4 w-4 text-rose-600" />}
          iconBg="bg-rose-100"
          label="Email"
          value={
            application.email ? (
              <a
                href={`mailto:${application.email}`}
                className="text-primary hover:underline break-all"
              >
                {application.email}
              </a>
            ) : (
              displayValue(application.email)
            )
          }
          delay={0.3}
        />

        <InfoCard
          icon={<CreditCard className="h-4 w-4 text-success" />}
          iconBg="bg-success/10"
          label="Payment Status"
          value={
            <div>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${getPaymentStatusStyles(application.payment_status)}`}>
                {formatPaymentStatus(application.payment_status)}
              </span>
              <p className="text-xs text-muted-foreground mt-1">
                {getPaymentStatusDescription(application.payment_status)}
              </p>
            </div>
          }
          delay={0.35}
        />
      </div>
    </motion.div>
  )
}
