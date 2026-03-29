/**
 * AnimatedInput Component - SmoothUI-style animated form inputs
 * Provides smooth focus and validation animations using CSS transitions.
 * Labels are positioned above inputs with 8px gap per design system requirements.
 * 
 * @requirements 1.2 - CSS transitions instead of framer-motion
 * @requirements 1.5 - Preserve same visual transition behavior
 * @requirements 8.1, 8.6 - SmoothUI animations with reduced-motion support
 * @requirements 9.3 - Labels above inputs with 8px gap
 * @requirements 9.4 - Error messages below with 4px top margin
 */

import { forwardRef, useState, useId } from 'react';
import { cn } from '@/lib/utils';

interface AnimatedInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const AnimatedInput = forwardRef<HTMLInputElement, AnimatedInputProps>(
  ({ label, error, helperText, className, id, ...props }, ref) => {
    const [isFocused, setIsFocused] = useState(false);
    const generatedId = useId();
    const inputId = id || generatedId;

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(true);
      props.onFocus?.(e);
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(false);
      props.onBlur?.(e);
    };

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className={cn(
              'block text-sm font-medium text-foreground mb-2',
              error && 'text-destructive'
            )}
          >
            {label}
            {props.required && <span className="text-destructive ml-1">*</span>}
          </label>
        )}
        
        <div className="relative">
          <input
            ref={ref}
            id={inputId}
            className={cn(
              'flex w-full min-h-[44px] h-11 rounded-md border bg-background px-3 py-2',
              'text-base text-foreground ring-offset-background',
              'transition-all duration-200 motion-reduce:transition-none',
              'file:border-0 file:bg-transparent file:text-sm file:font-medium',
              'placeholder:text-muted-foreground',
              'hover:border-primary/50 hover:bg-accent/30',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              'disabled:cursor-not-allowed disabled:opacity-50',
              'disabled:hover:border-input disabled:hover:bg-background',
              error 
                ? 'border-destructive focus-visible:ring-destructive' 
                : 'border-input',
              className
            )}
            onFocus={handleFocus}
            onBlur={handleBlur}
            aria-invalid={error ? 'true' : undefined}
            aria-required={props.required || undefined}
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
        {error && (
          <p 
            id={`${inputId}-error`}
            className="mt-1 text-sm text-destructive animate-in fade-in-0 slide-in-from-top-1 duration-150 motion-reduce:animate-none"
            role="alert"
          >
            {error}
          </p>
        )}

        {/* Helper text */}
        {helperText && !error && (
          <p 
            id={`${inputId}-helper`}
            className="mt-1 text-sm text-muted-foreground"
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
