import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { GraduationCap, Home, Menu, Phone, Search, UserPlus, X, LogIn } from '@/components/icons'
import { SkipLink } from '@/components/ui/SkipLink'
import { cn } from '@/lib/utils'
import { preloadAuthRoutes } from '@/lib/routePreload'

type PublicNavItem = {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const baseItems: PublicNavItem[] = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/track-application', label: 'Track', icon: Search },
  { href: '/contact', label: 'Contact', icon: Phone },
  { href: '/auth/signin', label: 'Sign in', icon: LogIn },
]

interface PublicSiteHeaderProps {
  className?: string
}

export function PublicSiteHeader({ className }: PublicSiteHeaderProps) {
  const location = useLocation()
  const [open, setOpen] = useState(false)

  const items = useMemo(() => baseItems, [])
  const warmAuthRoutes = () => {
    void preloadAuthRoutes('public-nav')
  }

  useEffect(() => {
    setOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!open) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open])

  return (
    <>
      <SkipLink />
      <header className={cn('sticky top-0 z-50 border-b border-slate-200 bg-white shadow-sm', className)}>
        <div className="container-responsive px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between gap-3">
            <Link to="/" className="inline-flex items-center gap-3 font-semibold text-foreground" aria-label="Mukuba Institute of Health and Applied Sciences logo - Home">
              <span className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 bg-white text-primary shadow-sm" aria-hidden="true">
                <GraduationCap className="h-5 w-5" />
              </span>
              <span className="hidden sm:block">
                <span className="block text-xs font-semibold uppercase text-slate-500">MIHAS-KATC</span>
                <span className="block text-base font-semibold tracking-tight text-slate-950">Admissions</span>
              </span>
            </Link>

            <nav className="hidden items-center gap-2 md:flex" aria-label="Primary">
              {items.map(({ href, label }) => {
                const active = location.pathname === href
                return (
                  <Link
                    key={href}
                    to={href}
                    onPointerEnter={href.startsWith('/auth') ? warmAuthRoutes : undefined}
                    onFocus={href.startsWith('/auth') ? warmAuthRoutes : undefined}
                    onTouchStart={href.startsWith('/auth') ? warmAuthRoutes : undefined}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'rounded-lg px-4 py-2 text-sm font-medium transition-colors duration-200',
                      active ? 'bg-slate-100 text-slate-950' : 'text-slate-700 hover:bg-slate-100 hover:text-slate-950'
                    )}
                  >
                    {label}
                  </Link>
                )
              })}
              <Link
                to="/auth/signup"
                onPointerEnter={warmAuthRoutes}
                onFocus={warmAuthRoutes}
                onTouchStart={warmAuthRoutes}
                className="ml-2 inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors duration-150 hover:bg-primary/90"
              >
                <UserPlus className="h-4 w-4" />
                Apply now
              </Link>
            </nav>

            <button
              type="button"
              className="grid h-11 w-11 min-h-[44px] min-w-[44px] place-items-center rounded-lg border border-slate-200 bg-white/90 md:hidden"
              aria-label={open ? 'Close menu' : 'Open menu'}
              aria-expanded={open}
              aria-controls="public-mobile-menu"
              aria-haspopup="true"
              onClick={() => setOpen(prev => !prev)}
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        <div
          id="public-mobile-menu"
          className={cn(
            'overflow-hidden border-t border-slate-200 bg-white transition-[max-height,opacity] duration-200 ease-in-out md:hidden',
            open ? 'max-h-[26rem] opacity-100' : 'max-h-0 opacity-0'
          )}
          role="region"
          aria-label="Mobile navigation"
          aria-hidden={!open}
          hidden={!open}
        >
          <nav className="container-responsive space-y-1 px-4 py-3" aria-label="Mobile primary">
            {items.map(({ href, label, icon: Icon }) => {
              const active = location.pathname === href
              return (
                <Link
                  key={href}
                  to={href}
                  onPointerEnter={href.startsWith('/auth') ? warmAuthRoutes : undefined}
                  onFocus={href.startsWith('/auth') ? warmAuthRoutes : undefined}
                  onTouchStart={href.startsWith('/auth') ? warmAuthRoutes : undefined}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex min-h-[44px] items-center gap-2 rounded-lg px-3 py-3 text-sm font-medium',
                    active ? 'bg-slate-100 text-slate-950' : 'hover:bg-slate-50'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              )
            })}
            <Link
              to="/auth/signup"
              onPointerEnter={warmAuthRoutes}
              onFocus={warmAuthRoutes}
              onTouchStart={warmAuthRoutes}
              className="mt-2 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-colors duration-150 hover:bg-primary/90"
            >
              <UserPlus className="h-4 w-4" />
              Start application
            </Link>
          </nav>
        </div>
      </header>
    </>
  )
}

export default PublicSiteHeader
