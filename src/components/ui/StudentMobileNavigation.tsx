import React from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '@/contexts/AuthContext'
import { useProfileQuery } from '@/hooks/auth/useProfileQuery'
import { useMobileNavigation } from '@/hooks/useMobileNavigation'
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
  Clock
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface StudentMobileNavigationProps {
  className?: string
}

export function StudentMobileNavigation({ className }: StudentMobileNavigationProps) {
  const { signOut } = useAuth()
  const { profile } = useProfileQuery()
  const navigate = useNavigate()
  const location = useLocation()
  const { isOpen, toggleMenu, closeMenu } = useMobileNavigation()

  const handleSignOut = async () => {
    try {
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
      description: 'View your overview'
    },
    { 
      href: '/apply', 
      label: 'New Application', 
      icon: Plus,
      description: 'Start a new application'
    },
    { 
      href: '/student/applications', 
      label: 'My Applications', 
      icon: FileText,
      description: 'View submitted applications'
    },
    { 
      href: '/track-application', 
      label: 'Track Application', 
      icon: Clock,
      description: 'Check application status'
    },
    { 
      href: '/student/notifications', 
      label: 'Notifications', 
      icon: Bell,
      description: 'View your messages'
    },
    { 
      href: '/settings', 
      label: 'Settings', 
      icon: Settings,
      description: 'Manage your account'
    }
  ]

  const isActiveRoute = (href: string) => {
    return location.pathname === href || location.pathname.startsWith(href + '/')
  }

  return (
    <>
      {/* Fixed Header */}
      <header className={cn(
        "fixed top-0 left-0 right-0 z-[60] bg-white/95 backdrop-blur-md border-b border-gray-200/50 shadow-sm",
        className
      )}>
        <div className="container-mobile">
          <div className="flex justify-between items-center h-16">
            {/* User Info */}
            <div className="flex items-center space-x-3 min-w-0 flex-1">
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-md">
                <User className="h-5 w-5 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-lg font-semibold text-gray-900 truncate">
                  {profile?.full_name ? (
                    profile.full_name.split(' ')[0]
                  ) : (
                    <div className="h-5 w-20 bg-gray-200 rounded animate-pulse" />
                  )}
                </h1>
                <p className="text-sm text-gray-600 truncate">
                  Student Portal
                </p>
              </div>
            </div>

            {/* Right Actions */}
            <div className="flex items-center space-x-2">
              <NotificationBell />
              
              {/* Menu Button */}
              <button
                className={cn(
                  "touch-target p-3 rounded-xl transition-all duration-200",
                  "bg-gray-900 hover:bg-gray-800 text-white",
                  "focus:outline-none focus:ring-2 focus:ring-primary/50",
                  "shadow-md hover:shadow-lg",
                  "border-2 border-gray-600 hover:border-gray-500"
                )}
                onClick={toggleMenu}
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
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={closeMenu}
            />

            {/* Menu Panel */}
            <motion.div
              className={cn(
                "fixed top-0 right-0 h-full w-80 max-w-[85vw] z-[80]",
                "bg-white shadow-2xl",
                "safe-area-top safe-area-bottom",
                "border-l border-gray-200"
              )}
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ 
                type: 'spring', 
                stiffness: 300, 
                damping: 30,
                mass: 0.8
              }}
            >
              <div className="flex flex-col h-full">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-100 bg-gradient-to-r from-primary/5 to-secondary/5">
                  <div className="flex items-center space-x-3">
                    <div className="h-12 w-12 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg">
                      <User className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 text-lg">
                        {profile?.full_name || (
                          <div className="h-5 w-32 bg-gray-200 rounded animate-pulse" />
                        )}
                      </p>
                      <p className="text-sm text-gray-600 truncate max-w-[180px]">
                        {profile?.email || (
                          <div className="h-4 w-40 bg-gray-200 rounded animate-pulse" />
                        )}
                      </p>
                    </div>
                  </div>
                  
                  <button
                    className="touch-target p-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
                    onClick={closeMenu}
                    aria-label="Close menu"
                  >
                    <X className="h-6 w-6" />
                  </button>
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
                            className={cn(
                              "flex items-center space-x-4 p-4 rounded-xl transition-all duration-200",
                              "touch-target group relative overflow-hidden",
                              isActive
                                ? "bg-primary/10 text-primary border-2 border-primary/20"
                                : "text-gray-700 hover:bg-gray-50 border-2 border-transparent hover:border-gray-200"
                            )}
                          >
                            <div className={cn(
                              "p-2 rounded-lg transition-colors",
                              isActive 
                                ? "bg-primary/20 text-primary" 
                                : "bg-gray-100 text-gray-600 group-hover:bg-gray-200"
                            )}>
                              <item.icon className="h-5 w-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={cn(
                                "font-medium truncate",
                                isActive ? "text-primary" : "text-gray-900"
                              )}>
                                {item.label}
                              </p>
                              <p className="text-sm text-gray-500 truncate">
                                {item.description}
                              </p>
                            </div>
                            {isActive && (
                              <div className="w-2 h-2 bg-primary rounded-full" />
                            )}
                          </Link>
                        </motion.div>
                      )
                    })}
                  </nav>
                </div>

                {/* Sign Out Button */}
                <div className="p-4 border-t border-gray-100 bg-gray-50/50">
                  <motion.button
                    onClick={handleSignOut}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: navigationItems.length * 0.05 }}
                    className={cn(
                      "w-full flex items-center justify-center space-x-3",
                      "p-4 bg-gradient-to-r from-red-500 to-red-600 text-white",
                      "rounded-xl hover:from-red-600 hover:to-red-700",
                      "shadow-lg hover:shadow-xl transition-all duration-200",
                      "font-medium touch-target !visible !flex"
                    )}
                    style={{ visibility: 'visible !important', display: 'flex !important', opacity: '1 !important' }}
                  >
                    <LogOut className="h-5 w-5" />
                    <span>Sign Out</span>
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}