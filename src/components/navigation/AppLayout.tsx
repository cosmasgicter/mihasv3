import { ReactNode } from 'react'
import { MobileBottomNav } from './MobileBottomNav'
import { DesktopSidebar } from './DesktopSidebar'
import { Header } from './Header'
import { useAuth } from '@/contexts/AuthContext'

interface AppLayoutProps {
  children: ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  const { user } = useAuth()

  if (!user) {
    return <>{children}</>
  }

  return (
    <>
      <DesktopSidebar />
      <Header />
      <main className="md:ml-64 pt-16 pb-20 md:pb-6 min-h-screen">
        {children}
      </main>
      <MobileBottomNav />
    </>
  )
}
