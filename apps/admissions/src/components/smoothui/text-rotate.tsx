/**
 * TextRotate Component - CSS rotateX() phrase cycling
 * Cycles through an array of phrases with a 3D flip transition.
 * No framer-motion — pure CSS transitions only.
 *
 * @requirements 5.1 - Cycles through a configurable list of phrases
 * @requirements 5.2 - Smooth rotation animation at configurable interval
 * @requirements 5.3 - prefers-reduced-motion shows first phrase only (static)
 * @requirements 5.4 - aria-live="polite" announces current phrase to screen readers
 */

import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/lib/animation-config';

interface TextRotateProps {
  /** Array of phrases to cycle through */
  phrases: string[];
  /** Interval between rotations in ms (default: 3000) */
  interval?: number;
  /** Animation duration in ms (default: 500) */
  duration?: number;
  /** Additional className */
  className?: string;
}

export function TextRotate({
  phrases,
  interval = 3000,
  duration = 500,
  className,
}: TextRotateProps) {
  const reducedMotion = useReducedMotion();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipping, setIsFlipping] = useState(false);

  const safeIndex = phrases.length > 0 ? currentIndex % phrases.length : 0;

  const advance = useCallback(() => {
    if (phrases.length <= 1) return;
    setIsFlipping(true);
    // After half the duration (exit completes), swap the phrase
    const halfDuration = duration / 2;
    setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % phrases.length);
      setIsFlipping(false);
    }, halfDuration);
  }, [phrases.length, duration]);

  useEffect(() => {
    if (reducedMotion || phrases.length <= 1) return;

    const id = setInterval(advance, interval);
    return () => clearInterval(id);
  }, [reducedMotion, phrases.length, interval, advance]);

  // Empty phrases guard
  if (phrases.length === 0) {
    return null;
  }

  // Reduced motion: show first phrase only, static
  if (reducedMotion) {
    return (
      <span className={cn('text-rotate-static', className)} aria-live="polite">
        {phrases[0]}
      </span>
    );
  }

  return (
    <>
      <style>{`
        .text-rotate-wrapper {
          display: inline-block;
          perspective: 600px;
          overflow: hidden;
          vertical-align: baseline;
        }
        .text-rotate-inner {
          display: inline-block;
          transform-style: preserve-3d;
          backface-visibility: hidden;
          transition: transform ${duration / 2}ms ease-in-out;
        }
        .text-rotate-inner--flipping {
          transform: rotateX(90deg);
        }
      `}</style>
      <span
        className={cn('text-rotate-wrapper', className)}
        aria-live="polite"
      >
        <span
          className={cn(
            'text-rotate-inner',
            isFlipping && 'text-rotate-inner--flipping',
          )}
        >
          {phrases[safeIndex]}
        </span>
      </span>
    </>
  );
}

export default TextRotate;
