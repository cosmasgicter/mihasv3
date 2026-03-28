import { FileText, GraduationCap, ScrollText, Settings, Users } from 'lucide-react'
import { Link } from 'react-router-dom'

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
  const quickActions = [
    { label: 'Applications', description: `${pendingApplications} pending`, to: '/admin/applications', icon: FileText },
    { label: 'Programs', description: `${totalPrograms} active`, to: '/admin/programs', icon: GraduationCap },
    { label: 'Users', description: `${totalStudents} students`, to: '/admin/users', icon: Users },
    { label: 'Audit Trail', description: 'System activity', to: '/admin/audit', icon: ScrollText },
    { label: 'Settings', description: 'Configure platform', to: '/admin/settings', icon: Settings }
  ]

  return (
    <div className="bg-card rounded-xl shadow-lg border border-border">
      <div className="px-6 py-4 border-b border-border">
        <h3 className="text-lg font-bold text-foreground">Quick Actions</h3>
      </div>
      <div className="p-4 space-y-2">
        {quickActions.map((action) => {
          const Icon = action.icon
          return (
            <Link
              key={action.label}
              to={action.to}
              className="flex items-center justify-between rounded-lg border border-border p-3 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium text-foreground">{action.label}</span>
              </div>
              <span className="text-xs text-foreground/75">{action.description}</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
