/**
 * TextEffect Component - CSS entrance animations triggered on viewport entry
 * Uses IntersectionObserver to animate text once on first scroll into view.
 * No framer-motion — pure CSS transitions only.
 *
 * @requirements 6.1 - Motion-based text entrance effects on section headings
 * @requirements 6.2 - Trigger once per element on first viewport entry
 * @requirements 6.3 - prefers-reduced-motion renders immediately without animation
 * @requirements 6.4 - Text visible in DOM before animation starts (no display:none)
 */

import { useRef, useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/lib/animation-config';

interface TextEffectProps {
  /** Text content */
  children: React.ReactNode;
  /** Animation type (default: 'fadeUp') */
  effect?: 'fadeUp' | 'fadeIn' | 'slideLeft' | 'blur';
  /** Delay before animation starts in ms (default: 0) */
  delay?: number;
  /** Additional className */
  className?: string;
}

/** CSS class names for the initial (pre-animation) state of each effect */
const initialStyles: Record<NonNullable<TextEffectProps['effect']>, string> = {
  fadeUp: 'text-effect--fade-up-initial',
  fadeIn: 'text-effect--fade-in-initial',
  slideLeft: 'text-effect--slide-left-initial',
  blur: 'text-effect--blur-initial',
};

/** CSS class names for the animated (post-intersection) state */
const animatedStyles: Record<NonNullable<TextEffectProps['effect']>, string> = {
  fadeUp: 'text-effect--fade-up-animated',
  fadeIn: 'text-effect--fade-in-animated',
  slideLeft: 'text-effect--slide-left-animated',
  blur: 'text-effect--blur-animated',
};

export function TextEffect({
  children,
  effect = 'fadeUp',
  delay = 0,
  className,
}: TextEffectProps) {
  const reducedMotion = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [hasIntersected, setHasIntersected] = useState(false);

  useEffect(() => {
    // Skip observer when reduced motion — text renders immediately
    if (reducedMotion) return;

    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setHasIntersected(true);
          observer.disconnect(); // triggerOnce: true
        }
      },
      { threshold: 0.1 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [reducedMotion]);

  // Reduced motion: render immediately, no animation classes
  if (reducedMotion) {
    return (
      <div ref={ref} className={cn('text-effect', className)}>
        {children}
      </div>
    );
  }

  return (
    <>
      <style>{`
        .text-effect {
          will-change: opacity, transform, filter;
        }

        /* --- Initial states (text visible but pre-animation) --- */
        .text-effect--fade-up-initial {
          opacity: 0;
          transform: translateY(24px);
        }
        .text-effect--fade-in-initial {
          opacity: 0;
        }
        .text-effect--slide-left-initial {
          opacity: 0;
          transform: translateX(-32px);
        }
        .text-effect--blur-initial {
          opacity: 0;
          filter: blur(8px);
        }

        /* --- Animated states --- */
        .text-effect--fade-up-animated {
          opacity: 1;
          transform: translateY(0);
          transition: opacity 0.6s ease-out, transform 0.6s ease-out;
        }
        .text-effect--fade-in-animated {
          opacity: 1;
          transition: opacity 0.6s ease-out;
        }
        .text-effect--slide-left-animated {
          opacity: 1;
          transform: translateX(0);
          transition: opacity 0.6s ease-out, transform 0.6s ease-out;
        }
        .text-effect--blur-animated {
          opacity: 1;
          filter: blur(0);
          transition: opacity 0.6s ease-out, filter 0.6s ease-out;
        }
      `}</style>
      <div
        ref={ref}
        className={cn(
          'text-effect',
          hasIntersected ? animatedStyles[effect] : initialStyles[effect],
          className,
        )}
        style={delay > 0 && hasIntersected ? { transitionDelay: `${delay}ms` } : undefined}
      >
        {children}
      </div>
    </>
  );
}

export default TextEffect;
