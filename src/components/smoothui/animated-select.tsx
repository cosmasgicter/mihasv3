/**
 * AnimatedSelect Component - SmoothUI-style animated select inputs
 * Provides smooth focus and validation animations for select elements
 * Uses CSS transitions instead of framer-motion for performance.
 * 
 * @requirements 1.2 - CSS transitions instead of framer-motion
 * @requirements 1.5 - Preserve same visual transition behavior
 * @requirements 7.3, 7.4 - SmoothUI form components with validation feedback
 */

import { forwardRef, useState, useId } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

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
    const generatedId = useId();
    const selectId = id || generatedId;

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

    const isLabelActive = isFocused || hasValue;

    return (
      <div className="relative">
        {label && (
          <label
            htmlFor={selectId}
            className={cn(
              'absolute left-3 top-3 origin-left pointer-events-none z-10',
              'text-muted-foreground transition-all duration-150 ease-out motion-reduce:transition-none',
              isLabelActive && '-translate-y-6 scale-[0.85]',
              isLabelActive && (error ? 'text-destructive' : 'text-primary'),
              error && !isLabelActive && 'text-destructive'
            )}
          >
            {label}
            {props.required && <span className="text-destructive ml-1">*</span>}
          </label>
        )}
        
        <div
          className={cn(
            'relative transition-transform duration-150 ease-out motion-reduce:transition-none',
            isFocused && 'scale-[1.01]'
          )}
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
            aria-invalid={error ? 'true' : undefined}
            aria-required={props.required || undefined}
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
          <div
            className={cn(
              'absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none',
              'transition-transform duration-150 ease-out motion-reduce:transition-none',
              isFocused && 'rotate-180'
            )}
          >
            <ChevronDown className={cn(
              'h-4 w-4 transition-colors',
              isFocused ? 'text-primary' : 'text-muted-foreground'
            )} />
          </div>
          
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
              id={`${selectId}-error`}
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
