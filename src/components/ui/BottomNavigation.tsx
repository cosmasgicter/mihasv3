/**
 * Bottom Navigation Component
 * 
 * Mobile-optimized bottom navigation with safe area support.
 * Provides primary navigation actions for mobile users.
 * 
 * Requirements: 9.7 - Bottom navigation for mobile primary actions
 */

import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { Home, Search, FileText, User, Settings, CreditCard, Calendar } from 'lucide-react'
import { useSafeArea } from './SafeAreaProvider'

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

/**
 * Default navigation items for students
 */
export const defaultStudentNavItems: BottomNavItem[] = [
  { href: '/student/dashboard', label: 'Dashboard', icon: Home, requiresAuth: true },
  { href: '/student/payment', label: 'Payment', icon: CreditCard, requiresAuth: true },
  { href: '/student/interview', label: 'Interview', icon: Calendar, requiresAuth: true },
  { href: '/student/profile', label: 'Profile', icon: User, requiresAuth: true },
]

/**
 * Default navigation items for public users
 */
export const defaultPublicNavItems: BottomNavItem[] = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/track-application', label: 'Track', icon: Search },
  { href: '/auth/signin', label: 'Sign In', icon: User },
]

/**
 * Bottom Navigation Component
 */
export function BottomNavigation({
  items,
  className,
  isAuthenticated = false,
  isActiveRoute: customIsActiveRoute,
}: BottomNavigationProps) {
  const location = useLocation()
  const { insets } = useSafeArea()

  // Use default items based on auth state if not provided
  const navItems = items || (isAuthenticated ? defaultStudentNavItems : defaultPublicNavItems)

  // Filter items based on auth requirements
  const visibleItems = navItems.filter(
    item => !item.requiresAuth || isAuthenticated
  )

  // Default active route checker
  const isActiveRoute = customIsActiveRoute || ((href: string) => {
    if (href === '/') {
      return location.pathname === '/'
    }
    return location.pathname.startsWith(href)
  })

  return (
    <nav
      className={cn(
        'fixed bottom-0 left-0 right-0 z-50',
        'bg-background/95 backdrop-blur-sm',
        'border-t border-border',
        'md:hidden', // Only show on mobile
        className
      )}
      style={{
        paddingBottom: `max(8px, ${insets.bottom}px)`,
      }}
      role="navigation"
      aria-label="Bottom navigation"
    >
      <div className="flex items-center justify-around px-2 pt-2">
        {visibleItems.map((item) => {
          const isActive = isActiveRoute(item.href)
          const Icon = item.icon

          return (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                // Touch target compliance - 44x44px minimum
                'flex flex-col items-center justify-center',
                'min-h-[44px] min-w-[44px] px-3 py-1',
                'rounded-lg',
                'transition-colors duration-200',
                'touch-manipulation select-none',
                '[-webkit-tap-highlight-color:transparent]',
                // Active/inactive states
                isActive
                  ? 'text-primary bg-primary/10'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
                // Focus styles
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2'
              )}
              aria-current={isActive ? 'page' : undefined}
            >
              <div className="relative">
                <Icon
                  className={cn(
                    'h-5 w-5',
                    isActive ? 'text-primary' : 'text-muted-foreground'
                  )}
                />
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
              <span
                className={cn(
                  'text-[10px] font-medium mt-0.5',
                  isActive ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                {item.label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

/**
 * Spacer component to prevent content from being hidden behind bottom nav
 */
export function BottomNavigationSpacer({ className }: { className?: string }) {
  const { insets } = useSafeArea()

  return (
    <div
      className={cn('md:hidden', className)}
      style={{
        height: `calc(64px + max(8px, ${insets.bottom}px))`,
      }}
      aria-hidden="true"
    />
  )
}
