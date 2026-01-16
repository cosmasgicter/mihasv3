import React, { useState, useCallback, useMemo } from 'react'
import { cn } from '@/lib/utils'

interface ImageSource {
  src: string
  width?: number
  type?: string
}

interface OptimizedImageProps {
  src: string
  alt: string
  className?: string
  containerClassName?: string
  loading?: 'lazy' | 'eager'
  fallback?: string
  width?: number
  height?: number
  sizes?: string
  srcSet?: string | ImageSource[]
  blurDataUrl?: string
  priority?: boolean
  objectFit?: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down'
  onLoad?: () => void
  onError?: () => void
}

/**
 * Generate a tiny blur placeholder SVG
 * This creates a small colored rectangle that serves as a blur-up placeholder
 */
const generateBlurPlaceholder = (width = 10, height = 10, color = '#e2e8f0'): string => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">
    <filter id="b" color-interpolation-filters="sRGB">
      <feGaussianBlur stdDeviation="20"/>
    </filter>
    <rect width="100%" height="100%" fill="${color}" filter="url(#b)"/>
  </svg>`
  return `data:image/svg+xml;base64,${btoa(svg)}`
}

/**
 * Get WebP version of an image path if available
 */
const getWebPPath = (src: string): string => {
  // Check if already WebP
  if (src.endsWith('.webp')) return src
  
  // Convert common formats to WebP
  return src.replace(/\.(png|jpg|jpeg)$/i, '.webp')
}

/**
 * Generate srcset string from sources array
 */
const generateSrcSet = (sources: ImageSource[]): string => {
  return sources
    .map(s => `${s.src}${s.width ? ` ${s.width}w` : ''}`)
    .join(', ')
}

/**
 * OptimizedImage component with blur-up placeholders, lazy loading,
 * WebP support, and responsive srcset
 */
export const OptimizedImage: React.FC<OptimizedImageProps> = ({
  src,
  alt,
  className = '',
  containerClassName = '',
  loading,
  fallback = '/images/placeholder.svg',
  width,
  height,
  sizes,
  srcSet,
  blurDataUrl,
  priority = false,
  objectFit = 'contain',
  onLoad,
  onError
}) => {
  const [isLoaded, setIsLoaded] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [useWebP, setUseWebP] = useState(true)

  // Determine loading strategy
  const loadingStrategy = priority ? 'eager' : (loading || 'lazy')

  // Generate blur placeholder if not provided
  const placeholder = useMemo(() => {
    return blurDataUrl || generateBlurPlaceholder()
  }, [blurDataUrl])

  // Get WebP source
  const webpSrc = useMemo(() => getWebPPath(src), [src])
  
  // Generate srcset if sources provided
  const computedSrcSet = useMemo(() => {
    if (typeof srcSet === 'string') return srcSet
    if (Array.isArray(srcSet) && srcSet.length > 0) {
      return generateSrcSet(srcSet)
    }
    return undefined
  }, [srcSet])

  // Handle image load
  const handleLoad = useCallback(() => {
    setIsLoaded(true)
    onLoad?.()
  }, [onLoad])

  // Handle image error
  const handleError = useCallback(() => {
    // If WebP failed, try original format
    if (useWebP && webpSrc !== src) {
      setUseWebP(false)
      return
    }
    setHasError(true)
    setIsLoaded(true)
    onError?.()
  }, [useWebP, webpSrc, src, onError])

  // Determine final source
  const finalSrc = hasError ? fallback : (useWebP ? webpSrc : src)

  // Object fit class mapping
  const objectFitClass = {
    contain: 'object-contain',
    cover: 'object-cover',
    fill: 'object-fill',
    none: 'object-none',
    'scale-down': 'object-scale-down'
  }[objectFit]

  return (
    <div 
      className={cn(
        'relative overflow-hidden',
        containerClassName
      )}
      style={{ width: width ? `${width}px` : undefined, height: height ? `${height}px` : undefined }}
    >
      {/* Blur placeholder - shown while loading */}
      {!isLoaded && !hasError && (
        <div 
          className="absolute inset-0 animate-pulse"
          style={{
            backgroundImage: `url(${placeholder})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: 'blur(20px)',
            transform: 'scale(1.1)'
          }}
          aria-hidden="true"
        />
      )}
      
      {/* Main image with picture element for format fallback */}
      <picture>
        {/* WebP source - modern browsers */}
        {!hasError && webpSrc !== src && (
          <source 
            srcSet={computedSrcSet || webpSrc} 
            type="image/webp"
            sizes={sizes}
          />
        )}
        
        {/* Fallback source - older browsers */}
        <img
          src={finalSrc}
          alt={alt}
          loading={loadingStrategy}
          width={width}
          height={height}
          sizes={sizes}
          srcSet={!useWebP ? computedSrcSet : undefined}
          className={cn(
            'transition-opacity duration-300',
            isLoaded ? 'opacity-100' : 'opacity-0',
            'max-h-full max-w-full',
            objectFitClass,
            className
          )}
          onLoad={handleLoad}
          onError={handleError}
          decoding={priority ? 'sync' : 'async'}
          fetchPriority={priority ? 'high' : 'auto'}
        />
      </picture>
    </div>
  )
}

/**
 * ResponsiveImage component for images that need multiple sizes
 * Automatically generates srcset for different viewport widths
 */
interface ResponsiveImageProps extends Omit<OptimizedImageProps, 'srcSet'> {
  basePath: string
  widths?: number[]
  format?: 'webp' | 'png' | 'jpg'
}

export const ResponsiveImage: React.FC<ResponsiveImageProps> = ({
  basePath,
  widths = [320, 640, 768, 1024, 1280],
  format = 'webp',
  sizes = '100vw',
  ...props
}) => {
  // Generate srcset from base path and widths
  const srcSet = useMemo(() => {
    return widths.map(w => ({
      src: `${basePath}-${w}w.${format}`,
      width: w
    }))
  }, [basePath, widths, format])

  return (
    <OptimizedImage
      {...props}
      src={`${basePath}.${format}`}
      srcSet={srcSet}
      sizes={sizes}
    />
  )
}

/**
 * LazyImage component - simplified lazy loading image
 * For images below the fold that don't need blur-up
 */
interface LazyImageProps {
  src: string
  alt: string
  className?: string
  width?: number
  height?: number
}

export const LazyImage: React.FC<LazyImageProps> = ({
  src,
  alt,
  className,
  width,
  height
}) => {
  const [isInView, setIsInView] = useState(false)
  const [isLoaded, setIsLoaded] = useState(false)

  // Use Intersection Observer for lazy loading
  const imgRef = React.useRef<HTMLImageElement>(null)

  React.useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true)
          observer.disconnect()
        }
      },
      { rootMargin: '50px' }
    )

    if (imgRef.current) {
      observer.observe(imgRef.current)
    }

    return () => observer.disconnect()
  }, [])

  return (
    <div className={cn('relative overflow-hidden', className)}>
      {!isLoaded && (
        <div className="absolute inset-0 bg-muted animate-pulse" aria-hidden="true" />
      )}
      <img
        ref={imgRef}
        src={isInView ? src : undefined}
        data-src={src}
        alt={alt}
        width={width}
        height={height}
        className={cn(
          'transition-opacity duration-300',
          isLoaded ? 'opacity-100' : 'opacity-0'
        )}
        onLoad={() => setIsLoaded(true)}
        loading="lazy"
        decoding="async"
      />
    </div>
  )
}

export default OptimizedImage
