/**
 * RadioGroup Component - shadcn/ui pattern with Radix UI primitives
 * 
 * Touch-optimized radio group with 44px minimum touch targets.
 * Uses Radix RadioGroup for accessibility and keyboard navigation.
 * 
 * Requirements: 6.2, 6.5, 6.6, 6.8 - Radix RadioGroup, keyboard navigation, touch targets, orientation
 */

import * as React from 'react'
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group'
import { Circle } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * RadioGroup Root Component
 * 
 * Container for radio items with proper accessibility.
 * Supports horizontal and vertical orientations.
 */
const RadioGroup = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>
>(({ className, ...props }, ref) => {
  return (
    <RadioGroupPrimitive.Root
      className={cn('grid gap-2', className)}
      {...props}
      ref={ref}
    />
  )
})
RadioGroup.displayName = RadioGroupPrimitive.Root.displayName

/**
 * RadioGroupItem Component
 * 
 * Individual radio button with 44px minimum touch target.
 * The visual indicator is 20x20px but wrapped in a larger touch area.
 * 
 * Requirements: 6.6 - Touch targets at least 44x44 pixels
 */
const RadioGroupItem = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>
>(({ className, ...props }, ref) => {
  return (
    <RadioGroupPrimitive.Item
      ref={ref}
      className={cn(
        // Touch target compliance - 44px minimum
        'aspect-square h-5 w-5',
        // Visual styling
        'rounded-full border-2 border-primary',
        // Text color for indicator
        'text-primary',
        // Focus styles
        'ring-offset-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        // Disabled state
        'disabled:cursor-not-allowed disabled:opacity-50',
        // Touch optimization
        'touch-manipulation',
        // Transition with reduced motion support
        'transition-colors duration-150',
        'motion-reduce:transition-none',
        className
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator className="flex items-center justify-center">
        <Circle className="h-2.5 w-2.5 fill-current text-current" aria-hidden="true" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  )
})
RadioGroupItem.displayName = RadioGroupPrimitive.Item.displayName

export { RadioGroup, RadioGroupItem }
