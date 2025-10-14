import React, { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import * as NavigationMenu from '@radix-ui/react-navigation-menu'
import { Button } from './Button'
import { useAuth } from '@/contexts/AuthContext'
import { useProfileQuery } from '@/hooks/auth/useProfileQuery'
import { useRoleQuery } from '@/hooks/auth/useRoleQuery'
import { useIsMobile } from '@/hooks/use-mobile'
import { 
  Settings, 
  LogOut, 
  Menu, 
  X, 
  Home,
  FileText,
  GraduationCap,
  Calendar,
  Users,
  Shield,
  BarChart3,
  ChevronRight,
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
  const [isOpen, setIsOpen] = useState(false)

  const toggleMenu = () => setIsOpen(!isOpen)
  const closeMenu = () => setIsOpen(false)

  const handleSignOut = async () => {
    try {
      await signOut()
      navigate('/', { replace: true })
    } catch (error) {
      console.error('Sign out error:', error)
      // Force navigation even if signOut fails
      navigate('/', { replace: true })
    }
  }

  const menuVariants = {
    closed: {
      opacity: 0,
      x: '100%',
      transition: {
        duration: 0.3,
        ease: [0.25, 0.25, 0, 1]
      }
    },
    open: {
      opacity: 1,
      x: 0,
      transition: {
        duration: 0.3,
        ease: [0.25, 0.25, 0, 1]
      }
    }
  }

  const itemVariants = {
    closed: { opacity: 0, x: 20 },
    open: (i: number) => ({
      opacity: 1,
      x: 0,
      transition: {
        delay: i * 0.1,
        duration: 0.3
      }
    })
  }

  const navigationItems = [
    { href: '/admin', label: 'Dashboard', icon: Home, emoji: '🏠' },
    { href: '/admin/applications', label: 'Applications', icon: FileText, emoji: '📋' },
    { href: '/admin/programs', label: 'Programs', icon: GraduationCap, emoji: '🎓' },
    { href: '/admin/intakes', label: 'Intakes', icon: Calendar, emoji: '📅' },
    { href: '/admin/users', label: 'Users', icon: Users, emoji: '👥' },
    { href: '/admin/analytics', label: 'Analytics', icon: BarChart3, emoji: '📊' },
    { href: '/admin/audit', label: 'Audit trail', icon: Activity, emoji: '🛡️' },
    { href: '/admin/settings', label: 'Settings', icon: Settings, emoji: '⚙️' },
  ]

  const isActiveRoute = (href: string) => {
    if (href === '/admin') {
      return location.pathname === '/admin'
    }
    return location.pathname.startsWith(href)
  }

  return (
    <NavigationMenu.Root className={cn("bg-white/95 backdrop-blur-sm shadow-lg border-b border-gray-200/50 sticky top-0 z-50", className)}>
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-3 sm:py-4 max-w-7xl mx-auto">
          {/* Admin Info - Mobile First */}
          <div className="flex items-center space-x-2 sm:space-x-4">
            <motion.div 
              className="flex items-center space-x-2 sm:space-x-3"
              whileHover={{ scale: 1.02 }}
              transition={{ type: "spring", stiffness: 300 }}
            >
              <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg">
                <Shield className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
              </div>
              <div>
                <h1 className="text-sm sm:text-lg font-bold text-gray-900">
                  {isMobile ? 'Admin' : 'Admin Dashboard'}
                </h1>
                <p className="text-xs sm:text-sm text-gray-600 hidden sm:block">
                  Welcome, {profile?.full_name || 'Admin'}
                </p>
                <p className="text-xs text-gray-600 sm:hidden">
                  {profile?.full_name || 'Admin'}
                </p>
              </div>
            </motion.div>
          </div>

          {/* Desktop Navigation */}
          <NavigationMenu.List className="hidden lg:flex items-center space-x-1 overflow-x-auto flex-nowrap">
            {navigationItems.map((item) => {
              const isActive = isActiveRoute(item.href)
              return (
                <NavigationMenu.Item key={item.href}>
                  <Link to={item.href}>
                    <Button 
                      variant={isActive ? "primary" : "ghost"} 
                      size="sm" 
                      className={cn(
                        "flex items-center space-x-2 transition-all duration-200",
                        isActive 
                          ? "bg-primary text-white shadow-md" 
                          : "hover:bg-gray-100 text-gray-700"
                      )}
                    >
                      <item.icon className="h-4 w-4" />
                      <span className="font-medium">{item.label}</span>
                    </Button>
                  </Link>
                </NavigationMenu.Item>
              )
            })}
            
            <NavigationMenu.Item>
              <div className="hidden xl:flex items-center text-xs text-gray-500 px-3 py-2 bg-gray-50 rounded-lg ml-2">
                <span className="font-medium">{userRole?.role?.replace('_', ' ').toUpperCase() || 'ADMIN'}</span>
              </div>
            </NavigationMenu.Item>
            
            <NavigationMenu.Item className="flex-shrink-0">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleSignOut}
                className="ml-2 text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300 whitespace-nowrap flex items-center !visible !flex"
                style={{ visibility: 'visible !important', display: 'flex !important', opacity: '1 !important' }}
              >
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </Button>
            </NavigationMenu.Item>
          </NavigationMenu.List>

          {/* Mobile Menu Button */}
          <motion.button
            className="lg:hidden p-3 rounded-xl bg-gray-900 hover:bg-gray-800 text-white transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/50 min-h-[48px] min-w-[48px] touch-target border-2 border-gray-600 hover:border-gray-500 shadow-lg z-[102]"
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
                  transition={{ duration: 0.2 }}
                >
                  <X className="h-5 w-5 sm:h-6 sm:w-6" />
                </motion.div>
              ) : (
                <motion.div
                  key="menu"
                  initial={{ rotate: 90, opacity: 0 }}
                  animate={{ rotate: 0, opacity: 1 }}
                  exit={{ rotate: -90, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <Menu className="h-5 w-5 sm:h-6 sm:w-6" />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.button>
        </div>
      </div>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              className="fixed inset-0 bg-black/70 backdrop-blur-md z-[100] lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeMenu}
            />

            {/* Mobile Menu */}
            <motion.div
              className="fixed top-0 right-0 h-full w-80 max-w-[90vw] bg-white shadow-2xl z-[101] lg:hidden safe-area-top safe-area-bottom border-l border-gray-200/50"
              variants={menuVariants}
              initial="closed"
              animate="open"
              exit="closed"
            >
              <div className="flex flex-col h-full">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-200/70 bg-gradient-to-r from-primary/10 to-secondary/10 backdrop-blur-sm">
                  <div className="flex items-center space-x-3">
                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg">
                      <Shield className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <p className="font-bold text-gray-900 text-lg">Admin Panel</p>
                      <p className="text-sm text-gray-600">{profile?.full_name || 'Administrator'}</p>
                    </div>
                  </div>
                  <motion.button
                    className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary/50 touch-target"
                    onClick={closeMenu}
                    whileTap={{ scale: 0.95 }}
                    aria-label="Close menu"
                  >
                    <X className="h-6 w-6" />
                  </motion.button>
                </div>

                {/* Navigation Items */}
                <NavigationMenu.List className="flex flex-col space-y-2 p-6 flex-1 custom-scrollbar overflow-y-auto">
                  {navigationItems.map((item, index) => {
                    const isActive = isActiveRoute(item.href)
                    return (
                      <NavigationMenu.Item key={item.href}>
                        <motion.div
                          variants={itemVariants}
                          custom={index}
                          initial="closed"
                          animate="open"
                        >
                          <Link 
                            to={item.href}
                            onClick={closeMenu}
                            className={cn(
                              "mobile-nav-item mobile-nav-focus transition-all duration-300",
                              isActive 
                                ? "bg-gradient-to-r from-primary to-secondary text-white shadow-lg" 
                                : "text-gray-700 hover:bg-gray-100 border border-gray-200 hover:border-gray-300"
                            )}
                          >
                            <div className="flex items-center justify-between w-full">
                              <div className="flex items-center space-x-3">
                                <span className="text-xl">{item.emoji}</span>
                                <div>
                                  <span className="mobile-nav-text">{item.label}</span>
                                  {isActive && (
                                    <div className="text-xs text-white/80 mt-1">Current Page</div>
                                  )}
                                </div>
                              </div>
                              <ChevronRight className={cn(
                                "h-5 w-5 transition-colors",
                                isActive ? "text-white/80" : "text-gray-400"
                              )} />
                            </div>
                          </Link>
                        </motion.div>
                      </NavigationMenu.Item>
                    )
                  })}

                  {/* Role Badge */}
                  <div className="mt-6 p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl border border-blue-200">
                    <div className="text-center">
                      <div className="text-sm font-medium text-gray-700 mb-1">Current Role</div>
                      <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-gradient-to-r from-primary to-secondary text-white">
                        {userRole?.role?.replace('_', ' ').toUpperCase() || 'ADMIN'}
                      </div>
                    </div>
                  </div>

                  {/* Sign Out */}
                  <NavigationMenu.Item className="mt-4">
                    <motion.div
                      variants={itemVariants}
                      custom={navigationItems.length}
                      initial="closed"
                      animate="open"
                    >
                      <button 
                        onClick={async () => {
                          closeMenu()
                          await handleSignOut()
                        }}
                        className="mobile-nav-item mobile-nav-focus w-full bg-gradient-to-r from-red-500 to-red-600 text-white hover:from-red-600 hover:to-red-700 shadow-lg hover:shadow-xl border-2 border-red-400 hover:border-red-500 !visible !flex"
                        style={{ visibility: 'visible !important', display: 'flex !important', opacity: '1 !important' }}
                      >
                        <div className="flex items-center justify-between w-full">
                          <div className="flex items-center space-x-3">
                            <LogOut className="h-5 w-5" />
                            <span className="mobile-nav-text">Sign Out</span>
                          </div>
                          <ChevronRight className="h-5 w-5 text-white/80" />
                        </div>
                      </button>
                    </motion.div>
                  </NavigationMenu.Item>
                </NavigationMenu.List>

                {/* Footer */}
                <div className="p-6 border-t border-gray-200/70 bg-gray-50/80 backdrop-blur-sm">
                  <div className="text-center">
                    <p className="text-sm font-medium text-gray-700 mb-1">
                      MIHAS-KATC Admin Portal
                    </p>
                    <p className="text-xs text-gray-500">
                      Secure Administrative Access
                    </p>
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