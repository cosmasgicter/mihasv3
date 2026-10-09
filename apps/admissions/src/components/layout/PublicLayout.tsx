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
      {/*
        One skip link (admissions-v2 task 11.5, R16.5 / WCAG 2.4.1).

        `PublicSiteHeader` already renders one, so every public page shipped two
        identical "Skip to main content" links pointing at the same target — a
        keyboard user tabbed past the same affordance twice before reaching the
        page. It is the header's, because the header is the thing being skipped.
      */}
      <PublicSiteHeader />
      <main id={APP_MAIN_CONTENT_ID} tabIndex={-1}>{children}</main>
      {showFooter && footerHydrated && (
        <Suspense fallback={null}>
          <SharedFooter />
        </Suspense>
      )}
    </div>
  );
}
