import React, { useMemo } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Button } from './Button'
import { BaseNavigation, NavigationItem } from '@/components/navigation/BaseNavigation'
import { GraduationCap, LayoutDashboard, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { useSignOutAction } from '@/hooks/useSignOutAction'

interface MobileNavigationProps {
  className?: string
}

export function MobileNavigation({ className }: MobileNavigationProps) {
  const { user, isAdmin } = useAuth()
  const { signOut, isSigningOut } = useSignOutAction()
  const navigate = useNavigate()
  const location = useLocation()

  // Requirements: 13.1, 13.2, 13.3, 13.4 - Improve Logout Performance
  const handleSignOut = async () => {
    await signOut()
  }

  const dashboardPath = isAdmin ? '/admin/dashboard' : '/student/dashboard'
  const dashboardLabel = isAdmin ? 'Admin Dashboard' : 'Dashboard'

  const mobileItems = useMemo<NavigationItem[]>(() => {
    const items: NavigationItem[] = [
      { href: '/', label: 'Home' },
      { href: '/track-application', label: 'Track Application' }
    ]

    if (!user) {
      items.push(
        { href: '/auth/signin', label: 'Sign In' },
        { href: '/auth/signup', label: 'Sign Up' }
      )
    } else {
      items.push({
        href: dashboardPath,
        label: dashboardLabel,
        icon: LayoutDashboard
      })
    }

    return items
  }, [dashboardLabel, dashboardPath, user])

  const isActiveRoute = (href: string) => {
    if (href === '/') {
      return location.pathname === '/'
    }
    return location.pathname.startsWith(href)
  }

  const handleNavigate = (href: string) => {
    navigate(href)
  }

  // Brand component - simplified without continuous rotation animation
  const brand = (
    <div className="flex items-center space-x-2">
      <GraduationCap className="h-8 w-8 text-primary" />
      <span className="text-xl font-bold text-foreground">MIHAS-KATC</span>
    </div>
  )

  // Desktop navigation
  const desktopNav = (
    <div className="hidden md:flex space-x-4">
      <Link to="/track-application">
        <Button
          variant="default"
          size="md"
          className="bg-gradient-to-r from-primary to-primary/80 text-primary-foreground hover:from-primary/90 hover:to-primary/70 font-bold shadow-lg"
        >
          Track Application
        </Button>
      </Link>
      {!user ? (
        <>
          <Link to="/auth/signin">
            <Button
              variant="default"
              size="md"
              className="bg-gradient-to-r from-primary to-primary/80 text-primary-foreground hover:from-primary/90 hover:to-primary/70 font-bold shadow-lg"
            >
              Sign In
            </Button>
          </Link>
          <Link to="/auth/signup">
            <Button variant="default" size="md" className="font-semibold">
              Sign Up
            </Button>
          </Link>
        </>
      ) : (
        <>
          <Link to={dashboardPath}>
            <Button
              variant="default"
              size="md"
              className="font-semibold"
            >
              <LayoutDashboard className="w-4 h-4 mr-2" />
              {dashboardLabel}
            </Button>
          </Link>
          <Button
            variant="outline"
            size="md"
            onClick={handleSignOut}
            disabled={isSigningOut}
            className="border-border text-foreground hover:bg-accent"
          >
            <LogOut className="w-4 h-4 mr-2" />
            {isSigningOut ? 'Signing Out...' : 'Sign Out'}
          </Button>
        </>
      )}
    </div>
  )

  // Mobile header
  const mobileHeader = (
    <div className="flex items-center space-x-3">
      <GraduationCap className="h-7 w-7 text-primary" />
      <span className="text-xl font-bold text-foreground">MIHAS-KATC</span>
    </div>
  )

  // Mobile footer
  const mobileFooter = (
    <>
      {user && (
        <button
          onClick={handleSignOut}
          disabled={isSigningOut}
          className="w-full flex items-center justify-center space-x-3 px-4 py-4 bg-destructive text-destructive-foreground rounded-xl hover:bg-destructive/90 shadow-lg hover:shadow-xl transition-all duration-200 font-medium min-h-[48px] touch-target mb-4"
        >
          <LogOut className="h-5 w-5" />
          <span>{isSigningOut ? 'Signing Out...' : 'Sign Out'}</span>
        </button>
      )}
      {!user && (
        <p className="text-foreground text-base text-center font-medium">
          Your Future Starts Here
        </p>
      )}
    </>
  )

  return (
    <div className={cn("relative", className)}>
      <BaseNavigation
        brand={brand}
        desktopNav={desktopNav}
        mobileItems={mobileItems}
        mobileHeader={mobileHeader}
        mobileFooter={mobileFooter}
        isActiveRoute={isActiveRoute}
        onNavigate={handleNavigate}
      />
    </div>
  )
}
