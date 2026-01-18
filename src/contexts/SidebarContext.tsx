import React, { createContext, useContext, useState, useMemo, useCallback } from 'react'

interface SidebarContextType {
  collapsed: boolean
  setCollapsed: (collapsed: boolean) => void
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined)

export const SidebarProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [collapsed, setCollapsed] = useState(false)

  // Memoize setCollapsed to prevent re-renders
  const handleSetCollapsed = useCallback((value: boolean) => {
    setCollapsed(value)
  }, [])

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
