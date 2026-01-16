/**
 * AnimatedCounter Component - SmoothUI-style animated number counter
 * Animates numbers from 0 to target value when scrolled into view
 * 
 * @requirements 8.1, 8.6 - SmoothUI animations with reduced-motion support
 */

import { useEffect, useState, useRef } from 'react';
import { motion, useReducedMotion, useSpring, useTransform } from 'framer-motion';
import { useInView } from 'react-intersection-observer';
import { counterConfig } from '@/lib/animation-config';

interface AnimatedCounterProps {
  value: number;
  suffix?: string;
  prefix?: string;
  duration?: number;
  delay?: number;
  className?: string;
  decimals?: number;
  threshold?: number;
}

export function AnimatedCounter({
  value,
  suffix = '',
  prefix = '',
  duration = counterConfig.duration,
  delay = counterConfig.delay,
  className = '',
  decimals = 0,
  threshold = 0.3,
}: AnimatedCounterProps) {
  const prefersReducedMotion = useReducedMotion();
  const { ref, inView } = useInView({
    threshold,
    triggerOnce: true,
  });
  
  const [hasAnimated, setHasAnimated] = useState(false);
  const [displayValue, setDisplayValue] = useState(0);

  // Spring animation for smooth counting
  const springValue = useSpring(0, {
    duration: prefersReducedMotion ? 0 : duration * 1000,
    bounce: 0,
  });

  // Transform spring value to display value
  const transformedValue = useTransform(springValue, (latest) => {
    return decimals > 0 ? latest.toFixed(decimals) : Math.round(latest);
  });

  useEffect(() => {
    if (inView && !hasAnimated) {
      setHasAnimated(true);
      
      if (prefersReducedMotion) {
        // Instant update for reduced motion
        setDisplayValue(value);
      } else {
        // Delayed start for animation
        const timer = setTimeout(() => {
          springValue.set(value);
        }, delay * 1000);
        
        return () => clearTimeout(timer);
      }
    }
  }, [inView, hasAnimated, value, springValue, delay, prefersReducedMotion]);

  // Subscribe to spring value changes
  useEffect(() => {
    if (!prefersReducedMotion) {
      const unsubscribe = transformedValue.on('change', (latest) => {
        setDisplayValue(Number(latest));
      });
      return unsubscribe;
    }
  }, [transformedValue, prefersReducedMotion]);

  const formattedValue = decimals > 0 
    ? displayValue.toFixed(decimals) 
    : Math.round(displayValue).toLocaleString();

  return (
    <span ref={ref} className={className}>
      {prefix}
      <motion.span
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: prefersReducedMotion ? 0 : 0.3 }}
      >
        {formattedValue}
      </motion.span>
      {suffix}
    </span>
  );
}

// Simplified counter for basic use cases
interface SimpleCounterProps {
  from?: number;
  to: number;
  suffix?: string;
  prefix?: string;
  className?: string;
}

export function SimpleCounter({
  from = 0,
  to,
  suffix = '',
  prefix = '',
  className = '',
}: SimpleCounterProps) {
  const prefersReducedMotion = useReducedMotion();
  const { ref, inView } = useInView({
    threshold: 0.3,
    triggerOnce: true,
  });
  
  const [count, setCount] = useState(from);

  useEffect(() => {
    if (!inView) return;

    if (prefersReducedMotion) {
      setCount(to);
      return;
    }

    const duration = 2000; // 2 seconds
    const steps = 60;
    const increment = (to - from) / steps;
    const stepDuration = duration / steps;
    let currentStep = 0;

    const timer = setInterval(() => {
      currentStep++;
      if (currentStep >= steps) {
        setCount(to);
        clearInterval(timer);
      } else {
        setCount(Math.round(from + increment * currentStep));
      }
    }, stepDuration);

    return () => clearInterval(timer);
  }, [inView, from, to, prefersReducedMotion]);

  return (
    <span ref={ref} className={className}>
      {prefix}{count.toLocaleString()}{suffix}
    </span>
  );
}

export default AnimatedCounter;
