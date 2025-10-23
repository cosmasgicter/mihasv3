import React from 'react'

interface AnimatedPageProps {
  children: React.ReactNode
  className?: string
}

export function AnimatedPage({ children, className = '' }: AnimatedPageProps) {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  if (prefersReducedMotion) {
    return <div className={className}>{children}</div>
  }

  return (
    <div 
      className={`animate-fade-in ${className}`}
      style={{
        animation: 'fadeInUp 0.3s ease-out'
      }}
    >
      {children}
    </div>
  )
}
