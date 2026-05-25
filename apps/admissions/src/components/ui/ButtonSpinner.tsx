import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'

const spinnerSize = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
} as const

export interface ButtonSpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

function SpinnerIcon({ size = 'md', className }: ButtonSpinnerProps) {
  return (
    <motion.svg
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className={cn(spinnerSize[size!], 'animate-spin text-primary motion-reduce:hidden', className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </motion.svg>
  )
}

/** Static fallback shown when prefers-reduced-motion is active */
function StaticIcon({ size = 'md', className }: ButtonSpinnerProps) {
  return (
    <svg
      className={cn(spinnerSize[size!], 'hidden text-primary motion-reduce:block', className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

/**
 * Standalone spinner for use in buttons and other inline contexts.
 *
 * Renders an animated SVG spinner with a static reduced-motion fallback.
 */
export function ButtonSpinner({ size = 'md', className }: ButtonSpinnerProps) {
  return (
    <>
      <SpinnerIcon size={size} className={className} />
      <StaticIcon size={size} className={className} />
    </>
  )
}
