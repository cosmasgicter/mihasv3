import React, { useMemo } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import * as NavigationMenu from '@radix-ui/react-navigation-menu'
import { Button } from './Button'
import { BaseNavigation, NavigationItem } from '@/components/navigation/BaseNavigation'
import { useAuth } from '@/contexts/AuthContext'
import { useProfileQuery } from '@/hooks/auth/useProfileQuery'
import { useIsMobile } from '@/hooks/use-mobile'
import { NotificationBell } from '@/components/student/NotificationBell'
import {
  User,
  LogOut,
  Settings,
  Home,
  Plus,
  Bell
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface AuthenticatedNavigationProps {
  className?: string
}

export function AuthenticatedNavigation({ className }: AuthenticatedNavigationProps) {
  const { signOut } = useAuth()
  const { profile } = useProfileQuery()
  const isMobile = useIsMobile()
  const navigate = useNavigate()
  const location = useLocation()

  // Requirements: 13.1, 13.2, 13.3, 13.4 - Improve Logout Performance
  // Navigate immediately, don't wait for signOut to complete
  const handleSignOut = async () => {
    // Navigate first for instant feedback - Requirements: 13.1
    navigate('/')
    
    // Fire-and-forget signOut - Requirements: 13.3
    signOut().catch((error) => {
      console.error('Sign out failed:', error)
      // Already navigated, so just log the error
      // Requirements: 13.4 - Still redirect even if API fails
    })
  }

  const navigationItems: NavigationItem[] = useMemo(() => [
    { href: '/student/dashboard', label: 'Dashboard', icon: Home },
    { href: '/student/application-wizard', label: 'New Application', icon: Plus },
    { href: '/settings', label: 'Settings', icon: Settings },
    { href: '/student/notifications', label: 'Notifications', icon: Bell }
  ], [])

  const isActiveRoute = (href: string) => {
    return location.pathname.startsWith(href)
  }

  const handleNavigate = (href: string) => {
    navigate(href)
  }

  // Brand component
  const brand = (
    <div className="flex items-center space-x-2 sm:space-x-3">
      <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-full bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg">
        <User className="h-4 w-4 sm:h-5 sm:w-5 text-primary-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <h1 className="text-sm sm:text-lg font-bold text-foreground truncate">
          {profile?.full_name ? (
            isMobile ? profile.full_name.split(' ')[0] : `Welcome, ${profile.full_name}`
          ) : (
            <span className="inline-flex items-center space-x-2">
              <span className="h-4 w-16 bg-muted rounded animate-pulse" />
            </span>
          )}
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground truncate max-w-[200px]">
          {profile?.email || (
            <span className="inline-flex items-center">
              <span className="h-3 w-24 bg-muted rounded animate-pulse" />
            </span>
          )}
        </p>
      </div>
    </div>
  )

  // Desktop navigation
  const desktopNav = (
    <>
      <NavigationMenu.Root>
        <NavigationMenu.List className="flex items-center space-x-2">
          {navigationItems.map((item) => {
            const isActive = isActiveRoute(item.href)
            const Icon = item.icon
            return (
              <NavigationMenu.Item key={item.href}>
                <Link to={item.href}>
                  <Button
                    variant={isActive ? "default" : "ghost"}
                    size="sm"
                    className={cn(
                      "flex items-center space-x-2 transition-all duration-200",
                      isActive
                        ? "bg-primary text-primary-foreground shadow-md"
                        : "hover:bg-accent text-foreground"
                    )}
                  >
                    {Icon && <Icon className="h-4 w-4" />}
                    <span className="font-medium">{item.label}</span>
                  </Button>
                </Link>
              </NavigationMenu.Item>
            )
          })}

          <NavigationMenu.Item>
            <NotificationBell />
          </NavigationMenu.Item>

          <NavigationMenu.Item>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSignOut}
              className="ml-2 text-destructive border-destructive/30 hover:bg-destructive/5 hover:border-destructive/30 flex items-center"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </NavigationMenu.Item>
        </NavigationMenu.List>
      </NavigationMenu.Root>
      <div className="lg:hidden ml-2">
        <NotificationBell />
      </div>
    </>
  )

  // Mobile header
  const mobileHeader = (
    <div className="flex items-center space-x-3">
      <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg">
        <User className="h-5 w-5 text-primary-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-bold text-foreground text-lg truncate">
          {profile?.full_name || (
            <span className="inline-flex items-center">
              <span className="h-5 w-24 bg-muted rounded animate-pulse" />
            </span>
          )}
        </p>
        <p className="text-sm text-muted-foreground truncate max-w-[180px]">
          {profile?.email || (
            <span className="inline-flex items-center">
              <span className="h-4 w-32 bg-muted rounded animate-pulse" />
            </span>
          )}
        </p>
      </div>
    </div>
  )

  // Mobile footer
  const mobileFooter = (
    <button 
      onClick={handleSignOut}
      className="w-full flex items-center justify-center space-x-3 px-4 py-4 bg-gradient-to-r from-destructive to-destructive/80 text-destructive-foreground rounded-xl hover:from-destructive/90 hover:to-destructive/70 shadow-lg hover:shadow-xl transition-all duration-200 font-medium min-h-[48px] touch-target logout-button"
    >
      <LogOut className="h-5 w-5" />
      <span>Sign Out</span>
    </button>
  )

  return (
    <BaseNavigation
      brand={brand}
      desktopNav={desktopNav}
      mobileItems={navigationItems}
      mobileHeader={mobileHeader}
      mobileFooter={mobileFooter}
      isActiveRoute={isActiveRoute}
      onNavigate={handleNavigate}
      className={className}
    />
  )
}