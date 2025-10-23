import React, { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Input, InputProps } from './Input'

export const PasswordInput = React.forwardRef<HTMLInputElement, Omit<InputProps, 'type'>>(
  (props, ref) => {
    const [showPassword, setShowPassword] = useState(false)

    return (
      <div className="relative">
        <Input
          {...props}
          ref={ref}
          type={showPassword ? 'text' : 'password'}
        />
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          className="absolute right-3 top-[34px] -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors touch-target"
          aria-label={showPassword ? 'Hide password' : 'Show password'}
          tabIndex={-1}
        >
          {showPassword ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
        </button>
      </div>
    )
  }
)

PasswordInput.displayName = 'PasswordInput'
