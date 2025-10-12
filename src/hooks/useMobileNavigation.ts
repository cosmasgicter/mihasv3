import { useState, useEffect, useCallback } from 'react'
import { useLocation } from 'react-router-dom'

interface UseMobileNavigationOptions {
  closeOnRouteChange?: boolean
  preventBodyScroll?: boolean
}

export function useMobileNavigation(options: UseMobileNavigationOptions = {}) {
  const {
    closeOnRouteChange = true,
    preventBodyScroll = true
  } = options

  const [isOpen, setIsOpen] = useState(false)
  const location = useLocation()

  // Close menu on route change
  useEffect(() => {
    if (closeOnRouteChange && isOpen) {
      setIsOpen(false)
    }
  }, [location.pathname, closeOnRouteChange, isOpen])

  // Manage body scroll
  useEffect(() => {
    if (!preventBodyScroll) return

    if (isOpen) {
      // Store current scroll position
      const scrollY = window.scrollY
      document.body.style.position = 'fixed'
      document.body.style.top = `-${scrollY}px`
      document.body.style.width = '100%'
      document.body.style.overflow = 'hidden'
    } else {
      // Restore scroll position
      const scrollY = document.body.style.top
      document.body.style.position = ''
      document.body.style.top = ''
      document.body.style.width = ''
      document.body.style.overflow = ''
      if (scrollY) {
        window.scrollTo(0, parseInt(scrollY || '0') * -1)
      }
    }

    return () => {
      // Cleanup on unmount
      document.body.style.position = ''
      document.body.style.top = ''
      document.body.style.width = ''
      document.body.style.overflow = ''
    }
  }, [isOpen, preventBodyScroll])

  // Handle escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen])

  const openMenu = useCallback(() => setIsOpen(true), [])
  const closeMenu = useCallback(() => setIsOpen(false), [])
  const toggleMenu = useCallback(() => setIsOpen(prev => !prev), [])

  return {
    isOpen,
    openMenu,
    closeMenu,
    toggleMenu
  }
}