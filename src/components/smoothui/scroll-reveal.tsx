/**
 * ScrollReveal Component - SmoothUI-style scroll-triggered animations
 * Reveals content with smooth animations when scrolled into view
 * 
 * @requirements 8.1, 8.6 - SmoothUI animations with reduced-motion support
 */

import { motion, useReducedMotion } from 'framer-motion';
import { useInView } from 'react-intersection-observer';
import { 
  scrollRevealVariants, 
  reducedMotionScrollRevealVariants,
  durations,
  type ScrollDirection 
} from '@/lib/animation-config';

interface ScrollRevealProps {
  children: React.ReactNode;
  direction?: ScrollDirection;
  delay?: number;
  duration?: number;
  threshold?: number;
  className?: string;
  once?: boolean;
}

export function ScrollReveal({
  children,
  direction = 'up',
  delay = 0,
  duration,
  threshold = 0.1,
  className = '',
  once = true,
}: ScrollRevealProps) {
  const prefersReducedMotion = useReducedMotion();
  const { ref, inView } = useInView({
    threshold,
    triggerOnce: once,
  });

  // Use reduced motion variants if user prefers
  const variants = prefersReducedMotion 
    ? reducedMotionScrollRevealVariants 
    : scrollRevealVariants[direction];

  // Override duration if provided
  const customTransition = duration !== undefined 
    ? { duration: prefersReducedMotion ? 0 : duration }
    : undefined;

  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={inView ? 'visible' : 'hidden'}
      variants={variants}
      transition={{
        delay: prefersReducedMotion ? 0 : delay,
        ...customTransition,
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// Staggered children reveal for lists/grids
interface StaggerRevealProps {
  children: React.ReactNode;
  staggerDelay?: number;
  threshold?: number;
  className?: string;
  once?: boolean;
}

export function StaggerReveal({
  children,
  staggerDelay = 0.1,
  threshold = 0.1,
  className = '',
  once = true,
}: StaggerRevealProps) {
  const prefersReducedMotion = useReducedMotion();
  const { ref, inView } = useInView({
    threshold,
    triggerOnce: once,
  });

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: prefersReducedMotion ? 0 : staggerDelay,
        delayChildren: prefersReducedMotion ? 0 : 0.1,
      },
    },
  };

  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={inView ? 'visible' : 'hidden'}
      variants={containerVariants}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// Individual stagger item
interface StaggerItemProps {
  children: React.ReactNode;
  className?: string;
}

export function StaggerItem({ children, className = '' }: StaggerItemProps) {
  const prefersReducedMotion = useReducedMotion();

  const itemVariants = {
    hidden: { opacity: 0, y: prefersReducedMotion ? 0 : 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: prefersReducedMotion ? 0 : durations.normal,
      },
    },
  };

  return (
    <motion.div variants={itemVariants} className={className}>
      {children}
    </motion.div>
  );
}

export default ScrollReveal;
