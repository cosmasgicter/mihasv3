'use client';

/**
 * CSS-only stagger primitives — deliberately kept in a separate module from
 * `@/components/motion` so that pages using ONLY `StaggerContainer` /
 * `StaggerItem` (both dashboards, at time of writing) never pull the
 * framer-motion bundle into their chunk graph. The barrel
 * (`@/components/motion/index.tsx`) re-exports both names so every existing
 * call site keeps working unchanged.
 *
 * See ADR-009 (documented inline in
 * `tests/unit/motionPrimitivesAuditFix.test.tsx`) for the established
 * CSS-first precedent this follows (PageShell, ButtonSpinner).
 */
import { createContext, useContext, useMemo, useRef, type CSSProperties, type ReactNode } from 'react';
import { useReducedMotion } from '@/lib/animation-config';
import { cn } from '@/lib/utils';

interface StaggerContainerProps {
  children: ReactNode;
  className?: string;
  delay?: number;
}

// A per-StaggerContainer counter (via context) assigns each StaggerItem
// child an increasing index, so siblings receive increasing CSS
// `animation-delay` values (0.08s apart, matching the previous
// framer-motion `staggerChildren` value) without any JS animation engine.
const StaggerIndexContext = createContext<{ next: () => number } | null>(null);

export function StaggerContainer({ children, className, delay = 0 }: StaggerContainerProps) {
  const reduced = useReducedMotion();
  const counterRef = useRef(0);
  const contextValue = useMemo(() => {
    counterRef.current = 0;
    return { next: () => counterRef.current++ };
  }, [children]);

  if (reduced) return <div className={className}>{children}</div>;

  return (
    <StaggerIndexContext.Provider value={contextValue}>
      <div className={className} style={{ '--stagger-base-delay': `${delay}s` } as CSSProperties}>
        {children}
      </div>
    </StaggerIndexContext.Provider>
  );
}

export function StaggerItem({
  children,
  className,
}: Omit<StaggerContainerProps, 'delay'>) {
  const reduced = useReducedMotion();
  const ctx = useContext(StaggerIndexContext);
  const indexRef = useRef<number | null>(null);
  if (indexRef.current === null) {
    indexRef.current = ctx ? ctx.next() : 0;
  }
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <div
      className={cn('animate-fade-in-up', className)}
      style={{
        animationDelay: `calc(var(--stagger-base-delay, 0s) + ${indexRef.current * 0.08}s)`,
      }}
    >
      {children}
    </div>
  );
}
