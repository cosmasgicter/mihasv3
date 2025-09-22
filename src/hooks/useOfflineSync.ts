import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { offlineSyncService } from '@/services/offlineSync'
import { OfflineDataPayloadMap, OfflineRecordType } from '@/types/offline'

export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [offlineDataCount, setOfflineDataCount] = useState(0)
  const [isSyncing, setIsSyncing] = useState(false)
  const { user } = useAuth()

  const updateOfflineDataCount = useCallback(async () => {
    if (user) {
      const count = await offlineSyncService.getOfflineDataCount(user.id)
      setOfflineDataCount(count)
    }
  }, [user])

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true)
      if (user) {
        setIsSyncing(true)
        offlineSyncService.processOfflineData().finally(() => {
          setIsSyncing(false)
          updateOfflineDataCount()
        })
      }
    }

    const handleOffline = () => {
      setIsOnline(false)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [updateOfflineDataCount, user])

  useEffect(() => {
    updateOfflineDataCount()
  }, [updateOfflineDataCount])

  const storeOffline = async <TType extends OfflineRecordType>(
    type: TType,
    data: OfflineDataPayloadMap[TType]
  ) => {
    if (user) {
      await offlineSyncService.storeOffline(user.id, type, data)
      await updateOfflineDataCount()
    }
  }

  const syncNow = async () => {
    if (isOnline && user && !isSyncing) {
      setIsSyncing(true)
      try {
        await offlineSyncService.processOfflineData()
        await updateOfflineDataCount()
      } finally {
        setIsSyncing(false)
      }
    }
  }

  return {
    isOnline,
    offlineDataCount,
    isSyncing,
    storeOffline,
    syncNow
  }
}