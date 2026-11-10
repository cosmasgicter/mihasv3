/**
 * EnhancedProgressIndicator Component
 * A visually enhanced step indicator with completion status and CSS transitions
 * 
 * @requirements 7.1, 7.2 - Progress indicator with completion status and animated transitions
 * @requirements 1.2, 1.5 - CSS transitions replace framer-motion
 */

import React, { useCallback, useRef } from 'react';
import { AlertTriangle, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { staggerChild } from '@/lib/animations';
import type { StepKey, WizardStepConfig } from '../steps/config';
import type { WizardStepState } from '../lib/wizardProgress';
import { useOptimizedAnimation } from '@/hooks/useOptimizedAnimation';

interface EnhancedProgressIndicatorProps {
  steps: WizardStepConfig[];
  currentStepIndex: number;
  onStepClick?: (stepIndex: number) => void;
  /**
   * Each step's state from the wizard's one readiness (task 26.1). A step is
   * complete only when its items pass; a visited step with failing items is
   * incomplete. There is no "every earlier step is complete" shortcut.
   */
  stepStates: Record<StepKey, WizardStepState>;
  progressPercentage?: number;
  className?: string;
  /**
   * Drop the mobile-only step label and overall progress bar (admissions-v2 task
   * 11.2, R16.5).
   *
   * The step rail is this component's job; "step 3 of 6" and one progress
   * percentage are now `WizardProgressSummary`'s, so rendering both put two
   * progress bars and two step counters in the same phone viewport. Defaulted
   * `false` so every existing caller — including
   * `wizardProperties.property.test.ts`, which pins this component's rendered
   * output — is byte-identical.
   */
  compact?: boolean;
}

interface StepItemProps {
  step: WizardStepConfig;
  index: number;
  isActive: boolean;
  isCompleted: boolean;
  isIncomplete: boolean;
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
  isIncomplete,
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
      aria-label={`Step ${step.id}: ${step.progressTitle}${isCurrent ? ' (current)' : isCompleted ? ' (completed)' : isIncomplete ? ' (incomplete)' : ''}`}
      aria-current={isCurrent ? 'step' : undefined}
    >
      {/* Step circle with icon */}
      <div
        className={cn(
          'relative rounded-full flex items-center justify-center',
          'text-base sm:text-sm font-semibold border-2 transition-[color,background-color,border-color,box-shadow] duration-300 ease-out z-10',
          isCompleted
            ? 'bg-success/90 border-success/70 text-white shadow-sm'
            : isIncomplete && !isCurrent
            ? 'bg-background border-warning text-foreground'
            : isCurrent
            ? 'bg-primary border-primary text-white  shadow-primary/25 scale-110'
            : 'bg-background border-border/50 text-muted-foreground',
        )}
        style={{ width: isCurrent ? '48px' : 'var(--touch-target, 44px)', height: isCurrent ? '48px' : 'var(--touch-target, 44px)' }}
      >
        {isCompleted ? (
          <CheckCircle
            className="transition-transform duration-300"
            style={{ width: 'var(--icon-size, 20px)', height: 'var(--icon-size, 20px)' }}
          />
        ) : isIncomplete && !isCurrent ? (
          <AlertTriangle
            className="text-warning"
            style={{ width: 'var(--icon-size, 20px)', height: 'var(--icon-size, 20px)' }}
          />
        ) : (
          <Icon
            style={{ width: 'var(--icon-size, 20px)', height: 'var(--icon-size, 20px)' }}
          />
        )}

        {/* Subtle ring for current step */}
        {isCurrent && shouldAnimate && (
          <div
            className="absolute inset-0 rounded-full border-2 border-primary/30 transition-opacity duration-150"
          />
        )}
      </div>

      {/* Step label */}
      <div data-text-role="caption"
        className={cn(
          'mt-3 text-sm sm:text-xs font-medium text-center leading-tight max-w-[100px]',
          'transition-[color] duration-150',
          isCurrent ? 'text-primary font-semibold' : isActive ? 'text-foreground' : 'text-muted-foreground'
        )}
      >
        {step.progressTitle}
      </div>

      {/* Step number badge */}
      <div data-text-role="caption"
        className={cn(
          'mt-1 text-sm sm:text-xs font-medium transition-opacity duration-300',
          isCurrent ? 'text-primary' : 'text-muted-foreground'
        )}
      >
        {isIncomplete && !isCurrent ? (
          <span className="inline-flex items-center gap-1 text-foreground">
            <AlertTriangle className="h-3.5 w-3.5 text-warning" aria-hidden="true" />
            Incomplete
          </span>
        ) : (
          <>Step {step.id} of {totalSteps}</>
        )}
      </div>

      {/* Click to return hint */}
      {isClickable && (
        <div data-text-role="caption" className="absolute -bottom-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-sm sm:text-xs text-primary whitespace-nowrap">
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
  isIncomplete,
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
        'min-h-touch',
        isClickable ? 'cursor-pointer hover:bg-accent/50' : 'cursor-default',
        isCurrent && 'bg-primary/5'
      )}
      aria-label={`Step ${step.id}: ${step.progressTitle}${isCurrent ? ' (current)' : isCompleted ? ' (completed)' : isIncomplete ? ' (incomplete)' : ''}`}
      aria-current={isCurrent ? 'step' : undefined}
    >
      {/* Step circle — 44px touch target */}
      <div
        className={cn(
          'w-11 h-11 rounded-full flex items-center justify-center',
          'text-base sm:text-sm font-semibold border-2 flex-shrink-0 transition-[color,background-color,border-color] duration-200',
          isCompleted
            ? 'bg-success border-success text-white'
            : isIncomplete && !isCurrent
            ? 'bg-background border-warning text-foreground'
            : isCurrent
            ? 'bg-primary border-primary text-white ring-4 ring-primary/20'
            : 'bg-background border-border text-muted-foreground'
        )}
      >
        {isCompleted ? <CheckCircle className="h-5 w-5" /> : isIncomplete && !isCurrent ? <AlertTriangle className="h-5 w-5 text-warning" /> : <Icon className="h-5 w-5" />}
      </div>

      {/* Step info */}
      <div className="flex-1 min-w-0 text-left">
        <div className={cn(
          'text-base sm:text-sm font-semibold truncate',
          isCurrent ? 'text-primary' : isActive ? 'text-foreground' : 'text-muted-foreground'
        )}>
          {step.progressTitle}
        </div>
        <div data-text-role="caption" className="text-sm sm:text-xs text-caption mt-0.5">
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
          className="w-2 h-2 rounded-full bg-primary flex-shrink-0"
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
  stepStates,
  progressPercentage,
  className,
  compact = false,
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

  const incompleteTitles = steps
    .filter((step, index) => index !== currentStepIndex && stepStates[step.key] === 'incomplete')
    .map(step => step.progressTitle);
  const displayProgressPercentage = progressPercentage ?? ((currentStepIndex + 1) / steps.length) * 100;

  return (
    <div className={cn('relative', className)}>
      {/* Desktop: Horizontal with connecting line */}
      <div className="hidden md:block">
        {/* Background connecting line */}
        <div className="absolute top-[22px] left-0 w-full h-0.5 bg-border/40" />
        
        {/* Animated progress line */}
        <div
          className="absolute top-[22px] left-0 h-0.5 bg-primary rounded-full transition-[width] duration-300 ease-out"
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
            const isCurrent = index === currentStepIndex;
            const isCompleted = !isCurrent && stepStates[step.key] === 'complete';
            const isIncomplete = stepStates[step.key] === 'incomplete';
            const isClickable = index < currentStepIndex;

            return (
              <StepItem
                key={step.id}
                ref={(el: HTMLButtonElement | null) => { desktopStepRefs.current[index] = el; }}
                step={step}
                index={index}
                isActive={isActive}
                isCompleted={isCompleted}
                isIncomplete={isIncomplete}
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

      {/*
        Mobile: six step controls, each 44 x 44 at 320 px (GATE-13.3-02, 13.6 §8.1
        item L6; R16.1 and R16.2 together).

        Task 13.3 measured this row at **18-20 x 40/48** at 320 x 568 — the width
        R16.1 says the student experience *"SHALL be designed at … first"*. Two
        defects compounded:

        * the buttons were declared `w-10 h-10` (40 px, already under R16.2's 44),
          and the current one `w-12 h-12`; and
        * nothing was `shrink-0`, so six of them plus five 24 px connectors plus ten
          12 px gaps — 504 px of intrinsic width — were squeezed into ~288 px of
          usable room and flex compressed them to 18-20 px **wide**.

        The desktop variant of this same component sizes its circle from
        `var(--touch-target, 44px)` and has always been right; only this branch
        hardcoded a number.

        The arithmetic the fix is built on: 6 x 44 = 264 px, and 320 px minus the
        wizard card's own horizontal padding leaves ~272-288 px. So the buttons are
        `min-h-touch min-w-touch shrink-0`, the row starts at `gap-1` and only
        relaxes to `gap-3` at >= 375 px (`xs:`), and the connector segments are
        `hidden xs:block` with `w-4 xs:w-6` — the two things that must give way are
        decoration, and progress is still stated three other ways on this same
        screen (each button's own `aria-label … (completed)`, the current-step
        label below, and the overall progress bar). `flex-wrap` is the backstop: if
        a future step count or a 200% text zoom still cannot fit, the row wraps
        rather than compressing a control below 44 px again.

        The current step keeps its emphasis without keeping its 48 px: a ring and
        the fill distinguish it, so all six controls are one size and the row's
        intrinsic width is predictable.
      */}
      <div className="md:hidden">
        <div
          className="flex flex-wrap items-center justify-center gap-1 py-2 xs:gap-3"
          role="group"
          aria-label="Application steps"
          data-orientation="horizontal"
        >
          {steps.map((step, index) => {
            const isCurrent = index === currentStepIndex;
            const isCompleted = !isCurrent && stepStates[step.key] === 'complete';
            const isIncomplete = stepStates[step.key] === 'incomplete';
            const isClickable = index < currentStepIndex;
            const Icon = step.icon;

            return (
              <React.Fragment key={step.id}>
                {index > 0 && (
                  <div
                    aria-hidden="true"
                    className={cn(
                      'hidden h-0.5 w-4 shrink-0 rounded-full transition-[background-color] duration-200 xs:block xs:w-6',
                      index <= currentStepIndex ? 'bg-primary' : 'bg-border/40'
                    )}
                  />
                )}
                <button
                  type="button"
                  ref={(el: HTMLButtonElement | null) => { mobileStepRefs.current[index] = el; }}
                  onClick={() => handleStepClick(index)}
                  onKeyDown={(e: React.KeyboardEvent) => handleArrowKeyNavigation(e, index, mobileStepRefs)}
                  disabled={!isClickable}
                  className={cn(
                    'relative flex min-h-touch min-w-touch shrink-0 items-center justify-center rounded-full transition-[color,background-color,border-color,box-shadow,transform] duration-200',
                    'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                    isClickable ? 'cursor-pointer' : 'cursor-default',
                    isCurrent
                      ? 'bg-primary text-white ring-2 ring-primary/40 ring-offset-2 ring-offset-card shadow-primary/25'
                      : isCompleted
                      ? 'bg-success/90 text-white'
                      : isIncomplete
                      ? 'bg-background border-2 border-warning text-foreground'
                      : 'bg-muted border border-border/50 text-muted-foreground'
                  )}
                  aria-label={`Step ${step.id}: ${step.progressTitle}${isCurrent ? ' (current)' : isCompleted ? ' (completed)' : isIncomplete ? ' (incomplete)' : ''}`}
                  aria-current={isCurrent ? 'step' : undefined}
                >
                  {isCompleted ? (
                    <CheckCircle className="h-5 w-5" />
                  ) : isIncomplete ? (
                    <AlertTriangle className="h-5 w-5 text-warning" />
                  ) : (
                    <Icon className={cn(isCurrent ? 'h-5 w-5' : 'h-4 w-4')} />
                  )}
                </button>
              </React.Fragment>
            );
          })}
        </div>
        {incompleteTitles.length > 0 && (
          <p data-text-role="caption" className="mt-1 flex items-center justify-center gap-1.5 text-sm sm:text-xs text-foreground">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" />
            <span>Incomplete: {incompleteTitles.join(', ')}</span>
          </p>
        )}
        {/* Current step label */}
        {!compact && (
          <p className="text-center text-base sm:text-sm font-semibold text-primary mt-2">
            {steps[currentStepIndex]?.progressTitle}
            <span className="text-muted-foreground font-normal ml-1.5">
              — Step {currentStepIndex + 1} of {steps.length}
            </span>
          </p>
        )}
      </div>

      {/* Overall progress bar (mobile only) */}
      {!compact && (
        <div className="md:hidden mt-4">
          <div data-text-role="caption" className="flex items-center justify-between text-sm sm:text-xs text-muted-foreground mb-1">
            <span>Overall progress</span>
            <span className="font-medium text-primary">{Math.round(displayProgressPercentage)}%</span>
          </div>
          <div className="h-2 bg-border rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-[width] duration-300 ease-out"
              style={{ width: `${displayProgressPercentage}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default EnhancedProgressIndicator;
