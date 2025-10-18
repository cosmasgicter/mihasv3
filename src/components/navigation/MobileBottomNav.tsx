import { Home, FileText, Bell, User, LayoutDashboard, Users } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { motion } from 'framer-motion'

export function MobileBottomNav() {
  const location = useLocation()
  const { user, isAdmin } = useAuth()

  if (!user) return null

  const studentLinks = [
    { to: '/student/dashboard', icon: Home, label: 'Home' },
    { to: '/apply', icon: FileText, label: 'Apply' },
    { to: '/student/notifications', icon: Bell, label: 'Alerts' },
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
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-gray-800/80 backdrop-blur-xl border-t border-gray-200 dark:border-gray-700 shadow-lg safe-area-bottom">
      <div className="flex justify-around items-center h-16 px-2">
        {links.map(({ to, icon: Icon, label }) => {
          const isActive = location.pathname === to
          return (
            <Link
              key={to}
              to={to}
              className="relative flex flex-col items-center justify-center flex-1 h-full group min-w-[60px]"
            >
              {isActive && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-purple-500/10 dark:from-blue-400/10 dark:to-purple-400/10 rounded-lg"
                  transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                />
              )}
              <Icon
                className={`h-5 w-5 transition-all duration-300 ${
                  isActive
                    ? 'text-blue-600 dark:text-blue-400 scale-110'
                    : 'text-gray-600 dark:text-gray-400 group-hover:text-blue-500 dark:group-hover:text-blue-300 group-hover:scale-105'
                }`}
              />
              <span
                className={`text-xs mt-1 transition-all duration-300 ${
                  isActive
                    ? 'text-blue-600 dark:text-blue-400 font-medium'
                    : 'text-gray-600 dark:text-gray-400 group-hover:text-blue-500 dark:group-hover:text-blue-300'
                }`}
              >
                {label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
