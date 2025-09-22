import { useCallback, useEffect, useRef, type ComponentType } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App.tsx'
import './index.css'
import { AnalyticsService } from './lib/analytics.ts'

type WebVitalsMetric = {
  id: string
  name: string
  value: number
  delta: number
  rating: 'good' | 'needs-improvement' | 'poor'
  navigationType: string
  path?: string
  url?: string
  attribution?: any
}

const WebVitalsReporter = () => {
  const reportedMetrics = useRef(new Set<string>())

  const handleReport = useCallback((metric: WebVitalsMetric) => {
    const metricKey = `${metric.name}-${metric.id}`
    if (reportedMetrics.current.has(metricKey)) {
      return
    }

    reportedMetrics.current.add(metricKey)

    const metadata = {
      id: metric.id,
      name: metric.name,
      value: metric.value,
      delta: metric.delta,
      rating: metric.rating,
      navigationType: metric.navigationType,
      ...(metric.path ? { path: metric.path } : {}),
      ...(metric.url ? { url: metric.url } : {}),
      ...(metric.attribution ? { attribution: metric.attribution } : {})
    }

    void AnalyticsService.trackEvent({
      action_type: 'web_vitals',
      page_path: metric.path ?? (typeof window !== 'undefined' ? window.location.pathname : '/'),
      metadata: {
        metric: metadata
      }
    })
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    void import('web-vitals').then((webVitals) => {
      if (webVitals.onCLS) webVitals.onCLS(handleReport)
      if (webVitals.onINP) webVitals.onINP(handleReport)
      if (webVitals.onLCP) webVitals.onLCP(handleReport)
      if (webVitals.onTTFB) webVitals.onTTFB(handleReport)
      // onFID is deprecated, use onINP instead
    }).catch((error) => {
      console.error('Failed to load web-vitals metrics', error)
    })
  }, [handleReport])

  return null
}

// Render immediately for better performance
createRoot(document.getElementById('root')!).render(
  <>
    <App />
    <WebVitalsReporter />
  </>
)

// Defer non-critical services
if (typeof window !== 'undefined') {
  setTimeout(() => {
    import('./services/offlineSync').then(({ offlineSyncService }) => {
      offlineSyncService.init().catch(() => {})
    }).catch(() => {})
  }, 2000) // Increased delay to not interfere with initial load
}
