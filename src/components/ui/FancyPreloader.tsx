import React from 'react'
import { GraduationCap } from 'lucide-react'

export function FancyPreloader() {
  return (
    <div
      className="fixed inset-0 bg-gradient-to-br from-blue-600 via-purple-600 to-blue-800 flex items-center justify-center z-50 animate-fade-in"
    >
      <div className="text-center relative">
        {/* Animated background glow */}
        <div className="absolute inset-0 blur-3xl opacity-50 animate-[pulse_4s_ease-in-out_infinite]">
          <div className="w-32 h-32 bg-card/30 rounded-full mx-auto" />
        </div>

        {/* Icon */}
        <div className="mb-6 relative z-10 animate-[spin_3s_linear_infinite]">
          <GraduationCap className="w-16 h-16 text-gray-900 mx-auto drop-shadow-lg" />
        </div>
        
        {/* Title */}
        <h1 className="text-3xl font-bold text-gray-900 mb-2 relative z-10 animate-slide-up">
          MIHAS-KATC
        </h1>
        
        {/* Subtitle */}
        <p className="text-foreground/90 mb-8 text-lg relative z-10 animate-fade-in" style={{ animationDelay: '0.4s', animationFillMode: 'forwards', opacity: 0 }}>
          Your Future Starts Here
        </p>
        
        {/* Loading dots */}
        <div className="flex space-x-2 justify-center relative z-10">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-2.5 h-2.5 bg-card rounded-full shadow-lg animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
