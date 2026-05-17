import React from 'react'
import { FileText, GraduationCap, Calendar, Clock, MapPin, Info } from 'lucide-react'
import { PublicApplicationStatus } from '../hooks/useApplicationTracker'
import { displayValue, getInstitutionName, formatDisplayDate } from '../utils/trackerUtils'
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
    className={`flex items-start gap-3 rounded-lg border border-border/40 bg-card/80  p-4 transition-all hover:shadow-md hover:border-primary/30 ${animateClasses.fadeIn}`}
    style={staggerChild(index)}
  >
    <div className={`flex-shrink-0 rounded-lg p-2.5 ${iconBg}`}>{icon}</div>
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
      <InfoCard icon={<GraduationCap className="h-4 w-4 text-primary" />} iconBg="bg-primary/10" label="Program" value={displayValue(application.program_name, 'Program unavailable')} index={1} />
      <InfoCard icon={<Calendar className="h-4 w-4 text-warning" />} iconBg="bg-warning/10" label="Intake Period" value={displayValue(application.intake_name, 'Intake unavailable')} index={2} />
      <InfoCard icon={<Clock className="h-4 w-4 text-orange-600" />} iconBg="bg-orange-100 dark:bg-orange-900/30" label="Submitted On" value={application.submitted_at ? formatDisplayDate(application.submitted_at) : 'Not submitted yet'} index={3} />
      <InfoCard icon={<MapPin className="h-4 w-4 text-indigo-600" />} iconBg="bg-indigo-100 dark:bg-indigo-900/30" label="Institution" value={getInstitutionName(application.institution)} index={4} />
    </div>
  </div>
)
