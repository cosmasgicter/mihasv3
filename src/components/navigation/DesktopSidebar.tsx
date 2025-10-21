import React from 'react'
import { Home, FileText, Bell, User, LayoutDashboard, Users, ChevronLeft, ChevronRight, GraduationCap, Calendar, BarChart3, Settings, Shield, Workflow, Brain, FileSearch } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useSidebar } from '@/contexts/SidebarContext'
import { motion, AnimatePresence } from 'framer-motion'

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
    <motion.aside
      animate={{ width: collapsed ? 80 : 256 }}
      className="hidden md:flex flex-col fixed left-0 top-0 h-screen bg-card/80 backdrop-blur-xl border-r border-border shadow-xl z-40"
      transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
    >
      <div className="flex items-center justify-between p-4 border-b border-border">
        <AnimatePresence mode="wait">
          {!collapsed && (
            <motion.h1
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-xl font-bold bg-gradient-to-r from-gradient-from to-gradient-to bg-clip-text text-transparent truncate max-w-[150px]"
            >
              MIHAS
            </motion.h1>
          )}
        </AnimatePresence>
        <button
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="p-2 rounded-lg hover:bg-accent transition-colors"
        >
          {collapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
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
                <motion.div
                  layoutId="activeSidebar"
                  className="absolute inset-0 bg-gradient-to-r from-primary/10 to-secondary/10"
                  transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                />
              )}
              <Icon
                className={`h-5 w-5 transition-all duration-300 relative z-10 ${
                  isActive
                    ? 'text-primary'
                    : 'text-foreground group-hover:text-primary'
                }`}
              />
              <AnimatePresence mode="wait">
                {!collapsed && (
                  <motion.span
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    className={`text-sm font-medium transition-colors relative z-10 truncate ${
                      isActive
                        ? 'text-primary'
                        : 'text-foreground group-hover:text-primary'
                    }`}
                  >
                    {label}
                  </motion.span>
                )}
              </AnimatePresence>
            </Link>
          )
        })}
      </nav>


    </motion.aside>
  )
})
