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
import { useCapabilities } from '@/contexts/CapabilityContext'

/** The super-admin shell's persistent scope label (task 30.5, R17.8). */
export const PLATFORM_SCOPE_LABEL = 'Platform admin · all schools'

export const Header = React.memo(function Header() {
  const { user, isAdmin } = useAuth()
  const { profile } = useProfileQuery()
  const { collapsed } = useSidebar()
  const { isMobile } = useResponsive()
  const scrollDirection = useScrollDirection()
  // The backend's `is_super_admin`, never a role string: the platform shell is
  // marked so a super admin always knows their actions reach every school.
  const { isSuperAdmin } = useCapabilities()
  const platformShell = isAdmin && isSuperAdmin

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
      className={`fixed top-0 z-50 hidden border-b transition-transform duration-300 app-safe-area md:block ${
        platformShell ? 'border-transparent' : 'border-border/40 bg-background'
      }`}
      style={{
        ...headerStyle,
        transform: transformValue,
        ...(platformShell ? { backgroundColor: designTokens.colors.admin.text } : {}),
      }}
      data-shell-scope={platformShell ? 'platform' : undefined}
    >
      <div className="mx-auto flex h-16 max-w-[1500px] items-center justify-between px-6">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1 overflow-hidden">
          {/* A row, not a pill-shaped card inside the header (task 31.3, R21.5). */}
          <div className="flex min-w-0 items-center gap-3 py-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              {isAdmin ? <ShieldCheck className="h-4 w-4" /> : <User className="h-4 w-4" />}
            </span>
            {/* Text with a label, not a heading: the page's H1 is the first heading (task 25.4). */}
            <div
              className="min-w-0"
              role="group"
              aria-label={`${isAdmin ? 'Admin workspace' : 'Student workspace'}: ${fullName}`}
            >
              <p className={`text-xs font-semibold uppercase tracking-[0.18em] ${platformShell ? 'text-white' : 'text-muted-foreground'}`}>
                {isAdmin ? 'Admin workspace' : 'Student workspace'}
              </p>
              <p className={`truncate text-sm font-semibold ${platformShell ? 'text-white' : 'text-foreground'}`}>{fullName}</p>
            </div>
          </div>
          {platformShell && (
            <p className="truncate text-sm font-semibold text-white" data-testid="platform-scope-label">
              {PLATFORM_SCOPE_LABEL}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          {!isAdmin && <NotificationBell />}
          <UserMenu />
        </div>
      </div>
    </header>
  )
})
