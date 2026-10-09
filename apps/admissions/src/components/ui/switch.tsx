import * as React from "react"
import * as SwitchPrimitives from "@radix-ui/react-switch"

import { cn } from "@/lib/utils"

/**
 * The canonical toggle. **The control that receives the tap is the 44 px one**
 * (GATE-13.3-03, 13.6 §8.1 item L6; R16.2, finding STU-14).
 *
 * ## What was wrong
 *
 * The 44 px box existed — as an `inline-flex … min-h-touch min-w-touch` **`div`**
 * wrapping a `h-6 w-11` Radix `Root`. A `div` has no handler, so tapping its
 * padding did nothing: the `button[role="switch"]` that actually toggles measured
 * **44.000 x 24.000**. Task 13.3 measured it 36 times on `/student/notifications`
 * — STU-14's own persisted preference controls — at every one of the six widths.
 *
 * A wrapper that is the right size and the wrong element is the most misleading
 * shape this class of defect takes: a scan that measures *boxes* sees 44 x 44 and
 * a student's thumb does not.
 *
 * ## What it does now
 *
 * The `Root` itself is the 44 px target (`min-h-touch min-w-touch`), and the
 * visible 44 x 24 track is a `span` drawn inside it. So the hit area and the
 * control are the same element, and the switch looks exactly as it did — the track
 * keeps `h-6 w-11`, the thumb keeps its 20 px travel, and `data-[state=…]` still
 * drives both because they are still on the `Root`.
 *
 * `className` continues to reach the `Root`, so existing call sites that size or
 * space the switch are unaffected; `min-h-touch`/`min-w-touch` are floors, not
 * fixed sizes, so a caller passing a larger box still wins.
 */
const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      "group relative inline-flex min-h-touch min-w-touch shrink-0 cursor-pointer items-center justify-center rounded-full bg-transparent",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      "disabled:cursor-not-allowed disabled:opacity-50 touch-manipulation",
      className
    )}
    {...props}
    ref={ref}
  >
    {/* The visible track. Purely presentational — the `Root` above is the target. */}
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none flex h-6 w-11 items-center rounded-full border-2 border-transparent transition-colors",
        "group-data-[state=checked]:bg-primary group-data-[state=unchecked]:bg-input"
      )}
    >
      <SwitchPrimitives.Thumb
        className={cn(
          "pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0"
        )}
      />
    </span>
  </SwitchPrimitives.Root>
))
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch }
