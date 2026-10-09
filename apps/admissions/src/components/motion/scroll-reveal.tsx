'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useReducedMotion } from '@/lib/animation-config';
import { cn } from '@/lib/utils';

interface ScrollRevealProps {
  children: ReactNode;
  className?: string;
}

/**
 * A native IntersectionObserver reveal for public pages.
 *
 * This mirrors FadeInView's one-shot opacity/translate reveal without pulling
 * the framer-motion runtime into the public entry/preload graph.
 */
export function ScrollReveal({ children, className }: ScrollRevealProps) {
  const reducedMotion = useReducedMotion();
  const elementRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(reducedMotion);

  useEffect(() => {
    if (reducedMotion) {
      setIsVisible(true);
      return;
    }

    const element = elementRef.current;
    if (!element || typeof IntersectionObserver === 'undefined') {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setIsVisible(true);
        observer.disconnect();
      },
      { rootMargin: '0px 0px -80px', threshold: 0.01 },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [reducedMotion]);

  return (
    <div
      ref={elementRef}
      className={cn(
        'transform-gpu transition-[opacity,transform] duration-300 ease-smooth-out motion-reduce:transition-none',
        isVisible ? 'translate-y-0 opacity-100' : 'translate-y-7 opacity-0',
        className,
      )}
    >
      {children}
    </div>
  );
}
