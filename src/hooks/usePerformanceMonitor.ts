import { useEffect, useRef, useState } from 'react'
import { measureAsyncPerformance } from '@/lib/utils'

interface PerformanceMetrics {
  renderTime: number
  componentMountTime: number
  updateCount: number
  lastUpdateTime: number
}

interface UsePerformanceMonitorOptions {
  enabled?: boolean
  logToConsole?: boolean
  componentName?: string
}

export function usePerformanceMonitor(
  dependencies: any[] = [],
  options: UsePerformanceMonitorOptions = {}
) {
  const { enabled = process.env.NODE_ENV === 'development', logToConsole = true, componentName = 'Component' } = options
  
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    renderTime: 0,
    componentMountTime: 0,
    updateCount: 0,
    lastUpdateTime: 0
  })
  
  const mountTimeRef = useRef<number>()
  const lastRenderTimeRef = useRef<number>()
  const updateCountRef = useRef(0)
  
  // Track component mount time
  useEffect(() => {
    if (!enabled) return
    
    const mountTime = performance.now()
    mountTimeRef.current = mountTime
    
    setMetrics(prev => ({
      ...prev,
      componentMountTime: mountTime
    }))
    
    if (logToConsole) {
    }
  }, [enabled, logToConsole, componentName])
  
  // Track render time and updates
  useEffect(() => {
    if (!enabled) return
    
    const renderTime = performance.now()
    const timeSinceMount = mountTimeRef.current ? renderTime - mountTimeRef.current : 0
    const timeSinceLastRender = lastRenderTimeRef.current ? renderTime - lastRenderTimeRef.current : 0
    
    updateCountRef.current += 1
    lastRenderTimeRef.current = renderTime
    
    setMetrics(prev => ({
      ...prev,
      renderTime: timeSinceMount,
      updateCount: updateCountRef.current,
      lastUpdateTime: timeSinceLastRender
    }))
    
    if (logToConsole && updateCountRef.current > 1) {
    }
  }, dependencies)
  
  const measureAsync = async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
    if (!enabled) return fn()
    
    const { result } = await measureAsyncPerformance(`${componentName}:${name}`, fn)
    return result
  }
  
  const measure = <T>(name: string, fn: () => T): T => {
    if (!enabled) return fn()
    
    const start = performance.now()
    const result = fn()
    const end = performance.now()
    
    if (logToConsole) {
    }
    
    return result
  }
  
  return {
    metrics,
    measureAsync,
    measure,
    enabled
  }
}