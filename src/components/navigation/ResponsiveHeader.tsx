import React, { useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
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
import { useRoleQuery } from '@/hooks/auth/useRoleQuery'
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
  const { user, signOut } = useAuth()
  const { isAdmin } = useRoleQuery({ user })
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)

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

  const handleSignOut = async () => {
    setOpen(false)
    navigate('/')
    await signOut().catch(() => undefined)
  }

  return (
    <header className={cn('sticky top-0 z-50 border-b border-border/80 bg-card/95 backdrop-blur-xl', className)}>
      <div className="container-responsive px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-3">
          <Link to="/" className="inline-flex items-center gap-2 font-semibold text-foreground">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-primary to-secondary text-white">
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
              <Button size="sm" variant="outline" onClick={handleSignOut}>
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </Button>
            )}
          </nav>

          <button
            type="button"
            className="grid h-10 w-10 place-items-center rounded-lg border border-border md:hidden"
            aria-label="Toggle menu"
            aria-expanded={open}
            onClick={() => setOpen(prev => !prev)}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      <div className={cn('overflow-hidden border-t border-border bg-card md:hidden', open ? 'max-h-96' : 'max-h-0')}>
        <nav className="container-responsive space-y-1 px-4 py-3" aria-label="Mobile primary">
          {items.map(({ href, label, icon: Icon }) => {
            const active = location.pathname === href
            return (
              <Link
                key={href}
                to={href}
                onClick={() => setOpen(false)}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-3 py-3 text-sm font-medium',
                  active ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            )
          })}
          {!user ? (
            <Button asChild variant="gradient" className="mt-2 w-full">
              <Link to="/auth/signup" onClick={() => setOpen(false)}>Start application</Link>
            </Button>
          ) : (
            <Button variant="outline" className="mt-2 w-full" onClick={handleSignOut}>Sign out</Button>
          )}
        </nav>
      </div>
    </header>
  )
}

export default ResponsiveHeader
