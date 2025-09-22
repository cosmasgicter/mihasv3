import React, { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  helperText?: string
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, label, error, helperText, ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false)
    const isPassword = type === 'password'
    const inputType = isPassword ? (showPassword ? 'text' : 'password') : type
    
    const id = React.useMemo(() => {
      return props.id || props.name || `input-${Math.random().toString(36).substr(2, 9)}`
    }, [props.id, props.name])
    
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={id} className="block text-sm font-medium text-secondary mb-1">
            {label}
            {props.required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}
        <div className="relative">
          <input
            type={inputType}
            id={id}
            className={cn(
              'flex h-10 w-full rounded-md border border-secondary bg-white px-3 py-2 text-sm placeholder:text-secondary focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary disabled:cursor-not-allowed disabled:opacity-50',
              error && 'border-red-500 focus:ring-red-500 focus:border-red-500',
              isPassword && 'pr-10',
              className
            )}
            ref={ref}
            {...props}
            readOnly={false}
            disabled={props.disabled || false}
          />
          {isPassword && (
            <button
              type="button"
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          )}
        </div>
        {error && (
          <p className="mt-1 text-sm text-red-600">{error}</p>
        )}
        {helperText && !error && (
          <p className="mt-1 text-sm text-secondary">{helperText}</p>
        )}
      </div>
    )
  }
)
Input.displayName = 'Input'

export { Input }