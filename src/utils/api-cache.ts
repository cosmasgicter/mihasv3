// API response caching utilities for improved performance

import { getEnvVariable } from './env'

interface CacheEntry<T> {
  data: T
  timestamp: number
  ttl: number // Time to live in milliseconds
  key: string
}

class ApiCache {
  private cache = new Map<string, CacheEntry<any>>()
  private maxSize = 100 // Maximum number of cached entries
  private defaultTTL = 5 * 60 * 1000 // 5 minutes default

  set<T>(
    key: string, 
    data: T, 
    ttl: number = this.defaultTTL
  ): void {
    // Remove oldest entries if cache is full
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value
      this.cache.delete(oldestKey)
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
      key
    })
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key)
    
    if (!entry) {
      return null
    }

    // Check if entry has expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key)
      return null
    }

    return entry.data as T
  }

  has(key: string): boolean {
    const entry = this.cache.get(key)
    
    if (!entry) {
      return false
    }

    // Check if entry has expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key)
      return false
    }

    return true
  }

  delete(key: string): boolean {
    return this.cache.delete(key)
  }

  clear(): void {
    this.cache.clear()
  }

  // Get cache statistics
  getStats() {
    const entries = Array.from(this.cache.values())
    const now = Date.now()
    
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      expired: entries.filter(entry => now - entry.timestamp > entry.ttl).length,
      active: entries.filter(entry => now - entry.timestamp <= entry.ttl).length
    }
  }

  // Clean up expired entries
  cleanup(): void {
    const now = Date.now()
    const expiredKeys: string[] = []
    
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        expiredKeys.push(key)
      }
    }
    
    expiredKeys.forEach(key => this.cache.delete(key))
  }
}

// Global cache instance
export const apiCache = new ApiCache()

// Set up periodic cleanup
if (typeof window !== 'undefined') {
  setInterval(() => {
    apiCache.cleanup()
  }, 60000) // Cleanup every minute
}

// Enhanced fetch with caching and retry logic
export interface FetchWithCacheOptions {
  cache?: boolean
  cacheTTL?: number
  retries?: number
  retryDelay?: number
  timeout?: number
  headers?: Record<string, string>
  signal?: AbortSignal
  cacheKey?: string
  transformResponse?: (response: Response) => Promise<any>
  onResponse?: (response: Response, duration: number) => void
  onError?: (error: unknown, duration: number) => void
}

export async function fetchWithCache<T>(
  url: string,
  options: RequestInit & FetchWithCacheOptions = {}
): Promise<T> {
  const {
    cache = true,
    cacheTTL = 5 * 60 * 1000, // 5 minutes
    retries = 3,
    retryDelay = 1000,
    timeout = 10000,
    headers = {},
    signal,
    cacheKey,
    transformResponse,
    onResponse,
    onError,
    ...fetchOptions
  } = options

  // Generate cache key
  const normalizedHeaders = Object.keys(headers).sort().reduce((acc, key) => {
    acc[key] = headers[key]
    return acc
  }, {} as Record<string, string>)

  const resolvedCacheKey = cacheKey ?? `${options.method || 'GET'}:${url}:${JSON.stringify({
    body: options.body,
    headers: normalizedHeaders
  })}`

  // Check cache for GET requests
  if (cache && (!options.method || options.method === 'GET')) {
    const cached = apiCache.get<T>(resolvedCacheKey)
    if (cached) {
      return cached
    }
  }

  // Create timeout signal
  const timeoutController = new AbortController()
  const timeoutId = setTimeout(() => timeoutController.abort(), timeout)

  // Combine signals
  const combinedSignal = signal || timeoutController.signal

  let lastError: Error

  // Retry logic
  for (let attempt = 0; attempt <= retries; attempt++) {
    const attemptStart = Date.now()
    try {
      // Validate URL to prevent SSRF attacks
      const urlObj = new URL(url)
      const allowedHosts = ['apply.mihas.edu.zm', 'mylgegkqoddcrxtwcclb.supabase.co', 'localhost']
      if (!allowedHosts.includes(urlObj.hostname)) {
        throw new Error('Invalid URL - host not allowed')
      }
      
      const response = await fetch(url, {
        ...fetchOptions,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        signal: combinedSignal
      })

      const responseClone = response.clone()
      const duration = Date.now() - attemptStart
      onResponse?.(responseClone, duration)

      clearTimeout(timeoutId)

      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}: ${response.statusText}`) as Error & {
          status?: number
          statusText?: string
          __apiCacheNotified?: boolean
        }
        error.status = response.status
        error.statusText = response.statusText
        onError?.(error, duration)
        error.__apiCacheNotified = true
        throw error
      }

      let data: T

      if (transformResponse) {
        data = await transformResponse(response)
      } else {
        data = await response.json()
      }

      // Cache successful GET responses
      if (cache && (!options.method || options.method === 'GET')) {
        apiCache.set(resolvedCacheKey, data, cacheTTL)
      }

      return data
    } catch (error) {
      const trackedError = error as Error & { __apiCacheNotified?: boolean }
      lastError = trackedError
      if (!trackedError.__apiCacheNotified) {
        onError?.(trackedError, Date.now() - attemptStart)
        trackedError.__apiCacheNotified = true
      }

      // Don't retry on certain errors
      if (
        error instanceof TypeError || // Network error
        lastError.name === 'AbortError' || // Timeout or user abort
        (error as any).status === 401 || // Unauthorized
        (error as any).status === 403 || // Forbidden
        (error as any).status === 404 // Not found
      ) {
        clearTimeout(timeoutId)
        throw lastError
      }

      // Wait before retry (except on last attempt)
      if (attempt < retries) {
        await new Promise(resolve => 
          setTimeout(resolve, retryDelay * Math.pow(2, attempt))
        )
      }
    }
  }

  clearTimeout(timeoutId)
  throw lastError!
}

// Specialized functions for common API patterns
export async function getWithCache<T>(
  url: string, 
  options: FetchWithCacheOptions = {}
): Promise<T> {
  return fetchWithCache<T>(url, { ...options, method: 'GET' })
}

export async function postWithoutCache<T>(
  url: string,
  data: any,
  options: FetchWithCacheOptions = {}
): Promise<T> {
  return fetchWithCache<T>(url, {
    ...options,
    method: 'POST',
    body: JSON.stringify(data),
    cache: false
  })
}

export async function putWithoutCache<T>(
  url: string,
  data: any,
  options: FetchWithCacheOptions = {}
): Promise<T> {
  return fetchWithCache<T>(url, {
    ...options,
    method: 'PUT',
    body: JSON.stringify(data),
    cache: false
  })
}

export async function deleteWithoutCache<T>(
  url: string,
  options: FetchWithCacheOptions = {}
): Promise<T> {
  return fetchWithCache<T>(url, {
    ...options,
    method: 'DELETE',
    cache: false
  })
}

// Batch request utility
export async function batchRequests<T>(
  requests: Array<() => Promise<T>>,
  concurrency: number = 5
): Promise<T[]> {
  const results: T[] = []
  
  for (let i = 0; i < requests.length; i += concurrency) {
    const batch = requests.slice(i, i + concurrency)
    const batchResults = await Promise.all(batch.map(request => request()))
    results.push(...batchResults)
  }
  
  return results
}

// Cache invalidation utilities
export function invalidateCache(pattern?: string): void {
  if (!pattern) {
    apiCache.clear()
    return
  }

  // Simple pattern matching (can be enhanced with regex)
  const keysToDelete: string[] = []
  
  for (const key of apiCache['cache'].keys()) {
    if (key.includes(pattern)) {
      keysToDelete.push(key)
    }
  }
  
  keysToDelete.forEach(key => apiCache.delete(key))
}

// Prefetch utility for anticipated requests
export async function prefetchData(
  urls: string[],
  options: FetchWithCacheOptions = {}
): Promise<void> {
  // Use low priority for prefetch requests
  const prefetchOptions = {
    ...options,
    cache: true,
    cacheTTL: 10 * 60 * 1000, // 10 minutes for prefetched data
    retries: 1 // Fewer retries for prefetch
  }

  // Batch prefetch requests
  await batchRequests(
    urls.map(url => () => getWithCache(url, prefetchOptions)),
    3 // Low concurrency for prefetch
  ).catch(() => {
    // Silently fail prefetch requests
  })
}

// Network-aware caching
export function getNetworkAwareCacheTTL(): number {
  if (typeof navigator === 'undefined') {
    return 5 * 60 * 1000 // Default 5 minutes
  }

  const connection = (navigator as any).connection ||
                    (navigator as any).mozConnection ||
                    (navigator as any).webkitConnection

  if (!connection) {
    return 5 * 60 * 1000 // Default 5 minutes
  }

  // Longer cache for slower connections
  switch (connection.effectiveType) {
    case 'slow-2g':
    case '2g':
      return 15 * 60 * 1000 // 15 minutes
    case '3g':
      return 10 * 60 * 1000 // 10 minutes
    case '4g':
    default:
      return 5 * 60 * 1000 // 5 minutes
  }
}

// Enhanced cache with persistence
export class PersistentCache extends ApiCache {
  private storageKey = getEnvVariable('VITE_API_CACHE_STORAGE_KEY', 'mihas-api-cache')
  private maxStorageSize = 5 * 1024 * 1024 // 5MB

  constructor() {
    super()
    this.loadFromStorage()
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.storageKey)
      if (stored) {
        const data = JSON.parse(stored)
        const now = Date.now()
        
        // Only load non-expired entries
        Object.entries(data).forEach(([key, entry]: [string, any]) => {
          if (now - entry.timestamp <= entry.ttl) {
            this['cache'].set(key, entry)
          }
        })
      }
    } catch (error) {
    }
  }

  private saveToStorage(): void {
    try {
      const data = Object.fromEntries(this['cache'])
      const serialized = JSON.stringify(data)
      
      // Check storage size limit
      if (serialized.length > this.maxStorageSize) {
        // Remove oldest entries until under limit
        const entries = Array.from(this['cache'].entries())
        entries.sort((a, b) => a[1].timestamp - b[1].timestamp)
        
        while (JSON.stringify(Object.fromEntries(this['cache'])).length > this.maxStorageSize) {
          const oldestKey = entries.shift()?.[0]
          if (oldestKey) {
            this['cache'].delete(oldestKey)
          } else {
            break
          }
        }
      }
      
      localStorage.setItem(this.storageKey, JSON.stringify(Object.fromEntries(this['cache'])))
    } catch (error) {
    }
  }

  set<T>(key: string, data: T, ttl?: number): void {
    super.set(key, data, ttl)
    this.saveToStorage()
  }

  delete(key: string): boolean {
    const result = super.delete(key)
    this.saveToStorage()
    return result
  }

  clear(): void {
    super.clear()
    localStorage.removeItem(this.storageKey)
  }
}

// Export persistent cache instance
export const persistentCache = new PersistentCache()
