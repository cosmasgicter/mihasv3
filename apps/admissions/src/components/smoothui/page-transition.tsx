/**
 * PageTransition Component - SmoothUI-style page transition wrapper
 * Provides smooth fade and slide animations for route changes
 * Uses CSS transitions instead of framer-motion for performance.
 * 
 * @requirements 1.2 - CSS transitions instead of framer-motion
 * @requirements 1.5 - Preserve same visual transition behavior
 * @requirements 4.4 - Page transitions complete within 300ms
 * @requirements 8.1, 8.6 - SmoothUI animations with reduced-motion support
 */

import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/lib/animation-config';

interface PageTransitionProps {
  children: React.ReactNode;
  className?: string;
  mode?: 'fade' | 'slide' | 'scale' | 'slideUp' | 'slideDown' | 'none';
  /** Custom duration in seconds (capped at 300ms for compliance) */
  duration?: number;
}

const modeClasses: Record<string, { initial: string; animate: string }> = {
  fade: {
    initial: 'opacity-0',
    animate: 'opacity-100',
  },
  slide: {
    initial: 'opacity-0 translate-x-5',
    animate: 'opacity-100 translate-x-0',
  },
  slideUp: {
    initial: 'opacity-0 translate-y-8',
    animate: 'opacity-100 translate-y-0',
  },
  slideDown: {
    initial: 'opacity-0 -translate-y-8',
    animate: 'opacity-100 translate-y-0',
  },
  scale: {
    initial: 'opacity-0 scale-95',
    animate: 'opacity-100 scale-100',
  },
};

export function PageTransition({ 
  children, 
  className = '',
  mode = 'fade',
  duration,
}: PageTransitionProps) {
  const reducedMotion = useReducedMotion();
  const [isVisible, setIsVisible] = useState(reducedMotion);

  useEffect(() => {
    if (reducedMotion) return;
    // Trigger animation on mount
    const frame = requestAnimationFrame(() => setIsVisible(true));
    return () => cancelAnimationFrame(frame);
  }, [reducedMotion]);

  if (mode === 'none' || reducedMotion) {
    return <div className={className}>{children}</div>;
  }

  const classes = modeClasses[mode] || modeClasses.fade;
  const durationMs = Math.min((duration ?? 0.3) * 1000, 300);

  return (
    <div
      className={cn(
        'transition-all ease-out motion-reduce:transition-none',
        isVisible ? classes.animate : classes.initial,
        className
      )}
      style={{ transitionDuration: `${durationMs}ms` }}
    >
      {children}
    </div>
  );
}

/**
 * RouteTransition - Wrapper for route-based page transitions
 * Uses CSS transitions to animate between routes
 * 
 * @requirements 4.4 - Smooth page transitions between routes
 */
interface RouteTransitionProps {
  children: React.ReactNode;
  mode?: PageTransitionProps['mode'];
  className?: string;
}

export function RouteTransition({ 
  children, 
  mode = 'fade',
  className = ''
}: RouteTransitionProps) {
  const location = useLocation();
  const reducedMotion = useReducedMotion();
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    if (reducedMotion) return;
    setIsVisible(false);
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => setIsVisible(true));
    });
    return () => cancelAnimationFrame(frame);
  }, [location.pathname, reducedMotion]);

  if (reducedMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <PageTransition mode={mode} className={className}>
      <div
        className={cn(
          'transition-opacity duration-200 ease-out motion-reduce:transition-none',
          isVisible ? 'opacity-100' : 'opacity-0'
        )}
      >
        {children}
      </div>
    </PageTransition>
  );
}

// Wrapper for animated routes
interface AnimatedRoutesProps {
  children: React.ReactNode;
  locationKey?: string;
  mode?: PageTransitionProps['mode'];
}

export function AnimatedRoutes({ children, locationKey, mode = 'fade' }: AnimatedRoutesProps) {
  const reducedMotion = useReducedMotion();
  const [isVisible, setIsVisible] = useState(reducedMotion);

  useEffect(() => {
    if (reducedMotion) return;
    setIsVisible(false);
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => setIsVisible(true));
    });
    return () => cancelAnimationFrame(frame);
  }, [locationKey, reducedMotion]);

  if (reducedMotion) {
    return <div>{children}</div>;
  }

  const classes = modeClasses[mode || 'fade'] || modeClasses.fade;

  return (
    <div
      className={cn(
        'transition-all duration-300 ease-out motion-reduce:transition-none',
        isVisible ? classes.animate : classes.initial
      )}
    >
      {children}
    </div>
  );
}

// Layout transition wrapper for shared layout animations
interface LayoutTransitionProps {
  children: React.ReactNode;
  layoutId?: string;
  className?: string;
}

export function LayoutTransition({ 
  children, 
  layoutId,
  className = '',
}: LayoutTransitionProps) {
  return (
    <div
      className={cn(
        'transition-all duration-300 ease-out motion-reduce:transition-none',
        className
      )}
    >
      {children}
    </div>
  );
}

/**
 * ContentTransition - For animating content changes within a page
 * Useful for tab panels, accordions, and dynamic content
 */
interface ContentTransitionProps {
  children: React.ReactNode;
  contentKey: string;
  mode?: 'fade' | 'slide' | 'scale';
  className?: string;
}

export function ContentTransition({
  children,
  contentKey,
  mode = 'fade',
  className = ''
}: ContentTransitionProps) {
  const reducedMotion = useReducedMotion();
  const [isVisible, setIsVisible] = useState(reducedMotion);

  useEffect(() => {
    if (reducedMotion) return;
    setIsVisible(false);
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => setIsVisible(true));
    });
    return () => cancelAnimationFrame(frame);
  }, [contentKey, reducedMotion]);

  if (reducedMotion) {
    return <div className={className}>{children}</div>;
  }

  const classes = modeClasses[mode || 'fade'] || modeClasses.fade;

  return (
    <div
      className={cn(
        'transition-all duration-300 ease-out motion-reduce:transition-none',
        isVisible ? classes.animate : classes.initial,
        className
      )}
    >
      {children}
    </div>
  );
}

export default PageTransition;
