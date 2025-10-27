import React from 'react'
import { Home, FileText, Bell, User, LayoutDashboard, Users, ChevronLeft, ChevronRight, GraduationCap, Calendar, BarChart3, Settings, Shield, Workflow, Brain, FileSearch } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useSidebar } from '@/contexts/SidebarContext'
import { designTokens } from '@/design-system/tokens'

export const DesktopSidebar = React.memo(function DesktopSidebar() {
  const location = useLocation()
  const { user, isAdmin } = useAuth()
  const { collapsed, setCollapsed } = useSidebar()

  if (!user) return null

  const studentLinks = [
    { to: '/student/dashboard', icon: Home, label: 'Dashboard' },
    { to: '/apply', icon: FileText, label: 'Application' },
    { to: '/student/notifications', icon: Bell, label: 'Notifications' },
    { to: '/student/profile', icon: User, label: 'Profile' },
  ]

  const adminLinks = [
    { to: '/admin/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/admin/applications', icon: FileText, label: 'Applications' },
    { to: '/admin/users', icon: Users, label: 'Users' },
    { to: '/admin/programs', icon: GraduationCap, label: 'Programs' },
    { to: '/admin/intakes', icon: Calendar, label: 'Intakes' },
    { to: '/admin/analytics', icon: BarChart3, label: 'Analytics' },
    { to: '/admin/ai-insights', icon: Brain, label: 'AI Insights' },
    { to: '/admin/workflow', icon: Workflow, label: 'Workflow' },
    { to: '/admin/roles', icon: Shield, label: 'Roles' },
    { to: '/admin/audit', icon: FileSearch, label: 'Audit Trail' },
    { to: '/admin/settings', icon: Settings, label: 'Settings' },
  ]

  const links = isAdmin ? adminLinks : studentLinks

  return (
    <aside
      className="hidden md:flex flex-col fixed left-0 top-0 h-screen bg-card/80 backdrop-blur-xl border-r border-border shadow-xl z-40 transition-all duration-300 ease-in-out"
      style={{ width: collapsed ? 'var(--sidebar-collapsed)' : 'var(--sidebar-expanded)' }}
    >
      <div className="flex items-center justify-between p-4 border-b border-border">
        {!collapsed && (
          <h1 className="text-xl font-bold text-gray-900 truncate animate-fade-in" style={{ maxWidth: '12rem' }}>
            MIHAS-KATC
          </h1>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="p-2 rounded-lg hover:bg-accent transition-colors"
        >
          {collapsed ? <ChevronRight style={{ width: 'var(--icon-size)', height: 'var(--icon-size)' }} /> : <ChevronLeft style={{ width: 'var(--icon-size)', height: 'var(--icon-size)' }} />}
        </button>
      </div>

      <nav className="flex-1 p-4 space-y-2">
        {links.map(({ to, icon: Icon, label }) => {
          const isActive = location.pathname === to
          return (
            <Link
              key={to}
              to={to}
              aria-current={isActive ? 'page' : undefined}
              className="relative flex items-center gap-3 px-3 py-3 rounded-lg group overflow-hidden"
            >
              {isActive && (
                <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-secondary/10 transition-all duration-300" />
              )}
              <Icon
                style={{ width: 'var(--icon-size)', height: 'var(--icon-size)' }}
                className={`transition-all duration-300 relative z-10 ${
                  isActive
                    ? 'text-primary'
                    : 'text-gray-900 group-hover:text-primary'
                }`}
              />
              {!collapsed && (
                <span
                  className={`font-medium transition-colors relative z-10 truncate animate-fade-in ${
                    isActive
                      ? 'text-primary'
                      : 'text-gray-900 group-hover:text-primary'
                  }`}
                  style={{ fontSize: 'var(--type-sm)' }}
                >
                  {label}
                </span>
              )}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
})
