/**
 * AnimatedInput Component - SmoothUI-style animated form inputs
 * Provides smooth focus and validation animations using CSS transitions.
 * 
 * @requirements 1.2 - CSS transitions instead of framer-motion
 * @requirements 1.5 - Preserve same visual transition behavior
 * @requirements 8.1, 8.6 - SmoothUI animations with reduced-motion support
 */

import { forwardRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface AnimatedInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const AnimatedInput = forwardRef<HTMLInputElement, AnimatedInputProps>(
  ({ label, error, helperText, className, id, ...props }, ref) => {
    const [isFocused, setIsFocused] = useState(false);
    const [hasValue, setHasValue] = useState(!!props.value || !!props.defaultValue);

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

    const isLabelActive = isFocused || hasValue;

    return (
      <div className="relative">
        {label && (
          <label
            htmlFor={inputId}
            className={cn(
              'absolute left-3 top-3 origin-left pointer-events-none',
              'text-muted-foreground transition-all duration-150 ease-out motion-reduce:transition-none',
              isLabelActive && '-translate-y-6 scale-[0.85]',
              isLabelActive && (error ? 'text-destructive' : 'text-primary'),
              error && !isLabelActive && 'text-destructive'
            )}
          >
            {label}
          </label>
        )}
        
        <div
          className={cn(
            'relative transition-transform duration-150 ease-out motion-reduce:transition-none',
            isFocused && 'scale-[1.01]'
          )}
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
          <div
            className={cn(
              'absolute bottom-0 left-1/2 h-0.5 rounded-full',
              'transition-all duration-300 ease-out motion-reduce:transition-none',
              error ? 'bg-destructive' : 'bg-primary',
              isFocused
                ? 'w-full left-0 translate-x-0'
                : 'w-0 -translate-x-1/2'
            )}
          />
        </div>

        {/* Error message with animation */}
        <div
          className={cn(
            'transition-all duration-150 ease-out overflow-hidden motion-reduce:transition-none',
            error ? 'opacity-100 max-h-10 mt-1.5' : 'opacity-0 max-h-0'
          )}
        >
          {error && (
            <p 
              id={`${inputId}-error`}
              className="text-sm text-destructive"
              role="alert"
            >
              {error}
            </p>
          )}
        </div>

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
