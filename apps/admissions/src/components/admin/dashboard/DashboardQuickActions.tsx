import { FileText, GraduationCap, ScrollText, Settings, Users, Zap } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ScaleOnHover } from '@/components/motion'
import { SectionCard } from '@/components/ui/SectionCard'
import { useCapabilities } from '@/contexts/CapabilityContext'
import { canSeeAdminNavPath } from '@/components/navigation/adminNavAccess'

interface DashboardQuickActionsProps {
  pendingApplications: number
  totalPrograms: number
  totalStudents: number
}

export function DashboardQuickActions({
  pendingApplications,
  totalPrograms,
  totalStudents
}: DashboardQuickActionsProps) {
  const caps = useCapabilities()
  const quickActions = [
    { label: 'Applications', description: `${pendingApplications} pending`, to: '/admin/applications', icon: FileText },
    { label: 'Programs', description: `${totalPrograms} active`, to: '/admin/programs', icon: GraduationCap },
    { label: 'Users', description: `${totalStudents} students`, to: '/admin/users', icon: Users },
    { label: 'Audit Trail', description: 'System activity', to: '/admin/audit', icon: ScrollText },
    { label: 'Settings', description: 'Configure platform', to: '/admin/settings', icon: Settings }
  ]
  const visibleQuickActions = quickActions.filter((action) => canSeeAdminNavPath(caps, action.to))

  return (
    <SectionCard
      title="Quick Actions"
      icon={<Zap className="h-5 w-5" aria-hidden="true" />}
    >
      <div className="space-y-2">
        {visibleQuickActions.map((action) => {
          const Icon = action.icon
          return (
            <ScaleOnHover key={action.label}>
              <Link
                to={action.to}
                className="flex items-center justify-between rounded-lg border border-border/40 p-3 hover:bg-muted/30 transition-colors min-h-touch focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
                  <span className="text-sm font-medium text-foreground">{action.label}</span>
                </div>
                <span className="text-xs text-muted-foreground">{action.description}</span>
              </Link>
            </ScaleOnHover>
          )
        })}
      </div>
    </SectionCard>
  )
}
