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
import { Home, Search, FileText, User, Settings, CreditCard, Calendar } from 'lucide-react'
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
  '/admin/users': () => import('@/pages/admin/Users'),
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
function BottomNavLink({ item, isActive }: { item: BottomNavItem; isActive: boolean }) {
  const Icon = item.icon
  const hasImport = item.href in routeImports
  const prefetch = usePrefetch(routeImports[item.href] ?? noopImport)
  const prefetchProps = hasImport ? prefetch : {}

  return (
    <Link
      to={item.href}
      className={cn(
        'flex flex-col items-center justify-center',
        'min-h-[44px] min-w-[44px] px-3 py-1',
        'rounded-lg',
        'transition-colors duration-200',
        'touch-manipulation select-none',
        '[-webkit-tap-highlight-color:transparent]',
        isActive
          ? 'text-primary bg-primary/10'
          : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
      )}
      aria-current={isActive ? 'page' : undefined}
      {...prefetchProps}
    >
      <div className="relative">
        <Icon className={cn('h-5 w-5', isActive ? 'text-primary' : 'text-muted-foreground')} />
        {item.badge !== undefined && item.badge > 0 && (
          <span
            className={cn(
              'absolute -top-1 -right-1',
              'min-w-[16px] h-4 px-1',
              'flex items-center justify-center',
              'text-[10px] font-bold',
              'bg-destructive text-destructive-foreground',
              'rounded-full'
            )}
            aria-label={`${item.badge} notifications`}
          >
            {item.badge > 99 ? '99+' : item.badge}
          </span>
        )}
      </div>
      <span className={cn('text-[10px] font-medium mt-0.5', isActive ? 'text-primary' : 'text-muted-foreground')}>
        {item.label}
      </span>
    </Link>
  )
}

/** Bottom Navigation Component */
export function BottomNavigation({
  items,
  className,
  isAuthenticated = false,
  isActiveRoute: customIsActiveRoute,
}: BottomNavigationProps) {
  const location = useLocation()
  const { insets } = useSafeArea()

  const navItems = items || (isAuthenticated ? defaultStudentNavItems : defaultPublicNavItems)
  const visibleItems = navItems.filter(item => !item.requiresAuth || isAuthenticated)

  const isActiveRoute = customIsActiveRoute || ((href: string) => {
    if (href === '/') return location.pathname === '/'
    return location.pathname.startsWith(href)
  })

  return (
    <nav
      className={cn(
        'fixed bottom-0 left-0 right-0 z-50',
        'bg-background/95 backdrop-blur-sm',
        'border-t border-border',
        'md:hidden',
        className
      )}
      style={{ paddingBottom: `max(8px, ${insets.bottom}px)` }}
      role="navigation"
      aria-label="Bottom navigation"
    >
      <div className="flex items-center justify-around px-2 pt-2">
        {visibleItems.map((item) => (
          <BottomNavLink key={item.href} item={item} isActive={isActiveRoute(item.href)} />
        ))}
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
