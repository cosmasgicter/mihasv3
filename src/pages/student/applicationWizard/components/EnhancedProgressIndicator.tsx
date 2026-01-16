/**
 * EnhancedProgressIndicator Component
 * A visually enhanced step indicator with completion status and animated transitions
 * 
 * @requirements 7.1, 7.2 - Progress indicator with completion status and animated transitions
 */

import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { CheckCircle, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { durations, easings } from '@/lib/animation-config';
import type { WizardStepConfig } from '../steps/config';

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
  totalSteps: number;
  prefersReducedMotion: boolean | null;
}

const StepItem = ({
  step,
  index,
  isActive,
  isCompleted,
  isCurrent,
  isClickable,
  onClick,
  totalSteps,
  prefersReducedMotion,
}: StepItemProps) => {
  const Icon = step.icon;

  const stepVariants = {
    initial: { scale: 0.8, opacity: 0 },
    animate: { 
      scale: 1, 
      opacity: 1,
      transition: {
        delay: prefersReducedMotion ? 0 : index * 0.1,
        duration: prefersReducedMotion ? 0 : durations.normal,
        ease: easings.easeOut,
      }
    },
    hover: isClickable ? { scale: 1.05 } : {},
    tap: isClickable ? { scale: 0.95 } : {},
  };

  const iconContainerVariants = {
    initial: { scale: 1 },
    completed: { 
      scale: [1, 1.2, 1],
      transition: {
        duration: prefersReducedMotion ? 0 : durations.normal,
        ease: easings.bounce,
      }
    },
    current: {
      boxShadow: [
        '0 0 0 0 rgba(59, 130, 246, 0.4)',
        '0 0 0 8px rgba(59, 130, 246, 0)',
      ],
      transition: {
        duration: prefersReducedMotion ? 0 : 1.5,
        repeat: Infinity,
        ease: 'easeInOut',
      }
    },
  };

  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={!isClickable}
      className={cn(
        'flex flex-col items-center relative flex-1 group outline-none',
        'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-lg',
        isClickable ? 'cursor-pointer' : 'cursor-default'
      )}
      variants={stepVariants}
      initial="initial"
      animate="animate"
      whileHover="hover"
      whileTap="tap"
      aria-label={`Step ${step.id}: ${step.progressTitle}${isCompleted ? ' (completed)' : isCurrent ? ' (current)' : ''}`}
      aria-current={isCurrent ? 'step' : undefined}
    >
      {/* Step circle with icon */}
      <motion.div
        className={cn(
          'relative rounded-full flex items-center justify-center',
          'text-sm font-semibold border-2 transition-colors duration-300 z-10',
          isCompleted
            ? 'bg-success border-success text-white shadow-md'
            : isCurrent
            ? 'bg-primary border-primary text-white shadow-lg'
            : 'bg-background border-border text-muted-foreground'
        )}
        style={{ width: 'var(--touch-target, 44px)', height: 'var(--touch-target, 44px)' }}
        variants={iconContainerVariants}
        animate={isCompleted ? 'completed' : isCurrent ? 'current' : 'initial'}
      >
        <AnimatePresence mode="wait">
          {isCompleted ? (
            <motion.div
              key="check"
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0, rotate: 180 }}
              transition={{ 
                duration: prefersReducedMotion ? 0 : durations.normal,
                ease: easings.bounce,
              }}
            >
              <CheckCircle 
                style={{ width: 'var(--icon-size, 20px)', height: 'var(--icon-size, 20px)' }} 
              />
            </motion.div>
          ) : (
            <motion.div
              key="icon"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              transition={{ 
                duration: prefersReducedMotion ? 0 : durations.fast,
              }}
            >
              <Icon 
                style={{ width: 'var(--icon-size, 20px)', height: 'var(--icon-size, 20px)' }} 
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Pulse ring for current step */}
        {isCurrent && !prefersReducedMotion && (
          <motion.div
            className="absolute inset-0 rounded-full border-2 border-primary"
            initial={{ scale: 1, opacity: 0.6 }}
            animate={{ 
              scale: [1, 1.4, 1.4],
              opacity: [0.6, 0, 0],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: 'easeOut',
            }}
          />
        )}
      </motion.div>

      {/* Step label */}
      <motion.div 
        className={cn(
          'mt-3 text-xs font-medium text-center leading-tight max-w-[100px]',
          isCurrent ? 'text-primary font-semibold' : isActive ? 'text-foreground' : 'text-muted-foreground'
        )}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ 
          delay: prefersReducedMotion ? 0 : index * 0.1 + 0.1,
          duration: prefersReducedMotion ? 0 : durations.normal,
        }}
      >
        {step.progressTitle}
      </motion.div>

      {/* Step number badge */}
      <motion.div
        className={cn(
          'mt-1 text-[10px] font-medium',
          isCurrent ? 'text-primary' : 'text-muted-foreground'
        )}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ 
          delay: prefersReducedMotion ? 0 : index * 0.1 + 0.15,
          duration: prefersReducedMotion ? 0 : durations.normal,
        }}
      >
        Step {step.id} of {totalSteps}
      </motion.div>

      {/* Click to return hint */}
      {isClickable && (
        <motion.div 
          className="absolute -bottom-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-xs text-primary whitespace-nowrap"
          initial={{ y: -5 }}
          animate={{ y: 0 }}
        >
          Click to return
        </motion.div>
      )}
    </motion.button>
  );
};


const MobileStepItem = ({
  step,
  index,
  isActive,
  isCompleted,
  isCurrent,
  isClickable,
  onClick,
  totalSteps,
  prefersReducedMotion,
}: StepItemProps) => {
  const Icon = step.icon;

  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={!isClickable}
      className={cn(
        'flex items-center gap-3 w-full p-2 rounded-lg transition-colors',
        'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
        isClickable ? 'cursor-pointer hover:bg-accent/50' : 'cursor-default',
        isCurrent && 'bg-primary/5'
      )}
      initial={{ x: -20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ 
        delay: prefersReducedMotion ? 0 : index * 0.1,
        duration: prefersReducedMotion ? 0 : durations.normal,
      }}
      aria-label={`Step ${step.id}: ${step.progressTitle}${isCompleted ? ' (completed)' : isCurrent ? ' (current)' : ''}`}
      aria-current={isCurrent ? 'step' : undefined}
    >
      {/* Step circle */}
      <motion.div
        className={cn(
          'w-10 h-10 rounded-full flex items-center justify-center',
          'text-sm font-semibold border-2 flex-shrink-0 transition-colors',
          isCompleted
            ? 'bg-success border-success text-white'
            : isCurrent
            ? 'bg-primary border-primary text-white ring-4 ring-primary/20'
            : 'bg-background border-border text-muted-foreground'
        )}
        animate={isCompleted ? { scale: [1, 1.1, 1] } : {}}
        transition={{ duration: prefersReducedMotion ? 0 : durations.fast }}
      >
        <AnimatePresence mode="wait">
          {isCompleted ? (
            <motion.div
              key="check"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
            >
              <CheckCircle className="h-5 w-5" />
            </motion.div>
          ) : (
            <motion.div
              key="icon"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
            >
              <Icon className="h-5 w-5" />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

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
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ 
            type: 'spring',
            stiffness: 300,
            damping: 20,
          }}
        >
          <CheckCircle className="h-5 w-5 text-success flex-shrink-0" />
        </motion.div>
      )}

      {/* Current step indicator */}
      {isCurrent && !isCompleted && (
        <motion.div
          className="w-2 h-2 rounded-full bg-primary flex-shrink-0"
          animate={{ 
            scale: [1, 1.2, 1],
            opacity: [1, 0.7, 1],
          }}
          transition={{
            duration: prefersReducedMotion ? 0 : 1.5,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      )}
    </motion.button>
  );
};

export const EnhancedProgressIndicator = ({
  steps,
  currentStepIndex,
  onStepClick,
  completedSteps = new Set(),
  className,
}: EnhancedProgressIndicatorProps) => {
  const prefersReducedMotion = useReducedMotion();

  const handleStepClick = (stepIndex: number) => {
    if (stepIndex < currentStepIndex && onStepClick) {
      onStepClick(stepIndex);
    }
  };

  const progressPercentage = ((currentStepIndex + 1) / steps.length) * 100;

  return (
    <div className={cn('relative', className)}>
      {/* Desktop: Horizontal with connecting line */}
      <div className="hidden md:block">
        {/* Background connecting line */}
        <div className="absolute top-[22px] left-0 w-full h-0.5 bg-border" />
        
        {/* Animated progress line */}
        <motion.div
          className="absolute top-[22px] left-0 h-0.5 bg-gradient-to-r from-primary via-success to-primary rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${progressPercentage}%` }}
          transition={{ 
            duration: prefersReducedMotion ? 0 : durations.slow,
            ease: easings.easeOut,
          }}
        />

        {/* Steps */}
        <div className="flex items-start justify-between relative">
          {steps.map((step, index) => {
            const isActive = index <= currentStepIndex;
            const isCompleted = index < currentStepIndex || completedSteps.has(index);
            const isCurrent = index === currentStepIndex;
            const isClickable = index < currentStepIndex;

            return (
              <StepItem
                key={step.id}
                step={step}
                index={index}
                isActive={isActive}
                isCompleted={isCompleted}
                isCurrent={isCurrent}
                isClickable={isClickable}
                onClick={() => handleStepClick(index)}
                totalSteps={steps.length}
                prefersReducedMotion={prefersReducedMotion}
              />
            );
          })}
        </div>
      </div>

      {/* Mobile: Vertical stepper */}
      <div className="md:hidden space-y-1">
        {steps.map((step, index) => {
          const isActive = index <= currentStepIndex;
          const isCompleted = index < currentStepIndex || completedSteps.has(index);
          const isCurrent = index === currentStepIndex;
          const isClickable = index < currentStepIndex;

          return (
            <MobileStepItem
              key={step.id}
              step={step}
              index={index}
              isActive={isActive}
              isCompleted={isCompleted}
              isCurrent={isCurrent}
              isClickable={isClickable}
              onClick={() => handleStepClick(index)}
              totalSteps={steps.length}
              prefersReducedMotion={prefersReducedMotion}
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
          <motion.div
            className="h-full bg-gradient-to-r from-primary to-success rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${progressPercentage}%` }}
            transition={{ 
              duration: prefersReducedMotion ? 0 : durations.slow,
              ease: easings.easeOut,
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default EnhancedProgressIndicator;
