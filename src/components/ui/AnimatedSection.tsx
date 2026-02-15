import React from 'react'
import { useInView } from 'react-intersection-observer'
import { cn } from '@/lib/utils'

interface AnimatedSectionProps {
  children: React.ReactNode
  className?: string
  delay?: number
}

export function AnimatedSection({ children, className = '', delay = 0 }: AnimatedSectionProps) {
  const [ref, inView] = useInView({ threshold: 0.2, triggerOnce: true })

  return (
    <div
      ref={ref}
      className={cn(
        'transition-all duration-500 ease-out',
        inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8',
        className
      )}
      style={delay > 0 ? { transitionDelay: `${delay * 1000}ms` } : undefined}
    >
      {children}
    </div>
  )
}
