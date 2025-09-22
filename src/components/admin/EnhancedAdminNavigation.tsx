import React, { useState } from 'react'

interface SubItem {
  href: string
  label: string
  emoji: string
}

interface NavigationItem {
  href?: string
  label: string
  icon?: any
  emoji: string
  isNew?: boolean
  subItems?: SubItem[]
}
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/contexts/AuthContext'
import { useProfileQuery } from '@/hooks/auth/useProfileQuery'
import { useRoleQuery } from '@/hooks/auth/useRoleQuery'
import { useIsMobile } from '@/hooks/use-mobile'
import { AdminSearchBar } from '@/components/admin/AdminSearchBar'
import { RealTimeNotifications } from '@/components/admin/RealTimeNotifications'
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
  ChevronDown,
  Activity,
  Brain,
  Zap,
  Bot
} from 'lucide-react'

export function EnhancedAdminNavigation() {
  const { signOut } = useAuth()
  const { profile } = useProfileQuery()
  const { userRole } = useRoleQuery()
  const isMobile = useIsMobile()
  const navigate = useNavigate()
  const location = useLocation()
  const [isOpen, setIsOpen] = useState(false)
  const [expandedMenus, setExpandedMenus] = useState<string[]>([])

  const toggleMenu = () => setIsOpen(!isOpen)
  const closeMenu = () => setIsOpen(false)
  
  const toggleSubMenu = (label: string) => {
    setExpandedMenus(prev => 
      prev.includes(label) 
        ? prev.filter(item => item !== label)
        : [...prev, label]
    )
  }

  const handleSignOut = async () => {
    await signOut()
    navigate('/')
  }

  const navigationItems: NavigationItem[] = [
    { href: '/admin', label: 'Dashboard', icon: Home, emoji: '🏠' },
    { 
      label: 'Applications', 
      icon: FileText, 
      emoji: '📋',
      subItems: [
        { href: '/admin/applications', label: 'All Applications', emoji: '📄' },
        { href: '/admin/applications/pending', label: 'Pending Review', emoji: '⏳' },
        { href: '/admin/applications/approved', label: 'Approved', emoji: '✅' }
      ]
    },
    { href: '/admin/ai-insights', label: 'AI Insights', icon: Brain, emoji: '🤖', isNew: true },
    { 
      label: 'Academic', 
      icon: GraduationCap, 
      emoji: '🎓',
      subItems: [
        { href: '/admin/programs', label: 'Programs', emoji: '📚' },
        { href: '/admin/intakes', label: 'Intakes', emoji: '📅' },
        { href: '/admin/subjects', label: 'Subjects', emoji: '📖' }
      ]
    },
    { 
      label: 'Management', 
      icon: Users, 
      emoji: '👥',
      subItems: [
        { href: '/admin/users', label: 'Users', emoji: '👤' },
        { href: '/admin/analytics', label: 'Analytics', emoji: '📊' },
        { href: '/admin/audit', label: 'Audit Trail', emoji: '🛡️' }
      ]
    },
    { href: '/admin/workflow', label: 'Automation', icon: Zap, emoji: '⚡', isNew: true },
    { href: '/admin/settings', label: 'Settings', icon: Settings, emoji: '⚙️' },
  ]

  const isActiveRoute = (href: string) => {
    if (href === '/admin') {
      return location.pathname === '/admin' || location.pathname === '/admin/enhanced-dashboard'
    }
    return location.pathname.startsWith(href)
  }

  return (
    <nav className="bg-white/95 backdrop-blur-sm shadow-lg border-b border-gray-200/50 sticky top-0 z-40">
      <div className="container-mobile">
        <div className="flex justify-between items-center py-3 sm:py-4">
          {/* Logo & Brand */}
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
                  MIHAS Admin
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
          <div className="hidden lg:flex items-center space-x-4 flex-1 max-w-4xl">
            {/* Search Bar */}
            <div className="flex-1 max-w-md mx-4">
              <AdminSearchBar />
            </div>
            
            {/* Navigation Items */}
            <div className="flex items-center space-x-1">
              {navigationItems.slice(0, 6).map((item) => {
                const isActive = isActiveRoute(item.href)
                return (
                  <Link key={item.href} to={item.href}>
                    <Button 
                      variant={isActive ? "primary" : "ghost"} 
                      size="sm" 
                      className={`relative flex items-center space-x-2 transition-all duration-200 ${
                        isActive 
                          ? "bg-primary text-white shadow-md" 
                          : "hover:bg-gray-100 text-gray-700"
                      } ${item.isNew ? 'ring-2 ring-purple-200 ring-opacity-50' : ''}`}
                    >
                      <item.icon className="h-4 w-4" />
                      <span className="font-medium">{item.label}</span>
                      {item.isNew && (
                        <span className="absolute -top-1 -right-1 bg-purple-500 text-white text-xs px-1.5 py-0.5 rounded-full font-bold animate-pulse">
                          NEW
                        </span>
                      )}
                    </Button>
                  </Link>
                )
              })}
            </div>
            
            {/* Right Side Actions */}
            <div className="flex items-center space-x-3">
              <RealTimeNotifications />
              
              <div className="hidden xl:flex items-center text-xs text-gray-500 px-3 py-2 bg-gray-50 rounded-lg">
                <span className="font-medium">{userRole?.role?.replace('_', ' ').toUpperCase() || 'ADMIN'}</span>
              </div>
              
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleSignOut}
                className="text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </div>

          {/* Mobile Actions */}
          <div className="lg:hidden flex items-center space-x-2">
            <RealTimeNotifications />
            <motion.button
              className="p-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/50 touch-target"
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
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              className="fixed inset-0 bg-black/70 backdrop-blur-md z-40 lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeMenu}
            />

            {/* Mobile Menu Panel */}
            <motion.div
              className="fixed top-0 right-0 h-full w-80 max-w-[90vw] bg-white/90 backdrop-blur-xl shadow-2xl z-50 lg:hidden safe-area-top safe-area-bottom border-l border-gray-200/50"
              initial={{ x: '100%', opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '100%', opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.25, 0.25, 0, 1] }}
            >
              <div className="flex flex-col h-full">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-200/70 bg-gradient-to-r from-primary/10 to-secondary/10 backdrop-blur-sm">
                  <div className="flex items-center space-x-3">
                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg">
                      <Shield className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <p className="font-bold text-gray-900 text-lg">MIHAS Admin</p>
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

                {/* Mobile Search */}
                <div className="p-6 border-b border-gray-200">
                  <AdminSearchBar />
                </div>
                
                {/* Navigation Items */}
                <div className="flex flex-col flex-1 overflow-hidden">
                  <div className="flex flex-col space-y-2 p-6 flex-1 overflow-y-auto">
                    {navigationItems.map((item, index) => {
                      const hasSubItems = 'subItems' in item
                      const isExpanded = expandedMenus.includes(item.label)
                      const isActive = hasSubItems ? false : isActiveRoute(item.href!)
                      
                      return (
                        <motion.div
                          key={item.label}
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.1 }}
                        >
                          {hasSubItems ? (
                            <>
                              <button
                                onClick={() => toggleSubMenu(item.label)}
                                className={`relative mobile-nav-item mobile-nav-focus transition-all duration-300 w-full text-left ${
                                  isExpanded
                                    ? "bg-gray-100 text-gray-900 border border-gray-300" 
                                    : "text-gray-700 hover:bg-gray-100 border border-gray-200 hover:border-gray-300"
                                }`}
                              >
                                <div className="flex items-center justify-between w-full">
                                  <div className="flex items-center space-x-3">
                                    <span className="text-lg">{item.emoji}</span>
                                    <span className="mobile-nav-text">{item.label}</span>
                                  </div>
                                  <ChevronDown className={`h-4 w-4 transition-transform ${
                                    isExpanded ? "rotate-180" : ""
                                  }`} />
                                </div>
                              </button>
                              
                              <AnimatePresence>
                                {isExpanded && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="overflow-hidden ml-4 space-y-1"
                                  >
                                    {item.subItems.map((subItem) => {
                                      const subIsActive = isActiveRoute(subItem.href)
                                      return (
                                        <Link
                                          key={subItem.href}
                                          to={subItem.href}
                                          onClick={closeMenu}
                                          className={`mobile-nav-item mobile-nav-focus transition-all duration-300 text-sm ${
                                            subIsActive
                                              ? "bg-gradient-to-r from-primary to-secondary text-white shadow-lg"
                                              : "text-gray-600 hover:bg-gray-50 border border-gray-100 hover:border-gray-200"
                                          }`}
                                        >
                                          <div className="flex items-center space-x-2">
                                            <span className="text-sm">{subItem.emoji}</span>
                                            <span className="mobile-nav-text">{subItem.label}</span>
                                          </div>
                                        </Link>
                                      )
                                    })}
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </>
                          ) : (
                            <Link 
                              to={item.href!}
                              onClick={closeMenu}
                              className={`relative mobile-nav-item mobile-nav-focus transition-all duration-300 ${
                                isActive 
                                  ? "bg-gradient-to-r from-primary to-secondary text-white shadow-lg" 
                                  : "text-gray-700 hover:bg-gray-100 border border-gray-200 hover:border-gray-300"
                              } ${item.isNew ? 'ring-2 ring-purple-200' : ''}`}
                            >
                              <div className="flex items-center justify-between w-full">
                                <div className="flex items-center space-x-3">
                                  <span className="text-lg">{item.emoji}</span>
                                  <div>
                                    <div className="flex items-center space-x-2">
                                      <span className="mobile-nav-text">{item.label}</span>
                                      {item.isNew && (
                                        <span className="bg-purple-500 text-white text-xs px-1.5 py-0.5 rounded-full font-bold animate-pulse">
                                          NEW
                                        </span>
                                      )}
                                    </div>
                                    {isActive && (
                                      <div className="text-xs text-white/80 mt-1">Current Page</div>
                                    )}
                                  </div>
                                </div>
                                <ChevronRight className={`h-4 w-4 transition-colors ${
                                  isActive ? "text-white/80" : "text-gray-400"
                                }`} />
                              </div>
                            </Link>
                          )}
                        </motion.div>
                      )
                    })

                    {/* Role Badge */}
                    <div className="mt-6 p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl border border-blue-200">
                      <div className="text-center">
                        <div className="text-sm font-medium text-gray-700 mb-1">Current Role</div>
                        <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-gradient-to-r from-primary to-secondary text-white">
                          {userRole?.role?.replace('_', ' ').toUpperCase() || 'ADMIN'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Fixed Sign Out Button */}
                  <div className="p-6 border-t border-gray-200 bg-white/90 backdrop-blur-sm">
                    <motion.button 
                      onClick={() => {
                        closeMenu()
                        handleSignOut()
                      }}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                      className="w-full flex items-center justify-center space-x-3 px-4 py-3 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-xl hover:from-red-600 hover:to-red-700 shadow-lg hover:shadow-xl transition-all duration-200 font-medium"
                    >
                      <LogOut className="h-5 w-5" />
                      <span>Sign Out</span>
                    </motion.button>
                  </div>
                </div>

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
    </nav>
  )
}