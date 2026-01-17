/**
 * ResponsiveHeader Component - Enhanced navigation header with scroll behavior
 * 
 * Features:
 * - Sticky header with hide-on-scroll-down behavior
 * - Mobile hamburger menu with slide-in animation
 * - Current page highlighting with visual indicators
 * 
 * @requirements 4.1, 4.2, 4.3, 4.5 - Navigation system redesign
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Menu, X, ChevronRight, GraduationCap, LayoutDashboard, LogOut, Home, Search, UserPlus, LogIn } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/contexts/AuthContext';
import { useRoleQuery } from '@/hooks/auth/useRoleQuery';
import { durations, easings } from '@/lib/animation-config';

export interface NavigationItem {
  href: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  description?: string;
}

interface ResponsiveHeaderProps {
  className?: string;
}

// Animation variants for the header
const headerVariants = {
  visible: {
    y: 0,
    transition: {
      duration: durations.normal,
      ease: easings.easeOut,
    },
  },
  hidden: {
    y: '-100%',
    transition: {
      duration: durations.normal,
      ease: easings.easeIn,
    },
  },
};

// Animation variants for mobile menu
const menuVariants = {
  closed: {
    x: '100%',
    transition: {
      duration: durations.normal,
      ease: easings.easeIn,
    },
  },
  open: {
    x: 0,
    transition: {
      duration: durations.normal,
      ease: easings.easeOut,
    },
  },
};

// Animation variants for menu items
const itemVariants = {
  closed: { opacity: 0, x: 20 },
  open: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: {
      delay: i * 0.05,
      duration: durations.fast,
      ease: easings.easeOut,
    },
  }),
};

// Custom hook for scroll direction detection
function useScrollDirection(threshold = 10) {
  const [scrollDirection, setScrollDirection] = useState<'up' | 'down' | null>(null);
  const [isAtTop, setIsAtTop] = useState(true);

  useEffect(() => {
    let lastScrollY = window.scrollY;
    let ticking = false;

    const updateScrollDirection = () => {
      const scrollY = window.scrollY;
      
      // Check if at top
      setIsAtTop(scrollY < threshold);

      // Determine scroll direction
      if (Math.abs(scrollY - lastScrollY) < threshold) {
        ticking = false;
        return;
      }

      setScrollDirection(scrollY > lastScrollY ? 'down' : 'up');
      lastScrollY = scrollY > 0 ? scrollY : 0;
      ticking = false;
    };

    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(updateScrollDirection);
        ticking = true;
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });

    return () => window.removeEventListener('scroll', onScroll);
  }, [threshold]);

  return { scrollDirection, isAtTop };
}

export function ResponsiveHeader({ className }: ResponsiveHeaderProps) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { isAdmin } = useRoleQuery({ user });
  const prefersReducedMotion = useReducedMotion();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { scrollDirection, isAtTop } = useScrollDirection();

  // Determine if header should be visible
  const isHeaderVisible = isAtTop || scrollDirection === 'up' || isMenuOpen;

  // Requirements: 13.1, 13.2, 13.3, 13.4 - Improve Logout Performance
  // Navigate immediately, don't wait for signOut to complete
  const handleSignOut = useCallback(async () => {
    // Navigate first for instant feedback - Requirements: 13.1
    navigate('/');
    
    // Fire-and-forget signOut - Requirements: 13.3
    signOut().catch((error) => {
      console.error('Sign out failed:', error);
      // Already navigated, so just log the error
      // Requirements: 13.4 - Still redirect even if API fails
    });
  }, [signOut, navigate]);

  const dashboardPath = isAdmin ? '/admin/dashboard' : '/student/dashboard';
  const dashboardLabel = isAdmin ? 'Admin Dashboard' : 'Dashboard';

  // Navigation items
  const navigationItems = useMemo<NavigationItem[]>(() => {
    const items: NavigationItem[] = [
      { href: '/', label: 'Home', icon: Home, description: 'Return to homepage' },
      { href: '/track-application', label: 'Track Application', icon: Search, description: 'Check your application status' },
    ];

    if (!user) {
      items.push(
        { href: '/auth/signin', label: 'Sign In', icon: LogIn, description: 'Access your account' },
        { href: '/auth/signup', label: 'Sign Up', icon: UserPlus, description: 'Create a new account' }
      );
    } else {
      items.push({
        href: dashboardPath,
        label: dashboardLabel,
        icon: LayoutDashboard,
        description: 'Go to your dashboard',
      });
    }

    return items;
  }, [user, dashboardPath, dashboardLabel]);

  // Check if route is active
  const isActiveRoute = useCallback((href: string) => {
    if (href === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(href);
  }, [location.pathname]);

  // Toggle mobile menu
  const toggleMenu = useCallback(() => {
    setIsMenuOpen((prev) => {
      const newState = !prev;
      document.body.style.overflow = newState ? 'hidden' : '';
      return newState;
    });
  }, []);

  // Close mobile menu
  const closeMenu = useCallback(() => {
    setIsMenuOpen(false);
    document.body.style.overflow = '';
  }, []);

  // Handle navigation
  const handleNavigate = useCallback((href: string) => {
    closeMenu();
    navigate(href);
  }, [closeMenu, navigate]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isMenuOpen) {
        closeMenu();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isMenuOpen, closeMenu]);

  // Brand component
  const Brand = (
    <Link 
      to="/" 
      className="flex items-center space-x-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg"
      aria-label="MIHAS-KATC Home"
    >
      <motion.div
        className="flex items-center space-x-2"
        whileHover={prefersReducedMotion ? {} : { scale: 1.02 }}
        transition={{ type: 'spring', stiffness: 300 }}
      >
        <GraduationCap className="h-8 w-8 text-primary" aria-hidden="true" />
        <span className="text-xl font-bold text-foreground">MIHAS-KATC</span>
      </motion.div>
    </Link>
  );

  return (
    <>
      {/* Header */}
      <motion.header
        className={cn(
          'fixed top-0 left-0 right-0 z-50',
          'bg-card/95 backdrop-blur-md border-b border-border/50 shadow-sm',
          className
        )}
        initial={false}
        animate={prefersReducedMotion ? {} : (isHeaderVisible ? 'visible' : 'hidden')}
        variants={prefersReducedMotion ? {} : headerVariants}
        aria-label="Main navigation"
      >
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-3 sm:py-4 max-w-7xl mx-auto">
            {/* Brand */}
            {Brand}

            {/* Desktop Navigation */}
            <nav className="hidden lg:flex items-center space-x-2" aria-label="Desktop navigation">
              {navigationItems.map((item) => {
                const isActive = isActiveRoute(item.href);
                return (
                  <Link
                    key={item.href}
                    to={item.href}
                    className={cn(
                      'px-4 py-2 rounded-lg font-medium transition-all duration-200',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                      isActive
                        ? 'bg-primary text-primary-foreground shadow-md'
                        : 'text-foreground hover:bg-accent hover:text-accent-foreground'
                    )}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    {item.label}
                  </Link>
                );
              })}
              
              {user && (
                <Button
                  variant="outline"
                  size="md"
                  onClick={handleSignOut}
                  className="ml-2 border-border text-foreground hover:bg-accent"
                >
                  <LogOut className="w-4 h-4 mr-2" aria-hidden="true" />
                  Sign Out
                </Button>
              )}
            </nav>

            {/* Mobile Menu Button */}
            <motion.button
              className={cn(
                'lg:hidden p-3 rounded-xl',
                'bg-card hover:bg-muted transition-colors duration-200',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                'min-h-[48px] min-w-[48px] touch-target',
                'border-2 border-border shadow-sm'
              )}
              onClick={toggleMenu}
              whileTap={prefersReducedMotion ? {} : { scale: 0.95 }}
              aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={isMenuOpen}
              aria-controls="mobile-menu"
            >
              <AnimatePresence mode="wait">
                {isMenuOpen ? (
                  <motion.div
                    key="close"
                    initial={prefersReducedMotion ? {} : { rotate: -90, opacity: 0 }}
                    animate={{ rotate: 0, opacity: 1 }}
                    exit={prefersReducedMotion ? {} : { rotate: 90, opacity: 0 }}
                    transition={{ duration: durations.fast }}
                  >
                    <X className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
                  </motion.div>
                ) : (
                  <motion.div
                    key="menu"
                    initial={prefersReducedMotion ? {} : { rotate: 90, opacity: 0 }}
                    animate={{ rotate: 0, opacity: 1 }}
                    exit={prefersReducedMotion ? {} : { rotate: -90, opacity: 0 }}
                    transition={{ duration: durations.fast }}
                  >
                    <Menu className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.button>
          </div>
        </div>
      </motion.header>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isMenuOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              className="fixed inset-0 bg-black/70 backdrop-blur-sm lg:hidden"
              style={{ zIndex: 9998 }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeMenu}
              aria-hidden="true"
            />

            {/* Mobile Menu Panel */}
            <motion.nav
              id="mobile-menu"
              className={cn(
                'fixed top-0 right-0 h-full w-80 max-w-[85vw]',
                'bg-card shadow-2xl lg:hidden',
                'border-l-4 border-primary overflow-y-auto'
              )}
              style={{ zIndex: 9999 }}
              variants={prefersReducedMotion ? {} : menuVariants}
              initial="closed"
              animate="open"
              exit="closed"
              aria-label="Mobile navigation"
            >
              <div className="flex flex-col h-full">
                {/* Mobile Menu Header */}
                <div className="flex items-center justify-between p-6 border-b border-border/70 bg-gradient-to-r from-primary/5 to-secondary/5">
                  <div className="flex items-center space-x-3">
                    <GraduationCap className="h-7 w-7 text-primary" aria-hidden="true" />
                    <span className="text-xl font-bold text-foreground">MIHAS-KATC</span>
                  </div>
                  <motion.button
                    className={cn(
                      'p-2 rounded-lg hover:bg-accent transition-colors duration-200',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                      'min-h-[44px] min-w-[44px] touch-target'
                    )}
                    onClick={closeMenu}
                    whileTap={prefersReducedMotion ? {} : { scale: 0.95 }}
                    aria-label="Close menu"
                  >
                    <X className="h-6 w-6" aria-hidden="true" />
                  </motion.button>
                </div>

                {/* Navigation Items */}
                <div className="flex flex-col flex-1 overflow-hidden">
                  <div className="flex flex-col space-y-2 p-6 flex-1 overflow-y-auto">
                    {navigationItems.map((item, index) => {
                      const isActive = isActiveRoute(item.href);
                      const Icon = item.icon;

                      return (
                        <motion.div
                          key={item.href}
                          variants={prefersReducedMotion ? {} : itemVariants}
                          custom={index}
                          initial="closed"
                          animate="open"
                        >
                          <button
                            onClick={() => handleNavigate(item.href)}
                            className={cn(
                              'w-full flex items-center justify-between px-4 py-4 rounded-xl',
                              'transition-all duration-200 min-h-[48px] touch-target',
                              'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                              isActive
                                ? 'bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shadow-lg'
                                : 'bg-card text-foreground hover:bg-accent border-2 border-border hover:border-primary'
                            )}
                            aria-current={isActive ? 'page' : undefined}
                          >
                            <div className="flex items-center space-x-3">
                              {Icon && <Icon className="h-5 w-5" aria-hidden="true" />}
                              <div className="text-left">
                                <span className="font-semibold">{item.label}</span>
                                {isActive && (
                                  <div className="text-xs opacity-80 mt-0.5">Current Page</div>
                                )}
                              </div>
                            </div>
                            <ChevronRight className="h-5 w-5 opacity-60" aria-hidden="true" />
                          </button>
                        </motion.div>
                      );
                    })}
                  </div>

                  {/* Mobile Menu Footer */}
                  <div className="p-6 border-t border-border/70 bg-muted/50">
                    {user ? (
                      <button
                        onClick={() => {
                          closeMenu();
                          handleSignOut();
                        }}
                        className={cn(
                          'w-full flex items-center justify-center space-x-3 px-4 py-4',
                          'bg-destructive text-destructive-foreground rounded-xl',
                          'hover:bg-destructive/90 shadow-lg hover:shadow-xl',
                          'transition-all duration-200 font-medium min-h-[48px] touch-target',
                          'focus:outline-none focus-visible:ring-2 focus-visible:ring-destructive'
                        )}
                      >
                        <LogOut className="h-5 w-5" aria-hidden="true" />
                        <span>Sign Out</span>
                      </button>
                    ) : (
                      <p className="text-foreground text-base text-center font-medium">
                        Your Future Starts Here
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </motion.nav>
          </>
        )}
      </AnimatePresence>

      {/* Spacer to prevent content from going under fixed header */}
      <div className="h-16 sm:h-[72px]" aria-hidden="true" />
    </>
  );
}

export default ResponsiveHeader;
