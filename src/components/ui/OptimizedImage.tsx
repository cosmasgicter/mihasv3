import React, { useState } from 'react'
import { motion } from 'framer-motion'

interface OptimizedImageProps {
  src: string
  alt: string
  className?: string
  loading?: 'lazy' | 'eager'
  fallback?: string
}

export const OptimizedImage: React.FC<OptimizedImageProps> = ({
  src,
  alt,
  className = '',
  loading = 'lazy',
  fallback = '/images/placeholder.svg'
}) => {
  const [isLoaded, setIsLoaded] = useState(false)
  const [hasError, setHasError] = useState(false)

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {!isLoaded && !hasError && (
        <div className="absolute inset-0 bg-gray-200 animate-pulse rounded" />
      )}
      
      <motion.img
        src={hasError ? fallback : src}
        alt={alt}
        loading={loading}
        className={`transition-opacity duration-300 ${
          isLoaded ? 'opacity-100' : 'opacity-0'
        } max-h-full max-w-full object-contain`}
        onLoad={() => setIsLoaded(true)}
        onError={() => {
          setHasError(true)
          setIsLoaded(true)
        }}
        initial={{ scale: 0.9 }}
        animate={{ scale: isLoaded ? 1 : 0.9 }}
        transition={{ duration: 0.3 }}
      />
    </div>
  )
}