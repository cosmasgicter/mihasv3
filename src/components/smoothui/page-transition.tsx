/**
 * PageTransition Component - SmoothUI-style page transition wrapper
 * Provides smooth fade and slide animations for route changes
 * 
 * @requirements 8.1, 8.6 - SmoothUI animations with reduced-motion support
 */

import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { 
  pageTransitionVariants, 
  reducedMotionVariants,
  durations 
} from '@/lib/animation-config';

interface PageTransitionProps {
  children: React.ReactNode;
  className?: string;
  mode?: 'fade' | 'slide' | 'scale' | 'none';
}

export function PageTransition({ 
  children, 
  className = '',
  mode = 'fade',
}: PageTransitionProps) {
  const prefersReducedMotion = useReducedMotion();

  // Use reduced motion variants if user prefers
  if (prefersReducedMotion || mode === 'none') {
    return <div className={className}>{children}</div>;
  }

  const variants = getVariantsForMode(mode);

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
function getVariantsForMode(mode: PageTransitionProps['mode']) {
  switch (mode) {
    case 'slide':
      return {
        initial: { opacity: 0, x: 20 },
        animate: { 
          opacity: 1, 
          x: 0,
          transition: { duration: durations.normal, ease: [0.4, 0, 0.2, 1] }
        },
        exit: { 
          opacity: 0, 
          x: -20,
          transition: { duration: durations.fast, ease: [0.4, 0, 1, 1] }
        },
      };
    case 'scale':
      return {
        initial: { opacity: 0, scale: 0.95 },
        animate: { 
          opacity: 1, 
          scale: 1,
          transition: { duration: durations.normal, ease: [0.4, 0, 0.2, 1] }
        },
        exit: { 
          opacity: 0, 
          scale: 1.05,
          transition: { duration: durations.fast, ease: [0.4, 0, 1, 1] }
        },
      };
    case 'fade':
    default:
      return pageTransitionVariants;
  }
}

// Wrapper for AnimatePresence with page transitions
interface AnimatedRoutesProps {
  children: React.ReactNode;
  locationKey?: string;
}

export function AnimatedRoutes({ children, locationKey }: AnimatedRoutesProps) {
  const prefersReducedMotion = useReducedMotion();

  if (prefersReducedMotion) {
    return <>{children}</>;
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div key={locationKey}>
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
        layout: { duration: durations.normal, ease: [0.4, 0, 0.2, 1] },
      }}
    >
      {children}
    </motion.div>
  );
}

export default PageTransition;
