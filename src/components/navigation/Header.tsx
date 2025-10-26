import React from 'react'
import { User } from 'lucide-react'
import { UserMenu } from '@/components/ui/UserMenu'
import { NotificationBell } from '@/components/student/NotificationBell'
import { useAuth } from '@/contexts/AuthContext'
import { useProfileQuery } from '@/hooks/auth/useProfileQuery'
import { useSidebar } from '@/contexts/SidebarContext'
import { designTokens } from '@/design-system/tokens'
import { useResponsive } from '@/hooks/useResponsive'
import { useScrollDirection } from '@/hooks/useScrollDirection'

export const Header = React.memo(function Header() {
  const { user, isAdmin } = useAuth()
  const { profile } = useProfileQuery()
  const { collapsed } = useSidebar()
  const { isMobile } = useResponsive()
  const scrollDirection = useScrollDirection()

  if (!user) return null

  const fullName = profile?.full_name || user.user_metadata?.full_name || 'User'

  const collapsedWidth = designTokens.layout.sidebarCollapsed
  const expandedWidth = designTokens.layout.sidebarExpanded

  return (
    <header
      className="fixed top-0 z-40 bg-card/80 backdrop-blur-xl border-b border-border shadow-sm transition-transform duration-300 app-safe-area"
      style={{
        transform: scrollDirection === 'down' ? 'translateY(-100%)' : 'translateY(0)',
        left: isMobile ? 0 : (collapsed ? collapsedWidth : expandedWidth),
        width: isMobile ? '100%' : `calc(100% - ${collapsed ? collapsedWidth : expandedWidth}px)`
      }}
    >
      <div className="flex items-center justify-between h-16 px-3 sm:px-4 md:px-6">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1 overflow-hidden">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2 min-w-0 max-w-full" style={{ fontSize: 'var(--type-sm)' }}>
            <User style={{ width: 'var(--icon-size)', height: 'var(--icon-size)' }} />
            <span className="truncate">{fullName}</span>
          </h2>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          {!isAdmin && <NotificationBell />}
          <UserMenu />
        </div>
      </div>
    </header>
  )
})
