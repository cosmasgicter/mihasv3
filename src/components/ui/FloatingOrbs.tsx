import React from 'react'
import { useOptimizedAnimation } from '@/hooks/useOptimizedAnimation'

/**
 * FloatingOrbs Component
 * 
 * Decorative animated background orbs using CSS animations.
 * Disabled on mobile devices and when user prefers reduced motion for performance.
 * 
 * @requirements 6.2 - Mobile performance optimization
 */
export const FloatingOrbs: React.FC = () => {
  const { shouldAnimate, isMobile } = useOptimizedAnimation()

  // Don't render on mobile or when animations are disabled
  if (isMobile || !shouldAnimate) {
    return null
  }

  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
      <div
        className="absolute w-96 h-96 rounded-full bg-gradient-to-br from-primary/20 to-secondary/20 blur-3xl animate-[floatOrb1_20s_ease-in-out_infinite]"
        style={{ top: '10%', left: '10%' }}
      />
      <div
        className="absolute w-80 h-80 rounded-full bg-gradient-to-br from-secondary/20 to-accent/20 blur-3xl animate-[floatOrb2_15s_ease-in-out_infinite]"
        style={{ top: '50%', right: '10%' }}
      />
      <div
        className="absolute w-72 h-72 rounded-full bg-gradient-to-br from-primary/20 to-info/20 blur-3xl animate-[floatOrb3_18s_ease-in-out_infinite]"
        style={{ bottom: '10%', left: '30%' }}
      />
    </div>
  )
}
