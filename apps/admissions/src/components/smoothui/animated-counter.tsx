/**
 * AnimatedCounter Component - SmoothUI-style animated number counter
 * Animates numbers from 0 to target value when scrolled into view
 * Uses native requestAnimationFrame for performance (no Framer Motion)
 * 
 * @requirements 8.1, 8.6 - SmoothUI animations with reduced-motion support
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import { useInView } from 'react-intersection-observer';
import { counterConfig, prefersReducedMotion as checkReducedMotion } from '@/lib/animation-config';

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
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const { ref, inView } = useInView({
    threshold,
    triggerOnce: true,
  });
  
  const [displayValue, setDisplayValue] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const animationRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  // Check reduced motion preference on mount
  useEffect(() => {
    setPrefersReducedMotion(checkReducedMotion());
  }, []);

  // Easing function for smooth animation
  const easeOutQuart = useCallback((t: number): number => {
    return 1 - Math.pow(1 - t, 4);
  }, []);

  useEffect(() => {
    if (!inView) return;

    // Show the element
    setIsVisible(true);

    // If reduced motion is preferred, show final value immediately
    if (prefersReducedMotion) {
      setDisplayValue(value);
      return;
    }

    // Cancel any existing animation
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    // Reset start time for new animation
    startTimeRef.current = null;

    const animate = (timestamp: number) => {
      if (!startTimeRef.current) {
        startTimeRef.current = timestamp + (delay * 1000);
      }

      const elapsed = timestamp - startTimeRef.current;
      
      // Wait for delay
      if (elapsed < 0) {
        animationRef.current = requestAnimationFrame(animate);
        return;
      }

      const durationMs = duration * 1000;
      const progress = Math.min(elapsed / durationMs, 1);
      const easedProgress = easeOutQuart(progress);
      const currentValue = easedProgress * value;

      setDisplayValue(currentValue);

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        setDisplayValue(value);
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [inView, value, duration, delay, prefersReducedMotion, easeOutQuart]);

  const formattedValue = decimals > 0 
    ? displayValue.toFixed(decimals) 
    : Math.round(displayValue).toLocaleString();

  const finalFormattedValue = decimals > 0
    ? value.toFixed(decimals)
    : value.toLocaleString();
  const accessibleValue = `${prefix}${finalFormattedValue}${suffix}`

  return (
    <span ref={ref} className={className}>
      <span className="sr-only">{accessibleValue}</span>
      {prefix && <span aria-hidden="true">{prefix}</span>}
      <span
        className="transition-opacity duration-300"
        style={{ opacity: isVisible ? 1 : 0 }}
        aria-hidden="true"
      >
        {formattedValue}
      </span>
      {suffix && <span aria-hidden="true">{suffix}</span>}
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
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const { ref, inView } = useInView({
    threshold: 0.3,
    triggerOnce: true,
  });
  
  const [count, setCount] = useState(from);

  // Check reduced motion preference on mount
  useEffect(() => {
    setPrefersReducedMotion(checkReducedMotion());
  }, []);

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
      <span className="sr-only">{`${prefix}${to.toLocaleString()}${suffix}`}</span>
      <span aria-hidden="true">{prefix}{count.toLocaleString()}{suffix}</span>
    </span>
  );
}

export default AnimatedCounter;
