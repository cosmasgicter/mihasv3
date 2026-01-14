/**
 * PWA Configuration
 * Enhanced configuration for offline-first architecture
 * Requirements: 9.5 - Add offline-first architecture improvements
 */

export const PWA_CONFIG = {
  // Cache names
  caches: {
    static: 'mihas-static-v1',
    dynamic: 'mihas-dynamic-v1',
    api: 'mihas-api-v1',
    images: 'mihas-images-v1',
    fonts: 'mihas-fonts-v1'
  },

  // Cache strategies
  strategies: {
    // Static assets - Cache first, fallback to network
    static: {
      cacheName: 'mihas-static-v1',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      maxEntries: 100
    },

    // API responses - Network first, fallback to cache
    api: {
      cacheName: 'mihas-api-v1',
      maxAge: 5 * 60 * 1000, // 5 minutes
      maxEntries: 50,
      networkTimeout: 3000 // 3 seconds
    },

    // Images - Cache first with long expiry
    images: {
      cacheName: 'mihas-images-v1',
      maxAge: 90 * 24 * 60 * 60 * 1000, // 90 days
      maxEntries: 200
    },

    // Fonts - Cache first with very long expiry
    fonts: {
      cacheName: 'mihas-fonts-v1',
      maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
      maxEntries: 20
    }
  },

  // Critical resources to precache
  precache: [
    '/',
    '/offline.html',
    '/manifest.json',
    '/favicon.ico',
    '/images/logos/mihas-logo.png',
    '/images/logos/katc-logo.png'
  ],

  // Routes to cache
  routes: {
    // Always cache these routes
    cache: [
      '/dashboard',
      '/apply',
      '/profile',
      '/applications'
    ],

    // Never cache these routes
    exclude: [
      '/admin',
      '/api/auth',
      '/api/payments'
    ]
  },

  // Offline fallbacks
  fallbacks: {
    page: '/offline.html',
    image: '/images/placeholder.png',
    font: null
  },

  // Background sync tags
  syncTags: {
    applicationSubmit: 'application-submit',
    profileUpdate: 'profile-update',
    documentUpload: 'document-upload',
    paymentVerification: 'payment-verification'
  },

  // Update check interval (in milliseconds)
  updateCheckInterval: 60 * 60 * 1000, // 1 hour

  // Skip waiting on update
  skipWaiting: true,

  // Claim clients immediately
  clientsClaim: true
}

/**
 * Check if a URL should be cached
 */
export function shouldCache(url: string): boolean {
  const urlObj = new URL(url)
  
  // Don't cache excluded routes
  if (PWA_CONFIG.routes.exclude.some(route => urlObj.pathname.startsWith(route))) {
    return false
  }

  // Cache included routes
  if (PWA_CONFIG.routes.cache.some(route => urlObj.pathname.startsWith(route))) {
    return true
  }

  // Cache static assets
  if (/\.(js|css|png|jpg|jpeg|svg|gif|webp|woff|woff2|ttf|eot)$/.test(urlObj.pathname)) {
    return true
  }

  return false
}

/**
 * Get cache strategy for a URL
 */
export function getCacheStrategy(url: string): keyof typeof PWA_CONFIG.strategies {
  const urlObj = new URL(url)

  // API requests
  if (urlObj.pathname.startsWith('/api/') || urlObj.hostname.includes('supabase.co')) {
    return 'api'
  }

  // Images
  if (/\.(png|jpg|jpeg|svg|gif|webp)$/.test(urlObj.pathname)) {
    return 'images'
  }

  // Fonts
  if (/\.(woff|woff2|ttf|eot)$/.test(urlObj.pathname)) {
    return 'fonts'
  }

  // Default to static
  return 'static'
}

/**
 * Check if cache entry is expired
 */
export function isCacheExpired(cachedTime: number, maxAge: number): boolean {
  return Date.now() - cachedTime > maxAge
}

/**
 * Get cache metadata
 */
export function getCacheMetadata(response: Response): {
  cachedAt: number
  url: string
  status: number
} {
  return {
    cachedAt: Date.now(),
    url: response.url,
    status: response.status
  }
}

/**
 * Create cache response with metadata
 */
export function createCacheResponse(response: Response): Response {
  const metadata = getCacheMetadata(response)
  const headers = new Headers(response.headers)
  headers.set('X-Cache-Metadata', JSON.stringify(metadata))
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  })
}

/**
 * Get cache metadata from response
 */
export function getResponseMetadata(response: Response): {
  cachedAt: number
  url: string
  status: number
} | null {
  const metadataHeader = response.headers.get('X-Cache-Metadata')
  if (!metadataHeader) {
    return null
  }

  try {
    return JSON.parse(metadataHeader)
  } catch {
    return null
  }
}
