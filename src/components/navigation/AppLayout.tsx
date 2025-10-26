import React, { ReactNode } from 'react'
import { MobileBottomNav } from './MobileBottomNav'
import { DesktopSidebar } from './DesktopSidebar'
import { Header } from './Header'
import { useAuth } from '@/contexts/AuthContext'
import { SidebarProvider, useSidebar } from '@/contexts/SidebarContext'
import { useResponsive } from '@/hooks/useResponsive'
import { motion } from 'framer-motion'
import ParticlesBackground from '@/components/ui/ParticlesBackground'
import { designTokens } from '@/design-system/tokens'

interface AppLayoutProps {
  children: ReactNode
}

const AppLayoutContent = React.memo(function AppLayoutContent({ children }: AppLayoutProps) {
  const { user } = useAuth()
  const { collapsed } = useSidebar()
  const { isMobile } = useResponsive()

  if (!user) {
    return <>{children}</>
  }

  const collapsedWidth = designTokens.layout.sidebarCollapsed
  const expandedWidth = designTokens.layout.sidebarExpanded

  return (
    <div className="flex min-h-screen w-full overflow-x-hidden">
      {/* Decorative background particles - disabled on mobile inside component */}
      <ParticlesBackground enabled={!isMobile} />
      <DesktopSidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <Header />
        <motion.main 
          animate={{ 
            marginLeft: isMobile ? 0 : (collapsed ? collapsedWidth : expandedWidth),
            width: isMobile ? '100%' : `calc(100% - ${collapsed ? collapsedWidth : expandedWidth}px)`
          }}
          transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
          className="pb-20 md:pb-6 min-h-screen overflow-x-hidden"
          style={{ paddingTop: 'var(--header-height)' }}
        >
          {children}
        </motion.main>
      </div>
      <MobileBottomNav />
    </div>
  )
})

export const AppLayout = React.memo(function AppLayout({ children }: AppLayoutProps) {
  return (
    <SidebarProvider>
      <AppLayoutContent>{children}</AppLayoutContent>
    </SidebarProvider>
  )
})
