import React, { useState } from 'react'
import { Home, FileText, Bell, User, LayoutDashboard, Users, MoreHorizontal, GraduationCap, Calendar, BarChart3, Settings, Shield, Workflow, Brain, FileSearch, TrendingUp } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'


export const MobileBottomNav = React.memo(function MobileBottomNav() {
  const location = useLocation()
  const { user, isAdmin } = useAuth()
  const [showMoreMenu, setShowMoreMenu] = useState(false)

  if (!user) return null

  const studentLinks = [
    { to: '/student/dashboard', icon: Home, label: 'Home' },
    { to: '/apply', icon: FileText, label: 'Apply' },
    { to: '/student/notifications', icon: Bell, label: 'Alerts' },
    { to: '/student/profile', icon: User, label: 'Profile' },
  ]

  const adminMainLinks = [
    { to: '/admin/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/admin/applications', icon: FileText, label: 'Apps' },
    { to: '/admin/users', icon: Users, label: 'Users' },
  ]

  const adminMoreSections = [
    {
      title: 'Management',
      links: [
        { to: '/admin/programs', icon: GraduationCap, label: 'Programs' },
        { to: '/admin/intakes', icon: Calendar, label: 'Intakes' },
        { to: '/admin/roles', icon: Shield, label: 'Roles' },
      ]
    },
    {
      title: 'Insights',
      links: [
        { to: '/admin/analytics', icon: BarChart3, label: 'Analytics' },
        { to: '/admin/ai-insights', icon: Brain, label: 'AI Insights' },
        { to: '/admin/audit', icon: FileSearch, label: 'Audit' },
      ]
    },
    {
      title: 'System',
      links: [
        { to: '/admin/workflow', icon: Workflow, label: 'Workflow' },
        { to: '/admin/flow-analysis', icon: TrendingUp, label: 'Flow Analysis' },
        { to: '/admin/settings', icon: Settings, label: 'Settings' },
      ]
    },
  ]

  const links = isAdmin ? adminMainLinks : studentLinks

  const renderLink = ({ to, icon: Icon, label }: any) => {
    const isActive = location.pathname === to
    return (
      <Link
        key={to}
        to={to}
        aria-current={isActive ? 'page' : undefined}
        aria-label={label}
        className={cn(
          "relative flex flex-col items-center justify-center flex-1 h-full group touch-target",
          "min-h-[44px] min-w-[44px] px-2"
        )}
      >
        {isActive && <div className="absolute inset-0 bg-primary/10 rounded-lg" />}
        <Icon
          className={cn(
            "h-5 w-5 transition-all duration-300",
            isActive
              ? "text-primary scale-110"
              : "text-foreground group-hover:text-primary group-hover:scale-105"
          )}
        />
        <span className={cn(
          "mt-1 text-xs transition-all duration-300 truncate max-w-[60px]",
          isActive ? "text-primary font-medium" : "text-foreground group-hover:text-primary"
        )}>
          {label}
        </span>
      </Link>
    )
  }

  return (
    <>
      <nav 
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card/80 backdrop-blur-xl border-t border-border shadow-lg safe-area-bottom animate-fade-in"
        role="navigation"
        aria-label="Mobile bottom navigation"
      >
        <div className="flex justify-around items-center h-16 px-2">
          {links.map(renderLink)}
          {isAdmin && (
            <button
              onClick={() => setShowMoreMenu(!showMoreMenu)}
              aria-label="More options"
              aria-expanded={showMoreMenu}
              aria-haspopup="menu"
              className={cn(
                "relative flex flex-col items-center justify-center flex-1 h-full group touch-target",
                "min-h-[44px] min-w-[44px] px-2"
              )}
            >
              <MoreHorizontal className="h-5 w-5 text-foreground group-hover:text-primary transition-all duration-300" />
              <span className="text-xs mt-1 text-foreground group-hover:text-primary transition-all duration-300">More</span>
            </button>
          )}
        </div>
      </nav>

      {isAdmin && showMoreMenu && (
        <>
          <div 
            onClick={() => setShowMoreMenu(false)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setShowMoreMenu(false)
              }
            }}
            role="button"
            tabIndex={0}
            aria-label="Close more menu"
            className="md:hidden fixed inset-0 bg-black/50 backdrop-blur-sm z-40 animate-fade-in"
          />
          <div 
            className="md:hidden fixed bottom-20 right-4 w-56 max-w-[calc(100vw-2rem)] bg-card rounded-2xl shadow-lg border border-border z-50 overflow-hidden animate-fade-in"
            role="menu"
            aria-label="Additional navigation options"
          >
            <div className="py-2">
              {adminMoreSections.map((section) => (
                <div key={section.title}>
                  <div className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {section.title}
                  </div>
                  {section.links.map(({ to, icon: Icon, label }) => {
                    const isActive = location.pathname === to
                    return (
                      <Link 
                        key={to} 
                        to={to} 
                        onClick={() => setShowMoreMenu(false)}
                        role="menuitem"
                        className={cn(
                          "flex items-center gap-3 px-3 py-3 transition-colors touch-target",
                          "min-h-[44px]",
                          isActive 
                            ? "bg-primary/10 text-primary font-medium" 
                            : "text-foreground hover:bg-accent"
                        )}
                      >
                        <Icon className="h-5 w-5 flex-shrink-0" />
                        <span className="text-sm">{label}</span>
                      </Link>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  )
})

