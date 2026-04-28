import React, { useState, useEffect } from 'react'
import { Menu, X, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface NavigationItem {
  href: string
  label: string
  icon?: React.ComponentType<{ className?: string }>
  emoji?: string
}

interface BaseNavigationProps {
  brand: React.ReactNode
  desktopNav: React.ReactNode
  mobileItems: NavigationItem[]
  mobileHeader: React.ReactNode
  mobileFooter?: React.ReactNode
  isActiveRoute: (href: string) => boolean
  onNavigate: (href: string) => void
  className?: string
}

export function BaseNavigation({
  brand,
  desktopNav,
  mobileItems,
  mobileHeader,
  mobileFooter,
  isActiveRoute,
  onNavigate,
  className
}: BaseNavigationProps) {
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
  useEffect(() => {
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

  const handleItemClick = (href: string) => {
    closeMenu()
    onNavigate(href)
  }

  return (
    <nav className={cn("bg-card/95  shadow-lg border-b border-border/50 sticky top-0 z-50", className)}>
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-3 sm:py-4 max-w-7xl mx-auto">
          {/* Brand */}
          {brand}

          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center space-x-2">
            {desktopNav}
          </div>

          {/* Mobile Menu Button */}
          <button
            className="lg:hidden p-3 rounded-xl bg-card hover:bg-muted transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[48px] min-w-[48px] touch-target border-2 border-border shadow-lg active:scale-95 motion-reduce:transform-none"
            onClick={toggleMenu}
            aria-label={isOpen ? "Close menu" : "Open menu"}
            aria-expanded={isOpen}
          >
            <div className="transition-transform duration-200 motion-reduce:transition-none">
              {isOpen ? (
                <X className="h-5 w-5 sm:h-6 sm:w-6" />
              ) : (
                <Menu className="h-5 w-5 sm:h-6 sm:w-6" />
              )}
            </div>
          </button>
        </div>
      </div>

      {/* Mobile Menu Overlay */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/70  lg:hidden transition-opacity duration-250 motion-reduce:transition-none"
            style={{ zIndex: 9998 }}
            onClick={closeMenu}
          />

          {/* Mobile Menu */}
          <div
            className={cn(
              "fixed top-0 right-0 h-full w-80 max-w-[85vw] bg-card shadow-lg lg:hidden border-l-4 border-primary overflow-y-auto",
              "transition-transform duration-250 ease-standard motion-reduce:transition-none",
              isOpen ? "translate-x-0" : "translate-x-full"
            )}
            style={{ zIndex: 9999 }}
          >
            <div className="flex flex-col h-full">
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-border/70 bg-gradient-to-r from-primary/5 to-secondary/5">
                {mobileHeader}
                <button
                  className="p-2 rounded-lg hover:bg-accent transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[44px] min-w-[44px] touch-target active:scale-95 motion-reduce:transform-none"
                  onClick={closeMenu}
                  aria-label="Close menu"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              {/* Navigation Items */}
              <div className="flex flex-col flex-1 overflow-hidden">
                <div className="flex flex-col space-y-2 p-6 flex-1 overflow-y-auto">
                  {mobileItems.map((item, index) => {
                    const isActive = isActiveRoute(item.href)
                    const Icon = item.icon

                    return (
                      <div
                        key={item.href}
                        className="animate-fade-in opacity-0"
                        style={{
                          animationDelay: `${index * 50}ms`,
                          animationFillMode: 'forwards',
                        }}
                      >
                        <button
                          onClick={() => handleItemClick(item.href)}
                          className={cn(
                            "w-full flex items-center justify-between px-4 py-4 rounded-xl transition-all duration-200 min-h-[48px] touch-target",
                            isActive
                              ? "bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shadow-lg"
                              : "bg-card text-foreground hover:bg-accent border-2 border-border hover:border-primary"
                          )}
                        >
                          <div className="flex items-center space-x-3">
                            {item.emoji && <span className="text-xl">{item.emoji}</span>}
                            {Icon && <Icon className="h-5 w-5" />}
                            <div className="text-left">
                              <span className="font-semibold">{item.label}</span>
                              {isActive && (
                                <div className="text-xs opacity-80 mt-0.5">Current Page</div>
                              )}
                            </div>
                          </div>
                          <ChevronRight className="h-5 w-5 opacity-60" />
                        </button>
                      </div>
                    )
                  })}
                </div>

                {/* Footer */}
                {mobileFooter && (
                  <div className="p-6 border-t border-border/70 bg-muted/50">
                    {mobileFooter}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </nav>
  )
}
