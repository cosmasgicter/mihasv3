/**
 * LoadingSpinner Component
 * 
 * Modern, smooth loading spinner using CSS animations only.
 * No Framer Motion dependency for better performance.
 * 
 * @requirements 5.1, 5.2 - Fast page loading with minimal JS overhead
 */

import { cn } from '@/lib/utils'

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  color?: 'primary' | 'secondary' | 'white'
  message?: string
  showPulse?: boolean
}

export function LoadingSpinner({ 
  size = 'md', 
  className, 
  color = 'primary',
  message,
  showPulse = false
}: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
    xl: 'w-10 h-10'
  }

  const borderSizeClasses = {
    sm: 'border-2',
    md: 'border-2',
    lg: 'border-[3px]',
    xl: 'border-[3px]'
  }

  const colorClasses = {
    primary: 'border-primary/20 border-t-primary',
    secondary: 'border-secondary/20 border-t-secondary', 
    white: 'border-white/20 border-t-white'
  }

  const textSizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
    xl: 'text-lg'
  }

  return (
    <div className="flex flex-col items-center justify-center gap-3">
      {/* Main spinner with smooth gradient effect */}
      <div className="relative">
        <div 
          className={cn(
            'rounded-full animate-spin',
            sizeClasses[size],
            borderSizeClasses[size],
            colorClasses[color],
            className
          )}
          style={{
            animationDuration: '0.8s',
            animationTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)'
          }}
        />
        {/* Subtle glow effect for larger sizes */}
        {(size === 'lg' || size === 'xl') && color === 'primary' && (
          <div 
            className={cn(
              'absolute inset-0 rounded-full opacity-30 blur-sm animate-pulse',
              sizeClasses[size],
              'bg-primary/20'
            )}
          />
        )}
      </div>

      {/* Message with fade-in animation */}
      {message && (
        <p 
          className={cn(
            'text-muted-foreground font-medium text-center animate-fade-in',
            textSizeClasses[size]
          )}
        >
          {message}
        </p>
      )}

      {/* Pulse dots indicator */}
      {showPulse && (
        <div className="flex items-center gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={cn(
                'w-1.5 h-1.5 rounded-full',
                color === 'white' ? 'bg-white' : 'bg-primary'
              )}
              style={{
                animation: 'pulse-dot 1.4s ease-in-out infinite',
                animationDelay: `${i * 0.16}s`
              }}
            />
          ))}
        </div>
      )}

      {/* CSS keyframes injected via style tag (only once) */}
      <style>{`
        @keyframes pulse-dot {
          0%, 80%, 100% {
            opacity: 0.3;
            transform: scale(0.8);
          }
          40% {
            opacity: 1;
            transform: scale(1);
          }
        }
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out forwards;
        }
      `}</style>
    </div>
  )
}
