import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useServiceWorkerUpdate } from '@/hooks/useServiceWorkerUpdate'
import { RefreshCw, Database, Clock, AlertCircle, CheckCircle, XCircle } from 'lucide-react'

interface CacheStats {
  totalCaches: number
  totalSize: number
  cacheNames: string[]
  lastUpdated: Date | null
}

/**
 * Cache Monitor Component
 * Displays cache statistics and provides cache management controls
 * 
 * Requirements: 12.1 - Cache monitoring and management
 */
export function CacheMonitor() {
  const [cacheStats, setCacheStats] = useState<CacheStats>({
    totalCaches: 0,
    totalSize: 0,
    cacheNames: [],
    lastUpdated: null
  })
  const [isLoading, setIsLoading] = useState(false)
  const [isClearing, setIsClearing] = useState(false)
  const [lastCleared, setLastCleared] = useState<Date | null>(null)
  
  const {
    updateAvailable,
    currentVersion,
    newVersion,
    isUpdating,
    updateServiceWorker,
    dismissUpdate
  } = useServiceWorkerUpdate()

  // Fetch cache statistics
  const fetchCacheStats = async () => {
    if (!('caches' in window)) {
      return
    }

    setIsLoading(true)
    try {
      const cacheNames = await caches.keys()
      let totalSize = 0

      // Calculate total cache size
      for (const cacheName of cacheNames) {
        const cache = await caches.open(cacheName)
        const requests = await cache.keys()
        
        for (const request of requests) {
          const response = await cache.match(request)
          if (response) {
            const blob = await response.blob()
            totalSize += blob.size
          }
        }
      }

      setCacheStats({
        totalCaches: cacheNames.length,
        totalSize,
        cacheNames,
        lastUpdated: new Date()
      })
    } catch (error) {
      console.error('Failed to fetch cache stats:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // Clear all caches
  const clearAllCaches = async () => {
    if (!('caches' in window)) {
      return
    }

    if (!confirm('Are you sure you want to clear all caches? This will force a fresh download of all assets.')) {
      return
    }

    setIsClearing(true)
    try {
      const cacheNames = await caches.keys()
      await Promise.all(cacheNames.map(name => caches.delete(name)))
      
      setLastCleared(new Date())
      await fetchCacheStats()
      
      // Notify user
      alert('All caches cleared successfully. Refreshed cache statistics.')
    } catch (error) {
      console.error('Failed to clear caches:', error)
      alert('Failed to clear caches. Please try again.')
    } finally {
      setIsClearing(false)
    }
  }

  // Send message to service worker to clear cache
  const clearServiceWorkerCache = async () => {
    if (!('serviceWorker' in navigator)) {
      return
    }

    const registration = await navigator.serviceWorker.getRegistration()
    if (!registration?.active) {
      alert('No active service worker found')
      return
    }

    const messageChannel = new MessageChannel()
    
    messageChannel.port1.onmessage = (event) => {
      if (event.data.success) {
        alert('Service worker cache cleared successfully')
        fetchCacheStats()
      }
    }

    registration.active.postMessage(
      { type: 'CLEAR_CACHE' },
      [messageChannel.port2]
    )
  }

  // Fetch stats on mount
  useEffect(() => {
    fetchCacheStats()
  }, [])

  // Format bytes to human-readable size
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes'
    
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
  }

  // Format date to relative time
  const formatRelativeTime = (date: Date | null): string => {
    if (!date) return 'Never'
    
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
    
    if (seconds < 60) return `${seconds}s ago`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
    return `${Math.floor(seconds / 86400)}d ago`
  }

  return (
    <div className="space-y-4">
      {/* Service Worker Update Banner */}
      {updateAvailable && (
        <Card className="p-4 border-blue-500 bg-blue-50">
          <div className="flex items-start justify-between">
            <div className="flex items-start space-x-3">
              <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
              <div>
                <h3 className="font-semibold text-blue-900">Update Available</h3>
                <p className="text-sm text-blue-700 mt-1">
                  A new version of the application is available.
                  {currentVersion && newVersion && (
                    <span className="block mt-1">
                      Current: {currentVersion} → New: {newVersion}
                    </span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex space-x-2">
              <Button
                size="sm"
                onClick={updateServiceWorker}
                disabled={isUpdating}
              >
                {isUpdating ? 'Updating...' : 'Update Now'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={dismissUpdate}
              >
                Later
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Cache Statistics */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Cache Statistics</h2>
          <Button
            size="sm"
            variant="outline"
            onClick={fetchCacheStats}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {/* Total Caches */}
          <div className="flex items-center space-x-3 p-4 bg-gray-50 rounded-lg">
            <Database className="h-8 w-8 text-blue-600" />
            <div>
              <p className="text-sm text-gray-600">Total Caches</p>
              <p className="text-2xl font-bold">{cacheStats.totalCaches}</p>
            </div>
          </div>

          {/* Total Size */}
          <div className="flex items-center space-x-3 p-4 bg-gray-50 rounded-lg">
            <Database className="h-8 w-8 text-green-600" />
            <div>
              <p className="text-sm text-gray-600">Total Size</p>
              <p className="text-2xl font-bold">{formatBytes(cacheStats.totalSize)}</p>
            </div>
          </div>

          {/* Last Updated */}
          <div className="flex items-center space-x-3 p-4 bg-gray-50 rounded-lg">
            <Clock className="h-8 w-8 text-purple-600" />
            <div>
              <p className="text-sm text-gray-600">Last Updated</p>
              <p className="text-2xl font-bold">{formatRelativeTime(cacheStats.lastUpdated)}</p>
            </div>
          </div>
        </div>

        {/* Cache Names List */}
        {cacheStats.cacheNames.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold mb-2">Active Caches</h3>
            <div className="space-y-2">
              {cacheStats.cacheNames.map((name, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm"
                >
                  <span className="font-mono text-xs">{name}</span>
                  {name.includes('v1.0.0') ? (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  ) : (
                    <XCircle className="h-4 w-4 text-gray-400" />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Cache Management Actions */}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={clearServiceWorkerCache}
            disabled={isClearing}
          >
            Clear Service Worker Cache
          </Button>
          <Button
            variant="destructive"
            onClick={clearAllCaches}
            disabled={isClearing}
          >
            {isClearing ? 'Clearing...' : 'Clear All Caches'}
          </Button>
        </div>

        {lastCleared && (
          <p className="text-sm text-gray-600 mt-4">
            Last cleared: {formatRelativeTime(lastCleared)}
          </p>
        )}
      </Card>

      {/* Version Information */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Version Information</h2>
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-gray-600">Current Version:</span>
            <span className="font-mono">{currentVersion || 'Unknown'}</span>
          </div>
          {newVersion && (
            <div className="flex justify-between">
              <span className="text-gray-600">Available Version:</span>
              <span className="font-mono text-blue-600">{newVersion}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-gray-600">Service Worker:</span>
            <span className={`font-semibold ${
              'serviceWorker' in navigator ? 'text-green-600' : 'text-red-600'
            }`}>
              {'serviceWorker' in navigator ? 'Active' : 'Not Available'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Cache API:</span>
            <span className={`font-semibold ${
              'caches' in window ? 'text-green-600' : 'text-red-600'
            }`}>
              {'caches' in window ? 'Supported' : 'Not Supported'}
            </span>
          </div>
        </div>
      </Card>
    </div>
  )
}
