import React from 'react'
import { FileText, User, GraduationCap, Calendar, Clock, MapPin, Mail, CreditCard, Info } from 'lucide-react'
import { PublicApplicationStatus } from '../hooks/useApplicationTracker'
import { displayValue, getInstitutionName, formatPaymentStatus, getPaymentStatusStyles, getPaymentStatusDescription, formatDisplayDate } from '../utils/trackerUtils'
import { animateClasses, staggerChild } from '@/lib/animations'

interface ApplicationInfoGridProps {
  application: PublicApplicationStatus
}

interface InfoCardProps {
  icon: React.ReactNode
  iconBg: string
  label: string
  value: React.ReactNode
  index?: number
}

const InfoCard: React.FC<InfoCardProps> = ({ icon, iconBg, label, value, index = 0 }) => (
  <div
    className={`flex items-start gap-3 rounded-2xl border border-border/40 bg-card/80 backdrop-blur-sm p-4 transition-all hover:shadow-md hover:border-primary/30 ${animateClasses.fadeIn}`}
    style={staggerChild(index)}
  >
    <div className={`flex-shrink-0 rounded-xl p-2.5 ${iconBg}`}>{icon}</div>
    <div className="flex-1 min-w-0">
      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
      <div className="text-sm font-semibold text-foreground mt-1 break-words">{value}</div>
    </div>
  </div>
)

export const ApplicationInfoGrid: React.FC<ApplicationInfoGridProps> = ({ application }) => (
  <div className={`space-y-4 ${animateClasses.fadeIn}`} style={{ animationDelay: '200ms', animationFillMode: 'forwards' }}>
    <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
      <Info className="h-5 w-5 text-primary" />
      Application Details
    </h3>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <InfoCard icon={<FileText className="h-4 w-4 text-primary" />} iconBg="bg-primary/10" label="Application Number" value={<span className="font-mono">{application.application_number}</span>} index={0} />
      <InfoCard icon={<User className="h-4 w-4 text-secondary" />} iconBg="bg-secondary/10" label="Applicant" value={displayValue(application.email, 'Applicant details unavailable')} index={1} />
      <InfoCard icon={<GraduationCap className="h-4 w-4 text-purple-600" />} iconBg="bg-purple-100 dark:bg-purple-900/30" label="Program" value={displayValue(application.program_name, 'Program unavailable')} index={2} />
      <InfoCard icon={<Calendar className="h-4 w-4 text-warning" />} iconBg="bg-warning/10" label="Intake Period" value={displayValue(application.intake_name, 'Intake unavailable')} index={3} />
      <InfoCard icon={<Clock className="h-4 w-4 text-orange-600" />} iconBg="bg-orange-100 dark:bg-orange-900/30" label="Submitted On" value={application.submitted_at ? formatDisplayDate(application.submitted_at) : 'Not submitted yet'} index={4} />
      <InfoCard icon={<MapPin className="h-4 w-4 text-indigo-600" />} iconBg="bg-indigo-100 dark:bg-indigo-900/30" label="Institution" value={getInstitutionName(application.institution)} index={5} />
      <InfoCard icon={<Mail className="h-4 w-4 text-rose-600" />} iconBg="bg-rose-100 dark:bg-rose-900/30" label="Email" value={application.email ? (<a href={`mailto:${application.email}`} className="text-primary hover:underline break-all">{application.email}</a>) : displayValue(application.email)} index={6} />
      <InfoCard icon={<CreditCard className="h-4 w-4 text-success" />} iconBg="bg-success/10" label="Payment Status" value={<div><span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${getPaymentStatusStyles(application.payment_status)}`}>{formatPaymentStatus(application.payment_status)}</span><p className="text-xs text-muted-foreground mt-1">{getPaymentStatusDescription(application.payment_status)}</p></div>} index={7} />
    </div>
  </div>
)
