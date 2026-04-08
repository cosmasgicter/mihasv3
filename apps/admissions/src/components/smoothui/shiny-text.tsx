/**
 * ShinyText Component - CSS gradient shimmer animation
 * Renders text with a shimmering gradient highlight effect using
 * background-clip: text and CSS @keyframes. No framer-motion.
 *
 * @requirements 3.1 - Animated logo text with shiny gradient shimmer effect
 * @requirements 3.2 - Animation plays once on viewport entry, then stays static
 * @requirements 3.3 - prefers-reduced-motion renders plain styled text
 * @requirements 3.4 - Uses existing Tailwind CSS design tokens
 */

import { useRef, useState, useEffect, type ElementType } from 'react';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/lib/animation-config';

interface ShinyTextProps {
  /** Text content to render */
  text: string;
  /** HTML tag to render (default: 'span') */
  as?: 'span' | 'p' | 'h1' | 'h2' | 'h3';
  /** Additional className */
  className?: string;
  /** Whether to animate on viewport entry (default: true) */
  animateOnEntry?: boolean;
}

export function ShinyText({
  text,
  as: Tag = 'span',
  className,
  animateOnEntry = true,
}: ShinyTextProps) {
  const reducedMotion = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const [hasAnimated, setHasAnimated] = useState(!animateOnEntry);

  useEffect(() => {
    if (reducedMotion || !animateOnEntry || hasAnimated) return;

    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setHasAnimated(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [reducedMotion, animateOnEntry, hasAnimated]);

  const Component = Tag as ElementType;

  // Reduced motion: plain styled text, no animation
  if (reducedMotion) {
    return (
      <Component
        ref={ref}
        className={cn('shiny-text-static', className)}
      >
        {text}
      </Component>
    );
  }

  return (
    <>
      <style>{`
        @keyframes shiny-text-shimmer {
          0% { background-position: 200% center; }
          100% { background-position: -200% center; }
        }
      `}</style>
      <Component
        ref={ref}
        className={cn(
          'shiny-text-base',
          hasAnimated && 'shiny-text-animate',
          className,
        )}
        style={{
          backgroundImage:
            'linear-gradient(90deg, currentColor 40%, rgba(255,255,255,0.8) 50%, currentColor 60%)',
          backgroundSize: '200% auto',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          WebkitTextFillColor: hasAnimated ? 'transparent' : 'currentColor',
          color: hasAnimated ? 'transparent' : 'currentColor',
          ...(hasAnimated
            ? { animation: 'shiny-text-shimmer 2s ease-in-out forwards' }
            : {}),
        }}
        onAnimationEnd={() => {
          // After shimmer completes, revert to solid text
          const el = ref.current;
          if (el) {
            el.style.animation = 'none';
            el.style.backgroundImage = 'none';
            el.style.webkitTextFillColor = 'currentColor';
            el.style.color = 'currentColor';
          }
        }}
      >
        {text}
      </Component>
    </>
  );
}

export default ShinyText;
