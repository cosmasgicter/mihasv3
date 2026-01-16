/**
 * Performance Utilities
 * 
 * Provides utilities for measuring and optimizing performance:
 * - Web Vitals measurement
 * - Performance observer setup
 * - Resource timing analysis
 * - Bundle size tracking
 * 
 * Requirements: 1.1, 1.2, 1.6
 */

/**
 * Web Vitals metrics interface
 */
export interface WebVitalsMetrics {
  fcp: number | null  // First Contentful Paint
  lcp: number | null  // Largest Contentful Paint
  fid: number | null  // First Input Delay
  cls: number | null  // Cumulative Layout Shift
  ttfb: number | null // Time to First Byte
  inp: number | null  // Interaction to Next Paint
}

/**
 * Performance thresholds based on requirements
 */
export const PERFORMANCE_THRESHOLDS = {
  fcp: 500,    // First Contentful Paint target (ms) - Requirement 1.1
  lcp: 1500,   // Largest Contentful Paint target (ms) - Requirement 1.2
  fid: 100,    // First Input Delay target (ms)
  cls: 0.1,    // Cumulative Layout Shift target
  ttfb: 200,   // Time to First Byte target (ms)
  inp: 200,    // Interaction to Next Paint target (ms)
  lighthouse: 95, // Lighthouse score target - Requirement 1.6
}

/**
 * Initialize Web Vitals measurement
 */
export function initWebVitals(callback: (metrics: Partial<WebVitalsMetrics>) => void): void {
  if (typeof window === 'undefined') return

  // First Contentful Paint
  const fcpObserver = new PerformanceObserver((entryList) => {
    const entries = entryList.getEntries()
    const fcpEntry = entries.find(entry => entry.name === 'first-contentful-paint')
    if (fcpEntry) {
      callback({ fcp: fcpEntry.startTime })
    }
  })
  
  try {
    fcpObserver.observe({ type: 'paint', buffered: true })
  } catch (e) {
    // Fallback for browsers that don't support buffered flag
    fcpObserver.observe({ entryTypes: ['paint'] })
  }

  // Largest Contentful Paint
  const lcpObserver = new PerformanceObserver((entryList) => {
    const entries = entryList.getEntries()
    const lastEntry = entries[entries.length - 1]
    if (lastEntry) {
      callback({ lcp: lastEntry.startTime })
    }
  })
  
  try {
    lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true })
  } catch (e) {
    // LCP not supported
  }

  // First Input Delay
  const fidObserver = new PerformanceObserver((entryList) => {
    const entries = entryList.getEntries()
    const firstEntry = entries[0] as PerformanceEventTiming
    if (firstEntry) {
      callback({ fid: firstEntry.processingStart - firstEntry.startTime })
    }
  })
  
  try {
    fidObserver.observe({ type: 'first-input', buffered: true })
  } catch (e) {
    // FID not supported
  }

  // Cumulative Layout Shift
  let clsValue = 0
  const clsObserver = new PerformanceObserver((entryList) => {
    for (const entry of entryList.getEntries()) {
      const layoutShiftEntry = entry as PerformanceEntry & { hadRecentInput: boolean; value: number }
      if (!layoutShiftEntry.hadRecentInput) {
        clsValue += layoutShiftEntry.value
        callback({ cls: clsValue })
      }
    }
  })
  
  try {
    clsObserver.observe({ type: 'layout-shift', buffered: true })
  } catch (e) {
    // CLS not supported
  }

  // Time to First Byte
  const navigationEntries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[]
  if (navigationEntries.length > 0) {
    const navEntry = navigationEntries[0]
    callback({ ttfb: navEntry.responseStart - navEntry.requestStart })
  }
}

/**
 * Check if metrics meet performance thresholds
 */
export function checkPerformanceThresholds(metrics: Partial<WebVitalsMetrics>): {
  passed: boolean
  results: Record<string, { value: number | null; threshold: number; passed: boolean }>
} {
  const results: Record<string, { value: number | null; threshold: number; passed: boolean }> = {}
  
  if (metrics.fcp !== null && metrics.fcp !== undefined) {
    results.fcp = {
      value: metrics.fcp,
      threshold: PERFORMANCE_THRESHOLDS.fcp,
      passed: metrics.fcp <= PERFORMANCE_THRESHOLDS.fcp
    }
  }
  
  if (metrics.lcp !== null && metrics.lcp !== undefined) {
    results.lcp = {
      value: metrics.lcp,
      threshold: PERFORMANCE_THRESHOLDS.lcp,
      passed: metrics.lcp <= PERFORMANCE_THRESHOLDS.lcp
    }
  }
  
  if (metrics.fid !== null && metrics.fid !== undefined) {
    results.fid = {
      value: metrics.fid,
      threshold: PERFORMANCE_THRESHOLDS.fid,
      passed: metrics.fid <= PERFORMANCE_THRESHOLDS.fid
    }
  }
  
  if (metrics.cls !== null && metrics.cls !== undefined) {
    results.cls = {
      value: metrics.cls,
      threshold: PERFORMANCE_THRESHOLDS.cls,
      passed: metrics.cls <= PERFORMANCE_THRESHOLDS.cls
    }
  }
  
  if (metrics.ttfb !== null && metrics.ttfb !== undefined) {
    results.ttfb = {
      value: metrics.ttfb,
      threshold: PERFORMANCE_THRESHOLDS.ttfb,
      passed: metrics.ttfb <= PERFORMANCE_THRESHOLDS.ttfb
    }
  }
  
  const passed = Object.values(results).every(r => r.passed)
  
  return { passed, results }
}

/**
 * Get resource timing information
 */
export function getResourceTimings(): PerformanceResourceTiming[] {
  if (typeof window === 'undefined') return []
  return performance.getEntriesByType('resource') as PerformanceResourceTiming[]
}

/**
 * Analyze bundle sizes from resource timings
 */
export function analyzeBundleSizes(): {
  totalSize: number
  jsSize: number
  cssSize: number
  imageSize: number
  fontSize: number
  otherSize: number
  resources: Array<{ name: string; size: number; type: string }>
} {
  const resources = getResourceTimings()
  
  let totalSize = 0
  let jsSize = 0
  let cssSize = 0
  let imageSize = 0
  let fontSize = 0
  let otherSize = 0
  
  const resourceList: Array<{ name: string; size: number; type: string }> = []
  
  for (const resource of resources) {
    const size = resource.transferSize || resource.encodedBodySize || 0
    totalSize += size
    
    const url = resource.name
    let type = 'other'
    
    if (url.endsWith('.js') || url.includes('.js?')) {
      jsSize += size
      type = 'js'
    } else if (url.endsWith('.css') || url.includes('.css?')) {
      cssSize += size
      type = 'css'
    } else if (/\.(png|jpg|jpeg|gif|webp|svg|ico)(\?|$)/i.test(url)) {
      imageSize += size
      type = 'image'
    } else if (/\.(woff|woff2|ttf|otf|eot)(\?|$)/i.test(url)) {
      fontSize += size
      type = 'font'
    } else {
      otherSize += size
    }
    
    resourceList.push({
      name: url.split('/').pop() || url,
      size,
      type
    })
  }
  
  return {
    totalSize,
    jsSize,
    cssSize,
    imageSize,
    fontSize,
    otherSize,
    resources: resourceList.sort((a, b) => b.size - a.size)
  }
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

/**
 * Log performance metrics to console (development only)
 */
export function logPerformanceMetrics(metrics: Partial<WebVitalsMetrics>): void {
  if (process.env.NODE_ENV !== 'development') return
  
  console.group('🚀 Performance Metrics')
  
  if (metrics.fcp !== null && metrics.fcp !== undefined) {
    const fcpStatus = metrics.fcp <= PERFORMANCE_THRESHOLDS.fcp ? '✅' : '❌'
    console.log(`${fcpStatus} FCP: ${metrics.fcp.toFixed(0)}ms (target: ${PERFORMANCE_THRESHOLDS.fcp}ms)`)
  }
  
  if (metrics.lcp !== null && metrics.lcp !== undefined) {
    const lcpStatus = metrics.lcp <= PERFORMANCE_THRESHOLDS.lcp ? '✅' : '❌'
    console.log(`${lcpStatus} LCP: ${metrics.lcp.toFixed(0)}ms (target: ${PERFORMANCE_THRESHOLDS.lcp}ms)`)
  }
  
  if (metrics.fid !== null && metrics.fid !== undefined) {
    const fidStatus = metrics.fid <= PERFORMANCE_THRESHOLDS.fid ? '✅' : '❌'
    console.log(`${fidStatus} FID: ${metrics.fid.toFixed(0)}ms (target: ${PERFORMANCE_THRESHOLDS.fid}ms)`)
  }
  
  if (metrics.cls !== null && metrics.cls !== undefined) {
    const clsStatus = metrics.cls <= PERFORMANCE_THRESHOLDS.cls ? '✅' : '❌'
    console.log(`${clsStatus} CLS: ${metrics.cls.toFixed(3)} (target: ${PERFORMANCE_THRESHOLDS.cls})`)
  }
  
  if (metrics.ttfb !== null && metrics.ttfb !== undefined) {
    const ttfbStatus = metrics.ttfb <= PERFORMANCE_THRESHOLDS.ttfb ? '✅' : '❌'
    console.log(`${ttfbStatus} TTFB: ${metrics.ttfb.toFixed(0)}ms (target: ${PERFORMANCE_THRESHOLDS.ttfb}ms)`)
  }
  
  console.groupEnd()
}

/**
 * Preload critical resources
 */
export function preloadResource(href: string, as: 'script' | 'style' | 'image' | 'font'): void {
  if (typeof document === 'undefined') return
  
  const link = document.createElement('link')
  link.rel = 'preload'
  link.href = href
  link.as = as
  
  if (as === 'font') {
    link.crossOrigin = 'anonymous'
  }
  
  document.head.appendChild(link)
}

/**
 * Prefetch resources for future navigation
 */
export function prefetchResource(href: string): void {
  if (typeof document === 'undefined') return
  
  const link = document.createElement('link')
  link.rel = 'prefetch'
  link.href = href
  
  document.head.appendChild(link)
}

/**
 * Defer non-critical JavaScript
 */
export function deferScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = src
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`))
    document.body.appendChild(script)
  })
}

/**
 * Check if the page is visible
 */
export function isPageVisible(): boolean {
  if (typeof document === 'undefined') return true
  return document.visibilityState === 'visible'
}

/**
 * Run callback when page becomes visible
 */
export function onPageVisible(callback: () => void): () => void {
  if (typeof document === 'undefined') return () => {}
  
  const handler = () => {
    if (document.visibilityState === 'visible') {
      callback()
    }
  }
  
  document.addEventListener('visibilitychange', handler)
  
  return () => {
    document.removeEventListener('visibilitychange', handler)
  }
}

/**
 * Idle callback wrapper with fallback
 */
export function requestIdleCallback(
  callback: () => void,
  options?: { timeout?: number }
): number {
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    return window.requestIdleCallback(callback, options)
  }
  
  // Fallback for browsers without requestIdleCallback
  return window.setTimeout(callback, options?.timeout || 1) as unknown as number
}

/**
 * Cancel idle callback
 */
export function cancelIdleCallback(id: number): void {
  if (typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
    window.cancelIdleCallback(id)
  } else {
    window.clearTimeout(id)
  }
}
