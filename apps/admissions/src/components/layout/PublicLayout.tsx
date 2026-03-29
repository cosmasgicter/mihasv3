/**
 * PublicLayout - Shared layout wrapper for all unauthenticated public pages.
 * Provides ResponsiveHeader, SharedFooter, and SmoothUI PageTransition.
 *
 * @requirements 16.2 - Shared PublicLayout with ResponsiveHeader and SharedFooter
 * @requirements 3.5 - Consistent layout across all public pages
 */

import { cn } from '@/lib/utils';
import { APP_MAIN_CONTENT_ID } from '@/lib/accessibility-utils';
import { ResponsiveHeader } from '@/components/navigation/ResponsiveHeader';
import { SharedFooter } from '@/components/layout/SharedFooter';
import { PageTransition } from '@/components/smoothui/page-transition';

interface PublicLayoutProps {
  children: React.ReactNode;
  showFooter?: boolean;
  className?: string;
}

export function PublicLayout({ children, showFooter = true, className }: PublicLayoutProps) {
  return (
    <PageTransition mode="fade">
      <div className={cn('min-h-screen bg-background overflow-x-hidden', className)}>
        <ResponsiveHeader />
        <main id={APP_MAIN_CONTENT_ID}>{children}</main>
        {showFooter && <SharedFooter />}
      </div>
    </PageTransition>
  );
}
