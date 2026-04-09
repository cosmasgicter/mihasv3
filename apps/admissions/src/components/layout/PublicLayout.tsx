/**
 * PublicLayout - Shared layout wrapper for all unauthenticated public pages.
 * Provides ResponsiveHeader, SharedFooter, and SmoothUI PageTransition.
 *
 * @requirements 16.2 - Shared PublicLayout with ResponsiveHeader and SharedFooter
 * @requirements 3.5 - Consistent layout across all public pages
 */

import { Suspense, lazy } from 'react';
import { cn } from '@/lib/utils';
import { APP_MAIN_CONTENT_ID } from '@/lib/accessibility-utils';
import { PublicSiteHeader } from '@/components/layout/PublicSiteHeader';

const SharedFooter = lazy(() => import('@/components/layout/SharedFooter').then((mod) => ({ default: mod.SharedFooter })));

interface PublicLayoutProps {
  children: React.ReactNode;
  showFooter?: boolean;
  className?: string;
}

export function PublicLayout({ children, showFooter = true, className }: PublicLayoutProps) {
  return (
    <div className={cn('min-h-screen bg-background overflow-x-hidden', className)}>
      <PublicSiteHeader />
      <main id={APP_MAIN_CONTENT_ID}>{children}</main>
      {showFooter && (
        <Suspense fallback={null}>
          <SharedFooter />
        </Suspense>
      )}
    </div>
  );
}
