import React from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Spinner } from './Spinner'

export interface LoadingOverlayProps extends React.HTMLAttributes<HTMLDivElement> {
  message?: string
  transparent?: boolean
}

export function LoadingOverlay({ className, message, transparent = false, ...props }: LoadingOverlayProps) {
  const prefersReducedMotion = useReducedMotion()

  const overlayContent = (
    <>
      <Spinner size="lg" />
      {message && (
        <p className="mt-4 text-sm text-slate-700 font-medium max-w-xs text-center">
          {message}
        </p>
      )}
    </>
  )

  if (prefersReducedMotion) {
    return (
      <div
        className={cn(
          'absolute inset-0 flex flex-col items-center justify-center z-50',
          transparent ? 'bg-white/60' : 'bg-white/90 backdrop-blur-sm',
          className
        )}
        role="status"
        aria-live="polite"
        aria-busy="true"
        {...props}
      >
        {overlayContent}
      </div>
    )
  }

  return (
    <motion.div
      className={cn(
        'absolute inset-0 flex flex-col items-center justify-center z-50',
        transparent ? 'bg-white/60' : 'bg-white/90 backdrop-blur-sm',
        className
      )}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.1 }} // 100ms transition
      role="status"
      aria-live="polite"
      aria-busy="true"
      {...props}
    >
      {overlayContent}
    </motion.div>
  )
}
