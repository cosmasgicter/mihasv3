/**
 * StepTransition Component
 * Provides smooth animated transitions between wizard steps
 * 
 * @requirements 7.2 - Animated transitions between steps
 */

import { ReactNode } from 'react';
import { motion, AnimatePresence, useReducedMotion, Variants } from 'framer-motion';
import { durations, easings } from '@/lib/animation-config';
import { cn } from '@/lib/utils';

type TransitionDirection = 'forward' | 'backward';

interface StepTransitionProps {
  children: ReactNode;
  stepKey: string | number;
  direction?: TransitionDirection;
  className?: string;
}

interface StepContainerProps {
  children: ReactNode;
  className?: string;
  title?: string;
  description?: string;
}

// Animation variants for step transitions
const getStepVariants = (direction: TransitionDirection, reducedMotion: boolean | null): Variants => {
  if (reducedMotion) {
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1, transition: { duration: 0 } },
      exit: { opacity: 0, transition: { duration: 0 } },
    };
  }

  const xOffset = direction === 'forward' ? 50 : -50;
  const exitXOffset = direction === 'forward' ? -50 : 50;

  return {
    initial: { 
      opacity: 0, 
      x: xOffset,
      scale: 0.98,
    },
    animate: { 
      opacity: 1, 
      x: 0,
      scale: 1,
      transition: {
        duration: durations.normal,
        ease: easings.easeOut,
      }
    },
    exit: { 
      opacity: 0, 
      x: exitXOffset,
      scale: 0.98,
      transition: {
        duration: durations.fast,
        ease: easings.easeIn,
      }
    },
  };
};

// Content reveal variants for staggered animations within steps
const contentVariants: Variants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.1,
    },
  },
};

const itemVariants: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: { 
    opacity: 1, 
    y: 0,
    transition: {
      duration: durations.fast,
      ease: easings.easeOut,
    }
  },
};

export const StepTransition = ({
  children,
  stepKey,
  direction = 'forward',
  className,
}: StepTransitionProps) => {
  const prefersReducedMotion = useReducedMotion();
  const variants = getStepVariants(direction, prefersReducedMotion);

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={stepKey}
        variants={variants}
        initial="initial"
        animate="animate"
        exit="exit"
        className={className}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
};

export const StepContainer = ({
  children,
  className,
  title,
  description,
}: StepContainerProps) => {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      className={cn(
        'bg-card rounded-lg shadow-lg p-6 border border-border',
        className
      )}
      variants={prefersReducedMotion ? undefined : contentVariants}
      initial="initial"
      animate="animate"
    >
      {(title || description) && (
        <motion.div 
          className="mb-6"
          variants={prefersReducedMotion ? undefined : itemVariants}
        >
          {title && (
            <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          )}
          {description && (
            <p className="text-sm text-muted-foreground mt-1">{description}</p>
          )}
        </motion.div>
      )}
      {children}
    </motion.div>
  );
};

// Animated form field wrapper for staggered field animations
export const AnimatedField = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => {
  const prefersReducedMotion = useReducedMotion();

  if (prefersReducedMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      variants={itemVariants}
    >
      {children}
    </motion.div>
  );
};

// Animated form section for grouping related fields
export const AnimatedSection = ({
  children,
  title,
  className,
}: {
  children: ReactNode;
  title?: string;
  className?: string;
}) => {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      className={cn('space-y-4', className)}
      variants={prefersReducedMotion ? undefined : contentVariants}
      initial="initial"
      animate="animate"
    >
      {title && (
        <motion.h3 
          className="text-sm font-medium text-muted-foreground uppercase tracking-wide"
          variants={prefersReducedMotion ? undefined : itemVariants}
        >
          {title}
        </motion.h3>
      )}
      {children}
    </motion.div>
  );
};

export default StepTransition;
