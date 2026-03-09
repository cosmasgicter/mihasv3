import React, { createContext, useContext, useState, useMemo, useCallback, useEffect } from 'react'

interface SidebarContextType {
  collapsed: boolean
  setCollapsed: (collapsed: boolean) => void
  mobileOpen: boolean
  setMobileOpen: (open: boolean) => void
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined)
const SIDEBAR_STORAGE_KEY = 'mihas:sidebar-collapsed'

function getInitialCollapsedState() {
  if (typeof window === 'undefined') {
    return false
  }

  try {
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

export const SidebarProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [collapsed, setCollapsed] = useState(getInitialCollapsedState)
  const [mobileOpen, setMobileOpen] = useState(false)

  const handleSetCollapsed = useCallback((value: boolean) => {
    setCollapsed(value)
  }, [])

  const handleSetMobileOpen = useCallback((value: boolean) => {
    setMobileOpen(value)
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(collapsed))
    } catch {
    }
  }, [collapsed])

  // Close mobile sidebar on Escape key
  useEffect(() => {
    if (!mobileOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileOpen(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [mobileOpen])

  // Prevent body scroll when mobile sidebar is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [mobileOpen])

  const value = useMemo(() => ({
    collapsed,
    setCollapsed: handleSetCollapsed,
    mobileOpen,
    setMobileOpen: handleSetMobileOpen
  }), [collapsed, handleSetCollapsed, mobileOpen, handleSetMobileOpen])

  return (
    <SidebarContext.Provider value={value}>
      {children}
    </SidebarContext.Provider>
  )
}

export const useSidebar = () => {
  const context = useContext(SidebarContext)
  if (!context) {
    throw new Error('useSidebar must be used within SidebarProvider')
  }
  return context
}
