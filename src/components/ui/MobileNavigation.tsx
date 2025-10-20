import React, { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from './Button'
import { GraduationCap, Menu, X, LayoutDashboard, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { useRoleQuery } from '@/hooks/auth/useRoleQuery'

interface MobileNavigationProps {
  className?: string
}

export function MobileNavigation({ className }: MobileNavigationProps) {
  const [isOpen, setIsOpen] = useState(false)
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const { isAdmin } = useRoleQuery({ user })

  const toggleMenu = () => setIsOpen(!isOpen)
  const closeMenu = () => setIsOpen(false)

  const handleSignOut = async () => {
    try {
      await signOut()
      navigate('/')
    } catch (error) {
      console.error('Sign out failed:', error)
      navigate('/')
    }
  }

  const menuVariants = {
    closed: {
      x: '100%',
      transition: {
        type: 'spring',
        stiffness: 400,
        damping: 40
      }
    },
    open: {
      x: 0,
      transition: {
        type: 'spring',
        stiffness: 400,
        damping: 40,
        staggerChildren: 0.1,
        delayChildren: 0.2
      }
    }
  }

  const itemVariants = {
    closed: {
      x: 50,
      opacity: 0
    },
    open: (custom: number) => {
      return {
        x: 0,
        opacity: 1,
        transition: {
          delay: custom * 0.1
        }
      }
    }
  }

  const dashboardPath = isAdmin ? '/admin/dashboard' : '/student/dashboard'
  const dashboardLabel = isAdmin ? 'Admin Dashboard' : 'Dashboard'

  type DrawerItem = {
    to: string
    label: string
    variant?: 'default' | 'accent'
    icon?: React.ReactNode
  }

  const drawerItems = useMemo<DrawerItem[]>(() => {
    const items: DrawerItem[] = [
      { to: '/', label: 'Home' },
      { to: '/track-application', label: 'Track Application' }
    ]

    if (!user) {
      items.push(
        { to: '/auth/signin', label: 'Sign In' },
        { to: '/auth/signup', label: 'Sign Up', variant: 'accent' }
      )
    } else {
      items.push({
        to: dashboardPath,
        label: dashboardLabel,
        variant: 'accent',
        icon: <LayoutDashboard className="w-5 h-5 mr-3 text-white" />
      })
    }

    return items
  }, [dashboardLabel, dashboardPath, user])

  return (
    <div className={cn("relative", className)}>
      <div className="flex justify-between items-center py-4">
        {/* Logo */}
        <motion.div
          className="flex items-center space-x-2"
          whileHover={{ scale: 1.05 }}
          transition={{ type: "spring", stiffness: 300 }}
        >
          <motion.div
            animate={{ rotate: [0, 360] }}
            transition={{ 
              duration: 20, 
              repeat: Infinity, 
              ease: "linear",
              repeatType: "loop"
            }}
            style={{ willChange: 'transform' }}
          >
            <GraduationCap className="h-8 w-8 text-primary" />
          </motion.div>
          <span className="text-xl font-bold text-high-contrast">MIHAS-KATC</span>
        </motion.div>

        {/* Desktop Navigation */}
        <div className="hidden md:flex space-x-4">
          <Link to="/track-application">
            <Button
              variant="gradient"
              size="md"
              
              className="bg-gradient-to-r from-white/30 to-white/40 border-2 border-white/70 text-white hover:from-white hover:to-white hover:text-primary font-bold backdrop-blur-sm shadow-lg"
            >
              Track Application
            </Button>
          </Link>
          {!user ? (
            <>
              <Link to="/auth/signin">
                <Button
                  variant="gradient"
                  size="md"
                  
                  className="bg-gradient-to-r from-white/30 to-white/40 border-2 border-white/70 text-white hover:from-white hover:to-white hover:text-primary font-bold backdrop-blur-sm shadow-lg"
                >
                  Sign In
                </Button>
              </Link>
              <Link to="/auth/signup">
                <Button variant="gradient" size="md"   className="font-semibold">
                  Sign Up
                </Button>
              </Link>
            </>
          ) : (
            <>
              <Link to={dashboardPath}>
                <Button
                  variant="gradient"
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
                className="border-white/70 text-white hover:bg-white/90/30"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </Button>
            </>
          )}
        </div>

        {/* Mobile Menu Button */}
        <motion.button
          className="md:hidden p-3 rounded-xl text-white bg-foreground/90 hover:bg-gray-800 backdrop-blur-sm transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-blue-500/60 shadow-lg hover:shadow-xl border-2 border-white/50 hover:border-white/70 min-h-[48px] min-w-[48px] z-[102] touch-target"
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

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              className="fixed inset-0 bg-black/70 backdrop-blur-md z-[100] md:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeMenu}
            />

            {/* Mobile Menu */}
            <motion.div
              className="fixed top-0 right-0 h-full w-80 max-w-[85vw] bg-foreground/90 from-gray-900 to-gray-800 backdrop-blur-xl shadow-2xl md:hidden border-l-4 border-white/30 safe-area-top safe-area-bottom z-[9999] opacity-100 visible"
              variants={menuVariants}
              initial="closed"
              animate="open"
              exit="closed"
            >
              <div className="flex flex-col h-full">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-white/20 bg-black/10 backdrop-blur-sm">
                  <div className="flex items-center space-x-3">
                    <GraduationCap className="h-7 w-7 text-primary" />
                    <span className="text-xl font-bold text-high-contrast">MIHAS-KATC</span>
                  </div>
                  <motion.button
                    className="p-2 rounded-lg text-white hover:bg-white/90/30 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-white/50 min-h-[44px] min-w-[44px] touch-target"
                    onClick={closeMenu}
                    whileTap={{ scale: 0.95 }}
                    aria-label="Close menu"
                  >
                    <X className="h-5 w-5" />
                  </motion.button>
                </div>

                {/* Navigation Items */}
                <div className="flex flex-col flex-1 overflow-hidden">
                  <div className="flex flex-col space-y-3 p-6 flex-1 overflow-y-auto">
                    {drawerItems.map((item, index) => (
                      <motion.div
                        key={item.to}
                        variants={itemVariants}
                        custom={index}
                        initial="closed"
                        animate="open"
                      >
                        <Link
                          to={item.to}
                          onClick={closeMenu}
                          className={cn(
                            'flex items-center px-4 py-4 rounded-xl text-white transition-all duration-200 font-bold shadow-lg hover:shadow-xl min-h-[48px] touch-target',
                            item.variant === 'accent'
                              ? 'bg-blue-500/30 hover:bg-blue-500/40'
                              : 'hover:bg-white/90/30',
                            'bg-opacity-100 visible border border-white/10'
                          )}
                        >
                          {item.icon}
                          <span className="text-white font-bold truncate">{item.label}</span>
                        </Link>
                      </motion.div>
                    ))}
                  </div>

                  {/* Fixed Sign Out Button for authenticated users */}
                  {user && (
                    <div className="p-6 border-t border-white/20 bg-black/10 backdrop-blur-sm">
                      <motion.button
                        onClick={() => {
                          closeMenu()
                          handleSignOut()
                        }}
                        variants={itemVariants}
                        custom={drawerItems.length}
                        initial="closed"
                        animate="open"
                        className="w-full flex items-center justify-center space-x-3 px-4 py-4 bg-gradient-to-r from-red-600 to-red-700 text-white rounded-xl hover:from-red-600 hover:to-red-700 shadow-lg hover:shadow-xl transition-all duration-200 font-medium min-h-[48px] touch-target"
                      >
                        <LogOut className="h-5 w-5" />
                        <span>Sign Out</span>
                      </motion.button>
                    </div>
                  )}
                </div>

                {/* Footer */}
                {!user && (
                  <div className="p-6 border-t border-white/20 bg-black/10 backdrop-blur-sm">
                    <p className="text-white/90 text-base text-center font-medium drop-shadow-sm">
                      Your Future Starts Here
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}