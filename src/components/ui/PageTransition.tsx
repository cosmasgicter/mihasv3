import React from 'react'

interface PageTransitionProps {
  children: React.ReactNode
  className?: string
}

export function PageTransition({ children, className }: PageTransitionProps) {
  return (
    <div
      className={className}
      style={{
        animation: 'fadeInUp 0.3s ease-in-out'
      }}
    >
      {children}
    </div>
  )
}

export function FadeTransition({ children, className }: PageTransitionProps) {
  return (
    <div
      className={className}
      style={{
        animation: 'fadeIn 0.2s ease-in-out'
      }}
    >
      {children}
    </div>
  )
}

export function SlideTransition({ children, className }: PageTransitionProps) {
  return (
    <div
      className={className}
      style={{
        animation: 'slideInLeft 0.3s ease-in-out'
      }}
    >
      {children}
    </div>
  )
}
