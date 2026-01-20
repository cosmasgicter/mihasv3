/**
 * LoadingSpinner Component
 * 
 * Sleek, modern loading spinner using SVG animations.
 * 
 * @requirements 5.1, 5.2 - Fast page loading with minimal JS overhead
 */

import { cn } from '@/lib/utils'

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  color?: 'primary' | 'secondary' | 'white' | 'current'
  message?: string
}

export function LoadingSpinner({ 
  size = 'md', 
  className, 
  color = 'primary',
  message
}: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'w-5 h-5',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16'
  }

  // Map color prop to Tailwind text classes
  const colorClasses = {
    primary: 'text-primary',
    secondary: 'text-secondary',
    white: 'text-white',
    current: 'text-current'
  }

  const textSizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
    xl: 'text-lg'
  }

  return (
    <div className="flex flex-col items-center justify-center gap-3">
      <div
        className={cn(
          "relative flex items-center justify-center",
          sizeClasses[size],
          colorClasses[color],
          className
        )}
      >
        <svg
          className="animate-spin w-full h-full"
          viewBox="0 0 50 50"
        >
          <circle
            className="opacity-10"
            cx="25"
            cy="25"
            r="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
          />
          <circle
            className="opacity-90"
            cx="25"
            cy="25"
            r="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            strokeDasharray="80"
            strokeDashoffset="60"
            strokeLinecap="round"
          />
        </svg>
      </div>

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

      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out forwards;
        }
      `}</style>
    </div>
  )
}
