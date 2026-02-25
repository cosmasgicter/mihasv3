/**
 * AdminLayout Component - Layout wrapper for admin pages
 * Provides consistent sidebar navigation and responsive behavior
 * 
 * @requirements 6.1 - Sidebar navigation layout with collapsible sections
 * @requirements 6.7 - Tablet-responsive behavior
 */

import React, { ReactNode } from 'react';
import { AdminSidebar } from './AdminSidebar';
import { AdminMobileNav } from './AdminMobileNav';
import { AdminHeader } from './AdminHeader';
import { SidebarProvider, useSidebar } from '@/contexts/SidebarContext';
import { useResponsive } from '@/hooks/useResponsive';
import { designTokens } from '@/design-system/tokens';
import { cn } from '@/lib/utils';
import { SkipLink } from '@/components/ui/SkipLink';

interface AdminLayoutProps {
  children: ReactNode;
  className?: string;
}

function AdminLayoutContent({ children, className }: AdminLayoutProps) {
  const { collapsed } = useSidebar();
  const { isMobile, isTablet } = useResponsive();

  const sidebarWidth = collapsed 
    ? designTokens.layout.sidebarCollapsed 
    : designTokens.layout.sidebarExpanded;

  // On mobile, no sidebar margin needed
  // On tablet, use collapsed sidebar width
  // On desktop, use full sidebar width based on collapsed state
  const getMainMargin = () => {
    if (isMobile) return 0;
    if (isTablet) return designTokens.layout.sidebarCollapsed;
    return sidebarWidth;
  };

  const mainMargin = getMainMargin();

  return (
    <div className="flex min-h-screen w-full overflow-x-hidden bg-gradient-to-br from-background via-primary/5 to-secondary/5">
      <SkipLink href="#admin-main-content">Skip to main content</SkipLink>
      
      {/* Desktop/Tablet Sidebar */}
      {!isMobile && <AdminSidebar />}
      
      {/* Main content area */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Admin Header */}
        <AdminHeader />
        
        {/* Main content */}
        <main
          id="admin-main-content"
          className={cn(
            'flex-1 min-h-screen overflow-x-hidden transition-all duration-300 ease-in-out',
            'pb-20 md:pb-6', // Extra padding for mobile bottom nav
            className
          )}
          style={{
            paddingTop: designTokens.layout.headerHeight,
            marginLeft: mainMargin,
            width: isMobile ? '100%' : `calc(100% - ${mainMargin}px)`,
          }}
        >
          {children}
        </main>
      </div>
      
      {/* Mobile Bottom Navigation */}
      {isMobile && <AdminMobileNav />}
    </div>
  );
}

export function AdminLayout({ children, className }: AdminLayoutProps) {
  return (
    <SidebarProvider>
      <AdminLayoutContent className={className}>{children}</AdminLayoutContent>
    </SidebarProvider>
  );
}

export default AdminLayout;
