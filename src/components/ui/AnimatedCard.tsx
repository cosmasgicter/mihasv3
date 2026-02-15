import React from 'react'
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

const directionClasses = {
  up: { hidden: 'opacity-0 translate-y-12', visible: 'opacity-100 translate-y-0' },
  down: { hidden: 'opacity-0 -translate-y-12', visible: 'opacity-100 translate-y-0' },
  left: { hidden: 'opacity-0 -translate-x-12', visible: 'opacity-100 translate-x-0' },
  right: { hidden: 'opacity-0 translate-x-12', visible: 'opacity-100 translate-x-0' },
  scale: { hidden: 'opacity-0 scale-[0.8]', visible: 'opacity-100 scale-100' },
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
  const [ref, inView] = useInView({
    triggerOnce: true,
    threshold: 0.1,
    rootMargin: '50px 0px'
  })

  const baseClasses = "relative overflow-hidden rounded-xl transition-all duration-500 ease-out"
  const glassClasses = glassEffect ? "glass-effect" : "bg-card"
  const gradientClasses = gradient ? "bg-gradient-to-br from-white via-white to-primary/5" : ""
  const shadowClasses = "shadow-lg hover:shadow-2xl"
  const hoverClasses = hover3d
    ? "hover:-translate-y-2 hover:scale-[1.02]"
    : "hover:-translate-y-1 hover:scale-[1.02]"

  const directionStyle = directionClasses[direction]

  return (
    <div
      ref={ref}
      className={cn(
        baseClasses,
        glassClasses,
        gradientClasses,
        shadowClasses,
        hoverClasses,
        inView ? directionStyle.visible : directionStyle.hidden,
        hover3d && "perspective-1000",
        className
      )}
      style={{
        transitionDelay: delay > 0 ? `${delay * 1000}ms` : undefined,
        transformStyle: hover3d ? 'preserve-3d' : 'flat'
      }}
    >
      {/* Gradient border animation */}
      <div className="absolute inset-0 bg-gradient-to-r from-blue-600 via-purple-600 to-blue-800 opacity-0 hover:opacity-100 transition-opacity duration-300 rounded-xl"
           style={{ padding: '2px' }}>
        <div className={cn(
          "h-full w-full rounded-xl",
          glassEffect ? "glass-effect" : "bg-card"
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
    </div>
  )
}

export { AnimatedCard }
export default AnimatedCard
