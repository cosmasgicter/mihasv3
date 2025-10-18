import React from 'react'
import { motion } from 'framer-motion'
import { LoadingSpinner } from './LoadingSpinner'
import { Button, ButtonProps } from './Button'
import { cn } from '@/lib/utils'

interface LoadingButtonProps extends ButtonProps {
  loading?: boolean
  loadingText?: string
  children: React.ReactNode
}

export function LoadingButton({
  loading = false,
  loadingText,
  children,
  disabled,
  className,
  ...props
}: LoadingButtonProps) {
  return (
    <Button
      disabled={disabled || loading}
      className={cn(
        'relative overflow-hidden transition-all duration-200',
        loading && 'cursor-not-allowed',
        className
      )}
      {...props}
    >
      <motion.div
        className="flex items-center justify-center space-x-2"
        animate={{
          opacity: loading ? 0.7 : 1,
          scale: loading ? 0.95 : 1
        }}
        transition={{ duration: 0.2 }}
      >
        {loading && (
          <LoadingSpinner 
            size="sm" 
            color={props.variant === 'outline' ? 'primary' : 'white'}
          />
        )}
        <span>{loading && loadingText ? loadingText : children}</span>
      </motion.div>
      
      {loading && (
        <motion.div
          className="absolute inset-0 bg-white dark:bg-gray-800/10 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
        />
      )}
    </Button>
  )
}