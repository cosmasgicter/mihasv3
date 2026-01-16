/**
 * AnimatedInput Component - SmoothUI-style animated form inputs
 * Provides smooth focus and validation animations
 * 
 * @requirements 8.1, 8.6 - SmoothUI animations with reduced-motion support
 */

import { forwardRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { durations } from '@/lib/animation-config';

interface AnimatedInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const AnimatedInput = forwardRef<HTMLInputElement, AnimatedInputProps>(
  ({ label, error, helperText, className, id, ...props }, ref) => {
    const [isFocused, setIsFocused] = useState(false);
    const [hasValue, setHasValue] = useState(!!props.value || !!props.defaultValue);
    const prefersReducedMotion = useReducedMotion();

    const inputId = id || `input-${Math.random().toString(36).substr(2, 9)}`;

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(true);
      props.onFocus?.(e);
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(false);
      setHasValue(!!e.target.value);
      props.onBlur?.(e);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setHasValue(!!e.target.value);
      props.onChange?.(e);
    };

    const labelVariants = {
      default: { 
        y: 0, 
        scale: 1,
        color: 'var(--muted-foreground)',
      },
      active: { 
        y: -24, 
        scale: 0.85,
        color: error ? 'var(--destructive)' : 'var(--primary)',
      },
    };

    const isLabelActive = isFocused || hasValue;

    return (
      <div className="relative">
        {label && (
          <motion.label
            htmlFor={inputId}
            className={cn(
              'absolute left-3 top-3 origin-left pointer-events-none',
              'text-muted-foreground transition-colors',
              error && 'text-destructive'
            )}
            initial="default"
            animate={isLabelActive ? 'active' : 'default'}
            variants={labelVariants}
            transition={{ 
              duration: prefersReducedMotion ? 0 : durations.fast,
              ease: 'easeOut',
            }}
          >
            {label}
          </motion.label>
        )}
        
        <motion.div
          className="relative"
          animate={{
            scale: isFocused && !prefersReducedMotion ? 1.01 : 1,
          }}
          transition={{ duration: durations.fast }}
        >
          <input
            ref={ref}
            id={inputId}
            className={cn(
              'flex h-12 w-full rounded-lg border bg-background px-3 py-2',
              'text-base ring-offset-background transition-all duration-200',
              'file:border-0 file:bg-transparent file:text-sm file:font-medium',
              'placeholder:text-muted-foreground',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              'disabled:cursor-not-allowed disabled:opacity-50',
              error 
                ? 'border-destructive focus-visible:ring-destructive' 
                : 'border-input',
              label && 'pt-5',
              className
            )}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onChange={handleChange}
            aria-invalid={!!error}
            aria-describedby={error ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined}
            {...props}
          />
          
          {/* Focus indicator line */}
          <motion.div
            className={cn(
              'absolute bottom-0 left-0 h-0.5 bg-primary rounded-full',
              error && 'bg-destructive'
            )}
            initial={{ width: 0, left: '50%', x: '-50%' }}
            animate={{
              width: isFocused ? '100%' : 0,
              left: isFocused ? 0 : '50%',
              x: isFocused ? 0 : '-50%',
            }}
            transition={{ 
              duration: prefersReducedMotion ? 0 : durations.normal,
              ease: 'easeOut',
            }}
          />
        </motion.div>

        {/* Error message with animation */}
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ 
            opacity: error ? 1 : 0, 
            height: error ? 'auto' : 0,
          }}
          transition={{ 
            duration: prefersReducedMotion ? 0 : durations.fast,
          }}
        >
          {error && (
            <p 
              id={`${inputId}-error`}
              className="mt-1.5 text-sm text-destructive"
              role="alert"
            >
              {error}
            </p>
          )}
        </motion.div>

        {/* Helper text */}
        {helperText && !error && (
          <p 
            id={`${inputId}-helper`}
            className="mt-1.5 text-sm text-muted-foreground"
          >
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

AnimatedInput.displayName = 'AnimatedInput';

export default AnimatedInput;
