import type { ReactNode } from 'react';
import { PageTransition as SmoothPageTransition } from '@/components/smoothui/page-transition';

interface PageTransitionProps {
  children: ReactNode;
  className?: string;
}

/**
 * @deprecated Use transition components from `@/components/smoothui` directly.
 * This compatibility wrapper keeps legacy imports working while routing all
 * behavior through the canonical SmoothUI transition system.
 */
export function PageTransition({ children, className }: PageTransitionProps) {
  return (
    <SmoothPageTransition mode="fade" className={className}>
      {children}
    </SmoothPageTransition>
  );
}

/**
 * @deprecated Use `PageTransition` from `@/components/smoothui` with `mode="fade"`.
 */
export function FadeTransition({ children, className }: PageTransitionProps) {
  return (
    <SmoothPageTransition mode="fade" className={className}>
      {children}
    </SmoothPageTransition>
  );
}

/**
 * @deprecated Use `PageTransition` from `@/components/smoothui` with `mode="slide"`.
 */
export function SlideTransition({ children, className }: PageTransitionProps) {
  return (
    <SmoothPageTransition mode="slide" className={className}>
      {children}
    </SmoothPageTransition>
  );
}
