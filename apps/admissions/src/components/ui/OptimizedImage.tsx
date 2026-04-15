import { useState, type ImgHTMLAttributes } from 'react'

function splitAssetPath(assetPath: string) {
  const [rawPathname = '', search = ''] = assetPath.split('?')
  const pathname = rawPathname || assetPath
  const match = pathname.match(/^(.*?)(\.[^.]+)$/)

  if (!match) {
    return null
  }

  return {
    base: match[1],
    ext: match[2],
    search: search ? `?${search}` : '',
  }
}

function buildVariantAssetPath(assetPath: string, width: number) {
  const parts = splitAssetPath(assetPath)
  if (!parts) {
    return null
  }

  return `${parts.base}-${width}w${parts.ext}${parts.search}`
}

interface OptimizedImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'loading'> {
  /** Image source URL */
  src: string
  /** Descriptive alt text (empty string for decorative images) */
  alt: string
  /** Explicit width in pixels */
  width: number
  /** Explicit height in pixels */
  height: number
  /** Optional WebP source URL (auto-derived from src if not provided) */
  webpSrc?: string
  /** Responsive srcset widths (e.g. [320, 640, 1024]) */
  srcSetWidths?: number[]
  /** Whether to lazy-load (default: true) */
  lazy?: boolean
  /** Additional CSS classes */
  className?: string
  /** Whether image is decorative (sets role="presentation") */
  decorative?: boolean
}

/**
 * Optimized image component with WebP support, lazy loading,
 * responsive srcsets, and fallback rendering on error.
 */
export function OptimizedImage({
  src,
  alt,
  width,
  height,
  webpSrc,
  srcSetWidths,
  lazy = true,
  className = '',
  decorative = false,
  ...rest
}: OptimizedImageProps) {
  const [hasError, setHasError] = useState(false)

  // Derive WebP source by replacing extension
  const derivedWebpSrc = webpSrc || src.replace(/\.(jpe?g|png)$/i, '.webp')
  const hasWebp = derivedWebpSrc !== src

  // Build srcset string from widths
  const buildSrcSet = (baseSrc: string) => {
    if (!srcSetWidths?.length) return undefined
    const variants = srcSetWidths
      .map((variantWidth) => {
        const variantPath = buildVariantAssetPath(baseSrc, variantWidth)
        return variantPath ? `${variantPath} ${variantWidth}w` : null
      })
      .filter((entry): entry is string => Boolean(entry))
    return variants.length > 0 ? variants.join(', ') : undefined
  }

  if (hasError) {
    return (
      <div
        className={`flex items-center justify-center bg-muted text-muted-foreground ${className}`}
        style={{ width, height }}
        role={decorative ? 'presentation' : 'img'}
        aria-label={decorative ? undefined : alt}
      >
        <div className="text-center p-2">
          <svg className="mx-auto h-8 w-8 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
          </svg>
          {!decorative && alt && <span className="text-xs">{alt}</span>}
        </div>
      </div>
    )
  }

  return (
    <picture className="block w-full h-full">
      {hasWebp && (
        <source
          type="image/webp"
          srcSet={buildSrcSet(derivedWebpSrc) || derivedWebpSrc}
        />
      )}
      <img
        src={src}
        alt={decorative ? '' : alt}
        width={width}
        height={height}
        loading={lazy ? 'lazy' : 'eager'}
        decoding="async"
        className={`max-w-full ${className}`}
        srcSet={buildSrcSet(src)}
        onError={() => setHasError(true)}
        {...(decorative ? { role: 'presentation' } : {})}
        {...rest}
      />
    </picture>
  )
}
