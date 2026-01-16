/**
 * Animation Configuration for SmoothUI-style animations
 * Provides Motion animation defaults with reduced-motion support
 * 
 * @requirements 8.1, 8.6 - SmoothUI animation registry with reduced-motion support
 */

// Check for reduced motion preference
export const prefersReducedMotion = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

// Animation durations (in seconds)
export const durations = {
  fast: 0.15,
  normal: 0.3,
  slow: 0.5,
  slower: 0.8,
} as const;

// Easing functions for smooth animations
export const easings = {
  default: [0.4, 0, 0.2, 1] as const,
  bounce: [0.68, -0.55, 0.265, 1.55] as const,
  smooth: [0.25, 0.1, 0.25, 1] as const,
  easeOut: [0, 0, 0.2, 1] as const,
  easeIn: [0.4, 0, 1, 1] as const,
  easeInOut: [0.4, 0, 0.2, 1] as const,
} as const;

// Spring configurations for physics-based animations
export const springs = {
  gentle: { stiffness: 120, damping: 14 },
  bouncy: { stiffness: 300, damping: 10 },
  stiff: { stiffness: 400, damping: 30 },
  slow: { stiffness: 100, damping: 20 },
} as const;

// Get duration based on reduced motion preference
export const getAnimationDuration = (duration: keyof typeof durations): number => {
  if (prefersReducedMotion()) return 0;
  return durations[duration];
};

// Page transition variants
export const pageTransitionVariants = {
  initial: { opacity: 0, y: 20 },
  animate: { 
    opacity: 1, 
    y: 0,
    transition: {
      duration: durations.normal,
      ease: easings.default,
    }
  },
  exit: { 
    opacity: 0, 
    y: -20,
    transition: {
      duration: durations.fast,
      ease: easings.easeIn,
    }
  },
};

// Reduced motion variants (instant state changes)
export const reducedMotionVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0 } },
  exit: { opacity: 0, transition: { duration: 0 } },
};

// Scroll reveal variants
export const scrollRevealVariants = {
  up: {
    hidden: { opacity: 0, y: 40 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: {
        duration: durations.slow,
        ease: easings.easeOut,
      }
    },
  },
  down: {
    hidden: { opacity: 0, y: -40 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: {
        duration: durations.slow,
        ease: easings.easeOut,
      }
    },
  },
  left: {
    hidden: { opacity: 0, x: -40 },
    visible: { 
      opacity: 1, 
      x: 0,
      transition: {
        duration: durations.slow,
        ease: easings.easeOut,
      }
    },
  },
  right: {
    hidden: { opacity: 0, x: 40 },
    visible: { 
      opacity: 1, 
      x: 0,
      transition: {
        duration: durations.slow,
        ease: easings.easeOut,
      }
    },
  },
};

// Reduced motion scroll reveal variants
export const reducedMotionScrollRevealVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0 } },
};

// Fade variants
export const fadeVariants = {
  hidden: { opacity: 0 },
  visible: { 
    opacity: 1,
    transition: {
      duration: durations.normal,
      ease: easings.easeOut,
    }
  },
};

// Scale variants for hover effects
export const scaleVariants = {
  initial: { scale: 1 },
  hover: { scale: 1.02 },
  tap: { scale: 0.98 },
};

// Stagger children configuration
export const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.1,
    },
  },
};

// Counter animation configuration
export const counterConfig = {
  duration: 2, // seconds
  delay: 0.2,
  ease: easings.easeOut,
};

// Get appropriate variants based on reduced motion preference
export const getVariants = <T extends Record<string, unknown>>(
  normalVariants: T,
  reducedVariants: T
): T => {
  return prefersReducedMotion() ? reducedVariants : normalVariants;
};

// Animation configuration type exports
export type Duration = keyof typeof durations;
export type Easing = keyof typeof easings;
export type Spring = keyof typeof springs;
export type ScrollDirection = 'up' | 'down' | 'left' | 'right';
