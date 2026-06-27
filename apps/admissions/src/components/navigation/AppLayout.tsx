import React, { ReactNode } from 'react'
import '@/styles/admin-colors.css'
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
import { BuildVersionBadge } from '@/components/ui/BuildVersionBadge'
import { useSignOutAction } from '@/hooks/useSignOutAction'
import { useToastStore } from '@/hooks/useToast'
import { RouteTransition } from '@/components/smoothui/page-transition'
import { designTokens } from '@/design-system/tokens'
import { APP_MAIN_CONTENT_ID } from '@/lib/accessibility-utils'
import { cn } from '@/lib/utils'
import {
  LogOut,
  UserCircle2,
} from 'lucide-react'
import { toError } from '@/lib/toError'
import { useTenantNavItem } from './tenantNav'
import { useCapabilities } from '@/contexts/CapabilityContext'
import { filterAdminNavItems } from './adminNavAccess'
import { pathFor, routeById, type ProductRouteDefinition } from '@/routes/routeRegistry'

interface AppLayoutProps {
  children: ReactNode
}

/** Map route paths to human-readable page titles for the mobile header */
const pageTitles: Record<string, string> = {
  [pathFor('student.dashboard')]: 'Dashboard',
  [pathFor('student.applicationWizard')]: 'Application',
  '/apply': 'Application',
  [pathFor('student.payment')]: 'Payment',
  [pathFor('student.interview')]: 'Interview',
  [pathFor('student.settings')]: 'Settings',
  [pathFor('student.notifications')]: 'Notifications',
  [pathFor('student.status')]: 'Application Status',
  [pathFor('admin.dashboard')]: 'Admin Dashboard',
  [pathFor('admin.applications')]: 'Applications',
  [pathFor('admin.users')]: 'Users',
  [pathFor('admin.tenants')]: 'Tenants',
  [pathFor('admin.programs')]: 'Programs',
  [pathFor('admin.intakes')]: 'Intakes',
  [pathFor('admin.audit')]: 'Audit Trail',
  [pathFor('admin.programFees')]: 'Program Fees',
  [pathFor('admin.settings')]: 'Settings',
}

/** Routes that should show a back button on mobile */
const backRoutes = new Set([
  pathFor('student.applicationWizard'),
  '/apply',
  pathFor('student.payment'),
  pathFor('student.interview'),
  pathFor('student.status'),
  pathFor('admin.applications'),
  pathFor('admin.users'),
  pathFor('admin.tenants'),
  pathFor('admin.programs'),
  pathFor('admin.intakes'),
  pathFor('admin.audit'),
  pathFor('admin.programFees'),
])

const navItemFromRoute = (route: ProductRouteDefinition, labelOverride?: string) => ({
  href: route.path,
  label: labelOverride ?? route.nav!.label,
  icon: route.nav!.icon,
  activeMatchPaths: route.nav?.activeMatchPaths ?? [],
})

/** Admin bottom nav items. The tenant item (/admin/tenants) is injected at
 *  render time from the shared capability-gated helper (R13.4). */
const adminNavItems = [
  navItemFromRoute(routeById('admin.dashboard')),
  navItemFromRoute(routeById('admin.applications'), 'Apps'),
  navItemFromRoute(routeById('admin.programs')),
  navItemFromRoute(routeById('admin.intakes')),
  navItemFromRoute(routeById('admin.users')),
  navItemFromRoute(routeById('admin.programFees'), 'Fees'),
  navItemFromRoute(routeById('admin.audit'), 'Audit'),
  navItemFromRoute(routeById('admin.settings')),
]

/** Student mobile navigation (4 primary + overflow in More menu) */
const studentNavItems = [
  navItemFromRoute(routeById('student.dashboard')),
  navItemFromRoute(routeById('student.applicationWizard')),
  navItemFromRoute(routeById('student.payment')),
  navItemFromRoute(routeById('student.interview')),
  navItemFromRoute(routeById('student.notifications')),
  navItemFromRoute(routeById('student.settings')),
  navItemFromRoute(routeById('student.status')),
]

const studentLogoutNavItem = { href: pathFor('auth.signIn'), label: 'Logout', icon: LogOut }

const AppLayoutContent = React.memo(function AppLayoutContent({ children }: AppLayoutProps) {
  const { user, isAdmin } = useAuth()
  const { signOut, isSigningOut } = useSignOutAction()
  const toast = useToastStore()
  const { collapsed } = useSidebar()
  const { isMobile } = useResponsive()
  const location = useLocation()
  const navigate = useNavigate()
  const tenantNavItem = useTenantNavItem()
  const caps = useCapabilities()

  // Apply scroll restoration to preserve positions across tab switches
  useScrollRestoration()

  if (!user) {
    return <>{children}</>
  }

  const collapsedWidth = designTokens.layout.sidebarCollapsed
  const expandedWidth = designTokens.layout.sidebarExpanded

  const resolvePageTitle = (pathname: string): string => {
    const exactMatch = pageTitles[pathname]
    if (exactMatch) return exactMatch
    const nestedMatch = Object.entries(pageTitles).find(([path]) =>
      pathname.startsWith(`${path}/`)
    )?.[1]
    return nestedMatch || 'Beanola'
  }

  // Determine mobile header props from current route
  const pageTitle = resolvePageTitle(location.pathname)
  const showBack = backRoutes.has(location.pathname) || location.pathname.includes('/application/')
  const handleBack = () => navigate(-1)
  const isStudentRoute = location.pathname.startsWith('/student')
  const isWizardRoute = location.pathname === '/apply' || location.pathname.startsWith(pathFor('student.applicationWizard'))
  const handleSignOut = async () => {
    try {
      await signOut()
      toast.success('Signed out', 'You have been signed out successfully.')
    } catch (error) {
      const message = toError(error).message || 'Please try again.'
      toast.error('Sign out failed', message)
    }
  }

  const mobileActions = !isAdmin && isStudentRoute ? (
    <div className="flex items-center justify-end gap-1 pr-1">
      <button
        type="button"
        onClick={() => navigate(pathFor('student.settings'))}
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-accent"
        aria-label="Open profile settings"
      >
        <UserCircle2 className="h-5 w-5" />
      </button>
      <NotificationBell />
      <button
        type="button"
        onClick={() => { void handleSignOut() }}
        disabled={isSigningOut}
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-accent disabled:opacity-60"
        aria-label="Log out"
        aria-busy={isSigningOut}
      >
        <LogOut className={cn('h-5 w-5', isSigningOut && 'opacity-60')} />
      </button>
    </div>
  ) : isAdmin ? (
    <div className="flex items-center justify-end gap-1 pr-1">
      <button
        type="button"
        onClick={() => { void handleSignOut() }}
        disabled={isSigningOut}
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-accent disabled:opacity-60"
        aria-label="Sign out"
        aria-busy={isSigningOut}
      >
        <LogOut className={cn('h-5 w-5', isSigningOut && 'opacity-60')} />
      </button>
    </div>
  ) : undefined

  // Pick nav items based on role
  const resolvedAdminNavItems = (() => {
    const visibleItems = filterAdminNavItems(adminNavItems, caps)
    if (!tenantNavItem) return visibleItems
    const usersIndex = visibleItems.findIndex((item) => item.href === pathFor('admin.users'))
    const insertAt = usersIndex >= 0 ? usersIndex + 1 : visibleItems.length
    const items = [...visibleItems]
    items.splice(insertAt, 0, {
      href: tenantNavItem.to,
      label: tenantNavItem.label,
      icon: tenantNavItem.icon,
      activeMatchPaths: [],
    })
    return items
  })()

  const navItems = isAdmin
    ? [
      ...resolvedAdminNavItems,
      {
        ...studentLogoutNavItem,
        onClick: () => { void handleSignOut() },
        activeMatchPaths: [],
      },
    ]
    : [
      ...studentNavItems,
      {
        ...studentLogoutNavItem,
        onClick: () => { void handleSignOut() },
        activeMatchPaths: [],
      },
    ]

  return (
    <div className="flex min-h-screen w-full overflow-x-hidden bg-muted/30">
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
          tabIndex={-1}
          className={cn(
            'flex-1 scroll-smooth overflow-x-hidden transition-all duration-300 ease-in-out',
            isWizardRoute ? 'pb-6 md:pb-6' : 'pb-20 md:pb-6'
          )}
          style={{
            paddingTop: isMobile ? '4rem' : 'var(--header-height)',
            marginLeft: isMobile ? 0 : (collapsed ? collapsedWidth : expandedWidth),
            width: isMobile ? '100%' : `calc(100% - ${collapsed ? collapsedWidth : expandedWidth}px)`,
          }}
        >
          <RouteTransition mode="fade">
            {children}
          </RouteTransition>
          <div className="px-4 pb-4 pt-2 md:px-6">
            <BuildVersionBadge className="ml-auto w-fit" />
          </div>
        </main>
      </div>

      {/* Canonical bottom navigation — mobile only */}
      {!isWizardRoute && (
        <BottomNavigation
          items={navItems}
          isAuthenticated
          overflowMode
        />
      )}
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
