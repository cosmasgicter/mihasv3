import React, { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from './Button'
import { useAuth } from '@/contexts/AuthContext'
import { useProfileQuery } from '@/hooks/auth/useProfileQuery'
import { NotificationBell } from '@/components/student/NotificationBell'
import {
  User,
  LogOut,
  Settings,
  Menu,
  X,
  Home,
  Plus,
  Bell,
  FileText,
  Search,
  ChevronRight
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ImprovedMobileNavigationProps {
  className?: string
}

export function ImprovedMobileNavigation({ className }: ImprovedMobileNavigationProps) {
  const { signOut } = useAuth()
  const { profile } = useProfileQuery()
  const navigate = useNavigate()
  const location = useLocation()
  const [isOpen, setIsOpen] = useState(false)

  // Close menu when route changes
  useEffect(() => {
    setIsOpen(false)
  }, [location.pathname])

  // Prevent body scroll when menu is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
      document.body.style.position = 'fixed'
      document.body.style.width = '100%'
    } else {
      document.body.style.overflow = ''
      document.body.style.position = ''
      document.body.style.width = ''
    }

    return () => {
      document.body.style.overflow = ''
      document.body.style.position = ''
      document.body.style.width = ''
    }
  }, [isOpen])

  const toggleMenu = () => setIsOpen(!isOpen)
  const closeMenu = () => setIsOpen(false)

  const handleSignOut = async () => {
    try {
      closeMenu()
      await signOut()
      navigate('/')
    } catch (error) {
      console.error('Sign out failed:', error)
      navigate('/')
    }
  }

  const navigationItems = [
    { 
      href: '/student/dashboard', 
      label: 'Dashboard', 
      icon: Home,
      description: 'View your applications and progress'
    },
    { 
      href: '/student/application-wizard', 
      label: 'New Application', 
      icon: Plus,
      description: 'Start a new application'
    },
    { 
      href: '/student/applications', 
      label: 'My Applications', 
      icon: FileText,
      description: 'View all your applications'
    },
    { 
      href: '/track-application', 
      label: 'Track Application', 
      icon: Search,
      description: 'Track any application by number'
    },
    { 
      href: '/settings', 
      label: 'Settings', 
      icon: Settings,
      description: 'Manage your profile and preferences'
    }
  ]

  const isActiveRoute = (href: string) => {
    return location.pathname === href || location.pathname.startsWith(href + '/')
  }

  return (
    <>
      {/* Top Navigation Bar */}
      <div className={cn(
        "bg-white/95 backdrop-blur-sm shadow-lg border-b border-gray-200/50 sticky top-0 z-40",
        className
      )}>
        <div className="container-mobile">
          <div className="flex justify-between items-center py-3 sm:py-4">
            {/* User Info */}
            <div className="flex items-center space-x-3 min-w-0 flex-1">
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg flex-shrink-0">
                <User className="h-5 w-5 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-lg font-bold text-gray-900 truncate">
                  {profile?.full_name ? 
                    `Hi, ${profile.full_name.split(' ')[0]}!` : 
                    'Welcome!'
                  }
                </h1>
                <p className="text-sm text-gray-600 truncate">
                  Student Portal
                </p>
              </div>
            </div>

            {/* Right Side Actions */}
            <div className="flex items-center gap-2">
              {/* Notification Bell - Always visible */}
              <div className="lg:hidden">
                <NotificationBell />
              </div>

              {/* Desktop Navigation - Hidden on mobile */}
              <div className="hidden lg:flex items-center space-x-2">
                {navigationItems.map((item) => (
                  <Link key={item.href} to={item.href}>
                    <Button
                      variant={isActiveRoute(item.href) ? "default" : "ghost"}
                      size="sm"
                      className="flex items-center space-x-2"
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </Button>
                  </Link>
                ))}
                <NotificationBell />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSignOut}
                  className="ml-2 text-red-600 border-red-200 hover:bg-red-50"
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign Out
                </Button>
              </div>

              {/* Mobile Menu Button */}
              <motion.button
                className={cn(
                  "lg:hidden p-3 rounded-xl text-white shadow-lg z-50 relative",
                  "min-h-[48px] min-w-[48px] touch-target",
                  "focus:outline-none focus:ring-2 focus:ring-primary/50",
                  "transition-all duration-200",
                  isOpen 
                    ? "bg-red-600 hover:bg-red-700" 
                    : "bg-gray-900 hover:bg-gray-800"
                )}
                onClick={toggleMenu}
                whileTap={{ scale: 0.95 }}
                aria-label={isOpen ? "Close menu" : "Open menu"}
                aria-expanded={isOpen}
              >
                <AnimatePresence mode="wait">
                  {isOpen ? (
                    <motion.div
                      key="close"
                      initial={{ rotate: -90, opacity: 0 }}
                      animate={{ rotate: 0, opacity: 1 }}
                      exit={{ rotate: 90, opacity: 0 }}
                      transition={{ duration: 0.15 }}
                    >
                      <X className="h-6 w-6" />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="menu"
                      initial={{ rotate: 90, opacity: 0 }}
                      animate={{ rotate: 0, opacity: 1 }}
                      exit={{ rotate: -90, opacity: 0 }}
                      transition={{ duration: 0.15 }}
                    >
                      <Menu className="h-6 w-6" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeMenu}
            />

            {/* Mobile Menu Panel */}
            <motion.div
              className={cn(
                "fixed top-0 right-0 h-full w-80 max-w-[85vw]",
                "bg-white shadow-2xl z-50 lg:hidden",
                "safe-area-top safe-area-bottom",
                "flex flex-col"
              )}
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ 
                type: "spring", 
                stiffness: 300, 
                damping: 30 
              }}
            >
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-primary/5 to-secondary/5">
                <div className="flex items-center space-x-3">
                  <div className="h-12 w-12 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg">
                    <User className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <p className="font-bold text-gray-900 text-lg">
                      {profile?.full_name || 'Student'}
                    </p>
                    <p className="text-sm text-gray-600 truncate max-w-[180px]">
                      {profile?.email || 'Loading...'}
                    </p>
                  </div>
                </div>
                <motion.button
                  className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors touch-target"
                  onClick={closeMenu}
                  whileTap={{ scale: 0.95 }}
                  aria-label="Close menu"
                >
                  <X className="h-6 w-6" />
                </motion.button>
              </div>

              {/* Navigation Items */}
              <div className="flex-1 overflow-y-auto py-4">
                <nav className="space-y-2 px-4">
                  {navigationItems.map((item, index) => {
                    const isActive = isActiveRoute(item.href)
                    
                    return (
                      <motion.div
                        key={item.href}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05 }}
                      >
                        <Link
                          to={item.href}
                          onClick={closeMenu}
                          className={cn(
                            "flex items-center justify-between p-4 rounded-xl transition-all duration-200",
                            "min-h-[60px] touch-target group",
                            isActive
                              ? "bg-primary text-white shadow-lg"
                              : "text-gray-700 hover:bg-gray-50 border border-gray-200 hover:border-gray-300"
                          )}
                        >
                          <div className="flex items-center space-x-4">
                            <div className={cn(
                              "p-2 rounded-lg transition-colors",
                              isActive 
                                ? "bg-white/20" 
                                : "bg-gray-100 group-hover:bg-gray-200"
                            )}>
                              <item.icon className={cn(
                                "h-5 w-5",
                                isActive ? "text-white" : "text-gray-600"
                              )} />
                            </div>
                            <div>
                              <p className={cn(
                                "font-semibold text-base",
                                isActive ? "text-white" : "text-gray-900"
                              )}>
                                {item.label}
                              </p>
                              <p className={cn(
                                "text-sm",
                                isActive ? "text-white/80" : "text-gray-500"
                              )}>
                                {item.description}
                              </p>
                            </div>
                          </div>
                          <ChevronRight className={cn(
                            "h-5 w-5 transition-transform group-hover:translate-x-1",
                            isActive ? "text-white/80" : "text-gray-400"
                          )} />
                        </Link>
                      </motion.div>
                    )
                  })}
                </nav>
              </div>

              {/* Footer with Sign Out */}
              <div className="p-6 border-t border-gray-200 bg-gray-50/50">
                <motion.button
                  onClick={handleSignOut}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: navigationItems.length * 0.05 }}
                  className={cn(
                    "w-full flex items-center justify-center space-x-3",
                    "px-4 py-4 bg-red-500 hover:bg-red-600 text-white",
                    "rounded-xl shadow-lg hover:shadow-xl transition-all duration-200",
                    "font-semibold min-h-[52px] touch-target"
                  )}
                  whileTap={{ scale: 0.98 }}
                >
                  <LogOut className="h-5 w-5" />
                  <span>Sign Out</span>
                </motion.button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}