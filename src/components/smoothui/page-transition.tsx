/**
 * PageTransition Component - SmoothUI-style page transition wrapper
 * Provides smooth fade and slide animations for route changes
 * 
 * @requirements 4.4 - Page transitions complete within 300ms
 * @requirements 8.1, 8.6 - SmoothUI animations with reduced-motion support
 */

import React from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { 
  pageTransitionVariants, 
  durations,
  easings
} from '@/lib/animation-config';

// Maximum transition duration to ensure completion within 300ms (Requirement 4.4)
const MAX_TRANSITION_DURATION = 0.3;

interface PageTransitionProps {
  children: React.ReactNode;
  className?: string;
  mode?: 'fade' | 'slide' | 'scale' | 'slideUp' | 'slideDown' | 'none';
  /** Custom duration in seconds (capped at 300ms for compliance) */
  duration?: number;
}

export function PageTransition({ 
  children, 
  className = '',
  mode = 'fade',
  duration,
}: PageTransitionProps) {
  const prefersReducedMotion = useReducedMotion();

  // Use reduced motion variants if user prefers
  if (prefersReducedMotion || mode === 'none') {
    return <div className={className}>{children}</div>;
  }

  const variants = getVariantsForMode(mode, duration);

  return (
    <motion.div
      initial="initial"
      animate="animate"
      exit="exit"
      variants={variants}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// Get animation variants based on mode
function getVariantsForMode(mode: PageTransitionProps['mode'], customDuration?: number) {
  // Ensure duration doesn't exceed 300ms (Requirement 4.4)
  const animateDuration = Math.min(customDuration ?? durations.normal, MAX_TRANSITION_DURATION);
  const exitDuration = Math.min(customDuration ?? durations.fast, MAX_TRANSITION_DURATION);

  switch (mode) {
    case 'slide':
      return {
        initial: { opacity: 0, x: 20 },
        animate: { 
          opacity: 1, 
          x: 0,
          transition: { duration: animateDuration, ease: easings.easeOut }
        },
        exit: { 
          opacity: 0, 
          x: -20,
          transition: { duration: exitDuration, ease: easings.easeIn }
        },
      };
    case 'slideUp':
      return {
        initial: { opacity: 0, y: 30 },
        animate: { 
          opacity: 1, 
          y: 0,
          transition: { duration: animateDuration, ease: easings.easeOut }
        },
        exit: { 
          opacity: 0, 
          y: -20,
          transition: { duration: exitDuration, ease: easings.easeIn }
        },
      };
    case 'slideDown':
      return {
        initial: { opacity: 0, y: -30 },
        animate: { 
          opacity: 1, 
          y: 0,
          transition: { duration: animateDuration, ease: easings.easeOut }
        },
        exit: { 
          opacity: 0, 
          y: 20,
          transition: { duration: exitDuration, ease: easings.easeIn }
        },
      };
    case 'scale':
      return {
        initial: { opacity: 0, scale: 0.95 },
        animate: { 
          opacity: 1, 
          scale: 1,
          transition: { duration: animateDuration, ease: easings.easeOut }
        },
        exit: { 
          opacity: 0, 
          scale: 1.02,
          transition: { duration: exitDuration, ease: easings.easeIn }
        },
      };
    case 'fade':
    default:
      return {
        initial: { opacity: 0 },
        animate: { 
          opacity: 1,
          transition: { duration: animateDuration, ease: easings.easeOut }
        },
        exit: { 
          opacity: 0,
          transition: { duration: exitDuration, ease: easings.easeIn }
        },
      };
  }
}

/**
 * RouteTransition - Wrapper for route-based page transitions
 * Uses AnimatePresence to animate between routes
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
  const prefersReducedMotion = useReducedMotion();

  if (prefersReducedMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      <PageTransition 
        key={location.pathname} 
        mode={mode}
        className={className}
      >
        {children}
      </PageTransition>
    </AnimatePresence>
  );
}

// Wrapper for AnimatePresence with page transitions
interface AnimatedRoutesProps {
  children: React.ReactNode;
  locationKey?: string;
  mode?: PageTransitionProps['mode'];
}

export function AnimatedRoutes({ children, locationKey, mode = 'fade' }: AnimatedRoutesProps) {
  const prefersReducedMotion = useReducedMotion();
  const variants = getVariantsForMode(mode);

  if (prefersReducedMotion) {
    return <>{children}</>;
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div 
        key={locationKey}
        initial="initial"
        animate="animate"
        exit="exit"
        variants={variants}
      >
        {children}
      </motion.div>
    </AnimatePresence>
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
  const prefersReducedMotion = useReducedMotion();

  if (prefersReducedMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      layoutId={layoutId}
      layout
      className={className}
      transition={{
        layout: { duration: Math.min(durations.normal, MAX_TRANSITION_DURATION), ease: easings.easeOut },
      }}
    >
      {children}
    </motion.div>
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
  const prefersReducedMotion = useReducedMotion();
  const variants = getVariantsForMode(mode);

  if (prefersReducedMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={contentKey}
        initial="initial"
        animate="animate"
        exit="exit"
        variants={variants}
        className={className}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

export default PageTransition;
