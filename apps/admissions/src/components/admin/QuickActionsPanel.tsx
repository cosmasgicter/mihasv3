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
      color: 'from-blue-600 to-purple-600',
      urgent: stats.pendingApplications > 0
    },
    {
      title: 'Programs',
      description: `${stats.totalPrograms} active programs`,
      icon: GraduationCap,
      href: '/admin/programs',
      color: 'from-purple-500 to-indigo-600',
      urgent: false
    },
    {
      title: 'Users',
      description: `${stats.totalStudents} students`,
      icon: Users,
      href: '/admin/users',
      color: 'from-blue-500 to-cyan-600',
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
        className={`${animateClasses.slideUp} opacity-0 bg-card rounded-2xl shadow-lg border border-border`}
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
                    className={`${animateClasses.slideUp} opacity-0 group relative hover:scale-[1.02] active:scale-[0.98] transition-transform duration-150`}
                    style={staggerChild(index)}
                  >
                    <Button 
                      className={`w-full h-24 flex flex-col items-center justify-center space-y-2 bg-gradient-to-r ${action.color} hover:shadow-xl transition-all duration-300 relative overflow-hidden`}
                    >
                      {action.urgent && (
                        <div className="absolute top-2 right-2">
                          <div className="w-3 h-3 bg-destructive rounded-full animate-pulse"></div>
                        </div>
                      )}
                      <Icon className="h-6 w-6 group-hover:scale-110 transition-transform" />
                      <span className="font-semibold text-sm">{action.title}</span>
                      {action.urgent && (
                        <span className="text-xs bg-card/20 px-2 py-1 rounded-full">
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
        className={`${animateClasses.slideUp} opacity-0 bg-card rounded-2xl shadow-lg border border-border`}
        style={staggerChild(2)}
      >
        <div className="px-6 py-4 border-b border-border">
          <h3 className="text-lg font-bold text-foreground">🛠️ System Tools</h3>
        </div>
        
        <div className="p-6 space-y-3">
          {systemActions.map((action, index) => {
            const Icon = action.icon
            return (
              <Link key={action.title} to={action.href}>
                <div
                  className={`${animateClasses.fadeIn} opacity-0 hover:scale-[1.02] active:scale-[0.98] transition-transform duration-150`}
                  style={staggerChild(index)}
                >
                  <Button 
                    variant="outline" 
                    className="w-full justify-start h-12 border-2 hover:border-primary hover:bg-primary/5 transition-all duration-300"
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
            className={`${animateClasses.fadeIn} opacity-0 hover:scale-[1.02] active:scale-[0.98] transition-transform duration-150`}
            style={staggerChild(4)}
          >
            <Button 
              variant="outline" 
              className="w-full justify-start h-12 border-2 hover:border-accent hover:bg-accent/5 transition-all duration-300"
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
        className={`${animateClasses.slideUp} opacity-0 bg-gradient-to-r from-blue-50 to-purple-50 rounded-2xl p-6 border border-primary/30`}
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
