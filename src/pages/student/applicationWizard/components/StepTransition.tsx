/**
 * StepTransition Component
 * Provides smooth CSS-based transitions between wizard steps
 * 
 * @requirements 7.2 - Animated transitions between steps
 * @requirements 1.2, 1.5 - CSS transitions replace framer-motion
 */

import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { animateClasses, staggerChild } from '@/lib/animations';

type TransitionDirection = 'forward' | 'backward';

interface StepTransitionProps {
  children: ReactNode;
  stepKey: string | number;
  direction?: TransitionDirection;
  className?: string;
}

interface StepContainerProps {
  children: ReactNode;
  className?: string;
  title?: string;
  description?: string;
}

export const StepTransition = ({
  children,
  stepKey,
  direction = 'forward',
  className,
}: StepTransitionProps) => {
  return (
    <div
      key={stepKey}
      className={cn(animateClasses.fadeIn, className)}
    >
      {children}
    </div>
  );
};

export const StepContainer = ({
  children,
  className,
  title,
  description,
}: StepContainerProps) => {
  return (
    <div
      className={cn(
        'bg-card rounded-lg shadow-lg p-6 border border-border',
        animateClasses.fadeIn,
        className
      )}
    >
      {(title || description) && (
        <div className="mb-6">
          {title && (
            <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          )}
          {description && (
            <p className="text-sm text-muted-foreground mt-1">{description}</p>
          )}
        </div>
      )}
      {children}
    </div>
  );
};

// Animated form field wrapper for staggered field animations
export const AnimatedField = ({
  children,
  className,
  index,
}: {
  children: ReactNode;
  className?: string;
  index?: number;
}) => {
  return (
    <div
      className={cn(animateClasses.fadeIn, className)}
      style={index !== undefined ? staggerChild(index) : undefined}
    >
      {children}
    </div>
  );
};

// Animated form section for grouping related fields
export const AnimatedSection = ({
  children,
  title,
  className,
}: {
  children: ReactNode;
  title?: string;
  className?: string;
}) => {
  return (
    <div className={cn('space-y-4', animateClasses.fadeIn, className)}>
      {title && (
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          {title}
        </h3>
      )}
      {children}
    </div>
  );
};

export default StepTransition;
