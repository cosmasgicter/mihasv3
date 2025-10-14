import React, { useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import * as NavigationMenu from '@radix-ui/react-navigation-menu'
import { Button } from './Button'
import { useAuth } from '@/contexts/AuthContext'
import { useProfileQuery } from '@/hooks/auth/useProfileQuery'
import { useIsMobile } from '@/hooks/use-mobile'
import { NotificationBell } from '@/components/student/NotificationBell'
import {
  User,
  LogOut,
  Settings,
  Menu,
  X,
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
  const [isOpen, setIsOpen] = useState(false)

  const toggleMenu = () => setIsOpen(!isOpen)
  const closeMenu = () => setIsOpen(false)

  const handleSignOut = async () => {
    try {
      await signOut()
      navigate('/')
    } catch (error) {
      console.error('Sign out failed:', error)
      // Fallback: navigate anyway to prevent user being stuck
      navigate('/')
    }
  }

  const menuVariants = useMemo(() => ({
    closed: {
      opacity: 0,
      x: '100%',
      transition: {
        duration: 0.25,
        ease: [0.4, 0, 0.2, 1]
      }
    },
    open: {
      opacity: 1,
      x: 0,
      transition: {
        duration: 0.25,
        ease: [0.4, 0, 0.2, 1]
      }
    }
  }), [])

  const itemVariants = useMemo(() => ({
    closed: { opacity: 0, x: 20 },
    open: (i: number) => ({
      opacity: 1,
      x: 0,
      transition: {
        delay: i * 0.05,
        duration: 0.2,
        ease: [0.4, 0, 0.2, 1]
      }
    })
  }), [])

  const navigationItems = [
    { href: '/student/dashboard', label: 'Dashboard', icon: Home },
    { href: '/student/application-wizard', label: 'New Application', icon: Plus },
    { href: '/settings', label: 'Settings', icon: Settings },
    { href: '/student/notifications', label: 'Notifications', icon: Bell }
  ]

  return (
    <NavigationMenu.Root className={cn("nav-container bg-white/95 backdrop-blur-sm shadow-lg border-b border-gray-200/50 sticky top-0 z-50", className)}>
      <div className="container-mobile">
        <div className="flex justify-between items-center py-3 sm:py-4">
          {/* User Info - Mobile First */}
          <div className="flex items-center space-x-2 sm:space-x-4">
            <motion.div 
              className="flex items-center space-x-2 sm:space-x-3"
              whileHover={{ scale: 1.02 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
            >
              <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg">
                <User className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-sm sm:text-lg font-bold text-gray-900 truncate">
                  {profile?.full_name ? (
                    isMobile ? profile.full_name.split(' ')[0] : `Welcome, ${profile.full_name}`
                  ) : (
                    <span className="inline-flex items-center space-x-2">
                      <span className="h-4 w-16 bg-gray-200 rounded animate-pulse" />
                    </span>
                  )}
                </h1>
                <p className="text-xs sm:text-sm text-gray-600 truncate max-w-[200px]">
                  {profile?.email || (
                    <span className="inline-flex items-center">
                      <span className="h-3 w-24 bg-gray-200 rounded animate-pulse" />
                    </span>
                  )}
                </p>
              </div>
            </motion.div>
          </div>

          {/* Right Side Actions */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="lg:hidden">
              <NotificationBell />
            </div>

            {/* Desktop Navigation */}
            <NavigationMenu.List className="hidden lg:flex items-center space-x-2">
              {navigationItems.map((item) => (
                <NavigationMenu.Item key={item.href}>
                  <Link to={item.href}>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex items-center space-x-2 hover:bg-primary/10 hover:text-primary smooth-transition"
                    >
                      <item.icon className="h-4 w-4" />
                      <span className="font-medium">{item.label}</span>
                    </Button>
                  </Link>
                </NavigationMenu.Item>
              ))}

              <NavigationMenu.Item>
                <NotificationBell />
              </NavigationMenu.Item>

              <NavigationMenu.Item>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSignOut}
                  className="ml-2 text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300"
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign Out
                </Button>
              </NavigationMenu.Item>
            </NavigationMenu.List>

            {/* Mobile Menu Button */}
            <motion.button
              className="lg:hidden mobile-menu-button mobile-menu-hw-accel smooth-transition focus:outline-none focus:ring-2 focus:ring-primary/50 touch-target"
              onClick={toggleMenu}
              whileTap={{ scale: 0.95 }}
              aria-label={isOpen ? "Close menu" : "Open menu"}
              aria-expanded={isOpen}
              data-testid="auth-nav-mobile-toggle"
              style={{ visibility: 'visible', display: 'flex', zIndex: 10000 }}
            >
              <AnimatePresence mode="wait">
                {isOpen ? (
                  <motion.div
                    key="close"
                    initial={{ rotate: -90, opacity: 0 }}
                    animate={{ rotate: 0, opacity: 1 }}
                    exit={{ rotate: 90, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <X className="h-6 w-6" />
                  </motion.div>
                ) : (
                  <motion.div
                    key="menu"
                    initial={{ rotate: 90, opacity: 0 }}
                    animate={{ rotate: 0, opacity: 1 }}
                    exit={{ rotate: -90, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Menu className="h-6 w-6" />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.button>
          </div>

        </div>
      </div>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              className="mobile-menu-backdrop lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeMenu}
              style={{ visibility: 'visible', display: 'block', zIndex: 9998 }}
            />

            {/* Mobile Menu */}
            <motion.div
              className="mobile-menu-container mobile-menu-hw-accel lg:hidden safe-area-top safe-area-bottom border-l border-gray-200/50"
              variants={menuVariants}
              initial="closed"
              animate="open"
              exit="closed"
              data-testid="auth-nav-mobile-menu"
              style={{ visibility: 'visible', display: 'block', zIndex: 9999 }}
            >
              <div className="flex flex-col h-full">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-200/70 bg-gradient-to-r from-primary/10 to-secondary/10 backdrop-blur-sm">
                  <div className="flex items-center space-x-3">
                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg">
                      <User className="h-5 w-5 text-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-gray-900 text-lg truncate">
                        {profile?.full_name || (
                          <span className="inline-flex items-center">
                            <span className="h-5 w-24 bg-gray-200 rounded animate-pulse" />
                          </span>
                        )}
                      </p>
                      <p className="text-sm text-gray-600 truncate max-w-[180px]">
                        {profile?.email || (
                          <span className="inline-flex items-center">
                            <span className="h-4 w-32 bg-gray-200 rounded animate-pulse" />
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <motion.button
                    className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 smooth-transition focus:outline-none focus:ring-2 focus:ring-primary/50 touch-target"
                    onClick={closeMenu}
                    whileTap={{ scale: 0.95 }}
                    aria-label="Close menu"
                  >
                    <X className="h-6 w-6" />
                  </motion.button>
                </div>

                {/* Navigation Items */}
                <div className="flex flex-col flex-1 overflow-hidden">
                  <div className="flex flex-col space-y-3 p-6 flex-1 overflow-y-auto">
                    {navigationItems.map((item, index) => (
                      <motion.div
                        key={item.href}
                        variants={itemVariants}
                        custom={index}
                        initial="closed"
                        animate="open"
                      >
                        <Link 
                          to={item.href}
                          onClick={closeMenu}
                          className="mobile-nav-item mobile-nav-focus mobile-menu-hw-accel text-gray-700 hover:bg-primary/10 hover:text-primary border border-gray-200 hover:border-primary/30 smooth-transition-slow block w-full"
                        >
                          <div className="flex items-center justify-between w-full">
                            <div className="flex items-center space-x-3">
                              <item.icon className="h-5 w-5 flex-shrink-0" />
                              <span className="mobile-nav-text">{item.label}</span>
                            </div>
                            <div className="w-2 h-2 rounded-full bg-primary/20"></div>
                          </div>
                        </Link>
                      </motion.div>
                    ))}
                  </div>

                  {/* Fixed Sign Out Button */}
                  <div className="p-6 border-t border-gray-200 bg-white backdrop-blur-sm">
                    <motion.button 
                      onClick={() => {
                        closeMenu()
                        handleSignOut()
                      }}
                      variants={itemVariants}
                      custom={navigationItems.length}
                      initial="closed"
                      animate="open"
                      className="w-full flex items-center justify-center space-x-3 px-4 py-4 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-xl hover:from-red-600 hover:to-red-700 shadow-lg hover:shadow-xl smooth-transition font-medium min-h-[48px] touch-target mobile-menu-hw-accel"
                    >
                      <LogOut className="h-5 w-5" />
                      <span>Sign Out</span>
                    </motion.button>
                  </div>
                </div>


              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </NavigationMenu.Root>
  )
}