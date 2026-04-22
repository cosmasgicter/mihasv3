import React from 'react'
import { ShieldCheck, User } from 'lucide-react'
import { UserMenu } from '@/components/ui/UserMenu'
import { NotificationBell } from '@/components/student/NotificationBell'
import { useAuth } from '@/contexts/AuthContext'
import { useProfileQuery } from '@/hooks/auth/useProfileQuery'
import { useSidebar } from '@/contexts/SidebarContext'
import { designTokens } from '@/design-system/tokens'
import { useResponsive } from '@/hooks/useResponsive'
import { useScrollDirection } from '@/hooks/useScrollDirection'
import { getDisplayName } from '@/lib/userDisplayName'

export const Header = React.memo(function Header() {
  const { user, isAdmin } = useAuth()
  const { profile } = useProfileQuery()
  const { collapsed } = useSidebar()
  const { isMobile } = useResponsive()
  const scrollDirection = useScrollDirection()

  if (!user) return null

  const fullName = getDisplayName(profile, user)

  const collapsedWidth = designTokens.layout.sidebarCollapsed
  const expandedWidth = designTokens.layout.sidebarExpanded

  const headerStyle = {
    left: isMobile ? 0 : (collapsed ? collapsedWidth : expandedWidth),
    width: isMobile ? '100%' : `calc(100% - ${collapsed ? collapsedWidth : expandedWidth}px)`
  }

  const transformValue = scrollDirection === 'down' ? 'translateY(-100%)' : 'translateY(0)'

  return (
    <header
      className="fixed top-0 z-40 hidden border-b border-border/40 bg-background/80 backdrop-blur-xl transition-transform duration-300 app-safe-area md:block"
      style={{
        ...headerStyle,
        transform: transformValue
      }}
    >
      <div className="mx-auto flex h-16 max-w-[1500px] items-center justify-between px-6">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1 overflow-hidden">
          <div className="flex min-w-0 items-center gap-3 rounded-full border border-border/70 bg-card/80 px-3 py-2 shadow-sm">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              {isAdmin ? <ShieldCheck className="h-4 w-4" /> : <User className="h-4 w-4" />}
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {isAdmin ? 'Admin workspace' : 'Student workspace'}
              </p>
              <h2 className="truncate text-sm font-semibold text-foreground">{fullName}</h2>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          {!isAdmin && <NotificationBell />}
          <UserMenu />
        </div>
      </div>
    </header>
  )
})
