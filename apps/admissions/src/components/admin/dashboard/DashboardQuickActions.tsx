import { FileText, GraduationCap, ScrollText, Settings, Users, Zap } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ScaleOnHover } from '@/components/motion'
import { SectionCard } from '@/components/ui/SectionCard'
import { useCapabilities } from '@/contexts/CapabilityContext'
import { canSeeAdminNavPath } from '@/components/navigation/adminNavAccess'

/**
 * Quick-action counts are optional, and `null` means *not measured* (task 9.2,
 * ADM-02 / MAINT-02).
 *
 * The previous props were three required numbers rendered as `"N pending"`,
 * `"N active"`, and `"N students"`. Two of them were untruthful even when they
 * arrived: `totalPrograms` has no source in the dashboard payload at all, so it
 * was always the `0` its initial state supplied; and `totalStudents` is fed by
 * the account total, which counts **staff accounts in scope**, not applicants.
 * A nav shortcut does not need a decorative number, so a count is now rendered
 * only where a real, definition-carrying metric supplies it.
 */
interface DashboardQuickActionsProps {
  /** The `decision_queue` metric's value, or `null` when it is unknown. */
  pendingApplications: number | null
  /** The `staff_accounts_total` metric's value, or `null` when it is unknown. */
  staffAccounts: number | null
}

export function DashboardQuickActions({
  pendingApplications,
  staffAccounts
}: DashboardQuickActionsProps) {
  const caps = useCapabilities()
  const quickActions = [
    {
      label: 'Applications',
      description: pendingApplications === null ? '' : `${pendingApplications} pending`,
      to: '/admin/applications',
      icon: FileText,
    },
    { label: 'Programmes', description: '', to: '/admin/programs', icon: GraduationCap },
    {
      label: 'Users',
      description: staffAccounts === null ? '' : `${staffAccounts} accounts`,
      to: '/admin/users',
      icon: Users,
    },
    { label: 'Audit trail', description: 'System activity', to: '/admin/audit', icon: ScrollText },
    { label: 'Settings', description: 'Configure platform', to: '/admin/settings', icon: Settings }
  ]
  const visibleQuickActions = quickActions.filter((action) => canSeeAdminNavPath(caps, action.to))

  return (
    <SectionCard
      title="Quick actions"
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
                {action.description ? (
                  <span className="text-xs text-muted-foreground">{action.description}</span>
                ) : null}
              </Link>
            </ScaleOnHover>
          )
        })}
      </div>
    </SectionCard>
  )
}
