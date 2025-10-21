import React from 'react'
import { Bell, User } from 'lucide-react'
import { UserMenu } from '@/components/ui/UserMenu'
import { NotificationBell } from '@/components/student/NotificationBell'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { useAuth } from '@/contexts/AuthContext'
import { useProfileQuery } from '@/hooks/auth/useProfileQuery'
import { useSidebar } from '@/contexts/SidebarContext'
import { useResponsive } from '@/hooks/useResponsive'
import { useScrollDirection } from '@/hooks/useScrollDirection'
import { motion } from 'framer-motion'

export const Header = React.memo(function Header() {
  const { user, isAdmin } = useAuth()
  const { profile } = useProfileQuery()
  const { collapsed } = useSidebar()
  const { isMobile } = useResponsive()
  const scrollDirection = useScrollDirection()

  if (!user) return null

  const fullName = profile?.full_name || user.user_metadata?.full_name || 'User'

  return (
    <motion.header
      initial={{ y: -100 }}
      animate={{ 
        y: scrollDirection === 'down' ? -100 : 0, 
        left: isMobile ? 0 : (collapsed ? 80 : 256),
        width: isMobile ? '100%' : `calc(100% - ${collapsed ? 80 : 256}px)`
      }}
      className="fixed top-0 z-40 bg-card/80 backdrop-blur-xl border-b border-border shadow-sm"
      transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
    >
      <div className="flex items-center justify-between h-16 px-3 sm:px-4 md:px-6">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1 overflow-hidden">
          <h2 className="text-sm sm:text-base md:text-lg font-semibold text-foreground flex items-center gap-2 min-w-0 max-w-full">
            <motion.div
              animate={{ rotate: [0, 10, -10, 0] }}
              transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
              className="flex-shrink-0"
            >
              <User className="h-5 w-5" />
            </motion.div>
            <span className="truncate">{fullName}</span>
          </h2>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          {!isAdmin && <NotificationBell />}
          <UserMenu />
        </div>
      </div>
    </motion.header>
  )
})
