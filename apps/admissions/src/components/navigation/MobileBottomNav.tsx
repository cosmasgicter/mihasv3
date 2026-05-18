import React, { useState } from 'react'
import { Home, FileText, Bell, LayoutDashboard, Users, MoreHorizontal, GraduationCap, Calendar, Settings, FileSearch, CreditCard, MessageSquare, Clock } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'


export const MobileBottomNav = React.memo(function MobileBottomNav() {
  const location = useLocation()
  const { user, isAdmin } = useAuth()
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const [showStudentMore, setShowStudentMore] = useState(false)

  if (!user) return null

  const studentMainLinks = [
    { to: '/student/dashboard', icon: Home, label: 'Home' },
    { to: '/student/application-wizard', icon: FileText, label: 'Apply' },
    { to: '/student/notifications', icon: Bell, label: 'Alerts' },
  ]

  const studentMoreLinks = [
    { to: '/student/communications', icon: MessageSquare, label: 'Communications' },
    { to: '/student/history', icon: Clock, label: 'Activity History' },
    { to: '/student/payment', icon: CreditCard, label: 'Payments' },
    { to: '/student/interview', icon: Calendar, label: 'Interviews' },
    { to: '/student/settings', icon: Settings, label: 'Settings' },
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
      ]
    },
    {
      title: 'System',
      links: [
        { to: '/admin/audit', icon: FileSearch, label: 'Audit' },
        { to: '/admin/settings', icon: Settings, label: 'Settings' },
      ]
    },
  ]

  const links = isAdmin ? adminMainLinks : studentMainLinks

  const isRouteActive = (path: string) => {
    if (path === '/student/application-wizard') {
      return location.pathname === '/student/application-wizard' || location.pathname === '/apply'
    }

    return location.pathname === path
  }

  type NavLink = { to: string; icon: LucideIcon; label: string }

  const renderLink = ({ to, icon: Icon, label }: NavLink) => {
    const isActive = isRouteActive(to)
    return (
      <Link
        key={to}
        to={to}
        aria-current={isActive ? 'page' : undefined}
        aria-label={label}
        className={cn(
          "relative flex flex-col items-center justify-center flex-1 h-full group",
          "min-h-touch min-w-touch px-2 rounded-lg",
          "transition-colors duration-150",
          isActive && "bg-primary/10"
        )}
      >
        <Icon
          className={cn(
            "h-5 w-5 transition-colors duration-150",
            isActive
              ? "text-primary"
              : "text-muted-foreground group-hover:text-primary"
          )}
        />
        <span className={cn(
          "mt-1 text-[10px] truncate max-w-[60px] transition-colors duration-150",
          isActive ? "text-primary font-semibold" : "text-muted-foreground group-hover:text-primary"
        )}>
          {label}
        </span>
      </Link>
    )
  }

  return (
    <>
      <nav 
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-border/60 bg-background shadow-md safe-area-bottom animate-fade-in"
        role="navigation"
        aria-label="Mobile bottom navigation"
      >
        <div className="flex justify-around items-center h-16 px-2">
          {links.map(renderLink)}
          <button
            onClick={() => isAdmin ? setShowMoreMenu(!showMoreMenu) : setShowStudentMore(!showStudentMore)}
            aria-label="More options"
            aria-expanded={isAdmin ? showMoreMenu : showStudentMore}
            aria-haspopup="menu"
            className={cn(
              "relative flex flex-col items-center justify-center flex-1 h-full group",
              "min-h-touch min-w-touch px-2 rounded-lg",
              "transition-colors duration-150 hover:bg-muted/50"
            )}
          >
            <MoreHorizontal className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors duration-150" />
            <span className="text-[10px] mt-1 text-muted-foreground group-hover:text-primary transition-colors duration-150">More</span>
          </button>
        </div>
      </nav>

      {!isAdmin && showStudentMore && (
        <>
          <div 
            onClick={() => setShowStudentMore(false)}
            onKeyDown={(e) => { if (e.key === 'Escape') setShowStudentMore(false) }}
            role="button"
            tabIndex={0}
            aria-label="Close more menu"
            className="md:hidden fixed inset-0 bg-scrim/50 z-40 animate-fade-in"
          />
          <div 
            className="md:hidden fixed bottom-20 right-4 w-56 max-w-[calc(100vw-2rem)] bg-card rounded-lg shadow-md border border-border z-50 overflow-hidden animate-fade-in"
            role="menu"
            aria-label="Additional student options"
          >
            <div className="py-2">
              {studentMoreLinks.map(({ to, icon: Icon, label }) => {
                const isActive = isRouteActive(to)
                return (
                  <Link 
                    key={to} 
                    to={to} 
                    onClick={() => setShowStudentMore(false)}
                    role="menuitem"
                    className={cn(
                      "flex items-center gap-3 px-3 py-3 rounded-lg transition-colors duration-150",
                      "min-h-touch",
                      isActive ? "bg-primary/10 text-primary font-semibold" : "text-foreground hover:bg-muted/50"
                    )}
                  >
                    <Icon className="h-5 w-5 flex-shrink-0" />
                    <span className="text-sm">{label}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        </>
      )}

      {isAdmin && showMoreMenu && (
        <>
          <div 
            onClick={() => setShowMoreMenu(false)}
            onKeyDown={(e) => { if (e.key === 'Escape') setShowMoreMenu(false) }}
            role="button"
            tabIndex={0}
            aria-label="Close more menu"
            className="md:hidden fixed inset-0 bg-scrim/50 z-40 animate-fade-in"
          />
          <div 
            className="md:hidden fixed bottom-20 right-4 w-56 max-w-[calc(100vw-2rem)] bg-card rounded-lg shadow-md border border-border z-50 overflow-hidden animate-fade-in"
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
                          "flex items-center gap-3 px-3 py-3 rounded-lg transition-colors duration-150",
                          "min-h-touch",
                          isActive ? "bg-primary/10 text-primary font-semibold" : "text-foreground hover:bg-muted/50"
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
