import { useEffect, useState } from 'react'
import { OfflineManager } from '@/lib/offlineManager'

export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [queueSize, setQueueSize] = useState(0)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    const updateOnlineStatus = () => {
      setIsOnline(navigator.onLine)
      setQueueSize(OfflineManager.getQueue().length)
    }

    const handleOnline = async () => {
      updateOnlineStatus()
      if (OfflineManager.getQueue().length > 0) {
        setSyncing(true)
        await OfflineManager.syncQueue()
        setSyncing(false)
        setQueueSize(0)
      }
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', updateOnlineStatus)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', updateOnlineStatus)
    }
  }, [])

  return { isOnline, queueSize, syncing }
}
