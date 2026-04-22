/**
 * PublicLayout - Shared layout wrapper for all unauthenticated public pages.
 * Provides ResponsiveHeader, SharedFooter, and SmoothUI PageTransition.
 *
 * @requirements 16.2 - Shared PublicLayout with ResponsiveHeader and SharedFooter
 * @requirements 3.5 - Consistent layout across all public pages
 */

import { Suspense, lazy } from 'react';
import { useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { APP_MAIN_CONTENT_ID } from '@/lib/accessibility-utils';
import { PublicSiteHeader } from '@/components/layout/PublicSiteHeader';
import { useDeferredHydration } from '@/hooks/useDeferredHydration';

const SharedFooter = lazy(() => import('@/components/layout/SharedFooter').then((mod) => ({ default: mod.SharedFooter })));

interface PublicLayoutProps {
  children: React.ReactNode;
  showFooter?: boolean;
  className?: string;
}

export function PublicLayout({ children, showFooter = true, className }: PublicLayoutProps) {
  const location = useLocation()
  const footerDelayMs = location.pathname === '/' ? 1600 : 500
  const footerHydrated = useDeferredHydration(showFooter, footerDelayMs)

  return (
    <div className={cn('relative min-h-screen overflow-x-hidden bg-background', className)}>
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[32rem] overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(20,184,166,0.12),transparent_20rem),radial-gradient(circle_at_top_right,rgba(37,99,235,0.1),transparent_24rem)]" />
      </div>
      <PublicSiteHeader />
      <main id={APP_MAIN_CONTENT_ID}>{children}</main>
      {showFooter && footerHydrated && (
        <Suspense fallback={null}>
          <SharedFooter />
        </Suspense>
      )}
    </div>
  );
}
