import React, { useState, useEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Menu, X, Home, FileText, User, Settings, Bell, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MobileOptimizedButton } from './MobileOptimizedButton'
import { useAuth } from '@/contexts/AuthContext'

interface NavigationItem {
  name: string
  href: string
  icon: React.ReactNode
  badge?: number
  adminOnly?: boolean
}

const navigationItems: NavigationItem[] = [
  {
    name: 'Dashboard',
    href: '/dashboard',
    icon: <Home className="w-5 h-5" />
  },
  {
    name: 'Applications',
    href: '/applications',
    icon: <FileText className="w-5 h-5" />
  },
  {
    name: 'Profile',
    href: '/profile',
    icon: <User className="w-5 h-5" />
  },
  {
    name: 'Admin Panel',
    href: '/admin',
    icon: <Settings className="w-5 h-5" />,
    adminOnly: true
  },
  {
    name: 'Notifications',
    href: '/notifications',
    icon: <Bell className="w-5 h-5" />,
    badge: 3
  }
]

export function EnhancedMobileNavigation() {
  const [isOpen, setIsOpen] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)
  const location = useLocation()
  const { user, isAdmin, signOut } = useAuth()
  const menuRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  // Close menu when route changes
  useEffect(() => {
    setIsOpen(false)
  }, [location.pathname])

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false)
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen])

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        isOpen &&
        menuRef.current &&
        buttonRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  // Prevent body scroll when menu is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }

    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  const toggleMenu = () => {
    if (isAnimating) return
    
    setIsAnimating(true)
    setIsOpen(!isOpen)
    
    // Reset animation lock after transition
    setTimeout(() => setIsAnimating(false), 300)
  }

  const handleSignOut = async () => {
    setIsOpen(false)
    await signOut()
  }

  const filteredItems = navigationItems.filter(item => 
    !item.adminOnly || (item.adminOnly && isAdmin)
  )

  return (
    <>
      {/* Mobile Navigation Button - Fixed position with proper z-index */}
      <button
        ref={buttonRef}
        onClick={toggleMenu}
        className={cn(
          // Fixed positioning with high z-index
          'fixed top-4 right-4 z-[60]',
          // Touch-optimized size (44px minimum)
          'w-12 h-12',
          // Styling
          'bg-white shadow-lg border border-gray-200 rounded-full',
          'flex items-center justify-center',
          'transition-all duration-200 ease-in-out',
          // Interactive states
          'hover:bg-gray-50 active:bg-gray-100',
          'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
          // Mobile optimizations
          'touch-manipulation select-none',
          // Show only on mobile/tablet
          'md:hidden',
          // Animation when menu is open
          isOpen && 'bg-gray-100 shadow-xl'
        )}
        aria-label={isOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={isOpen}
      >
        <div className="relative w-6 h-6">
          {/* Animated hamburger/close icon */}
          <span
            className={cn(
              'absolute block w-6 h-0.5 bg-gray-700 transition-all duration-300',
              'top-1.5 left-0',
              isOpen ? 'rotate-45 top-3' : 'rotate-0'
            )}
          />
          <span
            className={cn(
              'absolute block w-6 h-0.5 bg-gray-700 transition-all duration-300',
              'top-3 left-0',
              isOpen ? 'opacity-0' : 'opacity-100'
            )}
          />
          <span
            className={cn(
              'absolute block w-6 h-0.5 bg-gray-700 transition-all duration-300',
              'top-4.5 left-0',
              isOpen ? '-rotate-45 top-3' : 'rotate-0'
            )}
          />
        </div>
      </button>

      {/* Backdrop */}
      {isOpen && (
        <div
          className={cn(
            'fixed inset-0 z-[45]',
            'bg-black/30 backdrop-blur-sm',
            'transition-opacity duration-300',
            isOpen ? 'opacity-100' : 'opacity-0'
          )}
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Mobile Navigation Menu */}
      <div
        ref={menuRef}
        className={cn(
          // Fixed positioning with proper z-index
          'fixed top-0 right-0 z-[50]',
          // Sizing
          'h-full w-80 max-w-[85vw]',
          // Styling
          'bg-white shadow-2xl border-l border-gray-200',
          // Transform animation
          'transition-transform duration-300 ease-in-out',
          isOpen ? 'translate-x-0' : 'translate-x-full',
          // Show only on mobile/tablet
          'md:hidden',
          // Ensure content doesn't overflow
          'overflow-y-auto'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            {user?.user_metadata?.avatar_url ? (
              <img
                src={user.user_metadata.avatar_url}
                alt="Profile"
                className="w-10 h-10 rounded-full border-2 border-gray-200"
              />
            ) : (
              <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center">
                <User className="w-5 h-5 text-white" />
              </div>
            )}
            <div>
              <p className="font-medium text-gray-900 text-sm">
                {user?.user_metadata?.full_name || 'User'}
              </p>
              <p className="text-xs text-gray-600">
                {user?.email}
              </p>
            </div>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="py-4">
          <div className="space-y-1 px-4">
            {filteredItems.map((item) => {
              const isActive = location.pathname === item.href
              
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={cn(
                    // Base styling
                    'flex items-center justify-between px-4 py-3 rounded-lg',
                    'text-sm font-medium transition-colors duration-200',
                    // Touch optimization
                    'min-h-[44px] touch-manipulation',
                    // Active state
                    isActive
                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                      : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                  )}
                  onClick={() => setIsOpen(false)}
                >
                  <div className="flex items-center space-x-3">
                    <span className={cn(
                      isActive ? 'text-blue-700' : 'text-gray-500'
                    )}>
                      {item.icon}
                    </span>
                    <span>{item.name}</span>
                  </div>
                  
                  {item.badge && item.badge > 0 && (
                    <span className="bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  )}
                </Link>
              )
            })}
          </div>
        </nav>

        {/* Footer Actions */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200 bg-white">
          <MobileOptimizedButton
            onClick={handleSignOut}
            variant="outline"
            size="touch"
            fullWidth
            icon={<LogOut className="w-4 h-4" />}
            className="text-red-600 border-red-200 hover:bg-red-50"
          >
            Sign Out
          </MobileOptimizedButton>
        </div>
      </div>
    </>
  )
}

// Breadcrumb component for better navigation
export function Breadcrumb({ 
  items,
  className 
}: { 
  items: { label: string; href?: string }[]
  className?: string 
}) {
  return (
    <nav className={cn('flex items-center space-x-2 text-sm', className)}>
      {items.map((item, index) => (
        <React.Fragment key={index}>
          {index > 0 && (
            <span className="text-gray-400">/</span>
          )}
          {item.href ? (
            <Link
              to={item.href}
              className="text-blue-600 hover:text-blue-700 font-medium"
            >
              {item.label}
            </Link>
          ) : (
            <span className="text-gray-600 font-medium">
              {item.label}
            </span>
          )}
        </React.Fragment>
      ))}
    </nav>
  )
}

// Mobile-optimized page header with breadcrumbs
export function MobilePageHeader({
  title,
  subtitle,
  breadcrumbs,
  actions,
  className
}: {
  title: string
  subtitle?: string
  breadcrumbs?: { label: string; href?: string }[]
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn(
      'bg-white border-b border-gray-200 px-4 py-4',
      // Account for mobile nav button
      'pr-16 md:pr-4',
      className
    )}>
      {breadcrumbs && (
        <Breadcrumb items={breadcrumbs} className="mb-2" />
      )}
      
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold text-gray-900 truncate">
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm text-gray-600 mt-1">
              {subtitle}
            </p>
          )}
        </div>
        
        {actions && (
          <div className="ml-4 flex-shrink-0">
            {actions}
          </div>
        )}
      </div>
    </div>
  )
}
