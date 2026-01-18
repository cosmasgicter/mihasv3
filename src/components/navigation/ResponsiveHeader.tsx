/**
 * ResponsiveHeader Component - Enhanced navigation header with scroll behavior
 * 
 * Features:
 * - Sticky header with hide-on-scroll-down behavior
 * - Mobile hamburger menu with slide-in animation
 * - Current page highlighting with visual indicators
 * 
 * @requirements 4.1, 4.2, 4.3, 4.5 - Navigation system redesign
 * @performance Optimized to eliminate forced reflows - uses CSS transitions instead of Framer Motion
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Menu, X, ChevronRight, GraduationCap, LayoutDashboard, LogOut, Home, Search, UserPlus, LogIn } from '@/components/icons';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/contexts/AuthContext';
import { useRoleQuery } from '@/hooks/auth/useRoleQuery';

export interface NavigationItem {
  href: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  description?: string;
}

interface ResponsiveHeaderProps {
  className?: string;
}

// Custom hook for scroll direction detection - optimized to prevent reflows
function useScrollDirection(threshold = 10) {
  const [scrollDirection, setScrollDirection] = useState<'up' | 'down' | null>(null);
  const [isAtTop, setIsAtTop] = useState(true);
  const lastScrollYRef = useRef(0);
  const tickingRef = useRef(false);
  // Cache scroll values to batch reads
  const scrollStateRef = useRef({ direction: null as 'up' | 'down' | null, atTop: true });

  useEffect(() => {
    // Read initial scroll position once - batch DOM read
    const initialScrollY = window.scrollY;
    lastScrollYRef.current = initialScrollY;
    const initialAtTop = initialScrollY < threshold;
    scrollStateRef.current = { direction: null, atTop: initialAtTop };
    setIsAtTop(initialAtTop);

    const updateScrollDirection = () => {
      // Single DOM read - batch all reads before any state updates
      const scrollY = window.scrollY;
      const lastScrollY = lastScrollYRef.current;
      
      // Calculate new values without triggering state updates yet
      const newIsAtTop = scrollY < threshold;
      const diff = scrollY - lastScrollY;
      let newDirection = scrollStateRef.current.direction;
      
      if (Math.abs(diff) >= threshold) {
        newDirection = diff > 0 ? 'down' : 'up';
        lastScrollYRef.current = scrollY > 0 ? scrollY : 0;
      }
      
      // Batch state updates - only update if values actually changed
      const prevState = scrollStateRef.current;
      if (prevState.direction !== newDirection || prevState.atTop !== newIsAtTop) {
        scrollStateRef.current = { direction: newDirection, atTop: newIsAtTop };
        
        // Single batch of state updates
        if (prevState.direction !== newDirection) {
          setScrollDirection(newDirection);
        }
        if (prevState.atTop !== newIsAtTop) {
          setIsAtTop(newIsAtTop);
        }
      }
      
      tickingRef.current = false;
    };

    const onScroll = () => {
      if (!tickingRef.current) {
        tickingRef.current = true;
        requestAnimationFrame(updateScrollDirection);
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [threshold]);

  return { scrollDirection, isAtTop };
}

// Check for reduced motion preference once at module level
const prefersReducedMotion = typeof window !== 'undefined' 
  ? window.matchMedia('(prefers-reduced-motion: reduce)').matches 
  : false;

export function ResponsiveHeader({ className }: ResponsiveHeaderProps) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { isAdmin } = useRoleQuery({ user });
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

  // Toggle mobile menu - batch DOM writes to prevent reflows
  const toggleMenu = useCallback(() => {
    setIsMenuOpen((prev) => {
      const newState = !prev;
      // Use requestAnimationFrame to batch DOM write after state update
      requestAnimationFrame(() => {
        document.body.style.overflow = newState ? 'hidden' : '';
      });
      return newState;
    });
  }, []);

  // Close mobile menu - batch DOM writes to prevent reflows
  const closeMenu = useCallback(() => {
    setIsMenuOpen(false);
    // Use requestAnimationFrame to batch DOM write after state update
    requestAnimationFrame(() => {
      document.body.style.overflow = '';
    });
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
      // Batch DOM write in cleanup to prevent reflows
      requestAnimationFrame(() => {
        document.body.style.overflow = '';
      });
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isMenuOpen, closeMenu]);

  // Brand component - simplified without motion
  const Brand = (
    <Link 
      to="/" 
      className="flex items-center space-x-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg group"
      aria-label="MIHAS-KATC Home"
    >
      <div className={cn(
        "flex items-center space-x-2",
        !prefersReducedMotion && "transition-transform duration-200 group-hover:scale-[1.02]"
      )}>
        <GraduationCap className="h-8 w-8 text-primary" aria-hidden="true" />
        <span className="text-xl font-bold text-foreground">MIHAS-KATC</span>
      </div>
    </Link>
  );

  return (
    <>
      {/* Header - CSS transitions instead of Framer Motion */}
      <header
        className={cn(
          'fixed top-0 left-0 right-0 z-50',
          'bg-card/95 backdrop-blur-md border-b border-border/50 shadow-sm',
          !prefersReducedMotion && 'transition-transform duration-300 ease-out',
          !isHeaderVisible && !prefersReducedMotion && '-translate-y-full',
          className
        )}
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

            {/* Mobile Menu Button - CSS transitions */}
            <button
              className={cn(
                'lg:hidden p-3 rounded-xl',
                'bg-card hover:bg-muted transition-colors duration-200',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                'min-h-[48px] min-w-[48px] touch-target',
                'border-2 border-border shadow-sm',
                !prefersReducedMotion && 'active:scale-95 transition-transform'
              )}
              onClick={toggleMenu}
              aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={isMenuOpen}
              aria-controls="mobile-menu"
            >
              <div className={cn(
                !prefersReducedMotion && 'transition-transform duration-200',
                isMenuOpen && !prefersReducedMotion && 'rotate-90'
              )}>
                {isMenuOpen ? (
                  <X className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
                ) : (
                  <Menu className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
                )}
              </div>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Menu Overlay - CSS transitions */}
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 bg-black/70 backdrop-blur-sm lg:hidden',
          !prefersReducedMotion && 'transition-opacity duration-300',
          isMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        )}
        style={{ zIndex: 9998 }}
        onClick={closeMenu}
        aria-hidden="true"
      />

      {/* Mobile Menu Panel - CSS transitions */}
      <nav
        id="mobile-menu"
        className={cn(
          'fixed top-0 right-0 h-full w-80 max-w-[85vw]',
          'bg-card shadow-2xl lg:hidden',
          'border-l-4 border-primary overflow-y-auto',
          !prefersReducedMotion && 'transition-transform duration-300 ease-out',
          isMenuOpen ? 'translate-x-0' : 'translate-x-full'
        )}
        style={{ zIndex: 9999 }}
        aria-label="Mobile navigation"
        aria-hidden={!isMenuOpen}
      >
        <div className="flex flex-col h-full">
          {/* Mobile Menu Header */}
          <div className="flex items-center justify-between p-6 border-b border-border/70 bg-gradient-to-r from-primary/5 to-secondary/5">
            <div className="flex items-center space-x-3">
              <GraduationCap className="h-7 w-7 text-primary" aria-hidden="true" />
              <span className="text-xl font-bold text-foreground">MIHAS-KATC</span>
            </div>
            <button
              className={cn(
                'p-2 rounded-lg hover:bg-accent transition-colors duration-200',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                'min-h-[44px] min-w-[44px] touch-target',
                !prefersReducedMotion && 'active:scale-95 transition-transform'
              )}
              onClick={closeMenu}
              aria-label="Close menu"
            >
              <X className="h-6 w-6" aria-hidden="true" />
            </button>
          </div>

          {/* Navigation Items */}
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="flex flex-col space-y-2 p-6 flex-1 overflow-y-auto">
              {navigationItems.map((item, index) => {
                const isActive = isActiveRoute(item.href);
                const Icon = item.icon;

                return (
                  <div
                    key={item.href}
                    className={cn(
                      !prefersReducedMotion && 'transition-all duration-200',
                      isMenuOpen && !prefersReducedMotion && 'animate-fade-in-right'
                    )}
                    style={!prefersReducedMotion ? { animationDelay: `${index * 50}ms` } : undefined}
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
                  </div>
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
      </nav>

      {/* Spacer to prevent content from going under fixed header - uses CSS variable for height */}
      <div 
        className="h-16 sm:h-[72px]" 
        style={{ 
          // Use CSS custom property for potential dynamic height adjustments
          // This avoids layout recalculations when the value is read
          '--header-height': 'var(--header-height, 4rem)'
        } as React.CSSProperties}
        aria-hidden="true" 
      />
    </>
  );
}

export default ResponsiveHeader;
