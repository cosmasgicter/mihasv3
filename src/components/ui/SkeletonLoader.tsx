import React from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface SkeletonLoaderProps {
  className?: string
  count?: number
  height?: string | number
  width?: string | number
  rounded?: boolean
  animation?: 'pulse' | 'wave' | 'none'
}

export function SkeletonLoader({
  className,
  count = 1,
  height = '1rem',
  width = '100%',
  rounded = false,
  animation = 'pulse'
}: SkeletonLoaderProps) {
  const skeletonClass = cn(
    'bg-gray-200 dark:bg-gray-700',
    rounded ? 'rounded-full' : 'rounded',
    animation === 'pulse' && 'animate-pulse',
    className
  )

  const style = {
    height: typeof height === 'number' ? `${height}px` : height,
    width: typeof width === 'number' ? `${width}px` : width
  }

  const waveVariants = {
    initial: { x: '-100%' },
    animate: {
      x: '100%',
      transition: {
        duration: 1.5,
        repeat: Infinity,
        ease: 'easeInOut'
      }
    }
  }

  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className={cn(skeletonClass, 'relative overflow-hidden')}
          style={style}
        >
          {animation === 'wave' && (
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent"
              variants={waveVariants}
              initial="initial"
              animate="animate"
            />
          )}
        </div>
      ))}
    </>
  )
}

// Preset skeleton components for common use cases
export function SkeletonCard() {
  return (
    <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg space-y-3">
      <SkeletonLoader height={20} width="60%" />
      <SkeletonLoader height={16} count={3} />
      <SkeletonLoader height={14} width="40%" />
    </div>
  )
}

export function SkeletonTable({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex space-x-4">
        {Array.from({ length: columns }).map((_, i) => (
          <SkeletonLoader key={i} height={16} width={`${100 / columns}%`} />
        ))}
      </div>
      
      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex space-x-4">
          {Array.from({ length: columns }).map((_, colIndex) => (
            <SkeletonLoader 
              key={colIndex} 
              height={14} 
              width={`${100 / columns}%`}
              animation="wave"
            />
          ))}
        </div>
      ))}
    </div>
  )
}

export function SkeletonAvatar({ size = 40 }: { size?: number }) {
  return (
    <SkeletonLoader
      height={size}
      width={size}
      rounded
      animation="pulse"
    />
  )
}