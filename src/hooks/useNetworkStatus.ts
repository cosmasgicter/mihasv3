import { useState, useEffect, useCallback } from 'react'

// Network Information API is not yet in the standard TypeScript lib
interface NetworkInformation extends EventTarget {
  type?: string
  effectiveType?: string
  rtt?: number
  downlink?: number
  addEventListener(type: 'change', listener: EventListenerOrEventListenerObject): void
  removeEventListener(type: 'change', listener: EventListenerOrEventListenerObject): void
}

interface NavigatorWithConnection extends Navigator {
  connection?: NetworkInformation
  mozConnection?: NetworkInformation
  webkitConnection?: NetworkInformation
}

interface NetworkStatus {
  isOnline: boolean
  isSlowConnection: boolean
  connectionType: string
  effectiveType: string
  rtt: number
  downlink: number
}

export function useNetworkStatus() {
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>({
    isOnline: navigator.onLine,
    isSlowConnection: false,
    connectionType: 'unknown',
    effectiveType: 'unknown',
    rtt: 0,
    downlink: 0
  })

  const updateNetworkStatus = useCallback(() => {
    const isOnline = navigator.onLine
    
    // Get connection info if available (Chrome/Edge)
    const nav = navigator as NavigatorWithConnection
    const connection = nav.connection || nav.mozConnection || nav.webkitConnection
    
    let isSlowConnection = false
    let connectionType = 'unknown'
    let effectiveType = 'unknown'
    let rtt = 0
    let downlink = 0
    
    if (connection) {
      connectionType = connection.type || 'unknown'
      effectiveType = connection.effectiveType || 'unknown'
      rtt = connection.rtt || 0
      downlink = connection.downlink || 0
      
      // Determine if connection is slow
      isSlowConnection = 
        effectiveType === 'slow-2g' ||
        effectiveType === '2g' ||
        (effectiveType === '3g' && downlink < 1.5) ||
        rtt > 1000
    }
    
    setNetworkStatus({
      isOnline,
      isSlowConnection,
      connectionType,
      effectiveType,
      rtt,
      downlink
    })
  }, [])

  useEffect(() => {
    // Initial check
    updateNetworkStatus()
    
    // Listen for online/offline events
    const handleOnline = () => updateNetworkStatus()
    const handleOffline = () => updateNetworkStatus()
    
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    
    // Listen for connection changes (if supported)
    const nav = navigator as NavigatorWithConnection
    const connection = nav.connection || nav.mozConnection || nav.webkitConnection
    
    if (connection) {
      connection.addEventListener('change', updateNetworkStatus)
    }
    
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      
      if (connection) {
        connection.removeEventListener('change', updateNetworkStatus)
      }
    }
  }, [updateNetworkStatus])

  return networkStatus
}

// Hook for network-aware retries
export function useNetworkRetry() {
  const { isOnline, isSlowConnection } = useNetworkStatus()
  
  const retryWithBackoff = useCallback(async <T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000
  ): Promise<T> => {
    let lastError: Error
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        if (!isOnline && attempt > 0) {
          throw new Error('No internet connection')
        }
        
        return await operation()
      } catch (error) {
        lastError = error as Error
        
        if (attempt === maxRetries - 1) {
          throw lastError
        }
        
        // Calculate delay with exponential backoff
        const delay = baseDelay * Math.pow(2, attempt)
        const jitter = Math.random() * 0.1 * delay
        const totalDelay = delay + jitter
        
        // Longer delays for slow connections
        const adjustedDelay = isSlowConnection ? totalDelay * 1.5 : totalDelay
        
        await new Promise(resolve => setTimeout(resolve, adjustedDelay))
      }
    }
    
    throw lastError!
  }, [isOnline, isSlowConnection])
  
  return { retryWithBackoff }
}

// Hook for monitoring network quality over time
export function useNetworkQualityMonitor() {
  const [qualityHistory, setQualityHistory] = useState<{
    timestamp: number
    rtt: number
    downlink: number
    effectiveType: string
  }[]>([])
  
  const { rtt, downlink, effectiveType } = useNetworkStatus()
  
  useEffect(() => {
    const interval = setInterval(() => {
      setQualityHistory(prev => {
        const newEntry = {
          timestamp: Date.now(),
          rtt,
          downlink,
          effectiveType
        }
        
        // Keep only last 10 entries
        const updated = [...prev, newEntry].slice(-10)
        return updated
      })
    }, 30000) // Check every 30 seconds
    
    return () => clearInterval(interval)
  }, [rtt, downlink, effectiveType])
  
  const averageRtt = qualityHistory.length > 0 
    ? qualityHistory.reduce((sum, entry) => sum + entry.rtt, 0) / qualityHistory.length
    : 0
    
  const averageDownlink = qualityHistory.length > 0
    ? qualityHistory.reduce((sum, entry) => sum + entry.downlink, 0) / qualityHistory.length
    : 0
  
  return {
    qualityHistory,
    averageRtt,
    averageDownlink,
    isStableConnection: qualityHistory.length >= 3 && 
      Math.max(...qualityHistory.map(h => h.rtt)) - Math.min(...qualityHistory.map(h => h.rtt)) < 500
  }
}

// Hook for adaptive behavior based on network conditions
export function useAdaptiveNetworkBehavior() {
  const { isOnline, isSlowConnection, effectiveType } = useNetworkStatus()
  
  const getOptimalSettings = useCallback(() => {
    if (!isOnline) {
      return {
        enableCache: true,
        prefetchEnabled: false,
        imageQuality: 'low',
        maxConcurrentRequests: 0,
        requestTimeout: 5000
      }
    }
    
    if (isSlowConnection || effectiveType === '2g' || effectiveType === 'slow-2g') {
      return {
        enableCache: true,
        prefetchEnabled: false,
        imageQuality: 'low',
        maxConcurrentRequests: 1,
        requestTimeout: 10000
      }
    }
    
    if (effectiveType === '3g') {
      return {
        enableCache: true,
        prefetchEnabled: true,
        imageQuality: 'medium',
        maxConcurrentRequests: 2,
        requestTimeout: 8000
      }
    }
    
    // 4G and above
    return {
      enableCache: true,
      prefetchEnabled: true,
      imageQuality: 'high',
      maxConcurrentRequests: 4,
      requestTimeout: 5000
    }
  }, [isOnline, isSlowConnection, effectiveType])
  
  return {
    ...useNetworkStatus(),
    settings: getOptimalSettings()
  }
}
