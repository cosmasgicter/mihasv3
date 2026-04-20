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
  /** Additional aria-describedby ids to merge with the component's own (Req 17.2) */
  extraDescribedBy?: string;
}

export const AnimatedInput = forwardRef<HTMLInputElement, AnimatedInputProps>(
  ({ label, error, helperText, extraDescribedBy, className, id, ...props }, ref) => {
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
              'flex w-full min-h-[48px] h-12 rounded-xl border border-border/60 bg-background/80 px-4 py-2',
              'text-base text-foreground ring-offset-background',
              'transition-all duration-200 motion-reduce:transition-none',
              'file:border-0 file:bg-transparent file:text-sm file:font-medium',
              'placeholder:text-muted-foreground/60',
              'hover:border-primary/40 hover:bg-accent/20',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary',
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
            aria-describedby={[error ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined, extraDescribedBy].filter(Boolean).join(' ') || undefined}
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
            className="mt-1.5 text-xs text-destructive motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 motion-safe:duration-150"
            role="alert"
          >
            {error}
          </p>
        )}

        {/* Helper text */}
        {helperText && !error && (
          <p 
            id={`${inputId}-helper`}
            className="mt-1.5 text-xs text-muted-foreground"
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
