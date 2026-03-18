import React, { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { BottomNavigation } from '@/components/ui/BottomNavigation'
import { MobilePageHeader } from '@/components/ui/MobilePageHeader'
import { DesktopSidebar } from './DesktopSidebar'
import { Header } from './Header'
import { useAuth } from '@/contexts/AuthContext'
import { SidebarProvider, useSidebar } from '@/contexts/SidebarContext'
import { useResponsive } from '@/hooks/useResponsive'
import { useScrollRestoration } from '@/hooks/useScrollRestoration'
import { SkipLink } from '@/components/ui/SkipLink'
import { NotificationBell } from '@/components/student/NotificationBell'
import { UserMenu } from '@/components/ui/UserMenu'
import { RouteTransition } from '@/components/smoothui/page-transition'
import { designTokens } from '@/design-system/tokens'
import { APP_MAIN_CONTENT_ID } from '@/lib/accessibility-utils'
import {
  Home,
  FileText,
  Bell,
  Settings,
  LayoutDashboard,
  Users,
  CreditCard,
  Calendar,
  GraduationCap,
  FileSearch,
} from 'lucide-react'

interface AppLayoutProps {
  children: ReactNode
}

/** Map route paths to human-readable page titles for the mobile header */
const pageTitles: Record<string, string> = {
  '/student/dashboard': 'Dashboard',
  '/student/application-wizard': 'Application',
  '/apply': 'Application',
  '/student/payment': 'Payment',
  '/student/interview': 'Interview',
  '/student/settings': 'Settings',
  '/student/notifications': 'Notifications',
  '/student/status': 'Application Status',
  '/admin/dashboard': 'Admin Dashboard',
  '/admin/applications': 'Applications',
  '/admin/users': 'Users',
  '/admin/programs': 'Programs',
  '/admin/intakes': 'Intakes',
  '/admin/audit': 'Audit Trail',
  '/admin/settings': 'Settings',
}

/** Routes that should show a back button on mobile */
const backRoutes = new Set([
  '/student/application-wizard',
  '/apply',
  '/student/payment',
  '/student/interview',
  '/student/status',
  '/admin/applications',
  '/admin/users',
  '/admin/programs',
  '/admin/intakes',
  '/admin/audit',
])

/** Admin bottom nav items */
const adminNavItems = [
  { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/applications', label: 'Apps', icon: FileText },
  { href: '/admin/programs', label: 'Programs', icon: GraduationCap },
  { href: '/admin/intakes', label: 'Intakes', icon: Calendar },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/audit', label: 'Audit', icon: FileSearch },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
]

/** Student bottom nav items kept in parity with desktop student navigation */
const studentNavItems = [
  { href: '/student/dashboard', label: 'Dashboard', icon: Home },
  { href: '/student/application-wizard', label: 'Applications', icon: FileText },
  { href: '/student/payment', label: 'Payment', icon: CreditCard },
  { href: '/student/interview', label: 'Interview', icon: Calendar },
  { href: '/student/notifications', label: 'Notifications', icon: Bell },
  { href: '/student/settings', label: 'Profile & Settings', icon: Settings },
]

const AppLayoutContent = React.memo(function AppLayoutContent({ children }: AppLayoutProps) {
  const { user, isAdmin } = useAuth()
  const { collapsed } = useSidebar()
  const { isMobile } = useResponsive()
  const location = useLocation()
  const navigate = useNavigate()

  // Apply scroll restoration to preserve positions across tab switches
  useScrollRestoration()

  if (!user) {
    return <>{children}</>
  }

  const collapsedWidth = designTokens.layout.sidebarCollapsed
  const expandedWidth = designTokens.layout.sidebarExpanded

  // Determine mobile header props from current route
  const pageTitle = pageTitles[location.pathname] || 'MIHAS'
  const showBack = backRoutes.has(location.pathname) || location.pathname.includes('/application/')
  const handleBack = () => navigate(-1)
  const isStudentRoute = location.pathname.startsWith('/student')

  const mobileActions = !isAdmin && isStudentRoute ? (
    <div className="flex items-center justify-end gap-1 pr-1">
      <NotificationBell />
      <UserMenu />
    </div>
  ) : undefined

  // Pick nav items based on role
  const navItems = isAdmin ? adminNavItems : studentNavItems

  return (
    <div className="flex min-h-screen w-full overflow-x-hidden">
      <SkipLink href={`#${APP_MAIN_CONTENT_ID}`}>Skip to main content</SkipLink>
      <DesktopSidebar />

      <div className="flex flex-col flex-1 min-w-0">
        {/* Desktop header */}
        <Header />

        {/* Mobile page header — visible below md */}
        <MobilePageHeader
          title={pageTitle}
          showBack={showBack}
          onBack={handleBack}
          actions={mobileActions}
        />

        <main
          id={APP_MAIN_CONTENT_ID}
          className="pb-20 md:pb-6 pt-14 md:pt-0 min-h-screen overflow-x-hidden transition-all duration-300 ease-in-out"
          style={{
            paddingTop: isMobile ? '3.5rem' : 'var(--header-height)',
            marginLeft: isMobile ? 0 : (collapsed ? collapsedWidth : expandedWidth),
            width: isMobile ? '100%' : `calc(100% - ${collapsed ? collapsedWidth : expandedWidth}px)`,
          }}
        >
          <RouteTransition mode="fade">
            {children}
          </RouteTransition>
        </main>
      </div>

      {/* Canonical bottom navigation — mobile only */}
      <BottomNavigation
        items={navItems}
        isAuthenticated
      />
    </div>
  )
})

export const AppLayout = React.memo(function AppLayout({ children }: AppLayoutProps) {
  return (
    <SidebarProvider>
      <AppLayoutContent>{children}</AppLayoutContent>
    </SidebarProvider>
  )
})
