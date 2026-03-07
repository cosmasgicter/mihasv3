import React, { createContext, useContext, useState, useMemo, useCallback, useEffect } from 'react'

interface SidebarContextType {
  collapsed: boolean
  setCollapsed: (collapsed: boolean) => void
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

  // Memoize setCollapsed to prevent re-renders
  const handleSetCollapsed = useCallback((value: boolean) => {
    setCollapsed(value)
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(collapsed))
    } catch {
    }
  }, [collapsed])

  // Memoize context value to prevent unnecessary re-renders
  const value = useMemo(() => ({
    collapsed,
    setCollapsed: handleSetCollapsed
  }), [collapsed, handleSetCollapsed])

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
