'use client';

import { type ReactNode } from 'react';
import { motion, AnimatePresence, type Transition } from 'framer-motion';
import { useReducedMotion } from '@/lib/animation-config';
export { StaggerContainer, StaggerItem } from './stagger';

const spring = { type: 'spring' as const, stiffness: 400, damping: 17 };
const ease = [0.4, 0, 0.2, 1] as const;

function useDuration(base: number) {
  const reduced = useReducedMotion();
  if (reduced) return 0;
  // Slightly faster on mobile
  if (typeof window !== 'undefined' && window.innerWidth < 768) return base * 0.8;
  return base;
}

interface MotionProps {
  children: ReactNode;
  className?: string;
  delay?: number;
}

export function FadeIn({ children, className, delay = 0 }: MotionProps) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease, delay }}
    >
      {children}
    </motion.div>
  );
}

export function FadeInView({ children, className, delay = 0 }: MotionProps) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.4, ease, delay }}
    >
      {children}
    </motion.div>
  );
}

export function SlideUp({ children, className, delay = 0 }: MotionProps) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease, delay }}
    >
      {children}
    </motion.div>
  );
}

// A per-StaggerContainer counter (via context) assigns each StaggerItem
// child an increasing index, so siblings receive increasing CSS
// `animation-delay` values (0.08s apart, matching the previous
// framer-motion `staggerChildren` value) without any JS animation engine.
// See `./stagger.tsx` for the implementation and rationale (kept out of this
// framer-motion-importing module so pages using only Stagger* never pull in
// the framer-motion bundle).

export function ScaleOnHover({ children, className }: Omit<MotionProps, 'delay'>) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.98 }}
      transition={spring}
    >
      {children}
    </motion.div>
  );
}

interface PageTransitionProps {
  children: ReactNode;
  className?: string;
  id?: string;
}

export function PageTransition({ children, className, id }: PageTransitionProps) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div
      key={id}
      className={className}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2, ease }}
    >
      {children}
    </motion.div>
  );
}

interface CrossfadeProps {
  isLoading: boolean;
  skeleton: ReactNode;
  children: ReactNode;
}

export function Crossfade({ isLoading, skeleton, children }: CrossfadeProps) {
  const reduced = useReducedMotion();
  if (reduced) return <>{isLoading ? skeleton : children}</>;
  return (
    <AnimatePresence mode="wait">
      {isLoading ? (
        <motion.div
          key="skeleton"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {skeleton}
        </motion.div>
      ) : (
        <motion.div
          key="content"
          initial={{ opacity: 0, scale: 0.99 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.25, ease }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export { AnimatePresence, motion };
