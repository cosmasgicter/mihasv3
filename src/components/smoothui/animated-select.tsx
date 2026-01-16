/**
 * AnimatedSelect Component - SmoothUI-style animated select inputs
 * Provides smooth focus and validation animations for select elements
 * 
 * @requirements 7.3, 7.4 - SmoothUI form components with validation feedback
 */

import { forwardRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { durations } from '@/lib/animation-config';

interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface AnimatedSelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  label?: string;
  error?: string;
  helperText?: string;
  options: SelectOption[];
  placeholder?: string;
}

export const AnimatedSelect = forwardRef<HTMLSelectElement, AnimatedSelectProps>(
  ({ label, error, helperText, options, placeholder, className, id, ...props }, ref) => {
    const [isFocused, setIsFocused] = useState(false);
    const [hasValue, setHasValue] = useState(!!props.value || !!props.defaultValue);
    const prefersReducedMotion = useReducedMotion();

    const selectId = id || `select-${Math.random().toString(36).substr(2, 9)}`;

    const handleFocus = (e: React.FocusEvent<HTMLSelectElement>) => {
      setIsFocused(true);
      props.onFocus?.(e);
    };

    const handleBlur = (e: React.FocusEvent<HTMLSelectElement>) => {
      setIsFocused(false);
      setHasValue(!!e.target.value);
      props.onBlur?.(e);
    };

    const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
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
            htmlFor={selectId}
            className={cn(
              'absolute left-3 top-3 origin-left pointer-events-none z-10',
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
          <select
            ref={ref}
            id={selectId}
            className={cn(
              'flex h-12 w-full rounded-lg border bg-background px-3 py-2 pr-10',
              'text-base ring-offset-background transition-all duration-200',
              'appearance-none cursor-pointer',
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
            aria-describedby={error ? `${selectId}-error` : helperText ? `${selectId}-helper` : undefined}
            {...props}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((option) => (
              <option 
                key={option.value} 
                value={option.value}
                disabled={option.disabled}
              >
                {option.label}
              </option>
            ))}
          </select>
          
          {/* Custom dropdown arrow */}
          <motion.div
            className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
            animate={{ rotate: isFocused ? 180 : 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : durations.fast }}
          >
            <ChevronDown className={cn(
              'h-4 w-4 transition-colors',
              isFocused ? 'text-primary' : 'text-muted-foreground'
            )} />
          </motion.div>
          
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
              id={`${selectId}-error`}
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
            id={`${selectId}-helper`}
            className="mt-1.5 text-sm text-muted-foreground"
          >
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

AnimatedSelect.displayName = 'AnimatedSelect';

export default AnimatedSelect;
