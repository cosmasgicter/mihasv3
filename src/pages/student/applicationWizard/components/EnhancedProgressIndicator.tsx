/**
 * EnhancedProgressIndicator Component
 * A visually enhanced step indicator with completion status and CSS transitions
 * 
 * @requirements 7.1, 7.2 - Progress indicator with completion status and animated transitions
 * @requirements 1.2, 1.5 - CSS transitions replace framer-motion
 */

import React, { useCallback, useRef } from 'react';
import { CheckCircle, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { staggerChild } from '@/lib/animations';
import type { WizardStepConfig } from '../steps/config';
import { useOptimizedAnimation } from '@/hooks/useOptimizedAnimation';

interface EnhancedProgressIndicatorProps {
  steps: WizardStepConfig[];
  currentStepIndex: number;
  onStepClick?: (stepIndex: number) => void;
  completedSteps?: Set<number>;
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
        'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-lg',
        isClickable ? 'cursor-pointer' : 'cursor-default',
        shouldAnimate && 'transition-transform duration-200 hover:scale-105 active:scale-95'
      )}
      style={shouldAnimate ? staggerChild(index, 100) : undefined}
      aria-label={`Step ${step.id}: ${step.progressTitle}${isCompleted ? ' (completed)' : isCurrent ? ' (current)' : ''}`}
      aria-current={isCurrent ? 'step' : undefined}
    >
      {/* Step circle with icon */}
      <div
        className={cn(
          'relative rounded-full flex items-center justify-center',
          'text-sm font-semibold border-2 transition-all duration-300 z-10',
          isCompleted
            ? 'bg-success border-success text-white shadow-md'
            : isCurrent
            ? 'bg-primary border-primary text-white shadow-lg'
            : 'bg-background border-border text-muted-foreground',
          isCurrent && shouldAnimate && 'animate-pulse-ring'
        )}
        style={{ width: 'var(--touch-target, 44px)', height: 'var(--touch-target, 44px)' }}
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
        'flex items-center gap-3 w-full p-2 rounded-lg transition-colors',
        'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
        isClickable ? 'cursor-pointer hover:bg-accent/50' : 'cursor-default',
        isCurrent && 'bg-primary/5'
      )}
      aria-label={`Step ${step.id}: ${step.progressTitle}${isCompleted ? ' (completed)' : isCurrent ? ' (current)' : ''}`}
      aria-current={isCurrent ? 'step' : undefined}
    >
      {/* Step circle */}
      <div
        className={cn(
          'w-10 h-10 rounded-full flex items-center justify-center',
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

  const progressPercentage = ((currentStepIndex + 1) / steps.length) * 100;

  return (
    <div className={cn('relative', className)}>
      {/* Desktop: Horizontal with connecting line */}
      <div className="hidden md:block">
        {/* Background connecting line */}
        <div className="absolute top-[22px] left-0 w-full h-0.5 bg-border" />
        
        {/* Animated progress line */}
        <div
          className="absolute top-[22px] left-0 h-0.5 bg-gradient-to-r from-primary via-success to-primary rounded-full transition-all duration-500 ease-out"
          style={{ width: `${progressPercentage}%` }}
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

      {/* Mobile: Vertical stepper */}
      <div
        className="md:hidden space-y-1"
        role="group"
        aria-label="Application steps"
        data-orientation="vertical"
      >
        {steps.map((step, index) => {
          const isActive = index <= currentStepIndex;
          const isCompleted = index < currentStepIndex || completedSteps.has(index);
          const isCurrent = index === currentStepIndex;
          const isClickable = index < currentStepIndex;

          return (
            <MobileStepItem
              key={step.id}
              ref={(el: HTMLButtonElement | null) => { mobileStepRefs.current[index] = el; }}
              step={step}
              index={index}
              isActive={isActive}
              isCompleted={isCompleted}
              isCurrent={isCurrent}
              isClickable={isClickable}
              onClick={() => handleStepClick(index)}
              onKeyDown={(e: React.KeyboardEvent) => handleArrowKeyNavigation(e, index, mobileStepRefs)}
              totalSteps={steps.length}
              shouldAnimate={shouldAnimate}
            />
          );
        })}
      </div>

      {/* Overall progress bar (mobile only) */}
      <div className="md:hidden mt-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
          <span>Overall Progress</span>
          <span className="font-medium text-primary">{Math.round(progressPercentage)}%</span>
        </div>
        <div className="h-2 bg-border rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary to-success rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
      </div>
    </div>
  );
};

export default EnhancedProgressIndicator;
