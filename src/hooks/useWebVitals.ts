import React from 'react'
import { onCLS, onFID, onFCP, onLCP, onTTFB } from 'web-vitals'

export function useWebVitals() {
  React.useEffect(() => {
    onCLS(metric => console.log('CLS:', metric.value))
    onFID(metric => console.log('FID:', metric.value))
    onFCP(metric => console.log('FCP:', metric.value))
    onLCP(metric => console.log('LCP:', metric.value))
    onTTFB(metric => console.log('TTFB:', metric.value))
  }, [])
}
