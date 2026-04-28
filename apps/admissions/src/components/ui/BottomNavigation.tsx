/**
 * Bottom Navigation Component
 *
 * Mobile-optimized bottom navigation with safe area support and route prefetching.
 * Provides primary navigation actions for mobile users.
 *
 * Requirements: 4.1, 4.2, 10.5
 */

import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import {
  Home,
  Search,
  FileText,
  User,
  Settings,
  CreditCard,
  Calendar,
  MoreHorizontal,
} from 'lucide-react'
import { useSafeArea } from './SafeAreaProvider'
import { usePrefetch } from '@/hooks/usePrefetch'

export interface BottomNavItem {
  /** Route path */
  href: string
  /** Display label */
  label: string
  /** Icon component */
  icon: React.ComponentType<{ className?: string }>
  /** Whether this item requires authentication */
  requiresAuth?: boolean
  /** Badge count (optional) */
  badge?: number
  /** Optional click handler for non-route actions */
  onClick?: () => void
  /** Optional paths that should count as active (nested route support) */
  activeMatchPaths?: string[]
}

interface BottomNavigationProps {
  /** Navigation items */
  items?: BottomNavItem[]
  /** Additional class names */
  className?: string
  /** Whether user is authenticated */
  isAuthenticated?: boolean
  /** Custom active route checker */
  isActiveRoute?: (href: string) => boolean
  /** Enable overflow mode with max 4 visible tabs and a More menu */
  overflowMode?: boolean
  /** Max number of primary items visible when overflow mode is active */
  maxPrimaryItems?: number
}

/** Route-to-import map for prefetching route chunks on hover/focus */
const routeImports: Record<string, () => Promise<unknown>> = {
  '/student/dashboard': () => import('@/pages/student/Dashboard'),
  '/student/application-wizard': () => import('@/pages/student/applicationWizard/index'),
  '/student/payment': () => import('@/pages/student/Payment'),
  '/student/interview': () => import('@/pages/student/Interview'),
  '/student/notifications': () => import('@/pages/student/NotificationSettings'),
  '/student/settings': () => import('@/pages/student/Settings'),
  '/admin/dashboard': () => import('@/pages/admin/Dashboard'),
  '/admin/applications': () => import('@/pages/admin/Applications'),
  '/admin/programs': () => import('@/pages/admin/Programs'),
  '/admin/intakes': () => import('@/pages/admin/Intakes'),
  '/admin/users': () => import('@/pages/admin/Users'),
  '/admin/audit': () => import('@/pages/admin/AuditTrail'),
  '/admin/settings': () => import('@/pages/admin/Settings'),
}

/** Stable no-op import for routes without a prefetch target */
const noopImport = () => Promise.resolve()

export const defaultStudentNavItems: BottomNavItem[] = [
  { href: '/student/dashboard', label: 'Dashboard', icon: Home, requiresAuth: true },
  { href: '/student/payment', label: 'Payment', icon: CreditCard, requiresAuth: true },
  { href: '/student/interview', label: 'Interview', icon: Calendar, requiresAuth: true },
  { href: '/student/settings', label: 'Settings', icon: Settings, requiresAuth: true },
]

export const defaultPublicNavItems: BottomNavItem[] = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/track-application', label: 'Track', icon: Search },
  { href: '/auth/signin', label: 'Sign In', icon: User },
]

/** Individual bottom nav link with prefetch support */
function BottomNavLink({
  item,
  isActive,
  iconOnly = false,
  onNavigate,
  role,
}: {
  item: BottomNavItem
  isActive: boolean
  iconOnly?: boolean
  onNavigate?: () => void
  role?: string
}) {
  const Icon = item.icon
  const hasImport = item.href in routeImports
  const prefetch = usePrefetch(routeImports[item.href] ?? noopImport)
  const prefetchProps = hasImport ? prefetch : {}
  const baseClassName = cn(
    'flex flex-col items-center justify-center',
    'min-h-[44px] min-w-[44px] px-3 py-2',
    'rounded-lg',
    'transition-colors duration-150',
    'touch-manipulation select-none',
    '[-webkit-tap-highlight-color:transparent]',
    isActive
      ? 'bg-primary/10 text-primary font-semibold'
      : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
  )

  if (item.onClick) {
    return (
      <button
        type="button"
        onClick={() => {
          item.onClick?.()
          onNavigate?.()
        }}
        className={baseClassName}
        aria-current={isActive ? 'page' : undefined}
        role={role}
      >
        <div className="relative">
          <Icon className={cn('h-5 w-5', isActive ? 'text-primary' : 'text-muted-foreground')} />
          {item.badge !== undefined && item.badge > 0 && (
            <span
              className={cn(
                'absolute -top-1 -right-1',
                'min-w-[18px] h-[18px] px-1',
                'flex items-center justify-center',
                'text-[10px] font-bold',
                'bg-destructive text-destructive-foreground',
                'rounded-full'
              )}
              aria-label={`${item.badge} ${item.label} updates`}
            >
              {item.badge > 99 ? '99+' : item.badge}
            </span>
          )}
        </div>
        {!iconOnly && (
          <span className={cn('mt-1 text-[10px] font-semibold', isActive ? 'text-primary' : 'text-muted-foreground')}>
            {item.label}
          </span>
        )}
      </button>
    )
  }

  return (
    <Link
      to={item.href}
      className={baseClassName}
      aria-current={isActive ? 'page' : undefined}
      onClick={onNavigate}
      role={role}
      {...prefetchProps}
    >
      <div className="relative">
        <Icon className={cn('h-5 w-5', isActive ? 'text-primary' : 'text-muted-foreground')} />
        {item.badge !== undefined && item.badge > 0 && (
          <span
            className={cn(
              'absolute -top-1 -right-1',
              'min-w-[18px] h-[18px] px-1',
              'flex items-center justify-center',
              'text-[10px] font-bold',
              'bg-destructive text-destructive-foreground',
              'rounded-full'
            )}
            aria-label={`${item.badge} ${item.label} updates`}
          >
            {item.badge > 99 ? '99+' : item.badge}
          </span>
        )}
      </div>
      {!iconOnly && (
        <span className={cn('mt-1 text-[10px] font-semibold', isActive ? 'text-primary' : 'text-muted-foreground')}>
          {item.label}
        </span>
      )}
    </Link>
  )
}

/** Bottom Navigation Component */
export function BottomNavigation({
  items,
  className,
  isAuthenticated = false,
  isActiveRoute: customIsActiveRoute,
  overflowMode = false,
  maxPrimaryItems = 4,
}: BottomNavigationProps) {
  const location = useLocation()
  const { insets } = useSafeArea()
  const [isMoreOpen, setIsMoreOpen] = React.useState(false)
  const [viewportWidth, setViewportWidth] = React.useState(() => window.innerWidth)
  const moreButtonRef = React.useRef<HTMLButtonElement>(null)

  const navItems = items || (isAuthenticated ? defaultStudentNavItems : defaultPublicNavItems)
  const visibleItems = navItems.filter(item => !item.requiresAuth || isAuthenticated)
  const isNarrowViewport = viewportWidth < 360

  const isActiveRoute = customIsActiveRoute || ((href: string) => {
    if (href === '/') return location.pathname === '/'
    return location.pathname.startsWith(href)
  })

  React.useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  React.useEffect(() => {
    setIsMoreOpen(false)
  }, [location.pathname])

  const isItemActive = (item: BottomNavItem) =>
    item.activeMatchPaths?.some(path => isActiveRoute(path)) ?? isActiveRoute(item.href)

  const shouldOverflow = overflowMode && visibleItems.length > maxPrimaryItems
  const primaryItems = shouldOverflow ? visibleItems.slice(0, maxPrimaryItems) : visibleItems
  const overflowItems = shouldOverflow ? visibleItems.slice(maxPrimaryItems) : []
  const isMoreActive = overflowItems.some(isItemActive)

  return (
    <nav
      className={cn(
        'fixed bottom-0 left-0 right-0 z-50',
        'border-t border-border/45 bg-background shadow-sm',
        'md:hidden',
        className
      )}
      style={{ paddingBottom: `max(8px, ${insets.bottom}px)` }}
      role="navigation"
      aria-label="Bottom navigation"
    >
      {isMoreOpen && shouldOverflow && (
        <>
          <div className="fixed inset-0 z-[-1]" onClick={() => setIsMoreOpen(false)} aria-hidden="true" />
          <div
            id="bottom-navigation-overflow"
            className="absolute bottom-full left-3 right-3 mb-3 rounded-lg border border-border/60 bg-background px-3 pb-3 pt-3 shadow-lg"
            role="menu"
            aria-label="More navigation items"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setIsMoreOpen(false)
                moreButtonRef.current?.focus()
              }
            }}
          >
            <div className="mx-auto mb-2 h-1 w-12 rounded-full bg-muted" aria-hidden="true" />
            <div className="grid grid-cols-2 gap-2">
              {overflowItems.map((item) => (
                <BottomNavLink
                  key={item.href}
                  item={item}
                  isActive={isItemActive(item)}
                  iconOnly={false}
                  onNavigate={() => setIsMoreOpen(false)}
                  role="menuitem"
                />
              ))}
            </div>
          </div>
        </>
      )}

      <div className="flex items-center justify-around gap-1 px-2 pt-2">
        {primaryItems.map((item) => (
          <BottomNavLink key={item.href} item={item} isActive={isItemActive(item)} iconOnly={isNarrowViewport} />
        ))}
        {shouldOverflow && (
          <button
            type="button"
            ref={moreButtonRef}
            onClick={() => setIsMoreOpen((prev) => !prev)}
            className={cn(
              'flex flex-col items-center justify-center rounded-lg',
              'min-h-[44px] min-w-[44px] px-3 py-2',
              'touch-manipulation select-none [-webkit-tap-highlight-color:transparent]',
              'transition-colors duration-150',
              isMoreActive || isMoreOpen
                ? 'bg-primary/10 text-primary font-semibold'
                : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
            )}
            aria-expanded={isMoreOpen}
            aria-controls="bottom-navigation-overflow"
            aria-label="More navigation items"
          >
            <MoreHorizontal className={cn('h-5 w-5', isMoreActive || isMoreOpen ? 'text-primary' : 'text-muted-foreground')} />
            {!isNarrowViewport && (
              <span className={cn('mt-1 text-[10px] font-semibold', isMoreActive || isMoreOpen ? 'text-primary' : 'text-muted-foreground')}>
                More
              </span>
            )}
          </button>
        )}
      </div>
    </nav>
  )
}

/** Spacer component to prevent content from being hidden behind bottom nav */
export function BottomNavigationSpacer({ className }: { className?: string }) {
  const { insets } = useSafeArea()

  return (
    <div
      className={cn('md:hidden', className)}
      style={{ height: `calc(64px + max(8px, ${insets.bottom}px))` }}
      aria-hidden="true"
    />
  )
}
