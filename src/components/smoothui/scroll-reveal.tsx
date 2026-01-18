/**
 * ScrollReveal Component - SmoothUI-style scroll-triggered animations
 * Reveals content with smooth animations when scrolled into view
 * 
 * @requirements 8.1, 8.6 - SmoothUI animations with reduced-motion support
 */

import { motion } from 'framer-motion';
import { useInView } from 'react-intersection-observer';
import { 
  scrollRevealVariants, 
  reducedMotionScrollRevealVariants,
  durations,
  type ScrollDirection 
} from '@/lib/animation-config';
import { useOptimizedAnimation } from '@/hooks/useOptimizedAnimation';

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
  const { shouldAnimate } = useOptimizedAnimation();
  const { ref, inView } = useInView({
    threshold,
    triggerOnce: once,
  });

  // Use reduced motion/mobile variants (which are essentially "no animation" or "instant appear")
  // if animation is disabled.
  const variants = shouldAnimate 
    ? scrollRevealVariants[direction]
    : reducedMotionScrollRevealVariants;

  // Override duration if provided, or set to 0 if animation disabled
  const customTransition = duration !== undefined 
    ? { duration: shouldAnimate ? duration : 0 }
    : undefined;

  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={inView ? 'visible' : 'hidden'}
      variants={variants}
      transition={{
        delay: shouldAnimate ? delay : 0,
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
  const { shouldAnimate } = useOptimizedAnimation();
  const { ref, inView } = useInView({
    threshold,
    triggerOnce: once,
  });

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: shouldAnimate ? staggerDelay : 0,
        delayChildren: shouldAnimate ? 0.1 : 0,
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
  const { shouldAnimate } = useOptimizedAnimation();

  const itemVariants = {
    hidden: { opacity: 0, y: shouldAnimate ? 20 : 0 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: shouldAnimate ? durations.normal : 0,
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
