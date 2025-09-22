import React, { useMemo } from 'react'
import { motion, useReducedMotion } from 'framer-motion'

interface FloatingElementsProps {
  count?: number
  className?: string
  shouldAnimate?: boolean
}

const generateElements = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    id: i,
    size: Math.random() * 6 + 3,
    left: Math.random() * 100,
    top: Math.random() * 100,
    delay: Math.random() * 8,
    duration: 6 + Math.random() * 4,
    opacity: 0.1 + Math.random() * 0.3
  }))

export const FloatingElements = React.memo(({ count = 20, className = '', shouldAnimate = true }: FloatingElementsProps) => {
  const prefersReducedMotion = useReducedMotion()
  const elements = useMemo(() => generateElements(count), [count])
  const enableAnimation = shouldAnimate && !prefersReducedMotion

  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}>
      {elements.map((element) => (
        enableAnimation ? (
          <motion.div
            key={element.id}
            className="absolute rounded-full"
            style={{
              width: element.size,
              height: element.size,
              left: `${element.left}%`,
              top: `${element.top}%`,
              background: `radial-gradient(circle, rgba(20, 184, 166, ${element.opacity}) 0%, transparent 70%)`
            }}
            animate={{
              y: [-50, -100, -50],
              x: [0, 30, -30, 0],
              scale: [1, 1.2, 0.8, 1],
              rotate: [0, 180, 360]
            }}
            transition={{
              duration: element.duration,
              delay: element.delay,
              repeat: Infinity,
              ease: 'easeInOut'
            }}
          />
        ) : (
          <div
            key={element.id}
            className="absolute rounded-full"
            style={{
              width: element.size,
              height: element.size,
              left: `${element.left}%`,
              top: `${element.top}%`,
              background: `radial-gradient(circle, rgba(20, 184, 166, ${element.opacity}) 0%, transparent 70%)`,
              opacity: element.opacity
            }}
          />
        )
      ))}
    </div>
  )
})

export const GeometricPatterns = React.memo(() => {
  const prefersReducedMotion = useReducedMotion()

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-10">
      {/* Animated geometric shapes */}
      {prefersReducedMotion ? (
        <>
          <div className="absolute top-10 right-10 w-32 h-32 border-2 border-primary rounded-full" />
          <div className="absolute bottom-20 left-10 w-24 h-24 bg-gradient-to-r from-secondary to-accent rounded-lg" />
          <div className="absolute top-1/2 left-1/4 w-16 h-16 border-2 border-accent transform rotate-45" />
          <div className="absolute top-1/4 right-1/3 w-20 h-20 bg-gradient-radial from-primary/20 to-transparent rounded-full" />
        </>
      ) : (
        <>
          <motion.div
            className="absolute top-10 right-10 w-32 h-32 border-2 border-primary rounded-full"
            animate={{
              rotate: 360,
              scale: [1, 1.1, 1]
            }}
            transition={{
              rotate: { duration: 20, repeat: Infinity, ease: "linear" },
              scale: { duration: 4, repeat: Infinity, ease: "easeInOut" }
            }}
          />

          <motion.div
            className="absolute bottom-20 left-10 w-24 h-24 bg-gradient-to-r from-secondary to-accent rounded-lg"
            animate={{
              rotate: -360,
              y: [0, -20, 0]
            }}
            transition={{
              rotate: { duration: 15, repeat: Infinity, ease: "linear" },
              y: { duration: 3, repeat: Infinity, ease: "easeInOut" }
            }}
          />

          <motion.div
            className="absolute top-1/2 left-1/4 w-16 h-16 border-2 border-accent transform rotate-45"
            animate={{
              rotate: [45, 225, 45],
              scale: [1, 0.8, 1]
            }}
            transition={{
              duration: 8,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          />

          <motion.div
            className="absolute top-1/4 right-1/3 w-20 h-20 bg-gradient-radial from-primary/20 to-transparent rounded-full"
            animate={{
              scale: [1, 1.5, 1],
              opacity: [0.3, 0.1, 0.3]
            }}
            transition={{
              duration: 5,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          />
        </>
      )}
    </div>
  )
})