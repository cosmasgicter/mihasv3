import React from 'react'
import { FloatingOrbs } from './FloatingOrbs'
import { ParticleSystem } from './ParticleSystem'
import { prefersReducedMotion, isLowEndDevice } from '@/utils/performance'
import { useIsMobile } from '@/hooks/useMediaQuery'

interface AnimatedBackgroundProps {
  showOrbs?: boolean
  showParticles?: boolean
  className?: string
}

export function AnimatedBackground({ 
  showOrbs = true, 
  showParticles = false,
  className = ''
}: AnimatedBackgroundProps) {
  const isMobile = useIsMobile()
  const shouldReduceEffects = prefersReducedMotion() || isLowEndDevice() || isMobile

  return (
    <div className={`fixed inset-0 -z-10 ${className}`}>
      {/* Base gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-gray-50 via-blue-50 to-purple-50 dark:from-gray-900 dark:via-blue-950 dark:to-purple-950 transition-colors duration-500" />
      
      {/* Floating orbs - disabled on mobile/low-end */}
      {showOrbs && !shouldReduceEffects && <FloatingOrbs />}
      
      {/* Particle system - disabled on mobile/low-end */}
      {showParticles && !shouldReduceEffects && <ParticleSystem />}
    </div>
  )
}
