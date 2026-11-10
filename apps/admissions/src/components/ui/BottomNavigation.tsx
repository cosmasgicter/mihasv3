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
  MoreHorizontal,
} from 'lucide-react'
import { useSafeArea } from './SafeAreaProvider'
import { usePrefetch } from '@/hooks/usePrefetch'
import { pathFor, routeById, type ProductRouteDefinition } from '@/routes/routeRegistry'

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

const MAX_NAV_ITEMS = 4

/**
 * `ACTIVE_ITEM_TOKENS` — why the active item is `accent` and not `primary/10`
 * (GATE-13.3-12, task 13.6 §8.1 item L6).
 *
 * The active tab used to be `bg-primary/10 text-primary`, and axe reported
 * `color-contrast` (serious, WCAG 1.4.3) on its label: `--color-primary` over a 10 %
 * wash of itself on white measures **4.49 : 1**, marginally under AA's 4.5, and the
 * label is 10-12 px so no large-text allowance applies. The *More* overflow button
 * carried the identical pair, and so did five subject chips on the wizard's Education
 * step — nine axe rows from two token misuses.
 *
 * `bg-accent text-accent-foreground` is an existing pair in
 * `src/styles/design-tokens.css`, built for exactly this — a tinted surface with an
 * accessible foreground — and it measures **7.2 : 1**. No token was invented, and the
 * brand signal is unchanged. `aria-current="page"` carries the state non-visually, so
 * the colour is never the only cue.
 *
 * Recorded here as prose rather than beside the class strings because
 * `tests/property/ui-ux-performance-overhaul/uiPrimitives.property.test.ts` scans
 * `className` expressions for hex literals, and it cannot tell a comment from a class
 * — which is a fair trade for a guard that catches raw palette values.
 */
const ACTIVE_ITEM_TOKENS = 'bg-accent text-accent-foreground'

/** Route-to-import map for prefetching route chunks on hover/focus */
const routeImports: Record<string, () => Promise<unknown>> = {
  [pathFor('student.dashboard')]: () => import('@/pages/student/Dashboard'),
  [pathFor('student.applicationWizard')]: () => import('@/pages/student/applicationWizard/index'),
  [pathFor('student.payment')]: () => import('@/pages/student/Payment'),
  [pathFor('student.interview')]: () => import('@/pages/student/Interview'),
  [pathFor('student.notifications')]: () => import('@/pages/student/NotificationSettings'),
  [pathFor('student.settings')]: () => import('@/pages/student/Settings'),
  [pathFor('admin.dashboard')]: () => import('@/pages/admin/Dashboard'),
  [pathFor('admin.applications')]: () => import('@/pages/admin/Applications'),
  [pathFor('admin.programs')]: () => import('@/pages/admin/Programs'),
  [pathFor('admin.intakes')]: () => import('@/pages/admin/Intakes'),
  [pathFor('admin.users')]: () => import('@/pages/admin/Users'),
  [pathFor('admin.audit')]: () => import('@/pages/admin/AuditTrail'),
  [pathFor('admin.settings')]: () => import('@/pages/admin/Settings'),
}

/** Stable no-op import for routes without a prefetch target */
const noopImport = () => Promise.resolve()

const bottomNavItemFromRoute = (
  route: ProductRouteDefinition,
  options: { label?: string; requiresAuth?: boolean } = {},
): BottomNavItem => ({
  href: route.path,
  label: options.label ?? route.nav!.label,
  icon: route.nav!.icon,
  requiresAuth: options.requiresAuth,
  activeMatchPaths: route.nav?.activeMatchPaths,
})

export const defaultStudentNavItems: BottomNavItem[] = [
  bottomNavItemFromRoute(routeById('student.dashboard'), { requiresAuth: true }),
  bottomNavItemFromRoute(routeById('student.payment'), { requiresAuth: true }),
  bottomNavItemFromRoute(routeById('student.interview'), { requiresAuth: true }),
  bottomNavItemFromRoute(routeById('student.settings'), { label: 'Settings', requiresAuth: true }),
]

export const defaultPublicNavItems: BottomNavItem[] = [
  bottomNavItemFromRoute(routeById('public.home')),
  bottomNavItemFromRoute(routeById('public.trackApplication')),
  bottomNavItemFromRoute(routeById('auth.signIn')),
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
    'flex flex-1 flex-col items-center justify-center',
    'min-h-[44px] min-w-[44px] px-3 py-2',
    'rounded-lg',
    'transition-colors duration-150',
    'touch-manipulation select-none',
    '[-webkit-tap-highlight-color:transparent]',
    // The active item's own tokens — see `ACTIVE_ITEM_TOKENS` above
    // (GATE-13.3-12, 13.6 §8.1 item L6).
    isActive
      ? `${ACTIVE_ITEM_TOKENS} font-semibold`
      : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
  )
  /*
    The accessible name, always (GATE-13.3-11, 13.6 §8.1 item L6; R16.1).

    Below 360 px `iconOnly` drops the label span and **nothing replaced it** — no
    `aria-label`, and the icon is decorative — so axe reported `link-name`
    (serious, WCAG 2.4.4 / 4.1.2) on all four items at 320 x 568. That is the one
    width in R16.7's list under the threshold, and it is precisely the width R16.1
    says the student experience is designed at first: the primary navigation stopped
    telling a screen-reader user where anything went, at the design width.

    The label is now on the element unconditionally rather than only when the visual
    span is dropped, because an `aria-label` that matches the visible text is
    correct at every width and a conditional one is a second code path that can
    regress independently.
  */
  const accessibleName = item.badge !== undefined && item.badge > 0
    ? `${item.label} (${item.badge > 99 ? '99+' : item.badge} updates)`
    : item.label

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
        aria-label={accessibleName}
        role={role}
      >
        <div className="relative">
          <Icon className={cn('h-5 w-5', isActive ? 'text-accent-foreground' : 'text-muted-foreground')} aria-hidden="true" />
          {item.badge !== undefined && item.badge > 0 && (
            <span
              aria-hidden="true"
              data-text-role="caption"
              className={cn(
                'absolute -top-1 -right-1',
                'h-5 min-w-5 px-1',
                'flex items-center justify-center',
                'text-sm font-bold leading-none',
                'bg-destructive text-destructive-foreground',
                'rounded-full'
              )}
            >
              {item.badge > 99 ? '99+' : item.badge}
            </span>
          )}
        </div>
        {!iconOnly && (
          <span aria-hidden="true" className={cn('mt-1 max-w-full truncate text-xs font-semibold', isActive ? 'text-accent-foreground' : 'text-muted-foreground')}>
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
      aria-label={accessibleName}
      onClick={onNavigate}
      role={role}
      {...prefetchProps}
    >
      <div className="relative">
        <Icon className={cn('h-5 w-5', isActive ? 'text-accent-foreground' : 'text-muted-foreground')} aria-hidden="true" />
        {item.badge !== undefined && item.badge > 0 && (
          <span
            aria-hidden="true"
            data-text-role="caption"
            className={cn(
              'absolute -top-1 -right-1',
              'h-5 min-w-5 px-1',
              'flex items-center justify-center',
              'text-sm font-bold leading-none',
              'bg-destructive text-destructive-foreground',
              'rounded-full'
            )}
          >
            {item.badge > 99 ? '99+' : item.badge}
          </span>
        )}
      </div>
      {!iconOnly && (
        <span aria-hidden="true" className={cn('mt-1 max-w-full truncate text-xs font-semibold', isActive ? 'text-accent-foreground' : 'text-muted-foreground')}>
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
  maxPrimaryItems = MAX_NAV_ITEMS,
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

  const primaryItemLimit = Math.min(maxPrimaryItems, MAX_NAV_ITEMS)
  const shouldOverflow = visibleItems.length > 5 || (overflowMode && visibleItems.length > primaryItemLimit)
  const primaryItems = shouldOverflow ? visibleItems.slice(0, 4).slice(0, primaryItemLimit) : visibleItems
  const overflowItems = shouldOverflow ? visibleItems.slice(primaryItems.length) : []
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

      <div className="flex min-w-0 items-center justify-around gap-1 px-2 pt-2">
        {primaryItems.map((item) => (
          <BottomNavLink key={item.href} item={item} isActive={isItemActive(item)} iconOnly={isNarrowViewport} />
        ))}
        {shouldOverflow && (
          <button
            type="button"
            ref={moreButtonRef}
            onClick={() => setIsMoreOpen((prev) => !prev)}
            className={cn(
              'flex flex-1 flex-col items-center justify-center rounded-lg',
              'min-h-[44px] min-w-[44px] px-3 py-2',
              'touch-manipulation select-none [-webkit-tap-highlight-color:transparent]',
              'transition-colors duration-150',
              // Same token pair and reason as `BottomNavLink` above (GATE-13.3-12).
              isMoreActive || isMoreOpen
                ? `${ACTIVE_ITEM_TOKENS} font-semibold`
                : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
            )}
            aria-expanded={isMoreOpen}
            aria-controls="bottom-navigation-overflow"
            aria-label="More navigation items"
          >
            <MoreHorizontal className={cn('h-5 w-5', isMoreActive || isMoreOpen ? 'text-accent-foreground' : 'text-muted-foreground')} aria-hidden="true" />
            {!isNarrowViewport && (
              <span aria-hidden="true" className={cn('mt-1 max-w-full truncate text-xs font-semibold', isMoreActive || isMoreOpen ? 'text-accent-foreground' : 'text-muted-foreground')}>
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
