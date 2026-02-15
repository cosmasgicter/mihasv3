import React, { useMemo } from 'react'

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

/**
 * Check if user prefers reduced motion via CSS media query.
 */
function usePrefersReducedMotion(): boolean {
  const [prefersReduced, setPrefersReduced] = React.useState(() => {
    if (typeof window === 'undefined') return true
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  })

  React.useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handler = (e: MediaQueryListEvent) => setPrefersReduced(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  return prefersReduced
}

export const FloatingElements = React.memo(({ count = 20, className = '', shouldAnimate = true }: FloatingElementsProps) => {
  const prefersReducedMotion = usePrefersReducedMotion()
  const elements = useMemo(() => generateElements(count), [count])
  const enableAnimation = shouldAnimate && !prefersReducedMotion

  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}>
      {elements.map((element) => (
        <div
          key={element.id}
          className={`absolute rounded-full ${enableAnimation ? 'animate-[floatElement_var(--dur)_ease-in-out_infinite]' : ''}`}
          style={{
            width: element.size,
            height: element.size,
            left: `${element.left}%`,
            top: `${element.top}%`,
            background: `radial-gradient(circle, rgba(var(--color-primary-rgb, 37, 99, 235), ${element.opacity}) 0%, transparent 70%)`,
            opacity: enableAnimation ? undefined : element.opacity,
            animationDelay: enableAnimation ? `${element.delay}s` : undefined,
            ['--dur' as string]: `${element.duration}s`,
          }}
        />
      ))}
    </div>
  )
})

export const GeometricPatterns = React.memo(() => {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-10">
      <div className="absolute top-10 right-10 w-32 h-32 border-2 border-primary rounded-full animate-[spin_20s_linear_infinite]" />
      <div className="absolute bottom-20 left-10 w-24 h-24 bg-gradient-to-r from-secondary to-accent rounded-lg animate-[spin_15s_linear_infinite_reverse]" />
      <div className="absolute top-1/2 left-1/4 w-16 h-16 border-2 border-accent transform rotate-45 animate-[pulse_8s_ease-in-out_infinite]" />
      <div className="absolute top-1/4 right-1/3 w-20 h-20 bg-gradient-radial from-blue-500/20 to-transparent rounded-full animate-[pulse_5s_ease-in-out_infinite]" />
    </div>
  )
})
