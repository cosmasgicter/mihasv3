import { Home, FileText, Bell, User, LayoutDashboard, Users, ChevronLeft, ChevronRight } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { motion, AnimatePresence } from 'framer-motion'
import { useState } from 'react'
import { ThemeToggle } from '@/components/theme/ThemeToggle'

export function DesktopSidebar() {
  const location = useLocation()
  const { user, isAdmin } = useAuth()
  const [collapsed, setCollapsed] = useState(false)

  if (!user) return null

  const studentLinks = [
    { to: '/student/dashboard', icon: Home, label: 'Dashboard' },
    { to: '/student/application', icon: FileText, label: 'Application' },
    { to: '/student/status', icon: Bell, label: 'Status' },
    { to: '/student/profile', icon: User, label: 'Profile' },
  ]

  const adminLinks = [
    { to: '/admin/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/admin/applications', icon: FileText, label: 'Applications' },
    { to: '/admin/users', icon: Users, label: 'Users' },
    { to: '/admin/profile', icon: User, label: 'Profile' },
  ]

  const links = isAdmin ? adminLinks : studentLinks

  return (
    <motion.aside
      animate={{ width: collapsed ? 80 : 256 }}
      className="hidden md:flex flex-col fixed left-0 top-0 h-screen bg-white dark:bg-gray-800/80 dark:bg-gray-900/80 backdrop-blur-xl border-r border-gray-200 dark:border-gray-700 dark:border-gray-800 shadow-xl z-40"
      transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
    >
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 dark:border-gray-800">
        <AnimatePresence mode="wait">
          {!collapsed && (
            <motion.h1
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 bg-clip-text text-transparent"
            >
              MIHAS
            </motion.h1>
          )}
        </AnimatePresence>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-2 rounded-lg hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-800 transition-colors"
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
              className="relative flex items-center gap-3 px-3 py-3 rounded-lg group overflow-hidden"
            >
              {isActive && (
                <motion.div
                  layoutId="activeSidebar"
                  className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-purple-500/10 dark:from-blue-400/10 dark:to-purple-400/10"
                  transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                />
              )}
              <Icon
                className={`h-5 w-5 transition-all duration-300 relative z-10 ${
                  isActive
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-gray-600 dark:text-gray-400 group-hover:text-blue-500 dark:group-hover:text-blue-300'
                }`}
              />
              <AnimatePresence mode="wait">
                {!collapsed && (
                  <motion.span
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    className={`text-sm font-medium transition-colors relative z-10 ${
                      isActive
                        ? 'text-blue-600 dark:text-blue-400'
                        : 'text-gray-700 dark:text-gray-300 group-hover:text-blue-500 dark:group-hover:text-blue-300'
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

      <div className="p-4 border-t border-gray-200 dark:border-gray-700 dark:border-gray-800">
        <div className={`flex ${collapsed ? 'justify-center' : 'justify-end'}`}>
          <ThemeToggle />
        </div>
      </div>
    </motion.aside>
  )
}
