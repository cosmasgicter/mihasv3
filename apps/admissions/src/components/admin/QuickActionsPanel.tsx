import React from 'react'
import { staggerChild, animateClasses } from '@/lib/animations'
import { Link } from 'react-router-dom'
import { 
  FileText, 
  BarChart3, 
  GraduationCap, 
  Users, 
  Settings,
  Download,
  Zap,
  ScrollText
} from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface QuickActionsPanelProps {
  stats: {
    pendingApplications: number
    totalPrograms: number
    totalStudents: number
  }
}

export function QuickActionsPanel({ stats }: QuickActionsPanelProps) {
  const quickActions = [
    {
      title: 'Applications',
      description: `${stats.pendingApplications} in decision queue`,
      icon: FileText,
      href: '/admin/applications',
      urgent: stats.pendingApplications > 0
    },
    {
      title: 'Programs',
      description: `${stats.totalPrograms} active programs`,
      icon: GraduationCap,
      href: '/admin/programs',
      urgent: false
    },
    {
      title: 'Users',
      description: `${stats.totalStudents} students`,
      icon: Users,
      href: '/admin/users',
      urgent: false
    }
  ]

  const systemActions = [
    {
      title: 'Settings',
      icon: Settings,
      href: '/admin/settings',
      description: 'System configuration'
    },
    {
      title: 'Audit trail',
      icon: ScrollText,
      href: '/admin/audit',
      description: 'Review system activity'
    }
  ]

  return (
    <div className="space-y-6">
      {/* Primary Actions */}
      <div 
        className={`${animateClasses.slideUp} opacity-0 rounded-lg border border-border bg-card shadow-sm`}
        style={staggerChild(0)}
      >
        <div className="px-6 py-4 border-b border-border">
          <h3 className="text-lg font-bold text-foreground"><Zap className="w-5 h-5" /> Quick Actions</h3>
          <p className="text-sm text-muted-foreground mt-1">Manage your system efficiently</p>
        </div>
        
        <div className="p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {quickActions.map((action, index) => {
              const Icon = action.icon
              return (
                <Link key={action.title} to={action.href}>
                  <div
                    className={`${animateClasses.slideUp} opacity-0 group relative`}
                    style={staggerChild(index)}
                  >
                    <Button 
                      variant="outline"
                      className="relative flex h-24 w-full flex-col items-center justify-center space-y-2 overflow-hidden border-border bg-card transition-colors duration-150 hover:bg-muted"
                    >
                      {action.urgent && (
                        <div className="absolute top-2 right-2">
                          <div className="w-3 h-3 bg-destructive rounded-full animate-pulse"></div>
                        </div>
                      )}
                      <Icon className="h-6 w-6 text-primary" />
                      <span className="font-semibold text-sm">{action.title}</span>
                      {action.urgent && (
                        <span className="rounded-md bg-primary/10 px-2 py-1 text-xs text-primary">
                          {action.description}
                        </span>
                      )}
                    </Button>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      </div>

      {/* System Tools */}
      <div 
        className={`${animateClasses.slideUp} opacity-0 rounded-lg border border-border bg-card shadow-sm`}
        style={staggerChild(2)}
      >
        <div className="px-6 py-4 border-b border-border">
          <h3 className="text-lg font-bold text-foreground">System Tools</h3>
        </div>
        
        <div className="p-6 space-y-3">
          {systemActions.map((action, index) => {
            const Icon = action.icon
            return (
              <Link key={action.title} to={action.href}>
                <div
                  className={`${animateClasses.fadeIn} opacity-0`}
                  style={staggerChild(index)}
                >
                  <Button 
                    variant="outline" 
                    className="h-12 w-full justify-start border-border transition-colors duration-150 hover:border-primary/40 hover:bg-primary/5"
                  >
                    <Icon className="h-4 w-4 mr-3" />
                    <div className="text-left">
                      <div className="font-medium">{action.title}</div>
                      <div className="text-xs text-muted-foreground">{action.description}</div>
                    </div>
                  </Button>
                </div>
              </Link>
            )
          })}
          
          {/* Quick Export */}
          <div
            className={`${animateClasses.fadeIn} opacity-0`}
            style={staggerChild(4)}
          >
            <Button 
              variant="outline" 
              className="h-12 w-full justify-start border-border transition-colors duration-150 hover:border-accent hover:bg-accent/5"
              disabled
              title="Coming soon"
            >
              <Download className="h-4 w-4 mr-3" />
              <div className="text-left">
                <div className="font-medium">Export Data</div>
                <div className="text-xs text-muted-foreground">Download reports</div>
              </div>
            </Button>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div 
        className={`${animateClasses.slideUp} opacity-0 rounded-lg border border-border bg-card p-6 shadow-sm`}
        style={staggerChild(4)}
      >
        <h3 className="text-lg font-bold text-foreground mb-4"><BarChart3 className="w-5 h-5" /> Quick Stats</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-primary">{stats.pendingApplications}</div>
            <div className="text-sm text-muted-foreground">Decision Queue</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-secondary">{stats.totalPrograms}</div>
            <div className="text-sm text-muted-foreground">Programs</div>
          </div>
        </div>
      </div>
    </div>
  )
}
