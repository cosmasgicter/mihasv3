import React from 'react'
import { motion, type HTMLMotionProps, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface ButtonProps extends HTMLMotionProps<'button'> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'gradient'
  size?: 'sm' | 'md' | 'lg' | 'xl'
  loading?: boolean
  children: React.ReactNode
  magnetic?: boolean
  glow?: boolean
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  magnetic = false,
  glow = false,
  className,
  children,
  disabled,
  onClick,
  ...props
}: ButtonProps) {
  const prefersReducedMotion = useReducedMotion()
  const baseClasses = cn(
    'relative inline-flex items-center justify-center rounded-xl font-semibold',
    'transition-all duration-300 focus-visible:outline-none focus-visible:ring-2',
    'focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50',
    'overflow-hidden group'
  )
  
  const variantClasses = {
    primary: 'bg-primary text-white hover:bg-primary/80 border border-primary hover:border-primary/80',
    secondary: 'bg-secondary text-white hover:bg-secondary/80 border border-secondary hover:border-secondary/80',
    outline: 'border-2 border-secondary bg-transparent text-secondary hover:bg-secondary hover:text-white',
    ghost: 'text-secondary hover:bg-secondary/10 hover:text-secondary/80',
    danger: 'bg-red-600 text-white hover:bg-red-700 border border-red-600 hover:border-red-700',
    gradient: 'bg-gradient-to-r from-primary via-secondary to-accent text-white hover:shadow-2xl border-none'
  }
  
  const sizeClasses = {
    sm: 'h-9 px-4 text-sm',
    md: 'h-11 px-6 text-base',
    lg: 'h-12 px-8 text-lg',
    xl: 'h-16 px-10 text-xl'
  }

  const buttonVariants = {
    initial: { scale: 1 },
    hover: { 
      scale: magnetic ? 1.05 : 1.02,
      y: magnetic ? -2 : -1,
      transition: { 
        type: "spring", 
        stiffness: 300, 
        damping: 20 
      }
    },
    tap: { 
      scale: 0.95,
      transition: { duration: 0.1 }
    }
  }

  const rippleVariants = {
    initial: { scale: 0, opacity: 0 },
    animate: { 
      scale: 1, 
      opacity: [0, 0.3, 0],
      transition: { duration: 0.6 }
    }
  }

  const [ripples, setRipples] = React.useState<Array<{ id: number; x: number; y: number }>>([])

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!prefersReducedMotion) {
      const rect = e.currentTarget.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top

      const newRipple = { id: Date.now(), x, y }
      setRipples(prev => [...prev, newRipple])

      setTimeout(() => {
        setRipples(prev => prev.filter(ripple => ripple.id !== newRipple.id))
      }, 600)
    }

    if (onClick) {
      onClick(e)
    }
  }

  const buttonContent = (
    <>
      {/* Animated background for gradient variant */}
      {variant === 'gradient' && (
        prefersReducedMotion ? (
          <div
            className="absolute inset-0 bg-gradient-to-r from-primary via-secondary to-accent opacity-80"
            style={{ backgroundSize: '200% 200%' }}
          />
        ) : (
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-primary via-secondary to-accent opacity-0 group-hover:opacity-100 transition-opacity duration-300"
            animate={{ backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'] }}
            transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
            style={{ backgroundSize: '200% 200%' }}
          />
        )
      )}

      {/* Ripple effects */}
      {!prefersReducedMotion && ripples.map(ripple => (
        <motion.span
          key={ripple.id}
          className="absolute bg-white rounded-full pointer-events-none"
          style={{
            left: ripple.x - 10,
            top: ripple.y - 10,
            width: 20,
            height: 20,
          }}
          variants={rippleVariants}
          initial="initial"
          animate="animate"
        />
      ))}

      {/* Shine effect */}
      <div className="absolute inset-0 shine-effect rounded-xl" />

      {/* Content */}
      <div className="relative z-10 flex items-center justify-center">
        {loading && (
          prefersReducedMotion ? (
            <div className="mr-2 h-4 w-4 rounded-full border-2 border-current border-t-transparent" />
          ) : (
            <motion.div
              className="mr-2 h-4 w-4 rounded-full border-2 border-current border-t-transparent"
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            />
          )
        )}
        {children}
      </div>
    </>
  )

  return (
    <motion.button
      className={cn(
        baseClasses,
        variantClasses[variant],
        sizeClasses[size],
        magnetic && 'magnetic-button',
        glow && 'glow-effect',
        className
      )}
      {...(!prefersReducedMotion ? {
        variants: buttonVariants,
        initial: 'initial' as const,
        whileHover: 'hover' as const,
        whileTap: 'tap' as const
      } : {})}
      disabled={disabled || loading}
      onClick={handleClick}
      {...props}
    >
      {buttonContent}
    </motion.button>
  )
}
