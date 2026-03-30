"use client"

import * as React from "react"
import * as CheckboxPrimitive from "@radix-ui/react-checkbox"
import { Check } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Checkbox Component
 * 
 * Touch-optimized checkbox with 44x44px minimum touch target.
 * The visual checkbox is 20x20px but wrapped in a larger touch area.
 * 
 * Requirements: 9.2 - Touch targets at least 44x44 pixels
 */
const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <div className="relative inline-flex items-center justify-center min-h-[44px] min-w-[44px]">
    <CheckboxPrimitive.Root
      ref={ref}
      className={cn(
        // Visual checkbox size
        "grid place-content-center peer h-5 w-5 shrink-0 rounded-sm",
        // Border and background
        "border-2 border-primary bg-background",
        // Focus styles
        "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        // Disabled state
        "disabled:cursor-not-allowed disabled:opacity-50",
        // Checked state
        "data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
        // Touch optimization
        "touch-manipulation",
        // Transition
        "transition-colors duration-150",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        className={cn("grid place-content-center text-current")}
      >
        <Check className="h-4 w-4" strokeWidth={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  </div>
))
Checkbox.displayName = CheckboxPrimitive.Root.displayName

/**
 * Checkbox with Label
 * 
 * Combines checkbox with a label for better accessibility and touch targets.
 */
interface CheckboxWithLabelProps extends React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root> {
  label: string
  description?: string
}

const CheckboxWithLabel = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  CheckboxWithLabelProps
>(({ className, label, description, id, ...props }, ref) => {
  const generatedId = React.useId()
  const checkboxId = id || generatedId
  
  return (
    <div className="flex items-start gap-3 min-h-[44px] py-2">
      <div className="relative inline-flex items-center justify-center min-h-[44px] min-w-[44px] -my-2 -ml-3">
        <CheckboxPrimitive.Root
          ref={ref}
          id={checkboxId}
          className={cn(
            "grid place-content-center peer h-5 w-5 shrink-0 rounded-sm",
            "border-2 border-primary bg-background",
            "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
            "touch-manipulation transition-colors duration-150",
            className
          )}
          {...props}
        >
          <CheckboxPrimitive.Indicator
            className={cn("grid place-content-center text-current")}
          >
            <Check className="h-4 w-4" strokeWidth={3} />
          </CheckboxPrimitive.Indicator>
        </CheckboxPrimitive.Root>
      </div>
      <div className="flex flex-col">
        <label
          htmlFor={checkboxId}
          className="text-sm font-medium text-foreground cursor-pointer select-none leading-tight"
        >
          {label}
        </label>
        {description && (
          <span className="text-sm text-muted-foreground mt-0.5">
            {description}
          </span>
        )}
      </div>
    </div>
  )
})
CheckboxWithLabel.displayName = "CheckboxWithLabel"

export { Checkbox, CheckboxWithLabel }
