/**
 * ScrollReveal Component - SmoothUI-style scroll-triggered animations
 * Reveals content with smooth animations when scrolled into view
 * Uses CSS transitions instead of framer-motion for performance.
 * 
 * @requirements 1.2 - CSS transitions instead of framer-motion
 * @requirements 1.5 - Preserve same visual transition behavior
 * @requirements 8.1, 8.6 - SmoothUI animations with reduced-motion support
 */

import React, { useEffect, useState } from 'react';
import { useInView } from 'react-intersection-observer';
import { cn } from '@/lib/utils';
import type { ScrollDirection } from '@/lib/animation-config';

interface ScrollRevealProps {
  children: React.ReactNode;
  direction?: ScrollDirection;
  delay?: number;
  duration?: number;
  threshold?: number;
  className?: string;
  once?: boolean;
}

const directionStyles: Record<ScrollDirection, { hidden: string; visible: string }> = {
  up: {
    hidden: 'opacity-0 translate-y-10',
    visible: 'opacity-100 translate-y-0',
  },
  down: {
    hidden: 'opacity-0 -translate-y-10',
    visible: 'opacity-100 translate-y-0',
  },
  left: {
    hidden: 'opacity-0 -translate-x-10',
    visible: 'opacity-100 translate-x-0',
  },
  right: {
    hidden: 'opacity-0 translate-x-10',
    visible: 'opacity-100 translate-x-0',
  },
};

export function ScrollReveal({
  children,
  direction = 'up',
  delay = 0,
  duration,
  threshold = 0.1,
  className = '',
  once = true,
}: ScrollRevealProps) {
  const { ref, inView } = useInView({
    threshold,
    triggerOnce: once,
  });

  const styles = directionStyles[direction];
  const durationMs = duration !== undefined ? duration * 1000 : 500;

  return (
    <div
      ref={ref}
      className={cn(
        'transition-all ease-out motion-reduce:transition-none',
        inView ? styles.visible : styles.hidden,
        className
      )}
      style={{
        transitionDuration: `${durationMs}ms`,
        transitionDelay: `${delay * 1000}ms`,
      }}
    >
      {children}
    </div>
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
  const { ref, inView } = useInView({
    threshold,
    triggerOnce: once,
  });

  return (
    <div
      ref={ref}
      className={cn(
        'transition-opacity duration-300 ease-out motion-reduce:transition-none',
        inView ? 'opacity-100' : 'opacity-0',
        className
      )}
    >
      {React.Children.map(children, (child, index) => {
        if (!React.isValidElement(child)) return child;
        return React.cloneElement(child as React.ReactElement<{ style?: React.CSSProperties }>, {
          style: {
            ...(child.props as { style?: React.CSSProperties }).style,
            transitionDelay: inView ? `${index * staggerDelay * 1000}ms` : '0ms',
          },
        });
      })}
    </div>
  );
}

// Individual stagger item
interface StaggerItemProps {
  children: React.ReactNode;
  className?: string;
}

export function StaggerItem({ children, className = '' }: StaggerItemProps) {
  return (
    <div
      className={cn(
        'transition-all duration-300 ease-out motion-reduce:transition-none',
        'opacity-0 translate-y-5',
        className
      )}
      style={{ animationFillMode: 'forwards' }}
    >
      {children}
    </div>
  );
}

export default ScrollReveal;
