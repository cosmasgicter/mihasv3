import * as React from "react"
import * as SelectPrimitive from "@radix-ui/react-select"
import { Check, ChevronDown, ChevronUp } from "lucide-react"

import { cn } from "@/lib/utils"

const Select = SelectPrimitive.Root

const SelectGroup = SelectPrimitive.Group

const SelectValue = SelectPrimitive.Value

/**
 * SelectTrigger Component
 * 
 * Touch-optimized select trigger with 44px minimum height.
 * 
 * Requirements: 9.2 - Touch targets at least 44x44 pixels
 */
const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger> & {
    error?: boolean
  }
>(({ className, children, error, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    aria-invalid={error ? "true" : "false"}
    className={cn(
      // Touch target compliance - 44px minimum height
      "flex min-h-[44px] min-h-touch w-full items-start justify-between sm:items-center",
      // Styling
      "rounded-md border bg-background px-3 py-2",
      // Border color - normal vs error state
      error ? "border-destructive" : "border-input",
      // Typography
      "text-sm text-foreground sm:text-base",
      // Placeholder styling
      "data-[placeholder]:text-muted-foreground",
      // Focus styles — keyboard only
      "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      // Error focus state
      error && "focus-visible:border-destructive",
      // Disabled state
      "disabled:cursor-not-allowed disabled:opacity-50",
      // Touch optimization
      "touch-manipulation",
      // Mobile-friendly overflow handling for long labels
      "[&>span]:block [&>span]:min-w-0 [&>span]:flex-1 [&>span]:text-left",
      "[&>span]:break-words [&>span]:whitespace-normal [&>span]:leading-tight",
      "[&>span]:line-clamp-2 sm:[&>span]:line-clamp-1",
      // Transition with reduced motion support
      "transition-colors duration-150",
      "motion-reduce:transition-none",
      className
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="ml-2 h-5 w-5 shrink-0 opacity-50" aria-hidden="true" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
))
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName

const SelectScrollUpButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollUpButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton
    ref={ref}
    className={cn(
      "flex cursor-default items-center justify-center py-1",
      // Touch target for scroll button
      "min-h-[32px]",
      className
    )}
    {...props}
  >
    <ChevronUp className="h-4 w-4" aria-hidden="true" />
  </SelectPrimitive.ScrollUpButton>
))
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName

const SelectScrollDownButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollDownButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton
    ref={ref}
    className={cn(
      "flex cursor-default items-center justify-center py-1",
      // Touch target for scroll button
      "min-h-[32px]",
      className
    )}
    {...props}
  >
    <ChevronDown className="h-4 w-4" aria-hidden="true" />
  </SelectPrimitive.ScrollDownButton>
))
SelectScrollDownButton.displayName =
  SelectPrimitive.ScrollDownButton.displayName

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = "popper", ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      className={cn(
        "relative z-50 max-h-[--radix-select-content-available-height] w-[var(--radix-select-trigger-width)] min-w-[min(18rem,calc(100vw-1rem))] max-w-[calc(100vw-1rem)] overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-md",
        // Animation classes with reduced motion support
        "data-[state=open]:animate-in data-[state=closed]:animate-out",
        "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
        "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2",
        "data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        "origin-[--radix-select-content-transform-origin]",
        // Reduced motion support
        "motion-reduce:animate-none",
        position === "popper" &&
          "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
        className
      )}
      position={position}
      {...props}
    >
      <SelectScrollUpButton />
      <SelectPrimitive.Viewport
        className={cn(
          "p-2",
          position === "popper" &&
            "w-full min-w-[var(--radix-select-trigger-width)]"
        )}
      >
        {children}
      </SelectPrimitive.Viewport>
      <SelectScrollDownButton />
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
))
SelectContent.displayName = SelectPrimitive.Content.displayName

const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label
    ref={ref}
    className={cn("py-1.5 pl-8 pr-2 text-sm font-semibold", className)}
    {...props}
  />
))
SelectLabel.displayName = SelectPrimitive.Label.displayName

/**
 * SelectItem Component
 * 
 * Touch-optimized select item with 44px minimum height.
 * 
 * Requirements: 9.2 - Touch targets at least 44x44 pixels
 */
const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      // Touch target compliance - 44px minimum height
      "relative flex w-full min-h-touch cursor-default select-none items-start sm:items-center",
      // Padding and spacing
      "rounded-md py-2 pl-10 pr-3",
      // Typography
      "text-sm sm:text-base",
      // Long-label handling on mobile
      "[&_[data-slot='select-item-text']]:block [&_[data-slot='select-item-text']]:min-w-0",
      "[&_[data-slot='select-item-text']]:break-words [&_[data-slot='select-item-text']]:whitespace-normal",
      "[&_[data-slot='select-item-text']]:leading-tight [&_[data-slot='select-item-text']]:line-clamp-2 sm:[&_[data-slot='select-item-text']]:line-clamp-1",
      // Focus and hover states
      "outline-none focus:bg-accent focus:text-accent-foreground",
      // Disabled state
      "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      // Touch optimization
      "touch-manipulation",
      // Transition with reduced motion support
      "transition-colors duration-150",
      "motion-reduce:transition-none",
      className
    )}
    {...props}
  >
    <span className="absolute left-3 flex h-5 w-5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="h-5 w-5" aria-hidden="true" />
      </SelectPrimitive.ItemIndicator>
    </span>

    <SelectPrimitive.ItemText data-slot="select-item-text">
      {children}
    </SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
))
SelectItem.displayName = SelectPrimitive.Item.displayName

const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator
    ref={ref}
    className={cn("-mx-1 my-1 h-px bg-muted", className)}
    {...props}
  />
))
SelectSeparator.displayName = SelectPrimitive.Separator.displayName

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
}
