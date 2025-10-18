import { Bell } from 'lucide-react'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { UserMenu } from '@/components/ui/UserMenu'
import { NotificationBell } from '@/components/student/NotificationBell'
import { useAuth } from '@/contexts/AuthContext'
import { useProfileQuery } from '@/hooks/auth/useProfileQuery'
import { motion } from 'framer-motion'

export function Header() {
  const { user } = useAuth()
  const { profile } = useProfileQuery()

  if (!user) return null

  const firstName = profile?.full_name?.split(' ')[0] || user.email?.split('@')[0] || 'User'

  return (
    <motion.header
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      className="fixed top-0 left-0 right-0 md:left-64 z-30 bg-white dark:bg-gray-800/80 backdrop-blur-xl border-b border-gray-200 dark:border-gray-700 shadow-sm"
    >
      <div className="flex items-center justify-between h-16 px-4 md:px-6">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 dark:text-white">
            Welcome back, {firstName}
          </h2>
        </div>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          <NotificationBell />
          <UserMenu />
        </div>
      </div>
    </motion.header>
  )
}
