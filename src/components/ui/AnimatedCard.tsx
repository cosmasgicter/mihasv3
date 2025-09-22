import React from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useInView } from 'react-intersection-observer'
import { cn } from '@/lib/utils'

interface AnimatedCardProps {
  children: React.ReactNode
  className?: string
  delay?: number
  direction?: 'up' | 'down' | 'left' | 'right' | 'scale'
  hover3d?: boolean
  glassEffect?: boolean
  gradient?: boolean
}

function AnimatedCard({
  children,
  className,
  delay = 0,
  direction = 'up',
  hover3d = false,
  glassEffect = false,
  gradient = false
}: AnimatedCardProps) {
  const prefersReducedMotion = useReducedMotion()
  const [ref, inView] = useInView({
    triggerOnce: true,
    threshold: 0.1,
    rootMargin: '50px 0px'
  })

  const directionVariants = {
    up: {
      hidden: { opacity: 0, y: 50 },
      visible: { opacity: 1, y: 0 }
    },
    down: {
      hidden: { opacity: 0, y: -50 },
      visible: { opacity: 1, y: 0 }
    },
    left: {
      hidden: { opacity: 0, x: -50 },
      visible: { opacity: 1, x: 0 }
    },
    right: {
      hidden: { opacity: 0, x: 50 },
      visible: { opacity: 1, x: 0 }
    },
    scale: {
      hidden: { opacity: 0, scale: 0.8 },
      visible: { opacity: 1, scale: 1 }
    }
  }

  const hoverVariants = hover3d ? {
    hover: {
      rotateX: 5,
      rotateY: 5,
      scale: 1.02,
      y: -8,
      transition: {
        type: "spring",
        stiffness: 300,
        damping: 20
      }
    }
  } : {
    hover: {
      y: -4,
      scale: 1.02,
      transition: {
        type: "spring",
        stiffness: 300,
        damping: 20
      }
    }
  }

  const baseClasses = "relative overflow-hidden rounded-xl transition-all duration-300"
  const glassClasses = glassEffect ? "glass-effect" : "bg-white"
  const gradientClasses = gradient ? "bg-gradient-to-br from-white via-white to-primary/5" : ""
  const shadowClasses = "shadow-lg hover:shadow-2xl"

  if (prefersReducedMotion) {
    return (
      <div
        ref={ref}
        className={cn(
          baseClasses,
          glassClasses,
          gradientClasses,
          shadowClasses,
          hover3d && "perspective-1000",
          className
        )}
        style={{
          transformStyle: hover3d ? 'preserve-3d' : 'flat'
        }}
      >
        <div
          className="absolute inset-0 bg-gradient-to-r from-primary via-secondary to-accent rounded-xl"
          style={{ padding: '2px', opacity: 0.4 }}
        >
          <div className={cn(
            "h-full w-full rounded-xl",
            glassEffect ? "glass-effect" : "bg-white"
          )} />
        </div>

        <div className="relative z-10 p-6">
          {children}
        </div>
      </div>
    )
  }

  return (
    <motion.div
      ref={ref}
      className={cn(
        baseClasses,
        glassClasses,
        gradientClasses,
        shadowClasses,
        hover3d && "perspective-1000",
        className
      )}
      variants={directionVariants[direction]}
      initial="hidden"
      animate={inView ? "visible" : "hidden"}
      whileHover="hover"
      {...hoverVariants}
      transition={{
        duration: 0.6,
        delay: delay,
        ease: [0.25, 0.25, 0, 1]
      }}
      style={{
        transformStyle: hover3d ? 'preserve-3d' : 'flat'
      }}
    >
      {/* Gradient border animation */}
      <div className="absolute inset-0 bg-gradient-to-r from-primary via-secondary to-accent opacity-0 hover:opacity-100 transition-opacity duration-300 rounded-xl"
           style={{ padding: '2px' }}>
        <div className={cn(
          "h-full w-full rounded-xl",
          glassEffect ? "glass-effect" : "bg-white"
        )} />
      </div>

      {/* Content */}
      <div className="relative z-10 p-6">
        {children}
      </div>

      {/* Floating particles */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="particle" style={{ top: '20%', animationDelay: '0s' }} />
        <div className="particle" style={{ top: '60%', animationDelay: '2s' }} />
        <div className="particle" style={{ top: '80%', animationDelay: '4s' }} />
      </div>
    </motion.div>
  )
}

export { AnimatedCard }
export default AnimatedCard