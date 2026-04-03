import React from 'react'
import { FieldError } from 'react-hook-form'
import { z } from 'zod'
import { cn } from '@/lib/utils'
import { SELECT_CHEVRON_SVG } from '@/design-system/tokens'
import { ErrorDisplay } from './ErrorDisplay'

// Minimal inline success message (no canonical replacement needed)
function FormSuccess({ message, className }: { message?: string; className?: string }) {
  if (!message) return null
  return (
    <div className={cn('flex items-center space-x-2 text-sm text-success mt-1', className)}>
      <CheckCircle className="w-4 h-4 flex-shrink-0" />
      <span>{message}</span>
    </div>
  )
}
import { Eye, EyeOff, CheckCircle } from 'lucide-react'

// Enhanced input component with mobile optimization
interface EnhancedInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string | FieldError
  success?: string
  hint?: string
  required?: boolean
  showOptional?: boolean
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
  onRightIconClick?: () => void
}

export function EnhancedInput({
  label,
  error,
  success,
  hint,
  required = false,
  showOptional = true,
  leftIcon,
  rightIcon,
  onRightIconClick,
  className,
  ...props
}: EnhancedInputProps) {
  const errorMessage = typeof error === 'string' ? error : error?.message
  
  return (
    <div className="space-y-1">
      {label && (
        <label 
          htmlFor={props.id}
          className="block text-sm font-medium text-foreground"
        >
          {label}
          {required ? (
            <span className="text-error ml-1">*</span>
          ) : showOptional ? (
            <span className="text-foreground ml-1 font-normal">(optional)</span>
          ) : null}
        </label>
      )}
      
      <div className="relative">
        {leftIcon && (
          <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-foreground">
            {leftIcon}
          </div>
        )}
        
        <input
          {...props}
          className={cn(
            // Base styling
            'block w-full rounded-lg border border-input bg-card',
            'text-sm text-foreground placeholder-muted-foreground',
            'transition-colors duration-200',
            // Focus states
            'focus:border-primary focus:ring-2 focus:ring-ring/20',
            'focus:outline-none',
            // Mobile optimizations
            'min-h-[44px] px-3 py-2.5', // Ensure 44px touch target
            'text-base sm:text-sm', // Prevent zoom on iOS
            // Icon spacing
            leftIcon && 'pl-10',
            rightIcon && 'pr-10',
            // Error state
            errorMessage && 'border-destructive/30 focus:border-error focus:ring-destructive/20',
            // Success state
            success && 'border-success/30 focus:border-success focus:ring-success/20',
            // Disabled state
            'disabled:bg-muted disabled:text-foreground disabled:cursor-not-allowed',
            className
          )}
        />
        
        {rightIcon && (
          <button
            type="button"
            onClick={onRightIconClick}
            className={cn(
              'absolute right-3 top-1/2 transform -translate-y-1/2',
              'text-foreground hover:text-foreground',
              'min-w-[24px] min-h-[24px] flex items-center justify-center',
              'focus:outline-none focus:ring-2 focus:ring-ring rounded',
              onRightIconClick ? 'cursor-pointer' : 'cursor-default'
            )}
            disabled={!onRightIconClick}
          >
            {rightIcon}
          </button>
        )}
      </div>
      
      {hint && !errorMessage && !success && (
        <p className="text-xs text-foreground">{hint}</p>
      )}
      
      {errorMessage && <ErrorDisplay message={errorMessage} variant="inline" />}
      <FormSuccess message={success} />
    </div>
  )
}

// Enhanced textarea component
interface EnhancedTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string | FieldError
  success?: string
  hint?: string
  required?: boolean
  showOptional?: boolean
  showCharCount?: boolean
  maxLength?: number
}

export function EnhancedTextarea({
  label,
  error,
  success,
  hint,
  required = false,
  showOptional = true,
  showCharCount = false,
  maxLength,
  className,
  value,
  ...props
}: EnhancedTextareaProps) {
  const errorMessage = typeof error === 'string' ? error : error?.message
  const charCount = typeof value === 'string' ? value.length : 0
  
  return (
    <div className="space-y-1">
      {label && (
        <div className="flex items-center justify-between">
          <label 
            htmlFor={props.id}
            className="block text-sm font-medium text-foreground"
          >
            {label}
            {required ? (
              <span className="text-error ml-1">*</span>
            ) : showOptional ? (
              <span className="text-foreground ml-1 font-normal">(optional)</span>
            ) : null}
          </label>
          
          {showCharCount && maxLength && (
            <span className={cn(
              'text-xs',
              charCount > maxLength ? 'text-error' : 'text-foreground'
            )}>
              {charCount}/{maxLength}
            </span>
          )}
        </div>
      )}
      
      <textarea
        {...props}
        value={value}
        maxLength={maxLength}
        className={cn(
          // Base styling
          'block w-full rounded-lg border border-input bg-card',
          'text-sm text-foreground placeholder-muted-foreground',
          'transition-colors duration-200',
          // Focus states
          'focus:border-primary focus:ring-2 focus:ring-ring/20',
          'focus:outline-none',
          // Mobile optimizations
          'min-h-[88px] px-3 py-2.5', // Double height for textarea
          'text-base sm:text-sm', // Prevent zoom on iOS
          'resize-y', // Allow vertical resize only
          // Error state
          errorMessage && 'border-destructive/30 focus:border-error focus:ring-destructive/20',
          // Success state
          success && 'border-success/30 focus:border-success focus:ring-success/20',
          // Disabled state
          'disabled:bg-muted disabled:text-foreground disabled:cursor-not-allowed',
          className
        )}
      />
      
      {hint && !errorMessage && !success && (
        <p className="text-xs text-foreground">{hint}</p>
      )}
      
      {errorMessage && <ErrorDisplay message={errorMessage} variant="inline" />}
      <FormSuccess message={success} />
    </div>
  )
}

// Enhanced password input with toggle visibility
export function PasswordInput({
  className,
  ...props
}: Omit<EnhancedInputProps, 'type' | 'rightIcon' | 'onRightIconClick'>) {
  const [showPassword, setShowPassword] = React.useState(false)
  
  return (
    <EnhancedInput
      {...props}
      type={showPassword ? 'text' : 'password'}
      rightIcon={showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      onRightIconClick={() => setShowPassword(!showPassword)}
      className={className}
    />
  )
}

// Enhanced select component
interface EnhancedSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string | FieldError
  success?: string
  hint?: string
  required?: boolean
  showOptional?: boolean
  placeholder?: string
  options: { value: string; label: string; disabled?: boolean }[]
}

export function EnhancedSelect({
  label,
  error,
  success,
  hint,
  required = false,
  showOptional = true,
  placeholder = 'Select an option',
  options,
  className,
  ...props
}: EnhancedSelectProps) {
  const errorMessage = typeof error === 'string' ? error : error?.message
  
  return (
    <div className="space-y-1">
      {label && (
        <label 
          htmlFor={props.id}
          className="block text-sm font-medium text-foreground"
        >
          {label}
          {required ? (
            <span className="text-error ml-1">*</span>
          ) : showOptional ? (
            <span className="text-foreground ml-1 font-normal">(optional)</span>
          ) : null}
        </label>
      )}
      
      <select
        {...props}
        className={cn(
          // Base styling
          'block w-full rounded-lg border border-input bg-card',
          'text-sm text-foreground',
          'transition-colors duration-200',
          // Focus states
          'focus:border-primary focus:ring-2 focus:ring-ring/20',
          'focus:outline-none',
          // Mobile optimizations
          'min-h-[44px] px-3 py-2.5', // Ensure 44px touch target
          'text-base sm:text-sm', // Prevent zoom on iOS
          // Custom arrow
          'appearance-none',
          'bg-no-repeat bg-right bg-[length:16px_16px]',
          'pr-10', // Space for arrow
          // Error state
          errorMessage && 'border-destructive/30 focus:border-error focus:ring-destructive/20',
          // Success state
          success && 'border-success/30 focus:border-success focus:ring-success/20',
          // Disabled state
          'disabled:bg-muted disabled:text-foreground disabled:cursor-not-allowed',
          className
        )}
        style={{
          backgroundImage: SELECT_CHEVRON_SVG,
          backgroundPosition: 'right 0.5rem center'
        }}
      >
        <option value="" disabled>
          {placeholder}
        </option>
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
      
      {hint && !errorMessage && !success && (
        <p className="text-xs text-foreground">{hint}</p>
      )}
      
      {errorMessage && <ErrorDisplay message={errorMessage} variant="inline" />}
      <FormSuccess message={success} />
    </div>
  )
}

// Form field wrapper with consistent spacing
export function FormField({ 
  children, 
  className 
}: { 
  children: React.ReactNode
  className?: string 
}) {
  return (
    <div className={cn('space-y-4', className)}>
      {children}
    </div>
  )
}

// Form section with title and description
export function FormSection({
  title,
  description,
  children,
  className
}: {
  title: string
  description?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('space-y-4', className)}>
      <div>
        <h3 className="text-lg font-medium text-foreground">{title}</h3>
        {description && (
          <p className="text-sm text-foreground mt-1">{description}</p>
        )}
      </div>
      <div className="space-y-4">
        {children}
      </div>
    </div>
  )
}

// Real-time validation hook
export function useRealTimeValidation<T extends z.ZodRawShape>(
  schema: z.ZodObject<T>
) {
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  
  const validateField = React.useCallback((name: string, value: unknown) => {
    try {
      // Validate single field
      const fieldSchema = schema.shape[name as keyof T]
      if (fieldSchema) {
        (fieldSchema as unknown as z.ZodTypeAny).parse(value)
        setErrors(prev => {
          const { [name]: removed, ...rest } = prev
          return rest
        })
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        setErrors(prev => ({
          ...prev,
          [name]: error.issues[0]?.message || 'Invalid value'
        }))
      }
    }
  }, [schema])
  
  const validateForm = React.useCallback((data: z.infer<z.ZodObject<T>>) => {
    try {
      schema.parse(data)
      setErrors({})
      return true
    } catch (error) {
      if (error instanceof z.ZodError) {
        const fieldErrors: Record<string, string> = {}
        error.issues.forEach((err: z.core.$ZodIssue) => {
          if (err.path[0]) {
            fieldErrors[err.path[0] as string] = err.message
          }
        })
        setErrors(fieldErrors)
      }
      return false
    }
  }, [schema])
  
  return {
    errors,
    validateField,
    validateForm,
    clearErrors: () => setErrors({})
  }
}
