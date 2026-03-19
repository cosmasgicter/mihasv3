import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import {
  GraduationCap,
  Home,
  Search,
  Phone,
  LogIn,
  UserPlus,
  LayoutDashboard,
  Menu,
  X,
  LogOut,
} from '@/components/icons'
import { useAuth } from '@/contexts/AuthContext'
import { useSignOutAction } from '@/hooks/useSignOutAction'
import { useToastStore } from '@/hooks/useToast'
import { SkipLink } from '@/components/ui/SkipLink'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { cn } from '@/lib/utils'

export interface NavigationItem {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}

interface ResponsiveHeaderProps {
  className?: string
}

export function ResponsiveHeader({ className }: ResponsiveHeaderProps) {
  const { user, isAdmin } = useAuth()
  const { signOut, isSigningOut } = useSignOutAction()
  const toast = useToastStore()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const menuToggleRef = useRef<HTMLButtonElement>(null)
  const focusTrapRef = useFocusTrap(open)

  const dashboardPath = isAdmin ? '/admin/dashboard' : '/student/dashboard'

  const items = useMemo<NavigationItem[]>(() => {
    const base = [
      { href: '/', label: 'Home', icon: Home },
      { href: '/track-application', label: 'Track', icon: Search },
      { href: '/contact', label: 'Contact', icon: Phone },
    ]

    if (!user) {
      return [...base, { href: '/auth/signin', label: 'Sign in', icon: LogIn }]
    }

    return [...base, { href: dashboardPath, label: 'Dashboard', icon: LayoutDashboard }]
  }, [dashboardPath, user])

  // Close mobile menu on Escape key
  useEffect(() => {
    if (!open) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        menuToggleRef.current?.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open])

  const closeMenu = useCallback(() => setOpen(false), [])

  const handleSignOut = async () => {
    closeMenu()
    try {
      await signOut()
      toast.success('Signed out', 'You have been signed out successfully.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Please try again.'
      toast.error('Sign out failed', message)
    }
  }

  return (
    <>
    <SkipLink />
    <header className={cn('sticky top-0 z-50 border-b border-border/80 bg-card/95 backdrop-blur-xl', className)}>
      <div className="container-responsive px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-3">
          <Link to="/" className="inline-flex items-center gap-2 font-semibold text-foreground" aria-label="Mukuba Institute of Health and Allied Sciences logo - Home">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-primary to-secondary text-white" aria-hidden="true">
              <GraduationCap className="h-5 w-5" />
            </span>
            <span className="hidden sm:inline">MIHAS Admissions</span>
          </Link>

          <nav className="hidden items-center gap-2 md:flex" aria-label="Primary">
            {items.map(({ href, label }) => {
              const active = location.pathname === href
              return (
                <Link
                  key={href}
                  to={href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    active ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-muted'
                  )}
                >
                  {label}
                </Link>
              )
            })}
            {!user && (
              <Button asChild size="sm" variant="gradient" className="ml-2">
                <Link to="/auth/signup">
                  <UserPlus className="mr-2 h-4 w-4" />
                  Apply now
                </Link>
              </Button>
            )}
            {user && (
              <Button size="sm" variant="outline" onClick={handleSignOut} disabled={isSigningOut}>
                <LogOut className="mr-2 h-4 w-4" />
                {isSigningOut ? 'Signing out...' : 'Sign out'}
              </Button>
            )}
          </nav>

          <button
            ref={menuToggleRef}
            type="button"
            className="grid h-11 w-11 min-h-[44px] min-w-[44px] place-items-center rounded-lg border border-border md:hidden"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpen(prev => !prev)}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      <div
        id="mobile-menu"
        ref={focusTrapRef as React.RefObject<HTMLDivElement>}
        className={cn(
          'overflow-hidden border-t border-border bg-card transition-[max-height,opacity] duration-300 ease-in-out md:hidden',
          open ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
        )}
        role="region"
        aria-label="Mobile navigation"
      >
        <nav className="container-responsive space-y-1 px-4 py-3" aria-label="Mobile primary">
          {items.map(({ href, label, icon: Icon }) => {
            const active = location.pathname === href
            return (
              <Link
                key={href}
                to={href}
                onClick={closeMenu}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-3 py-3 min-h-[44px] text-sm font-medium',
                  active ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            )
          })}
          {!user ? (
            <Button asChild variant="gradient" className="mt-2 w-full min-h-[44px]">
              <Link to="/auth/signup" onClick={closeMenu}>Start application</Link>
            </Button>
          ) : (
            <Button variant="outline" className="mt-2 w-full min-h-[44px]" onClick={handleSignOut} disabled={isSigningOut}>
              {isSigningOut ? 'Signing out...' : 'Sign out'}
            </Button>
          )}
        </nav>
      </div>
    </header>
    </>
  )
}

export default ResponsiveHeader
