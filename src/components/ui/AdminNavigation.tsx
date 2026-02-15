import React from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import * as NavigationMenu from '@radix-ui/react-navigation-menu'
import { Button } from './Button'
import { BaseNavigation, NavigationItem } from '@/components/navigation/BaseNavigation'
import { useAuth } from '@/contexts/AuthContext'
import { useProfileQuery } from '@/hooks/auth/useProfileQuery'
import { useRoleQuery } from '@/hooks/auth/useRoleQuery'
import { useIsMobile } from '@/hooks/use-mobile'
import { 
  Settings, 
  LogOut, 
  Home,
  FileText,
  GraduationCap,
  Calendar,
  Users,
  Shield,
  BarChart3,
  Activity
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface AdminNavigationProps {
  className?: string
}

export function AdminNavigation({ className }: AdminNavigationProps) {
  const { signOut } = useAuth()
  const { profile } = useProfileQuery()
  const { userRole } = useRoleQuery()
  const isMobile = useIsMobile()
  const navigate = useNavigate()
  const location = useLocation()

  // Requirements: 13.1, 13.2, 13.3, 13.4 - Improve Logout Performance
  // Navigate immediately, don't wait for signOut to complete
  const handleSignOut = async () => {
    // Navigate first for instant feedback - Requirements: 13.1
    navigate('/', { replace: true })
    
    // Fire-and-forget signOut - Requirements: 13.3
    signOut().catch((error) => {
      console.error('Sign out error:', error)
      // Already navigated, so just log the error
      // Requirements: 13.4 - Still redirect even if API fails
    })
  }

  const navigationItems: NavigationItem[] = [
    { href: '/admin', label: 'Dashboard', icon: Home, emoji: '🏠' },
    { href: '/admin/applications', label: 'Applications', icon: FileText },
    { href: '/admin/programs', label: 'Programs', icon: GraduationCap },
    { href: '/admin/intakes', label: 'Intakes', icon: Calendar },
    { href: '/admin/users', label: 'Users', icon: Users, emoji: '👥' },
    { href: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
    { href: '/admin/compliance-analytics', label: 'Compliance', icon: Shield, emoji: '🛡️' },
    { href: '/admin/realtime-metrics', label: 'Real-time', icon: Activity, emoji: '⚡' },
    { href: '/admin/audit', label: 'Audit trail', icon: Activity, emoji: '🛡️' },
    { href: '/admin/settings', label: 'Settings', icon: Settings, emoji: '⚙️' },
  ]

  const isActiveRoute = (href: string) => {
    if (href === '/admin') {
      return location.pathname === '/admin'
    }
    return location.pathname.startsWith(href)
  }

  const handleNavigate = (href: string) => {
    navigate(href)
  }

  // Brand component
  const brand = (
    <div 
      className="flex items-center space-x-2 sm:space-x-3 hover:scale-[1.02] transition-transform duration-200"
    >
      <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-full bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg">
        <Shield className="h-4 w-4 sm:h-5 sm:w-5 text-primary-foreground" />
      </div>
      <div>
        <h1 className="text-sm sm:text-lg font-bold text-foreground truncate max-w-[150px] sm:max-w-[200px]">
          {isMobile ? 'Admin' : 'Admin Dashboard'}
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block truncate max-w-[200px]">
          Welcome, {profile?.full_name || 'Admin'}
        </p>
        <p className="text-xs text-muted-foreground sm:hidden truncate max-w-[120px]">
          {profile?.full_name || 'Admin'}
        </p>
      </div>
    </div>
  )

  // Desktop navigation
  const desktopNav = (
    <NavigationMenu.Root>
      <NavigationMenu.List className="flex items-center space-x-1 overflow-x-auto flex-nowrap scrollbar-hide max-w-[60vw]">
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
                  <span className="font-medium truncate">{item.label}</span>
                </Button>
              </Link>
            </NavigationMenu.Item>
          )
        })}
        
        <NavigationMenu.Item>
          <div className="hidden xl:flex items-center text-xs text-foreground px-3 py-2 bg-muted rounded-lg ml-2">
            <span className="font-medium truncate max-w-[100px]">{userRole?.role?.replace('_', ' ').toUpperCase() || 'ADMIN'}</span>
          </div>
        </NavigationMenu.Item>
        
        <NavigationMenu.Item className="flex-shrink-0">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleSignOut}
            className="ml-2 text-destructive border-destructive/30 hover:bg-destructive/5 hover:border-destructive/30 whitespace-nowrap flex items-center logout-button"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </Button>
        </NavigationMenu.Item>
      </NavigationMenu.List>
    </NavigationMenu.Root>
  )

  // Mobile header
  const mobileHeader = (
    <div className="flex items-center space-x-3">
      <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg">
        <Shield className="h-5 w-5 text-primary-foreground" />
      </div>
      <div>
        <p className="font-bold text-foreground text-lg truncate max-w-[150px]">Admin Panel</p>
        <p className="text-sm text-muted-foreground truncate max-w-[150px]">{profile?.full_name || 'Administrator'}</p>
      </div>
    </div>
  )

  // Mobile footer
  const mobileFooter = (
    <>
      {/* Role Badge */}
      <div className="mb-4 p-4 bg-gradient-to-r from-primary/10 to-secondary/10 rounded-xl border border-primary/30">
        <div className="text-center">
          <div className="text-sm font-medium text-foreground mb-1">Current Role</div>
          <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-gradient-to-r from-primary to-primary/80 text-primary-foreground truncate max-w-[150px]">
            {userRole?.role?.replace('_', ' ').toUpperCase() || 'ADMIN'}
          </div>
        </div>
      </div>

      {/* Sign Out */}
      <button 
        onClick={handleSignOut}
        className="w-full flex items-center justify-between px-4 py-4 rounded-xl transition-all duration-200 min-h-[48px] touch-target bg-gradient-to-r from-destructive to-destructive/80 text-destructive-foreground shadow-lg hover:shadow-xl"
      >
        <div className="flex items-center space-x-3">
          <LogOut className="h-5 w-5" />
          <span className="font-semibold">Sign Out</span>
        </div>
      </button>

      {/* Footer Text */}
      <div className="mt-4 text-center">
        <p className="text-sm font-medium text-foreground mb-1">
          MIHAS-KATC Admin Portal
        </p>
        <p className="text-xs text-muted-foreground">
          Secure Administrative Access
        </p>
      </div>
    </>
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