/**
 * EnhancedProgressIndicator Component
 * A visually enhanced step indicator with completion status and CSS transitions
 * 
 * @requirements 7.1, 7.2 - Progress indicator with completion status and animated transitions
 * @requirements 1.2, 1.5 - CSS transitions replace framer-motion
 */

import React, { useCallback, useRef } from 'react';
import { CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { staggerChild } from '@/lib/animations';
import type { WizardStepConfig } from '../steps/config';
import { useOptimizedAnimation } from '@/hooks/useOptimizedAnimation';

interface EnhancedProgressIndicatorProps {
  steps: WizardStepConfig[];
  currentStepIndex: number;
  onStepClick?: (stepIndex: number) => void;
  completedSteps?: Set<number>;
  progressPercentage?: number;
  className?: string;
}

interface StepItemProps {
  step: WizardStepConfig;
  index: number;
  isActive: boolean;
  isCompleted: boolean;
  isCurrent: boolean;
  isClickable: boolean;
  onClick?: () => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  totalSteps: number;
  shouldAnimate: boolean;
}

const StepItem = React.forwardRef<HTMLButtonElement, StepItemProps>(({
  step,
  index,
  isActive,
  isCompleted,
  isCurrent,
  isClickable,
  onClick,
  onKeyDown,
  totalSteps,
  shouldAnimate
}, ref) => {
  const Icon = step.icon;

  return (
    <button
      type="button"
      ref={ref}
      onClick={onClick}
      onKeyDown={onKeyDown}
      disabled={!isClickable}
      className={cn(
        'flex flex-col items-center relative flex-1 group outline-none',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg',
        'min-w-0',
        isClickable ? 'cursor-pointer' : 'cursor-default',
        shouldAnimate && 'transition-transform duration-200  '
      )}
      style={shouldAnimate ? staggerChild(index, 100) : undefined}
      aria-label={`Step ${step.id}: ${step.progressTitle}${isCompleted ? ' (completed)' : isCurrent ? ' (current)' : ''}`}
      aria-current={isCurrent ? 'step' : undefined}
    >
      {/* Step circle with icon */}
      <div
        className={cn(
          'relative rounded-full flex items-center justify-center',
          'text-sm font-semibold border-2 transition-all duration-500 ease-out z-10',
          isCompleted
            ? 'bg-success/90 border-success/70 text-white shadow-sm'
            : isCurrent
            ? 'bg-primary border-primary text-white  shadow-primary/25 scale-110'
            : 'bg-background border-border/50 text-muted-foreground/60',
        )}
        style={{ width: isCurrent ? '48px' : 'var(--touch-target, 44px)', height: isCurrent ? '48px' : 'var(--touch-target, 44px)' }}
      >
        {isCompleted ? (
          <CheckCircle
            className="transition-transform duration-300"
            style={{ width: 'var(--icon-size, 20px)', height: 'var(--icon-size, 20px)' }}
          />
        ) : (
          <Icon
            style={{ width: 'var(--icon-size, 20px)', height: 'var(--icon-size, 20px)' }}
          />
        )}

        {/* Pulse ring for current step */}
        {isCurrent && shouldAnimate && (
          <div
            className="absolute inset-0 rounded-full border-2 border-primary animate-ping opacity-30"
          />
        )}
      </div>

      {/* Step label */}
      <div
        className={cn(
          'mt-3 text-xs font-medium text-center leading-tight max-w-[100px]',
          'transition-all duration-300',
          isCurrent ? 'text-primary font-semibold' : isActive ? 'text-foreground' : 'text-muted-foreground'
        )}
      >
        {step.progressTitle}
      </div>

      {/* Step number badge */}
      <div
        className={cn(
          'mt-1 text-[10px] font-medium transition-opacity duration-300',
          isCurrent ? 'text-primary' : 'text-muted-foreground'
        )}
      >
        Step {step.id} of {totalSteps}
      </div>

      {/* Click to return hint */}
      {isClickable && (
        <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-xs text-primary whitespace-nowrap">
          Click to return
        </div>
      )}
    </button>
  );
});
StepItem.displayName = 'StepItem';


const MobileStepItem = React.forwardRef<HTMLButtonElement, StepItemProps>(({
  step,
  index: _index,
  isActive,
  isCompleted,
  isCurrent,
  isClickable,
  onClick,
  onKeyDown,
  totalSteps,
  shouldAnimate: _shouldAnimate
}, ref) => {
  const Icon = step.icon;

  return (
    <button
      type="button"
      ref={ref}
      onClick={onClick}
      onKeyDown={onKeyDown}
      disabled={!isClickable}
      className={cn(
        'flex items-center gap-3 w-full p-2 rounded-lg transition-colors',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'min-h-[44px]',
        isClickable ? 'cursor-pointer hover:bg-accent/50' : 'cursor-default',
        isCurrent && 'bg-primary/5'
      )}
      aria-label={`Step ${step.id}: ${step.progressTitle}${isCompleted ? ' (completed)' : isCurrent ? ' (current)' : ''}`}
      aria-current={isCurrent ? 'step' : undefined}
    >
      {/* Step circle — 44px touch target */}
      <div
        className={cn(
          'w-11 h-11 rounded-full flex items-center justify-center',
          'text-sm font-semibold border-2 flex-shrink-0 transition-all duration-300',
          isCompleted
            ? 'bg-success border-success text-white'
            : isCurrent
            ? 'bg-primary border-primary text-white ring-4 ring-primary/20'
            : 'bg-background border-border text-muted-foreground'
        )}
      >
        {isCompleted ? <CheckCircle className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
      </div>

      {/* Step info */}
      <div className="flex-1 min-w-0 text-left">
        <div className={cn(
          'text-sm font-semibold truncate',
          isCurrent ? 'text-primary' : isActive ? 'text-foreground' : 'text-muted-foreground'
        )}>
          {step.progressTitle}
        </div>
        <div className="text-xs text-caption mt-0.5">
          Step {step.id} of {totalSteps}
        </div>
      </div>

      {/* Completion indicator */}
      {isCompleted && (
        <CheckCircle className="h-5 w-5 text-success flex-shrink-0" />
      )}

      {/* Current step indicator */}
      {isCurrent && !isCompleted && (
        <div
          className="w-2 h-2 rounded-full bg-primary flex-shrink-0 animate-pulse"
        />
      )}
    </button>
  );
});
MobileStepItem.displayName = 'MobileStepItem';

export const EnhancedProgressIndicator = ({
  steps,
  currentStepIndex,
  onStepClick,
  completedSteps = new Set(),
  progressPercentage,
  className,
}: EnhancedProgressIndicatorProps) => {
  const { shouldAnimate } = useOptimizedAnimation();
  const desktopStepRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const mobileStepRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleStepClick = (stepIndex: number) => {
    if (stepIndex < currentStepIndex && onStepClick) {
      onStepClick(stepIndex);
    }
  };

  const handleArrowKeyNavigation = useCallback(
    (e: React.KeyboardEvent, index: number, refs: React.MutableRefObject<(HTMLButtonElement | null)[]>) => {
      const isHorizontal = e.currentTarget.closest('[data-orientation="horizontal"]') !== null;
      const prevKey = isHorizontal ? 'ArrowLeft' : 'ArrowUp';
      const nextKey = isHorizontal ? 'ArrowRight' : 'ArrowDown';

      let targetIndex: number | null = null;

      if (e.key === nextKey) {
        e.preventDefault();
        targetIndex = index < steps.length - 1 ? index + 1 : 0;
      } else if (e.key === prevKey) {
        e.preventDefault();
        targetIndex = index > 0 ? index - 1 : steps.length - 1;
      } else if (e.key === 'Home') {
        e.preventDefault();
        targetIndex = 0;
      } else if (e.key === 'End') {
        e.preventDefault();
        targetIndex = steps.length - 1;
      }

      if (targetIndex !== null) {
        refs.current[targetIndex]?.focus();
      }
    },
    [steps.length]
  );

  const displayProgressPercentage = progressPercentage ?? ((currentStepIndex + 1) / steps.length) * 100;

  return (
    <div className={cn('relative', className)}>
      {/* Desktop: Horizontal with connecting line */}
      <div className="hidden md:block">
        {/* Background connecting line */}
        <div className="absolute top-[22px] left-0 w-full h-0.5 bg-border/40" />
        
        {/* Animated progress line */}
        <div
          className="absolute top-[22px] left-0 h-0.5 bg-primary rounded-full transition-all duration-700 ease-out "
          style={{ width: `${displayProgressPercentage}%` }}
        />

        {/* Steps */}
        <div
          className="flex items-start justify-between relative"
          role="group"
          aria-label="Application steps"
          data-orientation="horizontal"
        >
          {steps.map((step, index) => {
            const isActive = index <= currentStepIndex;
            const isCompleted = index < currentStepIndex || completedSteps.has(index);
            const isCurrent = index === currentStepIndex;
            const isClickable = index < currentStepIndex;

            return (
              <StepItem
                key={step.id}
                ref={(el: HTMLButtonElement | null) => { desktopStepRefs.current[index] = el; }}
                step={step}
                index={index}
                isActive={isActive}
                isCompleted={isCompleted}
                isCurrent={isCurrent}
                isClickable={isClickable}
                onClick={() => handleStepClick(index)}
                onKeyDown={(e: React.KeyboardEvent) => handleArrowKeyNavigation(e, index, desktopStepRefs)}
                totalSteps={steps.length}
                shouldAnimate={shouldAnimate}
              />
            );
          })}
        </div>
      </div>

      {/* Mobile: Compact horizontal dots */}
      <div className="md:hidden">
        <div
          className="flex items-center justify-center gap-3 py-2"
          role="group"
          aria-label="Application steps"
          data-orientation="horizontal"
        >
          {steps.map((step, index) => {
            const isCompleted = index < currentStepIndex || completedSteps.has(index);
            const isCurrent = index === currentStepIndex;
            const isClickable = index < currentStepIndex;
            const Icon = step.icon;

            return (
              <React.Fragment key={step.id}>
                {index > 0 && (
                  <div className={cn(
                    'h-0.5 w-6 rounded-full transition-all duration-500',
                    index <= currentStepIndex ? 'bg-primary' : 'bg-border/40'
                  )} />
                )}
                <button
                  type="button"
                  ref={(el: HTMLButtonElement | null) => { mobileStepRefs.current[index] = el; }}
                  onClick={() => handleStepClick(index)}
                  onKeyDown={(e: React.KeyboardEvent) => handleArrowKeyNavigation(e, index, mobileStepRefs)}
                  disabled={!isClickable}
                  className={cn(
                    'relative flex items-center justify-center rounded-full transition-all duration-300',
                    'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                    isClickable ? 'cursor-pointer' : 'cursor-default',
                    isCurrent
                      ? 'w-12 h-12 bg-primary text-white  shadow-primary/25'
                      : isCompleted
                      ? 'w-10 h-10 bg-success/90 text-white'
                      : 'w-10 h-10 bg-muted border border-border/50 text-muted-foreground/60'
                  )}
                  aria-label={`Step ${step.id}: ${step.progressTitle}${isCompleted ? ' (completed)' : isCurrent ? ' (current)' : ''}`}
                  aria-current={isCurrent ? 'step' : undefined}
                >
                  {isCompleted ? (
                    <CheckCircle className="h-5 w-5" />
                  ) : (
                    <Icon className={cn(isCurrent ? 'h-5 w-5' : 'h-4 w-4')} />
                  )}
                </button>
              </React.Fragment>
            );
          })}
        </div>
        {/* Current step label */}
        <p className="text-center text-sm font-semibold text-primary mt-2">
          {steps[currentStepIndex]?.progressTitle}
          <span className="text-muted-foreground font-normal ml-1.5">
            — Step {currentStepIndex + 1} of {steps.length}
          </span>
        </p>
      </div>

      {/* Overall progress bar (mobile only) */}
      <div className="md:hidden mt-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
          <span>Overall Progress</span>
          <span className="font-medium text-primary">{Math.round(displayProgressPercentage)}%</span>
        </div>
        <div className="h-2 bg-border rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
            style={{ width: `${displayProgressPercentage}%` }}
          />
        </div>
      </div>
    </div>
  );
};

export default EnhancedProgressIndicator;
