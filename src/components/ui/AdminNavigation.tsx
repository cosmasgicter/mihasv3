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

  const toggleMenu = () => {
    setIsOpen(!isOpen)
    if (!isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
  }
  
  const closeMenu = () => {
    setIsOpen(false)
    document.body.style.overflow = ''
  }
  
  // Cleanup on unmount and handle escape key
  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        closeMenu()
      }
    }
    
    document.addEventListener('keydown', handleEscape)
    
    return () => {
      document.body.style.overflow = ''
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen])

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
      x: '100%',
      transition: {
        duration: 0.25,
        ease: [0.4, 0, 0.2, 1]
      }
    },
    open: {
      x: 0,
      transition: {
        duration: 0.25,
        ease: [0.4, 0, 0.2, 1]
      }
    }
  }

  const itemVariants = {
    closed: { opacity: 0, x: 10 },
    open: (i: number) => ({
      opacity: 1,
      x: 0,
      transition: {
        delay: i * 0.05,
        duration: 0.2
      }
    })
  }

  const navigationItems = [
    { href: '/admin', label: 'Dashboard', icon: Home, emoji: '🏠' },
    { href: '/admin/applications', label: 'Applications', icon: FileText, emoji: '<FileText className="w-5 h-5" />' },
    { href: '/admin/programs', label: 'Programs', icon: GraduationCap, emoji: '<GraduationCap className="w-5 h-5" />' },
    { href: '/admin/intakes', label: 'Intakes', icon: Calendar, emoji: '<Calendar className="w-5 h-5" />' },
    { href: '/admin/users', label: 'Users', icon: Users, emoji: '👥' },
    { href: '/admin/analytics', label: 'Analytics', icon: BarChart3, emoji: '<BarChart3 className="w-5 h-5" />' },
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
    <NavigationMenu.Root className={cn("bg-card/95 backdrop-blur-sm shadow-lg border-b border-border/50 sticky top-0 z-50", className)}>
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-3 sm:py-4 max-w-7xl mx-auto">
          {/* Admin Info - Mobile First */}
          <div className="flex items-center space-x-2 sm:space-x-4">
            <motion.div 
              className="flex items-center space-x-2 sm:space-x-3"
              whileHover={{ scale: 1.02 }}
              transition={{ type: "spring", stiffness: 300 }}
            >
              <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center shadow-lg">
                <Shield className="h-4 w-4 sm:h-5 sm:w-5 text-foreground" />
              </div>
              <div>
                <h1 className="text-sm sm:text-lg font-bold text-body truncate max-w-[150px] sm:max-w-[200px]">
                  {isMobile ? 'Admin' : 'Admin Dashboard'}
                </h1>
                <p className="text-xs sm:text-sm text-body hidden sm:block truncate max-w-[200px]">
                  Welcome, {profile?.full_name || 'Admin'}
                </p>
                <p className="text-xs text-body sm:hidden truncate max-w-[120px]">
                  {profile?.full_name || 'Admin'}
                </p>
              </div>
            </motion.div>
          </div>

          {/* Desktop Navigation */}
          <NavigationMenu.List className="hidden lg:flex items-center space-x-1 overflow-x-auto flex-nowrap scrollbar-hide max-w-[60vw]">
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
                          ? "bg-primary text-body shadow-md" 
                          : "hover:bg-accent text-foreground"
                      )}
                    >
                      <item.icon className="h-4 w-4" />
                      <span className="font-medium truncate">{item.label}</span>
                    </Button>
                  </Link>
                </NavigationMenu.Item>
              )
            })}
            
            <NavigationMenu.Item>
              <div className="hidden xl:flex items-center text-xs text-body px-3 py-2 bg-muted rounded-lg ml-2">
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

          {/* Mobile Menu Button */}
          <motion.button
            className="lg:hidden p-3 rounded-xl bg-foreground hover:bg-foreground/80 text-body transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 min-h-[48px] min-w-[48px] touch-target border-2 border-border hover:border-primary shadow-lg nav-toggle-button"
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
              className="fixed inset-0 bg-black/70 backdrop-blur-md nav-backdrop lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeMenu}
            />

            {/* Mobile Menu */}
            <motion.div
              className="fixed top-0 right-0 h-full w-80 max-w-[85vw] bg-card shadow-2xl nav-panel lg:hidden safe-area-top safe-area-bottom border-l-4 border-primary overflow-y-auto"
              style={{
                backgroundColor: '#ffffff',
                zIndex: 9999,
                opacity: 1,
                visibility: 'visible'
              }}
              variants={menuVariants}
              initial="closed"
              animate="open"
              exit="closed"
            >
              <div className="flex flex-col h-full">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-border/70 bg-gradient-to-r from-blue-500/10 to-purple-500/10 backdrop-blur-sm">
                  <div className="flex items-center space-x-3">
                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center shadow-lg">
                      <Shield className="h-5 w-5 text-foreground" />
                    </div>
                    <div>
                      <p className="font-bold text-body text-lg truncate max-w-[150px]">Admin Panel</p>
                      <p className="text-sm text-body truncate max-w-[150px]">{profile?.full_name || 'Administrator'}</p>
                    </div>
                  </div>
                  <motion.button
                    className="p-2 rounded-lg text-body hover:bg-accent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 touch-target"
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
                                ? "bg-gradient-to-r from-blue-600 to-purple-600 text-body shadow-lg" 
                                : "text-body hover:bg-accent border border-border hover:border-input"
                            )}
                            style={{
                              backgroundColor: isActive ? undefined : '#ffffff',
                              color: isActive ? '#ffffff' : '#1f2937',
                              border: isActive ? undefined : '2px solid #e5e7eb',
                              opacity: 1,
                              visibility: 'visible'
                            }}
                          >
                            <div className="flex items-center justify-between w-full">
                              <div className="flex items-center space-x-3">
                                <span className="text-xl" style={{ opacity: 1 }}>{item.emoji}</span>
                                <div>
                                  <span className="mobile-nav-text truncate" style={{ 
                                    color: isActive ? '#ffffff' : '#1f2937',
                                    fontWeight: 600,
                                    opacity: 1
                                  }}>{item.label}</span>
                                  {isActive && (
                                    <div className="text-xs text-caption/80 mt-1">Current Page</div>
                                  )}
                                </div>
                              </div>
                              <ChevronRight className={cn(
                                "h-5 w-5 transition-colors",
                                isActive ? "text-foreground/80" : "text-foreground"
                              )} style={{ opacity: 1 }} />
                            </div>
                          </Link>
                        </motion.div>
                      </NavigationMenu.Item>
                    )
                  })}

                  {/* Role Badge */}
                  <div className="mt-6 p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl border border-primary/30">
                    <div className="text-center">
                      <div className="text-sm font-medium text-body mb-1">Current Role</div>
                      <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-gradient-to-r from-blue-600 to-purple-600 text-body truncate max-w-[150px]">
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
                        className="mobile-nav-item mobile-nav-focus w-full bg-gradient-to-r from-red-600 to-red-700 text-body hover:from-red-600 hover:to-red-700 shadow-lg hover:shadow-xl border-2 border-red-400 hover:border-error logout-button"
                      >
                        <div className="flex items-center justify-between w-full">
                          <div className="flex items-center space-x-3">
                            <LogOut className="h-5 w-5" />
                            <span className="mobile-nav-text truncate">Sign Out</span>
                          </div>
                          <ChevronRight className="h-5 w-5 text-foreground/80" />
                        </div>
                      </button>
                    </motion.div>
                  </NavigationMenu.Item>
                </NavigationMenu.List>

                {/* Footer */}
                <div className="p-6 border-t border-border/70 bg-muted/80 backdrop-blur-sm">
                  <div className="text-center">
                    <p className="text-sm font-medium text-body mb-1">
                      MIHAS-KATC Admin Portal
                    </p>
                    <p className="text-xs text-body">
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