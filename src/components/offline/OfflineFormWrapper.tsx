/**
 * Offline Form Wrapper Component
 * Enables offline form completion and data entry with automatic sync
 * Requirements: 9.2 - Enable offline form completion and data entry
 */

import React, { useEffect, useState, useCallback } from 'react'
import { useNetworkStatus } from '@/hooks/useNetworkStatus'
import { offlineDataManager } from '@/services/offlineDataManager'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui'
import { Wifi, WifiOff, CloudUpload, AlertCircle, CheckCircle } from 'lucide-react'

interface OfflineFormWrapperProps {
  formId: string
  children: React.ReactNode
  onDataChange?: (data: any) => void
  onSync?: (success: boolean) => void
  className?: string
}

export function OfflineFormWrapper({
  formId,
  children,
  onDataChange,
  onSync,
  className = ''
}: OfflineFormWrapperProps) {
  const { isOnline, isSlowConnection } = useNetworkStatus()
  const [offlineData, setOfflineData] = useState<any>(null)
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle')
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null)

  // Load offline data on mount
  useEffect(() => {
    const loadOfflineData = () => {
      const data = offlineDataManager.getOfflineForm(formId)
      if (data) {
        setOfflineData(data)
        onDataChange?.(data.data)
      }
    }

    loadOfflineData()
  }, [formId, onDataChange])

  // Auto-sync when coming back online
  useEffect(() => {
    if (isOnline && offlineData?.needsSync) {
      handleSync()
    }
  }, [isOnline, offlineData?.needsSync])

  const saveOfflineData = useCallback((data: any, step: number = 1) => {
    const success = offlineDataManager.saveOfflineForm(formId, data, step)
    if (success) {
      setOfflineData({ formId, data, step, timestamp: new Date().toISOString(), isComplete: false, needsSync: true })
    }
    return success
  }, [formId])

  const handleSync = useCallback(async () => {
    if (isSyncing || !isOnline) return

    setIsSyncing(true)
    setSyncStatus('syncing')

    try {
      // Get user ID from auth context or localStorage
      const userId = localStorage.getItem('userId') || 'anonymous'
      const result = await offlineDataManager.syncOfflineData(userId)
      
      if (result.success) {
        setSyncStatus('success')
        setLastSyncTime(new Date())
        onSync?.(true)
        
        // Clear offline data after successful sync
        setOfflineData(null)
      } else {
        setSyncStatus('error')
        onSync?.(false)
        console.error('Sync errors:', result.errors)
      }
    } catch (error) {
      setSyncStatus('error')
      onSync?.(false)
      console.error('Sync failed:', error)
    } finally {
      setIsSyncing(false)
      
      // Reset status after delay
      setTimeout(() => setSyncStatus('idle'), 3000)
    }
  }, [isSyncing, isOnline, onSync])

  const getConnectionStatus = () => {
    if (!isOnline) return { icon: WifiOff, text: 'Offline', color: 'bg-red-100 text-red-800' }
    if (isSlowConnection) return { icon: Wifi, text: 'Slow Connection', color: 'bg-yellow-100 text-yellow-800' }
    return { icon: Wifi, text: 'Online', color: 'bg-green-100 text-green-800' }
  }

  const getSyncStatusInfo = () => {
    switch (syncStatus) {
      case 'syncing':
        return { icon: CloudUpload, text: 'Syncing...', color: 'bg-blue-100 text-blue-800' }
      case 'success':
        return { icon: CheckCircle, text: 'Synced', color: 'bg-green-100 text-green-800' }
      case 'error':
        return { icon: AlertCircle, text: 'Sync Failed', color: 'bg-red-100 text-red-800' }
      default:
        return null
    }
  }

  const connectionStatus = getConnectionStatus()
  const syncStatusInfo = getSyncStatusInfo()

  return (
    <div className={`offline-form-wrapper ${className}`}>
      {/* Connection and Sync Status Bar */}
      <div className="flex items-center justify-between p-3 bg-gray-50 border-b">
        <div className="flex items-center space-x-3">
          <Badge className={connectionStatus.color}>
            <connectionStatus.icon className="w-3 h-3 mr-1" />
            {connectionStatus.text}
          </Badge>
          
          {syncStatusInfo && (
            <Badge className={syncStatusInfo.color}>
              <syncStatusInfo.icon className="w-3 h-3 mr-1" />
              {syncStatusInfo.text}
            </Badge>
          )}
          
          {offlineData?.needsSync && (
            <Badge className="bg-orange-100 text-orange-800">
              Changes Pending
            </Badge>
          )}
        </div>

        <div className="flex items-center space-x-2">
          {lastSyncTime && (
            <span className="text-xs text-muted-foreground">
              Last sync: {lastSyncTime.toLocaleTimeString()}
            </span>
          )}
          
          {isOnline && offlineData?.needsSync && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleSync}
              disabled={isSyncing}
            >
              {isSyncing ? 'Syncing...' : 'Sync Now'}
            </Button>
          )}
        </div>
      </div>

      {/* Offline Mode Alert */}
      {!isOnline && (
        <Alert className="m-3">
          <WifiOff className="h-4 w-4" />
          <AlertDescription>
            You're currently offline. Your changes are being saved locally and will sync automatically when you're back online.
          </AlertDescription>
        </Alert>
      )}

      {/* Slow Connection Alert */}
      {isOnline && isSlowConnection && (
        <Alert className="m-3">
          <Wifi className="h-4 w-4" />
          <AlertDescription>
            Slow connection detected. Your changes are being saved locally to prevent data loss.
          </AlertDescription>
        </Alert>
      )}

      {/* Form Content */}
      <div className="form-content">
        {React.cloneElement(children as React.ReactElement, {
          onDataChange: (data: any) => {
            saveOfflineData(data)
            onDataChange?.(data)
          },
          initialData: offlineData?.data,
          isOffline: !isOnline
        })}
      </div>
    </div>
  )
}

/**
 * Hook for offline form management
 */
export function useOfflineForm(formId: string) {
  const { isOnline } = useNetworkStatus()
  const [hasOfflineData, setHasOfflineData] = useState(false)
  const [offlineData, setOfflineData] = useState<any>(null)

  useEffect(() => {
    const data = offlineDataManager.getOfflineForm(formId)
    setHasOfflineData(!!data)
    setOfflineData(data)
  }, [formId])

  const saveOffline = useCallback((data: any, step: number = 1) => {
    return offlineDataManager.saveOfflineForm(formId, data, step)
  }, [formId])

  const markComplete = useCallback(() => {
    offlineDataManager.markFormComplete(formId)
  }, [formId])

  const sync = useCallback(async (userId: string) => {
    if (!isOnline) return { success: false, error: 'No internet connection' }
    
    try {
      const result = await offlineDataManager.syncOfflineData(userId)
      if (result.success) {
        setHasOfflineData(false)
        setOfflineData(null)
      }
      return result
    } catch (error) {
      return {
        success: false,
        synced: 0,
        failed: 1,
        errors: [error instanceof Error ? error.message : 'Unknown error']
      }
    }
  }, [isOnline])

  return {
    hasOfflineData,
    offlineData,
    saveOffline,
    markComplete,
    sync,
    isOnline
  }
}